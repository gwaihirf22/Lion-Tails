import { storyAllowance, type StoryRequest } from "@shared/schema";
import { storage } from "../storage";
import { resolveModel } from "./modelPolicy";
import { StoryGenerationError } from "./storyErrors";

/**
 * Has this account got a free story left?
 *
 * The whole rule now lives in storyAllowance(). What was here was four things
 * at once and none of them right: its own copies of 50 and 10, a 30-day
 * "month" that agreed with neither endpoint, an unguarded reset that two
 * concurrent calls could both fire, and -- above all -- a "count < 50" early
 * return that made the monthly path unreachable. Because the reset set count
 * to 0, the very next call short-circuited there, so a user who ran out got
 * FIFTY more rather than ten a month. That is the behaviour Blake asked to
 * change, and it had never actually run.
 */
async function canGenerateStoryWithFreeTier(userId: number = 1): Promise<boolean> {
  // Admins bypass the quota. This used to compare username === 'paulblake',
  // which is one rename away from locking the owner out and, worse, would grant
  // the bypass to anyone who registered that name -- nothing reserves it.
  const user = await storage.getUser(userId);
  if (user?.isAdmin) return true;

  // Forgive whatever months are owed first, and persist it -- otherwise the
  // allowance would be recomputed from a stale count on every request and the
  // top-up would never actually land in the row.
  const { count, lastResetDate } = await storage.applyStoryTopUp(userId);
  return storyAllowance({ count, lastResetDate }).remaining > 0;
}

/**
 * Quota check for the ENQUEUE path.
 *
 * Quota is charged at success now, not at enqueue, so this must count work
 * already in flight as well as work already paid for. Without that a user could
 * enqueue repeatedly before any of it completed and never be told no. A
 * free-tier user's concurrency limit is 1, so the maximum unconsumed exposure
 * is exactly one generation.
 *
 * Local generations are free. The quota exists to protect the owner's OpenAI
 * credits, and Ollama costs electricity -- so the decision comes from the
 * resolved model rather than from a second key lookup. This is a deliberate
 * behaviour change: the old check was `if (!userApiKey)`, which charged local
 * users for something that cost the owner nothing.
 */
export async function canEnqueueWithinQuota(
  userId: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const resolved = await resolveModel(userId, "chat").catch(() => null);
  // A missing model is not a quota problem; let the enqueue path report it.
  if (!resolved) return { ok: true };
  if (resolved.provider !== "openai") return { ok: true };
  if (resolved.usingOwnKey || resolved.isAdmin) return { ok: true };

  const withinQuota = await canGenerateStoryWithFreeTier(userId);
  if (!withinQuota) {
    return {
      ok: false,
      message:
        "You've reached your free story generation limit. Add your own OpenAI API key in Settings to continue, choose a local model, or wait until next month when your free quota refreshes.",
    };
  }
  return { ok: true };
}

// generateStory() was removed here. Story generation is asynchronous now:
// POST /api/story/generate enqueues a story_jobs row and the worker runs it
// (server/lib/storyWorker.ts). Keeping a synchronous entry point that no
// route called would have left a second generation path that nothing
// exercises -- untested, and free to drift from the one that runs. The quota
// helper below is still used, by the enqueue route.
