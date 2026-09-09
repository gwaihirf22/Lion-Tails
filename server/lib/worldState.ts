/**
 * What a world remembers, and how much force each memory carries.
 *
 * THE PROBLEM THIS SOLVES. A story that continues another needs to know what is
 * already true, or the villain's name changes between episodes. But a model
 * handed a list of facts treats it as a checklist and writes the same story
 * again -- so the next story is either inconsistent or cookie-cutter, and the
 * first version of this feature would have produced the second.
 *
 * The fix is not more facts, it is GRADED facts. Three kinds, each rendered with
 * different force:
 *
 *   character  these people exist and have these names. Identity, not
 *              obligation -- nobody has to appear.
 *   fact       already true. Do not contradict. Hard.
 *   thread     left open. You MAY pick one up, or ignore them all. Explicitly
 *              optional, and saying so is the entire mechanism.
 *
 * Without the third tier every remembered thing reads as an instruction. With
 * it, the model is told plainly which things it is free to leave alone -- which
 * is what "available but not always acted upon" actually requires.
 *
 * WHY ENTRIES AND NOT PROSE. A world changes: Leroy gets sick, Joseph leaves.
 * Prose can only be rewritten wholesale, which costs a re-read of every story.
 * Entries can be superseded one at a time by the extraction that noticed the
 * change, so the world stays current for the price of reading the newest story.
 *
 * Pure. No database, no model, no React -- every rule here is unit tested.
 */

/** The most entries a world keeps. Beyond this the prompt is a document. */
export const MAX_WORLD_ENTRIES = 60;
/** Per entry. Long enough for "Leroy, Mia's uncle, runs the bakery"; not a paragraph. */
export const MAX_ENTRY_LENGTH = 200;

export type WorldEntryKind = "character" | "fact" | "thread";

export type WorldEntry = {
  id: string;
  kind: WorldEntryKind;
  text: string;
  /**
   * "closed" means resolved, or gone from the story. Kept rather than deleted,
   * so a later extraction can see that a thread was already tied off instead of
   * proposing it again -- and so a human can tell the difference between
   * "never happened" and "happened and finished".
   */
  status: "current" | "closed";
  /** Which story introduced it. Provenance, and what a UI would link to. */
  sourceStoryId?: string;
  updatedAt: string;
};

/** What the extraction model is asked to return. */
export type WorldPatch = {
  add?: Array<{ kind: WorldEntryKind; text: string }>;
  /** Revisions to entries the model was shown, by id. */
  update?: Array<{ id: string; text?: string; status?: "current" | "closed" }>;
  /**
   * A refreshed prose summary of the world, for a person to read.
   *
   * Produced by the SAME call as the entries, which is what retires the
   * separate summarise-this-universe job: that one re-read up to eight whole
   * stories to say what this one says from the newest story plus the entries it
   * was already shown. One call, and it can never be stale because it is
   * rewritten every time the world changes.
   */
  summary?: string;
};

const clean = (s: unknown): string =>
  typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, MAX_ENTRY_LENGTH) : "";

const isKind = (k: unknown): k is WorldEntryKind =>
  k === "character" || k === "fact" || k === "thread";

/**
 * Fold an extraction into the world.
 *
 * Deliberately total and forgiving: this consumes MODEL OUTPUT, which is
 * checked for shape but cannot be trusted for sense. An unknown id, a bad kind
 * or an empty string is dropped rather than throwing, because the alternative
 * is a failed background job that loses a whole story's continuity over one
 * malformed row.
 */
export function mergeWorldState(
  existing: WorldEntry[],
  patch: WorldPatch,
  opts: { sourceStoryId: string; now?: string; newId?: () => string },
): WorldEntry[] {
  const now = opts.now ?? new Date().toISOString();
  const newId = opts.newId ?? (() => Math.random().toString(36).slice(2, 10));
  const byId = new Map(existing.map((e) => [e.id, { ...e }]));

  for (const u of patch.update ?? []) {
    const entry = byId.get(u?.id);
    if (!entry) continue; // an id the model invented
    const text = clean(u.text);
    if (text) entry.text = text;
    if (u.status === "current" || u.status === "closed") entry.status = u.status;
    entry.updatedAt = now;
  }

  // Case-insensitive on the text, because a model re-proposing a fact it was
  // just shown is the common failure and a duplicated world grows without
  // bound. This is not clever de-duplication and does not try to be: near
  // duplicates are the extraction prompt's job to avoid, not this function's
  // to guess at.
  const seen = new Set([...byId.values()].map((e) => e.text.toLowerCase()));

  for (const a of patch.add ?? []) {
    if (!isKind(a?.kind)) continue;
    const text = clean(a.text);
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    const id = newId();
    byId.set(id, {
      id,
      kind: a.kind,
      text,
      status: "current",
      sourceStoryId: opts.sourceStoryId,
      updatedAt: now,
    });
  }

  const all = [...byId.values()];
  if (all.length <= MAX_WORLD_ENTRIES) return all;

  // Over the cap. Drop CLOSED entries first, oldest first -- a resolved thread
  // is the least useful thing to keep, and dropping a current fact would let
  // the next story contradict something it was told.
  const rank = (e: WorldEntry) => (e.status === "closed" ? 0 : 1);
  return all
    .sort((x, y) => rank(x) - rank(y) || x.updatedAt.localeCompare(y.updatedAt))
    .slice(all.length - MAX_WORLD_ENTRIES);
}

