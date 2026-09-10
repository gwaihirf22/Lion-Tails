/**
 * Building the input for a universe summary, and the prompt that consumes it.
 *
 * The hard constraint is context, and it is smaller than it looks. On gpt-oss
 * the whole window is 16384 tokens, and the output reserve is not padding: that
 * model has spent an entire 8192-token budget on reasoning and emitted nothing
 * (docs/decisions.md §13). Under-reserving output is the failure that started
 * that investigation.
 *
 *   INPUT_BUDGET = 16384 - 8192 (output + reasoning) - 512 (scaffold) = 7680
 *
 * ~7680 tokens is about 5,700 words: two or three medium stories, not the seven
 * or eight the feature was first sketched with. The window is therefore
 * token-budgeted against the resolved model rather than a fixed story count.
 */
import { pool } from "../db";

/** Reserved for reasoning plus the summary itself. */
const RESERVE_OUTPUT = 8192;
/** System prompt, instructions, JSON envelope. */
const RESERVE_SCAFFOLD = 512;
/** A ceiling regardless of how much context a model has. */
const MAX_WINDOW_STORIES = 8;
/** Target length of the summary itself. */
export const SUMMARY_TARGET_WORDS = 400;

/**
 * EMPIRICAL, not arbitrary. 7 medium stories measured 13,965 tokens for ~10,500
 * words -- about 1.33 tokens per word at ~5.2 characters per word, i.e. ~3.9
 * characters per token. 3.5 therefore over-estimates by ~11%, and over-
 * estimating is the safe direction: an under-estimate is a truncation and a
 * wasted 60-90 second local call. Re-derive from measurements if you change it.
 */
const CHARS_PER_TOKEN = 3.5;
const est = (s: string) => Math.ceil((s?.length ?? 0) / CHARS_PER_TOKEN);

export type UniverseStory = { storyId: string; title: string; content: string; createdAt: string };

export type SummaryWindow = {
  /** The assembled prompt input, frozen onto story_jobs.brief. */
  text: string;
  /** Story ids read in full, oldest first. Frozen onto story_jobs.outline. */
  storyIds: string[];
  coveredCount: number;
  droppedCount: number;
};

/** Newest first, which is the order the window is selected in. */
export async function loadUniverseStories(universeId: string): Promise<UniverseStory[]> {
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT story_id, story_data, created_at
       FROM user_stories
      WHERE universe_id = $1
      ORDER BY created_at DESC`,
    [universeId],
  );
  return rows.map((r) => ({
    storyId: r.story_id,
    title: r.story_data?.story?.title ?? "Untitled",
    content: r.story_data?.story?.content ?? "",
    createdAt: r.created_at,
  }));
}

function canonBlock(canon: Array<{ text: string; status: string }>): string {
  const active = canon.filter((c) => c.status === "active");
  if (active.length === 0) return "";
  return (
    "CANON -- facts that are true in this world and must never be lost:\n" +
    active.map((c, i) => `  ${i + 1}. ${c.text}`).join("\n")
  );
}

function storyBlock(s: UniverseStory): string {
  return `### ${s.title}\n${s.content}`;
}

/**
 * Choose as many recent stories as fit, newest first, then present them oldest
 * first so the summariser reads them in the order they happened.
 */
export function selectWindow(opts: {
  stories: UniverseStory[]; // newest first
  existingSummary: string | null;
  canon: Array<{ text: string; status: string }>;
  contextLimit: number;
}): SummaryWindow {
  const canonText = canonBlock(opts.canon);
  const summaryText = opts.existingSummary
    ? `STORY SO FAR (previous summary):\n${opts.existingSummary}`
    : "";

  // Canon and the previous summary are never dropped: they are the only
  // representation of everything outside the window.
  const fixed = est(canonText) + est(summaryText);
  let budget = opts.contextLimit - RESERVE_OUTPUT - RESERVE_SCAFFOLD - fixed;

  const chosen: UniverseStory[] = [];
  for (const story of opts.stories) {
    if (chosen.length >= MAX_WINDOW_STORIES) break;
    const cost = est(storyBlock(story));
    if (cost > budget) {
      // Never produce a zero-story window: clip the newest rather than read none.
      if (chosen.length === 0 && budget > 500) {
        const room = Math.max(0, budget - 50) * CHARS_PER_TOKEN;
        chosen.push({ ...story, content: story.content.slice(0, room) + "\n[...truncated]" });
      }
      break;
    }
    budget -= cost;
    chosen.push(story);
  }
  chosen.reverse(); // chronological

  const dropped = opts.stories.length - chosen.length;
  const parts: string[] = [];
  if (canonText) parts.push(canonText);
  if (summaryText) parts.push(summaryText);
  parts.push(
    "FULL TEXT OF THE MOST RECENT STORIES:\n" + chosen.map(storyBlock).join("\n\n"),
  );
  if (dropped > 0) {
    // Saying this out loud is what keeps the windowing honest to the model
    // rather than silently lossy.
    parts.push(
      `There are ${dropped} earlier ${dropped === 1 ? "story" : "stories"} not reproduced here. ` +
        `They are represented by the summary above. Do not contradict it, and do not treat ` +
        `the absence of a detail from it as evidence that the detail is false.`,
    );
  }

  return {
    text: parts.join("\n\n"),
    storyIds: chosen.map((s) => s.storyId),
    coveredCount: chosen.length,
    droppedCount: dropped,
  };
}

export function summarySystemPrompt(): string {
  return (
    "You maintain the continuity bible for a series of stories. " +
    "You record what is TRUE in this world -- characters, relationships, places, " +
    "and what has already happened -- so that the next story does not contradict it. " +
    "You are not a reviewer and not a storyteller: you do not judge the stories and " +
    "you do not invent."
  );
}

export function summaryUserPrompt(window: string, targetWords: number): string {
  return `
    ${window}

    Write an updated continuity summary of this world, about ${targetWords} words.

    Include: who the characters are and how they relate; where things happen;
    what has already happened that a later story must not contradict; and any
    unresolved thread a later story could pick up.

    Do NOT include: how good the stories are, morals or lessons, or anything
    that did not happen. Prefer specifics -- names, places, objects -- over
    summary language like "they learned about courage".

    Respond with ONLY a valid JSON object:
    { "summary": "...", "proposedCanon": ["a short fact worth never forgetting", "..."] }

    proposedCanon is for facts so central that losing them would break a later
    story. Keep it to at most three, each under 200 characters, and leave it
    empty if nothing qualifies.
  `;
}
