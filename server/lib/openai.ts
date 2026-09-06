import { StoryRequest, StoryResponse } from "@shared/schema";
import { getBibleVerseByTheme } from "../data/bibleVerses";
import { generateStoryWithOpenAI } from "./openai-implementation";
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

// Main story generation function
export async function generateStory(
  request: StoryRequest,
  userId: number = 1,
  // generationId identifies the generation_records row for this attempt, so a
  // saved story can point at the record that produced it.
): Promise<StoryResponse & { debugData?: any[]; generationId?: string }> {
  const { childName, gender, animal, useAnimal, theme, biblicalEvent, useTimeTravel, characterId, storyType, heroOfFaith, useCustomPrompts, customSystemPrompt, customUserPrompt } = request;
  
  try {
    // Get the user's OpenAI key if they've provided one
    const userApiKey = await storage.getUserOpenAIKey(userId);
    
    // Check if user can generate a story with free tier if they don't have their own API key
    if (!userApiKey) {
      const canGenerate = await canGenerateStoryWithFreeTier(userId);
      
      if (!canGenerate) {
        throw new StoryGenerationError(
          "quota_exceeded",
          "You've reached your free story generation limit. Add your own OpenAI API key in Settings to continue, or wait until next month when your free quota refreshes.",
        );
      }
      
      // Increment the counter for free tier
      await storage.incrementStoryGenerationCount(userId);
    }
    
    
    // Get a bible verse related to the theme
    const bibleVerse = getBibleVerseByTheme(theme);
    
    // For time travel stories, we need to handle them differently
    if (useTimeTravel && characterId) {
      // Get bible verse related to the theme
      // Use the OpenAI implementation to generate a story
      const generatedStory = await generateStoryWithOpenAI(request, userId);
      
      // Add the bible verse to the response
      return {
        ...generatedStory,
        bibleVerse
      };
    }
    
    // No model at all. This used to fall through to a ~1400-word canned
    // "Noah's Ark" story, personalised with the child's name and returned with
    // HTTP 200 and no marker of any kind -- so asking for courage and a rabbit
    // returned Noah's Ark and nothing said the model was never called.
    //
    // The .catch(() => null) that used to wrap this also swallowed the real
    // reason from modelPolicy, e.g. "OpenAI API key not found".
    const availableModel = await resolveModel(userId, "chat");
    if (!availableModel) {
      throw new StoryGenerationError(
        "no_model_available",
        "No story model is available for your account. Add your own OpenAI API key in Settings, or choose a local model if one is configured.",
      );
    }
    
    // Use the OpenAI implementation to generate a story with userId for API key access
    // Pass custom prompts if Parent Mode is active and prompts are provided

    const customPrompts = useCustomPrompts ? { systemPrompt: customSystemPrompt, userPrompt: customUserPrompt } : undefined;
    const generatedStory = await generateStoryWithOpenAI(request, userId, customPrompts);
    
    // Add the bible verse to the response
    return {
      ...generatedStory,
      bibleVerse
    };
  } catch (error) {
    // Never convert a failure into a story. This catch used to return a valid
    // StoryResponse titled "Story Generation Error" with HTTP 200; because it
    // satisfied storyResponseSchema, nothing downstream could distinguish it
    // from real output, and the client auto-saved it to the user's library
    // with a success toast.
    //
    // Typed failures pass through untouched so the route can map them to a
    // real status code; anything else is wrapped with its message preserved.
    if (error instanceof StoryGenerationError) {
      throw error;
    }

    console.error("Error generating story:", error);
    const wrapped = new StoryGenerationError(
      "generation_failed",
      error instanceof Error && error.message
        ? error.message
        : "There was a problem generating your story. Please try again.",
      { cause: error, debugData: (error as any)?.debugData },
    );
    // debugData is attached to the thrown error by the generator and was
    // previously discarded here.
    throw wrapped;
  }
}
