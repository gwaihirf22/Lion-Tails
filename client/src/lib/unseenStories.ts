/**
 * Stories written and not yet opened, for the nav bubble.
 *
 * ONE QUERY KEY, exported, because three places need to agree about it: the
 * Header asks, the reader clears it, and the library clears it. A second
 * spelling of the key is a bubble that never goes away -- the invalidation
 * lands on a cache entry nobody is reading.
 *
 * A COUNT AND NOT THE LIBRARY. This runs on every page load, and the stories
 * endpoint returns every story's full text; counting them in the browser would
 * make the badge the most expensive request in the app.
 */
export const UNSEEN_STORIES_KEY = ["/api/stories/unseen/count"] as const;

export type UnseenStories = { count: number };
