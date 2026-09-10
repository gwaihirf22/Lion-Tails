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
