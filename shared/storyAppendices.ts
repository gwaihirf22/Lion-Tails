/**
 * The blocks the SERVER adds to a finished story, named in one place.
 *
 * Three things are appended to `story.content` after the model is done, each
 * for the same reason: a section the model is asked to remember is one it can
 * forget, soften, or bury in the middle. Appending them makes them exact and
 * unconditional.
 *
 * WHY THEY NEED A SHARED NAME. They are prose, sitting in the same column as
 * the story, and everything downstream that reads a story reads them too --
 * which is fine for a reader and wrong for a machine. The universe summariser
 * feeds a story's content verbatim into a model that writes
 * `story_universes.world_state`, and that becomes canon for the NEXT story in
 * the world. Left in, "Ada is invented; nobody like them was there" is
 * summarised as an event, and a disclaimer becomes a fact about the universe.
 */

/** Says plainly that the character in a real account was invented. */
export const MEETING_NOTE_HEADING = "**About this story:**";

/**
 * The note's first sentence, which depends on WHAT the account is.
 *
 * It said `${label} really lived` for both kinds of source, and a biblical
 * event's label is not a person: a real story came back "**About this story:**
 * Paul's Missionary Journeys really lived", and Noah's Ark would have "lived"
 * too. The note is the one place a reader is told what is true and what was
 * invented, so a sentence in it that reads as nonsense costs it the only thing
 * it has.
 *
 * Pure, and here rather than at the call site, so it can be read in a test
 * without a model call.
 */
export function accountIsRealSentence(source: { kind: "biblical-event" | "hero-of-faith"; label: string }): string {
  return source.kind === "hero-of-faith"
    ? `${source.label} really lived, and what happens in this story is what the account records.`
    : `${source.label} is a real account from the Bible, and what happens in this story is what it records.`;
}

/** Answers to what the reader asked about the account. */
export const DIGGING_DEEPER_HEADING = "**Digging deeper:**";

/** The two static links every story ends with. */
export const FURTHER_LEARNING_HEADING = "**For Further Learning:**";

export const ALL_HEADINGS = [
  MEETING_NOTE_HEADING,
  DIGGING_DEEPER_HEADING,
  FURTHER_LEARNING_HEADING,
];

/**
 * The story as the model wrote it, with everything the server added removed.
 *
 * Cuts from the EARLIEST appended heading onward rather than matching each
 * block, so a heading added later is covered without anyone remembering to
 * come back here -- and so a block whose exact wording has changed over time
 * still cuts, since only the heading has to match.
 *
 * Returns the content unchanged when it finds nothing, which is the normal
 * case for stories written before any of this existed.
 */
export function storyWithoutAppendices(content: string): string {
  return splitAppendices(content).body.trimEnd();
}

/**
 * The story and its appended blocks, apart -- and put back exactly.
 *
 * For the one write path that changes a story's text by hand: a parent edits
 * the BODY, and the server re-attaches whatever appendices the stored content
 * carried, so the disclaimer cannot be deleted by an edit. `body + appendices`
 * is the original content, byte for byte; `appendices` is "" when there are
 * none.
 */
export function splitAppendices(content: string): { body: string; appendices: string } {
  let cut = -1;
  for (const heading of ALL_HEADINGS) {
    const at = content.indexOf(heading);
    if (at !== -1 && (cut === -1 || at < cut)) cut = at;
  }
  return cut === -1
    ? { body: content, appendices: "" }
    : { body: content.slice(0, cut), appendices: content.slice(cut) };
}
