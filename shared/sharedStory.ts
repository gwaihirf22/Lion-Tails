/**
 * What a stranger may see of a shared story.
 *
 * Blake: "a share story option which would create a link that would allow a
 * person to view the story without having an account."
 *
 * AN ALLOW-LIST, NEVER THE ROW. A saved story carries a great deal that is not
 * the story:
 *
 *   - `story.debugData` -- every prompt and every raw model reply for the
 *     whole generation, system prompt included;
 *   - `request` -- the children: names, ages, traits, what a parent typed
 *     into "what should happen";
 *   - `story.imagePrompt` and each picture's `prompt` -- written from the
 *     character sheet's APPEARANCE fields, including "How they look, for
 *     pictures", which by design reaches no story text at all. Publishing it
 *     would publish details of a child the story itself never mentions;
 *   - `universeId`, `heroId`, `userId`, `expiresAt`, `isFavorite`.
 *
 * So the view is built field by field from things the READER already sees on
 * the page, and `tests/sharedStory.test.ts` asserts its exact key set. Adding a
 * field here is a decision to publish it; the test makes that deliberate.
 *
 * Nothing here says whose story it is. No username, no account.
 */

import type { EditLogEntry } from "./editLog";
import { storyImagesOf, type SavedStory, type StoryPicture } from "./schema";
import { BUILT_IN_STORY_IDS } from "./quests";

/**
 * A share token: 16 random bytes as base64url, which is always 22 characters.
 *
 * Checked on the public route BEFORE any query, so junk never reaches the
 * database, and by the share page before it fetches. Generated in
 * server/lib/sharing.ts, which is the only place with a CSPRNG to hand.
 */
export const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

/** Where a share link points. One definition, for the dialog and the server. */
export function sharePathFor(token: string): string {
  return `/s/${token}`;
}

/**
 * Could this /s/:token segment name a story at all?
 *
 * TWO shapes reach the same path. A normal share is a minted token -- the
 * whole capability, unguessable and revocable, because the story behind it is
 * one family's. A story the app ships with is named by its plain id: it has no
 * row for a token to point at, and needs none, since nothing about it is
 * private and it is already in every library.
 *
 * Checked before fetching so a typo costs no request -- but it MUST know about
 * both, or it turns a good link away. It did: the client tested the token
 * shape alone and answered "no longer shared" for the prologue, without ever
 * asking the server, which would have said yes.
 */
export function isShareTarget(token: string): boolean {
  return SHARE_TOKEN_PATTERN.test(token) || BUILT_IN_STORY_IDS.includes(token);
}

export type SharedStoryView = {
  title: string;
  /** Appendices included: the "About this story" note travels with the story. */
  content: string;
  storyType?: SavedStory["story"]["storyType"];
  /** Changes one line a reader sees under the questions. Not personal. */
  moralOutcome: SavedStory["story"]["moralOutcome"];
  bibleVerse: SavedStory["story"]["bibleVerse"];
  applicationQuestions: string[];
  /** The chosen picture -- the one at the end of the story. */
  imageUrl?: string;
  /** Every picture, for the ones set into the text. No prompts: see above. */
  images: Array<Pick<StoryPicture, "id" | "url" | "anchor"> & { prompt: "" }>;
  /**
   * When a parent edited it, so the page says "Edited by a parent" as the app
   * does. Safe to publish by construction: entries are {at, by: "parent",
   * changed} and editLog.ts guarantees the log never carries a name.
   */
  editLog: EditLogEntry[];
};

export function sharedStoryView(
  saved: Pick<SavedStory, "story" | "images" | "createdAt"> & {
    editLog?: EditLogEntry[] | null;
  },
): SharedStoryView {
  const s = saved.story;
  return {
    title: s.title,
    content: s.content,
    ...(s.storyType ? { storyType: s.storyType } : {}),
    moralOutcome: s.moralOutcome,
    bibleVerse: s.bibleVerse,
    applicationQuestions: s.applicationQuestions ?? [],
    ...(s.imageUrl ? { imageUrl: s.imageUrl } : {}),
    // Through storyImagesOf, so a story illustrated before galleries existed
    // still shows its one picture -- and then rebuilt, key by key, because
    // spreading the picture object would carry its prompt along.
    images: storyImagesOf(saved).map((p) => ({
      id: p.id,
      url: p.url,
      ...(p.anchor ? { anchor: p.anchor } : {}),
      prompt: "" as const,
    })),
    // Rebuilt entry by entry, for the same reason as the pictures: a spread
    // would carry along anything a future entry grows.
    editLog: (saved.editLog ?? []).map((e) => ({ at: e.at, by: e.by, changed: [...e.changed] })),
  };
}
