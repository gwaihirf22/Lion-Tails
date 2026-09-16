/**
 * The one thing the reader asks for in a picture.
 *
 * Blake: *"ask them if there are any additional or imperatives that should be
 * included in the picture."* A picture is drawn from the story, so it already
 * knows who is in the scene and where it is; this is for what it would not
 * think of -- the umbrella she is holding, the rain, the time of day.
 *
 * IT REACHES BOTH MODELS THAT DECIDE WHAT IS DRAWN, and that is deliberate.
 * The scene writer gets it as a section of its prompt (passageScene.ts), so
 * the moment it describes is composed around it; and the SERVER appends it to
 * the image prompt afterwards, because a model asked to carry a sentence
 * through writes its own words instead -- the look book's whole history
 * (`withLooks` in shared/lookBook.ts), and the reason `generateAvatar` appends
 * its note rather than asking for it.
 *
 * APPENDED, NEVER PREPENDED. `isPresentDayScene()` in server/lib/illustration.ts
 * reads the OPENING of the scene prompt to decide whether a quest traveller
 * keeps their own clothes, so anything in front of "In the present day," takes
 * a child out of their coat and into a tunic.
 *
 * Pure, and no regex is built from the note: it is user text.
 */

/**
 * The limit, refused rather than truncated -- `avatarRequestSchema`'s rule. A
 * sentence or two is what this is for; a paragraph is a second story.
 */
export const MAX_PICTURE_NOTE_CHARS = 300;

/** Trimmed, and quoted safely for a prompt. Empty means there is no note. */
function cleaned(note: string | undefined): string {
  return (note ?? "").trim().slice(0, MAX_PICTURE_NOTE_CHARS).trim();
}

/**
 * Quoted for a prompt, with the reader's own double quotes turned into single
 * ones so the sentence around it cannot be broken out of. Not escaping -- this
 * is a prompt, not markup -- just keeping one pair of quotes meaning one thing.
 */
function quoted(note: string): string {
  const inner = note.split('"').join("'");
  return /[.!?]$/.test(inner) ? `"${inner}"` : `"${inner}."`;
}

/**
 * The image prompt with the reader's instruction on the end.
 *
 * With no note the prompt is returned UNCHANGED, byte for byte, so every
 * picture drawn without one is the picture that would have been drawn before
 * this existed.
 */
export function withPictureNote(prompt: string, note?: string): string {
  const asked = cleaned(note);
  if (!asked) return prompt;
  return `${prompt.trimEnd()} The reader asked for this, and it must be in the picture: ${quoted(asked)}`;
}

/**
 * The section the scene writer reads. Goes LAST, with the passage -- never in
 * the cached prefix, which every picture of a story shares.
 */
export function renderPictureNoteSection(note?: string): string {
  const asked = cleaned(note);
  if (!asked) return "";
  return (
    "=== WHAT THE READER ASKED FOR ===\n" +
    "The reader asked for this in the picture, and it must be in the scene you describe: " +
    `${quoted(asked)}\n` +
    "Work it into this moment as the story allows, and do not let it change who is here, " +
    "where they are, or what the moment is."
  );
}
