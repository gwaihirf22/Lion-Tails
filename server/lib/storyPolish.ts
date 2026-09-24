import { renderBrief, type StoryBrief, WORDS_PER_VERSE_LINE } from "./storyBrief";
import { ALL_HEADINGS } from "@shared/storyAppendices";

/**
 * The polish pass: the whole story, read once by the model that wrote it, and
 * given back as one story.
 *
 * WHY IT EXISTS. A long story is written a chapter at a time, each from one
 * line of an outline, and the chapters are joined with a blank line. No
 * chapter ever sees the ones that follow it. "Behind the False Wall"
 * (2026-09-16, three chapters) wrote the Gestapo raid in chapter one -- six
 * people silent behind the wall for three days -- and then chapter two opened
 * by writing the same raid again as news. Chapter one ended in 1942 and
 * chapter two began in 1944 with no join at all, and the prose fell into the
 * same shape for a page ("She could not... She could not... She could not...").
 * None of that is a chapter's fault; a chapter cannot see it. Blake: "the
 * problem lies in cohesion... it needs to be a beautiful story afterward and
 * less disjointed."
 *
 * It runs on the SAME model that wrote the story (Blake's choice: cost scales
 * with what the account already chose, and a local story gets a local polish
 * for free), included in the story's price, on every story. It is a FULL
 * rewrite for flow, told to keep every fact.
 *
 * THIS FILE IS PURE. The prompt, the acceptance check and the token budget are
 * here with no client and no I/O, captured in `tests/storyPolish.test.ts` --
 * the `buildChapterPrompt` precedent: the assembled prompt is what the model
 * reads, so the assembled prompt is what gets tested. The call itself lives in
 * openai-implementation.ts beside `finalizeStoryDetails`, where `ledgerFor`
 * and `requestModelText` are.
 *
 * A POLISH CAN NEVER FAIL A STORY. The draft is kept until the polished text
 * has passed `acceptPolish`, and any error from the call keeps the draft too
 * (the `diggingDeeper` rule: a second call must not cost the first). What it
 * checks is what a rewrite loses silently -- length, names, dates, form, and
 * the structure the reader and the appendix guards depend on.
 */

export type MoralOutcome = "positive" | "learning" | "consequences" | "creative";

export type PolishPromptInput = {
  brief: StoryBrief;
  /** The draft as it was written: one entry per pass (chapter), or one for a single call. */
  parts: string[];
  storyType: string;
  moralOutcome: MoralOutcome;
};

/**
 * Where one pass ended and the next began, shown to the editor.
 *
 * The first real run (Corrie ten Boom, three chapters, Luna) handed back 88%
 * of sentences untouched and the recap that opened chapter two word for word.
 * Told only that there WERE seams, the model did not find them. Told where
 * they are, it has nothing to search for. `partMarker(n)` is what goes into
 * the draft; `PART_MARKER_LEFT` is what acceptPolish refuses to let out.
 */
export const partMarker = (n: number) => `[PART ${n} BEGINS]`;
const PART_MARKER_LEFT = /\[PART \d+ BEGINS\]/;
const STORY_OPEN = "<<< THE STORY >>>";
const STORY_CLOSE = "<<< END OF THE STORY >>>";

/** The draft the editor reads: the parts, with a marker at every join. */
export function markedDraft(parts: string[]): string {
  return parts.map((p, i) => (i === 0 ? p.trim() : `${partMarker(i + 1)}\n\n${p.trim()}`)).join("\n\n");
}

/**
 * How far the polished text may move from the draft, as a ratio of its words.
 *
 * Cutting a duplicated scene and stacked one-liners legitimately shrinks a
 * story -- the raid told twice was about a sixth of a chapter -- so the floor
 * is not tight. Growth is capped harder: an editor asked to fix flow who adds
 * a fifth is writing, not editing.
 */
export const POLISH_LENGTH_FLOOR = 0.8;
export const POLISH_LENGTH_CEILING = 1.2;

export function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

/** What the prompt says about the ending. The stored label's meaning depends on it. */
function endingRule(brief: StoryBrief, moralOutcome: MoralOutcome): string {
  if (brief.cliffhanger) {
    return "It is left open on purpose: do not resolve it, and do not soften it.";
  }
  if (moralOutcome === "consequences") {
    return "It does not end happily, on purpose: do not soften it or add a comfort it does not have.";
  }
  return "Do not change what happens at the end, and do not add to it.";
}

function formRule(storyType: string): string {
  return storyType === "poem"
    ? "This is a POEM. Keep it in verse: one line of verse per line, stanzas separated by a blank line, no prose paragraphs."
    : "Prose, in paragraphs separated by a blank line. No headings of any kind.";
}

/**
 * The whole user prompt the editor reads.
 *
 * `renderBrief(brief, "chapter")` is the compact set of rules every chapter
 * already gets -- who is who, what must stay true, never narrate the invented
 * character's limits, the account's cautions -- which is exactly what an editor
 * needs and nothing an editor does not. Not a new BriefPurpose: that would move
 * all 68 brief goldens for a projection only this call reads.
 */