/** Entries the next story should be told about, in the order they are rendered. */
export function activeWorld(entries: WorldEntry[]): {
  characters: string[];
  facts: string[];
  threads: string[];
} {
  const live = entries.filter((e) => e.status === "current");
  return {
    characters: live.filter((e) => e.kind === "character").map((e) => e.text),
    facts: live.filter((e) => e.kind === "fact").map((e) => e.text),
    threads: live.filter((e) => e.kind === "thread").map((e) => e.text),
  };
}

export function extractionSystemPrompt(): string {
  return (
    "You keep the continuity notes for a series of children's stories. You " +
    "record what a LATER story would need to know so that it does not " +
    "contradict this one. You are not a reviewer and not a storyteller: you do " +
    "not judge the story, you do not retell it, and you never invent anything " +
    "that is not in the text."
  );
}

/**
 * The extraction prompt.
 *
 * The framing is Blake's and it is the load-bearing part: not "summarise this
 * story" but "if this story were to continue, what must be noted". Those
 * produce different output -- the first gives a plot recap, the second gives
 * the things that would be wrong to change.
 */
export function extractionUserPrompt(story: { title: string; content: string }, existing: WorldEntry[]): string {
  const known = existing
    .filter((e) => e.status === "current")
    .map((e) => `  ${e.id} [${e.kind}] ${e.text}`)
    .join("\n");

  return `
STORY: ${story.title}

${story.content}

${known ? `ALREADY RECORDED about this world:\n${known}\n` : ""}
Suppose someone writes the NEXT story in this world. What must be noted so
they do not contradict this one?

Record three kinds of thing:

  character  Anyone who appeared and was named, with one line saying who they
             are. Include people the story invented, not only the ones it was
             given -- a character who was there is a character whose name must
             not change in the next story. Do not record unnamed extras: "a boy
             in her class", "the shopkeeper".
  fact       Something now true that a later story must not contradict.
             Relationships, places, objects, what happened and what it cost.
  thread     Something left open that a later story COULD pick up. A decision
             not made, a question not answered, a thing not yet mended.

${known ? `You may also REVISE what is already recorded, by id, when this story
changed it -- someone fell ill, someone left, a thread was resolved. Set status
to "closed" for anything now finished or gone. Do not re-add something already
recorded.
` : ""}
Prefer specifics -- names, places, objects -- over summary language like "they
learned about courage". Nothing about how good the story is, and no morals.
Each entry under ${MAX_ENTRY_LENGTH} characters.

Also write "summary": a short paragraph, about 120 words, telling someone who
has not read these stories what this world is and what has happened in it so
far. Prose, for a person to read. Not a list, and not a review.

Respond with ONLY a valid JSON object:
{ "add": [{ "kind": "character" | "fact" | "thread", "text": "..." }],
  "summary": "..."${
    known ? `,\n  "update": [{ "id": "...", "text": "...", "status": "current" | "closed" }]` : ""
  } }
`.trim();
}

/** Shape check for the model's reply. Sense is not checkable; shape is. */
export function parseWorldPatch(value: unknown): WorldPatch | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as { add?: unknown; update?: unknown };
  const add = Array.isArray(v.add)
    ? v.add.filter((a: any) => isKind(a?.kind) && clean(a?.text)).map((a: any) => ({
        kind: a.kind as WorldEntryKind,
        text: clean(a.text),
      }))
    : [];
  const update = Array.isArray(v.update)
    ? v.update.filter((u: any) => typeof u?.id === "string").map((u: any) => ({
        id: u.id as string,
        text: typeof u.text === "string" ? clean(u.text) : undefined,
        status: u.status === "closed" || u.status === "current" ? u.status : undefined,
      }))
    : [];
  const summary =
    typeof (value as { summary?: unknown }).summary === "string"
      ? (value as { summary: string }).summary.trim().slice(0, 2000)
      : undefined;
  // An extraction that found nothing at all is a failed extraction, not an
  // empty world -- every story introduces someone or establishes something.
  if (add.length === 0 && update.length === 0) return undefined;
  return { add, update, summary };
}
