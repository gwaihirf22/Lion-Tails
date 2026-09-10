/**
 * The name of the series every library begins with.
 *
 * Shared because it is printed in two places that must agree: the prologue's
 * own heading (server/data/questPrologue.ts) and the card the library pins it
 * on (client/src/pages/SavedStories.tsx). Everything else about the universe
 * is server data in server/data/lionTails.ts, which the client never reads.
 */
export const QUEST_SERIES_TITLE = "Quests of the Timekeeper";