export function buildPolishPrompt(opts: PolishPromptInput): string {
  const { brief, parts, storyType, moralOutcome } = opts;
  const draft = parts.join("\n\n");
  const words = countWords(draft);
  const floor = Math.round(words * POLISH_LENGTH_FLOOR);
  const ceiling = Math.round(words * POLISH_LENGTH_CEILING);
  const howWritten =
    parts.length > 1
      ? `It was written in ${parts.length} separate passes, each from one line of an outline, and no pass could see the ones that came after it. Then the passes were joined with nothing between them. A line reading ${partMarker(2)}, ${partMarker(3)} and so on shows where each new pass began: those are the seams. Rework every one of them, and remove the marker lines.`
      : `It was written in one pass, quickly.`;

  return `
      ${renderBrief(brief, "chapter")}

      You are the EDITOR of the story below, not its author. ${howWritten} Read the whole of it and give it back as ONE story that no reader would guess was written in pieces.

      FIX, wherever you find it:
      - Seams: a part that opens as if the reader knows nothing, or restates what the part before it just showed. Join the parts with a real transition, or with none; never with a recap.
      - The same scene told twice. Keep the better telling, once, where it belongs.
      - Contradictions: a detail, a name, the time of day, the year, who is in the room -- anything one part has differently from another.
      - Anything that reads as an instruction to the writer rather than as story ("the chapter should", "this part ends with", "the story does not pretend").
      - Repetition of shape: the same sentence pattern three times running; a line of one sentence stacked on another for effect where one would do; the same word leaned on across a page.
      - Summary that tells the reader what a scene has already shown, and a lesson stated where the story has already made it.
      Vary the rhythm. Let a scene breathe where it has earned it; tighten where it dawdles. Rewrite wherever the reading improves; handing the text back nearly as it came is a failure of this task. Keep a sentence only because it is good, never because it is there.

      KEEP, exactly:
      - Every event, in its order, and who does what. Every name, place, date and number. Every quotation of Scripture, word for word.
      - The ending as it ends. ${endingRule(brief, moralOutcome)}
      - The voice and the reading level of the story as written. Do not make it older or younger.
      - The length: between ${floor} and ${ceiling} words. It is ${words} words now.
      - The form. ${formRule(storyType)}
      Do not add a title, headings, chapter numbers, part markers, a moral, notes, questions, or anything after the story's last sentence. Do not add or remove a character. Do not invent a name or an age for anyone the story leaves unnamed.

      ${STORY_OPEN}
      ${markedDraft(parts)}
      ${STORY_CLOSE}

      Reply with the story text only: no preface, no commentary, no code fences, no markers.
    `;
}

/**
 * The output budget for the polish call, from the draft's size.
 *
 * English prose runs about 1.3 tokens a word; the ceiling allows a fifth more
 * than the draft, and a thinking model spends part of the budget reasoning
 * before it writes a word (docs/decisions.md §13). requestModelText doubles on
 * truncation, so this only needs to be right for the common case.
 */
export function polishTokenBudget(draftWords: number): number {
  const output = Math.ceil(draftWords * 1.3 * POLISH_LENGTH_CEILING);
  return Math.max(2048, output + 1024);
}

/**
 * Tokens the whole polish call needs, prompt AND output, for the context check.
 *
 * The prompt is the draft again plus about a thousand tokens of rules. On the
 * local deployment the window is shared and fixed, so a long story can simply
 * not fit through this pass -- and the honest answer is to skip it and say so,
 * not to send a request that will be cut off.
 */
export function polishContextNeeded(draftWords: number): number {
  return Math.ceil(draftWords * 1.3) + 1200 + polishTokenBudget(draftWords);
}

export type PolishVerdict =
  | { accepted: true; content: string }
  | { accepted: false; reason: string };

export type AcceptPolishInput = {
  draft: string;
  polished: string;
  storyType: string;
  targetWordCount: number;
  /** The names a rewrite must not lose: the cast, and any pet. */
  castNames: string[];
  /** The generation's own floor on length, as a ratio of the target. */
  minimumLengthRatio: number;
};

const ATX_HEADING = /^#{1,6}\s+\S/m;
/** A short, wholly-bold line: how the reader renders a heading. See storyContent.ts. */
const BOLD_LINE_HEADING = /^\*\*[^*\n]{1,80}\*\*\s*$/m;
const PART_MARKER = /^\s*(chapter|part)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/im;
const YEAR_OR_NUMBER = /\b\d{3,4}\b/g;

function wholeWord(text: string, word: string): boolean {
  const lower = text.toLowerCase();
  const needle = word.toLowerCase();
  let from = 0;
  for (;;) {
    const at = lower.indexOf(needle, from);
    if (at < 0) return false;
    const before = at === 0 ? "" : lower[at - 1];
    const after = lower[at + needle.length] ?? "";
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return true;
    from = at + 1;
  }
}

