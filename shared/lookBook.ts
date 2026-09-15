/**
 * How the people a story invented look, so they look the same on every page.
 *
 * A cast member has a portrait, and the portrait is attached to every picture
 * they are in. Nobody else does: Mordecai, Haman, a shopkeeper, a hero of
 * faith (`hero.imageUrl` is empty for all eighty). The cover montage anchors
 * whoever it happened to draw -- and only them, and only as they were in that
 * panel. Blake: "so that every character that appears in the generated story
 * in words could then easily appear in the pictures too."
 *
 * So the call that writes a passage picture's scene also writes one sentence
 * of appearance for each such person it drew, and every later scene is handed
 * those sentences and told to use them word for word. The words are what an
 * image model draws from; the same words are the nearest thing to the same
 * face that text can give.
 *
 * It costs no call of its own: it rides on the scene call, which already reads
 * the whole story.
 *
 * FIRST WORDS WIN. An entry is never rewritten. A look book that a later
 * picture can revise is a look book in which Haman changes his beard whenever
 * a scene describes him differently, which is the drift it exists to stop.
 */

export type LookBook = Record<string, string>;

/** Sentences, not paragraphs: one person, one line of a prompt. */
export const MAX_LOOK_CHARS = 300;
/** A story for children has a dozen named people, not thirty. */
export const MAX_LOOKS = 30;

const keyOf = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * The entries of `proposed` worth adding to `existing`. Total: whatever the
 * model sent, bad entries are dropped and nothing throws, because this runs
 * after a picture has been paid for and must never cost the picture.
 *
 * - blank names, non-strings and blank sentences: dropped;
 * - a sentence over the cap: cut at the cap (a long look is still a look);
 * - a name that is a cast member's: dropped -- they have a portrait, and a
 *   second, written face for them is a second opinion that can disagree;
 * - a name already in the book, in any case: dropped -- first words win;
 * - past MAX_LOOKS: dropped.
 */
export function newLooks(existing: unknown, proposed: unknown, castNames: readonly string[]): LookBook {
  const book = lookBookOf(existing);
  if (!proposed || typeof proposed !== "object" || Array.isArray(proposed)) return {};
  const taken = new Set([...Object.keys(book), ...castNames].map(keyOf));
  const added: LookBook = {};
  let room = MAX_LOOKS - Object.keys(book).length;
  for (const [rawName, rawLook] of Object.entries(proposed as Record<string, unknown>)) {
    if (room <= 0) break;
    if (typeof rawLook !== "string") continue;
    const name = rawName.trim().replace(/\s+/g, " ");
    const look = rawLook.trim().replace(/\s+/g, " ");
    if (!name || !look || taken.has(keyOf(name))) continue;
    added[name] = look.length > MAX_LOOK_CHARS ? `${look.slice(0, MAX_LOOK_CHARS - 1)}…` : look;
    taken.add(keyOf(name));
    room--;
  }
  return added;
}

/** A stored look book, read defensively: only string entries survive. */
export function lookBookOf(value: unknown): LookBook {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (e): e is [string, string] => typeof e[1] === "string" && Boolean(e[0].trim() && e[1].trim()),
    ),
  );
}

/** The book as prompt lines, or "" when it is empty. */
export function renderLookBook(book: LookBook): string {
  return Object.entries(book)
    .map(([name, look]) => `- ${name}: ${look}`)
    .join("\n");
}

/** A whole-word, case-insensitive find with no regex: names are model text. */
function mentions(text: string, name: string): boolean {
  const hay = text.toLowerCase();
  const needle = name.toLowerCase();
  const isWordChar = (ch: string | undefined) => Boolean(ch && /[\p{L}\p{N}]/u.test(ch));
  for (let at = hay.indexOf(needle); at !== -1; at = hay.indexOf(needle, at + 1)) {
    if (!isWordChar(hay[at - 1]) && !isWordChar(hay[at + needle.length])) return true;
  }
  return false;
}

/**
 * The picture's prompt with the look of everyone in it who is in the book.
 *
 * ADDED BY THE SERVER, NOT ASKED OF THE MODEL. The first real test asked the
 * scene writer to copy each sentence into its prompt, and it wrote the look
 * book and then described Mordecai and Haman in its own words -- the image
 * model never saw a single saved sentence. A rule the model can forget is not
 * the mechanism; this is. Only names the scene actually uses are attached, so
 * a picture of Haman carries no description of Mordecai.
 */
export function withLooks(prompt: string, book: LookBook): string {
  const lines = Object.entries(book)
    .filter(([name, look]) => mentions(prompt, name) && !prompt.includes(look))
    .map(([name, look]) => `${name}: ${look}`);
  return lines.length ? `${prompt}\n\nHow they look, the same in every picture of this story -- ${lines.join(" ")}` : prompt;
}
