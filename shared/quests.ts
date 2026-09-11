import { characterRoleOf } from "./schema";

/**
 * The name of the series every library begins with.
 *
 * Shared because it is printed in two places that must agree: the prologue's
 * own heading (server/data/questPrologue.ts) and the card the library pins it
 * on (client/src/pages/SavedStories.tsx). Everything else about the universe
 * is server data in server/data/lionTails.ts, which the client never reads.
 */
export const QUEST_SERIES_TITLE = "Quests of the Timekeeper";

/**
 * Is this story one of the Timekeeper's?
 *
 * ONE definition, because the library's tab is the first thing to ask and it
 * will not be the last -- a badge, the Quests page. Two are what the app
 * ships with (`builtIn`: the prologue has no journey in its request, it IS
 * the series), and any story whose request was a quest. The role is read
 * through characterRoleOf(), never off the field: a legacy `useTimeTravel`
 * story is a quest too, and only that function knows it.
 */
export function isTimekeeperStory(story: {
  builtIn?: boolean | null;
  request?: { characterRole?: string | null; useTimeTravel?: boolean | null } | null;
}): boolean {
  return story.builtIn === true || characterRoleOf(story.request) === "travels";
}

/**
 * The shortest a quest may be, and why there is a floor at all.
 *
 * A quest has to fit two stories: the way in -- their own life, the moment
 * asking something of them, the shop arriving where it could not be, the
 * crossing -- and then the account itself, faithfully, with the real events in
 * order. The outline gives the way in a part of its own, so what is left for
 * the account is everything after part one:
 *
 *   very-short   500 words, and written in ONE call with no outline at all,
 *                so the way in has no budget to be given
 *   short      1,000 words in 3 parts -> 667 for the account and the return
 *   medium     1,500 words in 3 parts -> 1,000
 *   long       2,500 words in 5 parts -> 2,000
 *
 * 667 words is not a retelling of Genesis 37-50, it is a summary of one. So
 * the floor is medium, which was verified end to end rather than assumed, and
 * QUEST_PREFERRED_LENGTH is what the form offers first: the account is the
 * variable this cannot control, and the big ones want the room.
 *
 * REFUSED, never quietly upgraded. decisions.md 16: "Length is what the user
 * asked for; silently shortening it delivers something other than the
 * request" -- and silently lengthening it spends more of the owner's money
 * than they chose to.
 */
export const QUEST_LENGTHS = ["medium", "long", "extended"] as const;

export const QUEST_PREFERRED_LENGTH = "long";

export function questLengthAllowed(storyLength?: string | null): boolean {
  return QUEST_LENGTHS.includes((storyLength ?? "") as (typeof QUEST_LENGTHS)[number]);
}
