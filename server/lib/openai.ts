import { creditsLabel, FREE_STORIES_PER_MONTH, storyAllowance, type StoryRequest } from "@shared/schema";
import { storage } from "../storage";
import { DEFAULTS, MODEL_CATALOG, modelName, resolveModel, storyCreditsFor } from "./modelPolicy";
import { StoryGenerationError } from "./storyErrors";

/**
 * What to tell someone who cannot afford the story they asked for.
 *
 * It names the three ways out that actually exist, and only the ones that
 * apply: a cheaper model is suggested only when they can afford it, because
 * "switch to Luna" to someone with no credits at all is a second refusal
 * waiting to happen.
 *
 * Pure, so the wording is tested rather than discovered by running out.
 */
export function notEnoughCreditsMessage(
  model: string,
  credits: number,
  allowance: { remaining: number; nextTopUp: Date },
): string {
  // Local time, as startOfMonthAfter builds it: formatted in UTC, midnight on
  // the 1st is still the 30th anywhere west of Greenwich.
  const when = allowance.nextTopUp.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  const topUp = `or wait for ${FREE_STORIES_PER_MONTH} more on ${when}`;

  const cheaper = DEFAULTS.chat;
  const cheaperCost = MODEL_CATALOG[cheaper]?.storyCredits ?? 1;
  if (model !== cheaper && allowance.remaining >= cheaperCost) {
    return (
      `A story on ${modelName(model)} costs ${creditsLabel(credits)} and you have ` +
      `${creditsLabel(allowance.remaining)}. Switch to ${modelName(cheaper)} in Settings ` +
      `(${creditsLabel(cheaperCost)} a story), add your own OpenAI key, ${topUp}.`
    );
  }
  return (
    `You have used all your credits. Choose a local model in Settings, ` +
    `add your own OpenAI key, ${topUp}.`
  );
}

/**
 * How many free credits has this account got?
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
async function freeAllowanceFor(userId: number = 1) {
  // Forgive whatever months are owed first, and persist it -- otherwise the
  // allowance would be recomputed from a stale count on every request and the
  // top-up would never actually land in the row.
  const { count, lastResetDate } = await storage.applyStoryTopUp(userId);
  return storyAllowance({ count, lastResetDate });
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
  const resolved = await resolveModel(userId, "chat", { forStory: true }).catch(() => null);
  // A missing model is not a quota problem; let the enqueue path report it.
  if (!resolved) return { ok: true };

  // The same price the worker will charge when the story finishes, from the
  // same function -- so the check and the bill cannot disagree. Zero covers a
  // local model, an admin, and anyone on their own key.
  const credits = storyCreditsFor(resolved.model, {
    isAdmin: resolved.isAdmin,
    hasOwnKey: resolved.usingOwnKey,
  });
  if (credits === 0) return { ok: true };

  /**
   * ENOUGH FOR THIS STORY, not "any left". A flat price of 1 made those the
   * same question. At 3 credits for Terra they are not: an account with 2
   * credits has some left and cannot afford the story it is asking for, and
   * letting it through would charge it into a negative balance the allowance
   * then has to clamp away -- a free Terra story on the owner.
   */
  const allowance = await freeAllowanceFor(userId);
  if (allowance.remaining < credits) {
    return { ok: false, message: notEnoughCreditsMessage(resolved.model, credits, allowance) };
  }
  return { ok: true };
}

// generateStory() was removed here. Story generation is asynchronous now:
// POST /api/story/generate enqueues a story_jobs row and the worker runs it
// (server/lib/storyWorker.ts). Keeping a synchronous entry point that no
// route called would have left a second generation path that nothing
// exercises -- untested, and free to drift from the one that runs. The quota
// helper below is still used, by the enqueue route.
