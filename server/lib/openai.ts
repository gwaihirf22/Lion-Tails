import { StoryRequest } from "@shared/schema";
import { storage } from "../storage";
import { resolveModel } from "./modelPolicy";
import { StoryGenerationError } from "./storyErrors";

// Constants for our subscription model
const FREE_STORY_INITIAL_QUOTA = 50;
const FREE_STORY_MONTHLY_QUOTA = 10;
const MONTH_IN_MS = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

// Function to check if user can generate a story with the free tier
async function canGenerateStoryWithFreeTier(userId: number = 1): Promise<boolean> {
  // Admins bypass the quota. This used to compare username === 'paulblake',
  // which is one rename away from locking the owner out and, worse, would grant
  // the bypass to anyone who registered that name -- nothing reserves it.
  const user = await storage.getUser(userId);
  if (user?.isAdmin) {
    return true;
  }
  
  // Default to user ID 1 if not authenticated
  const count = await storage.getStoryGenerationCount(userId);
  const lastResetDate = await storage.getLastResetDate(userId);
  
  // If user has generated less than the initial quota, they can generate a story
  if (count < FREE_STORY_INITIAL_QUOTA) {
    return true;
  }
  
  // If it's been a month since the last reset, reset the counter
  // and give the user their monthly quota
  if (lastResetDate) {
    const now = new Date();
    const timeSinceLastReset = now.getTime() - lastResetDate.getTime();
    
    if (timeSinceLastReset >= MONTH_IN_MS) {
      // It's been a month, so reset the counter
      await storage.resetStoryGenerationCount(userId);
      return true;
    }
    
    // Check if user has monthly quota available
    const monthlyQuotaUsed = count - FREE_STORY_INITIAL_QUOTA;
    const currentMonthNumber = Math.floor(timeSinceLastReset / MONTH_IN_MS) + 1;
    const totalMonthlyQuota = FREE_STORY_MONTHLY_QUOTA * currentMonthNumber;
    
    return monthlyQuotaUsed < totalMonthlyQuota;
  }
  
  // If no reset date has been set, set it now and allow the generation
  await storage.setLastResetDate(userId, new Date());
  return true;
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