function verseLines(text: string): number {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("**") && !l.startsWith("-")).length;
}

/**
 * Take the story out of whatever the model wrapped it in.
 *
 * Code fences and a one-line preface ("Here is the revised story:") are the
 * two things an editor model adds despite being told not to. The preface is
 * only dropped when it is not a line of the draft, so a story that genuinely
 * opens with a short line keeps it.
 */
export function unwrapPolished(raw: string, draft: string): string {
  let text = raw.replace(/\r\n/g, "\n").trim();
  const fence = text.match(/^```[a-z]*\n([\s\S]*?)\n```$/i);
  if (fence) text = fence[1].trim();
  // The delimiters, and the rules a model echoes from a fence it was shown.
  // The first real run ended "...of the heart.\"\n      --", the tail of a
  // `---` fence, which the reader would have drawn as a scene break. Only the
  // outermost lines: a rule INSIDE the story is a scene break the writer meant.
  const edge = /^(<<<[^\n]*>>>|[-_*—–]{2,}\s*)$/;
  const lines = text.split("\n");
  while (lines.length && (edge.test(lines[0].trim()) || lines[0].trim() === "")) lines.shift();
  while (lines.length && (edge.test(lines[lines.length - 1].trim()) || lines[lines.length - 1].trim() === "")) lines.pop();
  text = lines.join("\n").trim();
  const blocks = text.split(/\n{2,}/);
  if (blocks.length > 1) {
    const first = blocks[0].trim();
    const looksLikePreface =
      !first.includes("\n") &&
      first.length < 120 &&
      (/^(here('s| is)|below is|the (revised|edited|polished)|revised|edited|polished)/i.test(first) ||
        first.endsWith(":")) &&
      !draft.includes(first);
    if (looksLikePreface) text = blocks.slice(1).join("\n\n").trim();
  }
  return text;
}

/**
 * Whether the polished text may replace the draft.
 *
 * Every check here is something a rewrite loses SILENTLY -- there is no error,
 * the story reads fine, and a date, a child, or the reader's chapter structure
 * is gone. Rejecting keeps the draft, which is a story that already passed.
 */
export function acceptPolish(input: AcceptPolishInput): PolishVerdict {
  const { draft, storyType, targetWordCount, castNames, minimumLengthRatio } = input;
  const content = unwrapPolished(input.polished, draft);
  if (!content) return { accepted: false, reason: "empty reply" };
  if (PART_MARKER_LEFT.test(content) || /<<<[^\n]*>>>/.test(content)) {
    return { accepted: false, reason: "left a part marker in the story" };
  }

  const draftWords = countWords(draft);
  const words = countWords(content);
  const floor = Math.max(draftWords * POLISH_LENGTH_FLOOR, targetWordCount * minimumLengthRatio);
  if (words < floor) {
    return { accepted: false, reason: `too short: ${words} words against a floor of ${Math.round(floor)}` };
  }
  if (words > draftWords * POLISH_LENGTH_CEILING) {
    return { accepted: false, reason: `too long: ${words} words against a draft of ${draftWords}` };
  }

  // Structure the draft did not have. The reader turns a bold line into a
  // heading and cuts the story at an appendix heading, and the server's own
  // appendix guards key on `content.includes(HEADING)` -- so a heading the
  // model wrote would suppress the real one.
  for (const heading of ALL_HEADINGS) {
    if (content.includes(heading)) return { accepted: false, reason: `wrote an appendix heading: ${heading}` };
  }
  if (ATX_HEADING.test(content) && !ATX_HEADING.test(draft)) {
    return { accepted: false, reason: "added a heading" };
  }
  const boldLines = (s: string) => (s.match(new RegExp(BOLD_LINE_HEADING.source, "gm")) ?? []).length;
  if (boldLines(content) > boldLines(draft)) {
    return { accepted: false, reason: "added a bold heading line" };
  }
  if (PART_MARKER.test(content) && !PART_MARKER.test(draft)) {
    return { accepted: false, reason: "added a chapter or part marker" };
  }

  // Facts a rewrite drops without noticing. Only what the DRAFT had: a name
  // the story never used is not lost by not using it.
  for (const name of castNames) {
    if (name && wholeWord(draft, name) && !wholeWord(content, name)) {
      return { accepted: false, reason: `lost a name: ${name}` };
    }
  }
  const numbers = new Set(draft.match(YEAR_OR_NUMBER) ?? []);
  for (const n of numbers) {
    if (!wholeWord(content, n)) return { accepted: false, reason: `lost a date or number: ${n}` };
  }

  if (storyType === "poem") {
    const before = verseLines(draft);
    const after = verseLines(content);
    const expected = Math.max(4, Math.round(targetWordCount / WORDS_PER_VERSE_LINE));
    if (after < expected * 0.5 || after < before * 0.7) {
      return { accepted: false, reason: `lost the verse: ${after} lines from ${before}` };
    }
  }

  return { accepted: true, content };
}
