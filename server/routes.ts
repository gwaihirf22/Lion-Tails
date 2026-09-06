import type { Express, Request, Response } from "express";
import { dbConnectionStatus, pool, schemaStatus, schemaProblems } from "./db";
import { isModelAllowedFor, listSelectableModels } from "./lib/modelPolicy";
import { StoryGenerationError } from "./lib/storyErrors";
import {
  enqueueStoryJob,
  getStoryJob,
  listActiveStoryJobs,
  cancelStoryJob,
  countInFlight,
} from "./lib/storyJobs";
import {
  buildStoryBrief,
  buildSystemPrompt,
  resolveStoryCharacter,
} from "./lib/storyBrief";
import { getWordCountFromLength } from "./lib/openai-implementation";
import { canEnqueueWithinQuota } from "./lib/openai";
import { requireAuth } from "./lib/requireAuth";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { storyRequestSchema, savedStorySchema, songSchema, characterSchema, heroOfFaithSchema, heroStorySchema } from "@shared/schema";
import { analyzeImageWithOpenAI } from "./lib/openai-implementation";
import { getBibleVerseByTheme } from "./data/bibleVerses";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import { v4 as uuidv4 } from "uuid";
import { setupAuth } from "./auth";
import { registerSongRoutes } from "./songs";
import { requireAdmin } from "./lib/requireAuth";

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication with passport and session
  setupAuth(app);

  // API routes for characters - all require authentication
  
  // Get all characters - requires authentication
  app.get("/api/characters", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to view characters" });
      }
      
      // Get user ID from authenticated user
      const userId = (req.user as any).id;
      
      // Get only characters belonging to this user
      const characters = await storage.getAllCharacters(userId);
      res.json(characters);
    } catch (error) {
      console.error("Error fetching characters:", error);
      res.status(500).json({ message: "Failed to fetch characters" });
    }
  });
  
  // Get a specific character - requires authentication
  app.get("/api/characters/:id", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to view characters" });
      }
      
      const character = await storage.getCharacterById(req.params.id);
      if (!character) {
        return res.status(404).json({ message: "Character not found" });
      }
      
      // In the future, we should check if the character belongs to the user
      // const userId = (req.user as any).id;
      // if (character.userId !== userId) {
      //   return res.status(403).json({ message: "Not authorized to access this character" });
      // }
      
      res.json(character);
    } catch (error) {
      console.error("Error fetching character:", error);
      res.status(500).json({ message: "Failed to fetch character" });
    }
  });
  
  // Create a new character - requires authentication
  app.post("/api/characters", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to create characters" });
      }
      
      // Get user ID from authenticated user
      const userId = (req.user as any).id;
      
      // The id and createdAt fields will be added by the storage method
      const { id, createdAt, ...characterData } = req.body;
      
      // Create the character associated with the authenticated user
      const character = await storage.createCharacter(characterData, userId);
      res.status(201).json(character);
    } catch (error) {
      console.error("Error creating character:", error);
      
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      
      res.status(500).json({ message: "Failed to create character" });
    }
  });
  
  // Update a character - requires authentication
  app.put("/api/characters/:id", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to update characters" });
      }
      
      // Get user ID from authenticated user
      const userId = (req.user as any).id;
      
      // Remove fields that should not be updated directly
      const { id: bodyId, createdAt, ...updates } = req.body;
      
      // Get the character to check ownership
      const existingCharacter = await storage.getCharacterById(req.params.id);
      
      // Check if character exists and belongs to the user
      if (!existingCharacter) {
        return res.status(404).json({ message: "Character not found" });
      }
      
      // In the future, we should check ownership
      // if (existingCharacter.userId !== userId) {
      //   return res.status(403).json({ message: "Not authorized to update this character" });
      // }
      
      // Update the character
      const character = await storage.updateCharacter(req.params.id, updates);
      
      if (!character) {
        return res.status(404).json({ message: "Character not found" });
      }
      
      res.json(character);
    } catch (error) {
      console.error("Error updating character:", error);
      
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      
      res.status(500).json({ message: "Failed to update character" });
    }
  });
  
  // Delete a character - requires authentication
  app.delete("/api/characters/:id", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to delete characters" });
      }
      
      // Get user ID from authenticated user
      const userId = (req.user as any).id;
      
      // Get the character to check ownership
      const existingCharacter = await storage.getCharacterById(req.params.id);
      
      // Check if character exists
      if (!existingCharacter) {
        return res.status(404).json({ message: "Character not found" });
      }
      
      // In the future, we should check ownership
      // if (existingCharacter.userId !== userId) {
      //   return res.status(403).json({ message: "Not authorized to delete this character" });
      // }
      
      const success = await storage.deleteCharacter(req.params.id);
      
      if (!success) {
        return res.status(404).json({ message: "Character not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting character:", error);
      res.status(500).json({ message: "Failed to delete character" });
    }
  });
  
  // Register song routes
  registerSongRoutes(app);

  // POST /api/generate-story was deleted here. It had zero client callers and
  // was a second generation path with different save semantics -- exactly the
  // kind of parallel definition that has produced most of this repo's bugs.

  // Enqueue-only. The URL is kept because the client posts here, but it now
  // answers 202 with a job id instead of holding the request open for the whole
  // generation. That request could run 500s on a local model, past SWAG's 240s
  // proxy timeout -- at which point nginx returns its own HTML error page, the
  // client parses it as JSON, and the user sees
  // `Unexpected token '<', "<!DOCTYPE "`. Removing the long-lived request is
  // what removes that failure, and it also means navigating away no longer
  // abandons the story.
  app.post("/api/story/generate", requireAuth, async (req, res) => {
    try {
      const validatedData = storyRequestSchema.parse(req.body);
      const userId = (req.user as any).id;

      // Quota is charged at SUCCESS now (see storyWorker.finishSucceeded), so
      // the check here must count work already in flight as well as work
      // already paid for -- otherwise a user could enqueue repeatedly before
      // any of it completed.
      const allowed = await canEnqueueWithinQuota(userId);
      if (!allowed.ok) {
        return res.status(429).json({ message: allowed.message, code: "quota_exceeded" });
      }

      // The brief is resolved and FROZEN here. resolveStoryCharacter reads the
      // database, so building it at generation time would let a character
      // deleted mid-story change the brief between chapter 4 and chapter 5.
      const character = await resolveStoryCharacter(validatedData, userId);
      const result = await enqueueStoryJob({
        userId,
        request: validatedData,
        brief: buildStoryBrief(validatedData, character),
        // Parent Mode is derived inside buildSystemPrompt from the request, so
        // there is no second argument here to forget. See storyBrief.ts.
        systemPrompt: buildSystemPrompt(validatedData),
        targetWordCount: getWordCountFromLength(validatedData.storyLength || "medium"),
      });

      if (!result.ok) {
        return res.status(result.status).json({
          message: result.message,
          code: result.code,
          inFlight: result.inFlight,
        });
      }
      return res.status(202).json({ jobId: result.jobId, status: "queued" });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      console.error("Error enqueueing story:", error);
      res.status(500).json({ message: "Failed to start story generation" });
    }
  });

  // Poll one job. 404 rather than 403 for someone else's job, so ids are not
  // enumerable. The full story is returned inline on success -- the poller is
  // already asking, so make the answer complete.
  app.get("/api/story/jobs/:jobId", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const job = await getStoryJob(req.params.jobId, userId);
    if (!job) return res.status(404).json({ message: "Job not found" });
    let story: unknown;
    if (job.status === "succeeded" && job.story_id) {
      story = await storage.getStoryById(job.story_id, userId).catch(() => undefined);
    }
    res.json({ ...job, story });
  });

  // In-flight jobs plus anything finished in the last hour. That window is how
  // a reloaded page rediscovers a job it was not watching, with no
  // localStorage involved.
  app.get("/api/story/jobs", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    res.json(await listActiveStoryJobs(userId));
  });

  // Cooperative cancel, checked at step boundaries. Cancelling during chapter 4
  // still pays for chapter 4 -- a completion already in flight cannot be
  // recalled, and the UI should say so rather than implying otherwise.
  app.post("/api/story/jobs/:jobId/cancel", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const ok = await cancelStoryJob(req.params.jobId, userId);
    if (!ok) return res.status(404).json({ message: "No cancellable job with that id" });
    res.json({ cancelled: true });
  });
  
  // Get user's story generation usage stats
  app.get("/api/story/usage", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to view usage stats" });
      }
      
      // Get user ID from authenticated user
      const userId = (req.user as any).id;
      
      // Get the user's current generation count
      const count = await storage.getStoryGenerationCount(userId);
      
      // Get the last reset date or use the current date if none exists
      const lastReset = await storage.getLastResetDate(userId) || new Date();
      
      // Calculate next reset date (1st of next month)
      const nextReset = new Date(lastReset);
      nextReset.setMonth(nextReset.getMonth() + 1);
      nextReset.setDate(1);
      
      // Set standard monthly limit (free tier)
      const monthlyLimit = 10;
      
      // Add initial 50 stories for new users
      const initialBonus = 50;
      
      // Calculate remaining generations
      // If this is the first month (no reset date is set or it's the first time using the app)
      const isNewUser = !await storage.getLastResetDate(userId);
      const limit = isNewUser ? initialBonus + monthlyLimit : monthlyLimit;
      const remaining = Math.max(0, limit - count);
      
      res.json({
        count,
        remaining,
        limit,
        lastReset: lastReset.toISOString(),
        nextReset: nextReset.toISOString(),
        isNewUser
      });
    } catch (error) {
      console.error("Error fetching usage stats:", error);
      res.status(500).json({ message: "Failed to fetch usage statistics" });
    }
  });
  
  // API endpoint to save a story after generation
  app.post("/api/story/save", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to save stories" });
      }
      
      const { story, request, isFavorite } = req.body;
      
      if (!story || !request) {
        return res.status(400).json({ message: "Story and request data are required" });
      }
      
      // Get user ID from authenticated user
      const userId = (req.user as any).id;
      
      // Check if the story is about a Hero of Faith and get the ID
      let heroId: string | undefined = undefined;
      
      if (request.heroOfFaith && request.heroOfFaith !== "None") {
        // Look up the hero by name to get the ID
        const heroes = await storage.getAllHeroesOfFaith();
        const hero = heroes.find(h => h.name === request.heroOfFaith);
        if (hero) {
          heroId = hero.id;
          console.log(`Found Hero of Faith ID ${heroId} for ${request.heroOfFaith}`);
        }
      }
      
      // Save the story with associated hero if applicable
      const savedStory = await storage.saveStory(story, request, userId, heroId);
      
      // If isFavorite is specified, set favorite status
      if (typeof isFavorite === 'boolean' && isFavorite) {
        await storage.toggleFavorite(savedStory.id, true, userId);
        savedStory.isFavorite = true;
      }
      
      // If this is a Hero of Faith story, also save it to the hero stories collection
      if (heroId && story.bibleVerse) {
        try {
          // Create a hero story entry
          await storage.createHeroStory({
            heroId,
            title: story.title,
            content: story.content,
            isHistoricallyAccurate: true,
            bibleVerse: story.bibleVerse,
            isFeatured: false,
            sources: [
              {
                title: "User Generated Story",
                author: "AI Story Generator",
                url: `/stories/${savedStory.id}`
              }
            ]
          }, userId);
          console.log(`Created hero story for hero ${heroId}`);
        } catch (heroStoryError) {
          console.error("Error creating hero story:", heroStoryError);
          // Don't fail the entire request if this part fails
        }
      }
      
      res.status(201).json(savedStory);
    } catch (error) {
      console.error("Error saving story:", error);
      res.status(500).json({ message: "Failed to save story" });
    }
  });
  
  // Search for stories - general search query
  app.get("/api/stories/search", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to search stories" });
      }
      
      const query = req.query.q as string;
      
      if (!query) {
        return res.status(400).json({ message: "Search query is required" });
      }
      
      // Get user ID from authenticated user
      const userId = (req.user as any).id;
      
      // Search stories with the query
      const stories = await storage.searchStories(query, userId);
      
      res.status(200).json(stories);
    } catch (error) {
      console.error("Error searching stories:", error);
      res.status(500).json({ message: "Failed to search stories" });
    }
  });
  
  // Search for stories by name
  app.get("/api/stories/search/name/:name", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to search stories" });
      }
      
      const name = req.params.name;
      
      if (!name) {
        return res.status(400).json({ message: "Name parameter is required" });
      }
      
      // Get user ID from authenticated user
      const userId = (req.user as any).id;
      
      // Search stories with the name
      const stories = await storage.searchStoriesByName(name, userId);
      
      res.status(200).json(stories);
    } catch (error) {
      console.error("Error searching stories by name:", error);
      res.status(500).json({ message: "Failed to search stories by name" });
    }
  });
  
  // Search for stories by Bible passage
  app.get("/api/stories/search/passage/:passage", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to search stories" });
      }
      
      const passage = req.params.passage;
      
      if (!passage) {
        return res.status(400).json({ message: "Bible passage parameter is required" });
      }
      
      // Get user ID from authenticated user
      const userId = (req.user as any).id;
      
      // Search stories with the Bible passage
      const stories = await storage.searchStoriesByBiblePassage(passage, userId);
      
      res.status(200).json(stories);
    } catch (error) {
      console.error("Error searching stories by Bible passage:", error);
      res.status(500).json({ message: "Failed to search stories by Bible passage" });
    }
  });
  
  // Search for stories by topic
  app.get("/api/stories/search/topic/:topic", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to search stories" });
      }
      
      const topic = req.params.topic;
      
      if (!topic) {
        return res.status(400).json({ message: "Topic parameter is required" });
      }
      
      // Get user ID from authenticated user
      const userId = (req.user as any).id;
      
      // Search stories with the topic
      const stories = await storage.searchStoriesByTopic(topic, userId);
      
      res.status(200).json(stories);
    } catch (error) {
      console.error("Error searching stories by topic:", error);
      res.status(500).json({ message: "Failed to search stories by topic" });
    }
  });
  
  // Get stories for a specific Hero of Faith
  app.get("/api/heroes/:heroId/stories", async (req, res) => {
    try {
      const heroId = req.params.heroId;
      
      if (!heroId) {
        return res.status(400).json({ message: "Hero ID parameter is required" });
      }
      
      // Get the hero to confirm it exists
      const hero = await storage.getHeroOfFaithById(heroId);
      
      if (!hero) {
        return res.status(404).json({ message: "Hero not found" });
      }
      
      // Get user ID from authenticated user for permission check
      const userId = req.user ? (req.user as any).id : undefined;
      
      // Get both dedicated hero stories and regular stories about this hero
      const heroStories = await storage.getHeroStoriesByHeroId(heroId);
      
      // Get user-generated stories about this hero
      const userStories = userId ? await storage.getStoriesByHeroId(heroId, userId) : [];
      
      console.log(`Found ${heroStories.length} dedicated hero stories and ${userStories.length} user stories for hero ${heroId}`);
      
      // Return both types of stories
      res.status(200).json({
        heroStories,
        userStories
      });
    } catch (error) {
      console.error("Error fetching hero stories:", error);
      res.status(500).json({ message: "Failed to fetch hero stories" });
    }
  });
  
  // API endpoint to toggle favorite status of a story
  app.post("/api/story/favorite/:id", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to modify stories" });
      }
      
      const { isFavorite } = req.body;
      
      if (typeof isFavorite !== 'boolean') {
        return res.status(400).json({ message: "isFavorite must be a boolean" });
      }
      
      // Get the user ID from the authenticated user
      const userId = (req.user as any).id;
      const story = await storage.toggleFavorite(req.params.id, isFavorite, userId);
      
      if (!story) {
        return res.status(404).json({ message: "Story not found or unauthorized" });
      }
      
      res.json(story);
    } catch (error) {
      console.error("Error updating favorite status:", error);
      res.status(500).json({ message: "Failed to update favorite status" });
    }
  });
  
  // API endpoint to associate a story with a hero of faith
  app.post("/api/stories/:id/associate-hero", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to modify stories" });
      }
      
      const { heroId } = req.body;
      
      if (!heroId || typeof heroId !== 'string') {
        return res.status(400).json({ message: "Valid hero ID is required" });
      }
      
      // Verify the hero exists
      const hero = await storage.getHeroOfFaithById(heroId);
      if (!hero) {
        return res.status(404).json({ message: "Hero not found" });
      }
      
      // Get the user ID from the authenticated user
      const userId = (req.user as any).id;
      
      // Get the story and update its heroId
      const storyId = req.params.id;
      const story = await storage.getStoryById(storyId, userId);
      
      if (!story) {
        return res.status(404).json({ message: "Story not found or unauthorized" });
      }
      
      // Update the heroId field in the story
      const updatedStory = await storage.updateStoryHeroId(storyId, heroId, userId);
      
      if (!updatedStory) {
        return res.status(500).json({ message: "Failed to associate story with hero" });
      }
      
      res.json(updatedStory);
    } catch (error) {
      console.error("Error associating story with hero:", error);
      res.status(500).json({ message: "Failed to associate story with hero" });
    }
  });
  
  // Get all saved stories - requires authentication
  app.get("/api/stories", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to view stories" });
      }
      
      // Get only the stories belonging to the authenticated user
      const userId = (req.user as any).id;
      const stories = await storage.getUserStories(userId);
      res.json(stories);
    } catch (error) {
      console.error("Error fetching stories:", error);
      res.status(500).json({ message: "Failed to fetch stories" });
    }
  });
  
  // Get a specific story - requires authentication
  app.get("/api/stories/:id", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to view stories" });
      }
      
      // Get the story, but only if it belongs to the authenticated user
      const userId = (req.user as any).id;
      const story = await storage.getStoryById(req.params.id, userId);
      
      if (!story) {
        return res.status(404).json({ message: "Story not found" });
      }
      
      res.json(story);
    } catch (error) {
      console.error("Error fetching story:", error);
      res.status(500).json({ message: "Failed to fetch story" });
    }
  });
  
  // Toggle a story as favorite - requires authentication
  app.put("/api/stories/:id/favorite", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to modify stories" });
      }
      
      const { isFavorite } = req.body;
      
      if (typeof isFavorite !== 'boolean') {
        return res.status(400).json({ message: "isFavorite must be a boolean" });
      }
      
      // Get the user ID from the authenticated user
      const userId = (req.user as any).id;
      const story = await storage.toggleFavorite(req.params.id, isFavorite, userId);
      
      if (!story) {
        return res.status(404).json({ message: "Story not found or unauthorized" });
      }
      
      res.json(story);
    } catch (error) {
      console.error("Error updating story:", error);
      res.status(500).json({ message: "Failed to update story" });
    }
  });
  
  // Delete a story - requires authentication
  app.delete("/api/stories/:id", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to delete stories" });
      }
      
      // Get the user ID from the authenticated user
      const userId = (req.user as any).id;
      const success = await storage.deleteStory(req.params.id, userId);
      
      if (!success) {
        return res.status(404).json({ message: "Story not found or unauthorized" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting story:", error);
      res.status(500).json({ message: "Failed to delete story" });
    }
  });
  
  // All song routes are handled by registerSongRoutes
  
  // API routes for OpenAI settings - all require authentication
  
  // Get user's OpenAI API key (note: we never return the actual key for security, just if it exists)
  app.get("/api/settings/openai-key-status", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to access settings" });
      }
      
      const userId = (req.user as any).id;
      const key = await storage.getUserOpenAIKey(userId);
      res.json({ hasKey: !!key });
    } catch (error) {
      console.error("Error fetching OpenAI key status:", error);
      res.status(500).json({ message: "Failed to fetch API key status" });
    }
  });
  
  // Set user's OpenAI API key
  app.post("/api/settings/openai-key", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to update settings" });
      }
      
      const userId = (req.user as any).id;
      const { key } = req.body;
      
      if (!key || typeof key !== 'string') {
        return res.status(400).json({ message: "Valid API key is required" });
      }
      
      await storage.setUserOpenAIKey(userId, key);
      res.json({ success: true });
    } catch (error) {
      console.error("Error setting OpenAI key:", error);
      res.status(500).json({ message: "Failed to set API key" });
    }
  });
  
  // Delete user's OpenAI API key
  app.delete("/api/settings/openai-key", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to update settings" });
      }
      
      const userId = (req.user as any).id;
      await storage.setUserOpenAIKey(userId, '');
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting OpenAI key:", error);
      res.status(500).json({ message: "Failed to delete API key" });
    }
  });
  
  // Get user's OpenAI model
  app.get("/api/settings/openai-model", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to access settings" });
      }
      
      const userId = (req.user as any).id;
      const model = await storage.getUserOpenAIModel(userId);
      res.json({ model: model || 'gpt-4o-mini' });
    } catch (error) {
      console.error("Error fetching OpenAI model:", error);
      res.status(500).json({ message: "Failed to fetch model setting" });
    }
  });
  
  // Models this user may select, with tier and quality warnings, so the UI can
  // present the local option honestly rather than offering models that will be
  // rejected or silently downgraded.
  app.get("/api/settings/models", async (req, res) => {
    try {
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const userId = (req.user as any).id;
      const ownKey = await storage.getUserOpenAIKey(userId);
      const isAdmin = Boolean((req.user as any).isAdmin);
      res.json({
        models: listSelectableModels({ isAdmin, hasOwnKey: Boolean(ownKey) }),
        hasOwnKey: Boolean(ownKey),
      });
    } catch (error) {
      console.error("Error listing models:", error);
      res.status(500).json({ message: "Failed to list models" });
    }
  });

  // Set user's OpenAI model
  app.post("/api/settings/openai-model", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to update settings" });
      }
      
      const userId = (req.user as any).id;
      const { model } = req.body;
      
      if (!model || typeof model !== 'string') {
        return res.status(400).json({ message: "Valid model name is required" });
      }

      // Reject anything not in the catalog, and anything this user is not
      // entitled to. This is defence in depth, not the enforcement point --
      // resolveModel() re-checks at generation time, because entitlement can
      // change after a model is stored (a user can delete their own API key).
      const ownKey = await storage.getUserOpenAIKey(userId);
      const isAdmin = Boolean((req.user as any).isAdmin);
      if (!isModelAllowedFor(model, "chat", { isAdmin, hasOwnKey: Boolean(ownKey) })) {
        return res.status(403).json({
          message:
            "That model is not available on your account. Premium models require your own OpenAI API key.",
          allowed: listSelectableModels({ isAdmin, hasOwnKey: Boolean(ownKey) }),
        });
      }
      
      await storage.setUserOpenAIModel(userId, model);
      res.json({ success: true });
    } catch (error) {
      console.error("Error setting OpenAI model:", error);
      res.status(500).json({ message: "Failed to set model" });
    }
  });
  
  // API routes for Heroes of Faith
  
  // Heroes of Faith seeding lives in server/seed.ts and runs after the database
  // is ready. It used to be a fire-and-forget IIFE here, which raced database
  // initialisation and silently seeded into memory.
  
  // Get all heroes of faith
  app.get("/api/heroes", async (req, res) => {
    try {
      const heroes = await storage.getAllHeroesOfFaith();
      res.json(heroes);
    } catch (error) {
      console.error("Error fetching heroes of faith:", error);
      res.status(500).json({ message: "Failed to fetch heroes of faith" });
    }
  });
  
  // Get a specific hero of faith
  app.get("/api/heroes/:id", async (req, res) => {
    try {
      const hero = await storage.getHeroOfFaithById(req.params.id);
      if (!hero) {
        return res.status(404).json({ message: "Hero of faith not found" });
      }
      res.json(hero);
    } catch (error) {
      console.error("Error fetching hero of faith:", error);
      res.status(500).json({ message: "Failed to fetch hero of faith" });
    }
  });
  
  // Create a new hero of faith
  app.post("/api/heroes", requireAdmin, async (req, res) => {
    try {
      // The id and createdAt fields will be added by the storage method
      const { id, createdAt, ...heroData } = req.body;
      
      // Validate the heroData
      const validatedData = heroOfFaithSchema.omit({ id: true, createdAt: true }).parse(heroData);
      
      // Create the hero
      const hero = await storage.createHeroOfFaith(validatedData);
      res.status(201).json(hero);
    } catch (error) {
      console.error("Error creating hero of faith:", error);
      
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      
      res.status(500).json({ message: "Failed to create hero of faith" });
    }
  });
  
  // Update a hero of faith
  app.put("/api/heroes/:id", requireAdmin, async (req, res) => {
    try {
      const { id: bodyId, createdAt, ...updates } = req.body;
      
      const hero = await storage.updateHeroOfFaith(req.params.id, updates);
      
      if (!hero) {
        return res.status(404).json({ message: "Hero of faith not found" });
      }
      
      res.json(hero);
    } catch (error) {
      console.error("Error updating hero of faith:", error);
      
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      
      res.status(500).json({ message: "Failed to update hero of faith" });
    }
  });
  
  // Delete a hero of faith
  app.delete("/api/heroes/:id", requireAdmin, async (req, res) => {
    try {
      const success = await storage.deleteHeroOfFaith(req.params.id);
      
      if (!success) {
        return res.status(404).json({ message: "Hero of faith not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting hero of faith:", error);
      res.status(500).json({ message: "Failed to delete hero of faith" });
    }
  });

  // Analyze an image with OpenAI Vision API - requires authentication
  app.post("/api/analyze-image", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to analyze images" });
      }
      
      const { imageBase64 } = req.body;
      
      if (!imageBase64 || typeof imageBase64 !== 'string') {
        return res.status(400).json({ message: "Valid image data is required" });
      }
      
      // Get the user ID to check for API key
      const userId = (req.user as any).id;
      
      // Check if user has their own OpenAI API key
      const userOpenAIKey = await storage.getUserOpenAIKey(userId);
      
      if (!userOpenAIKey) {
        return res.status(403).json({ 
          message: "Image analysis requires your own OpenAI API key. Please add your API key in Settings."
        });
      }
      
      // Analyze the image with OpenAI using user's API key and userId
      const analysis = await analyzeImageWithOpenAI(imageBase64, userId);
      
      res.json({ analysis });
    } catch (error) {
      console.error("Error analyzing image:", error);
      res.status(500).json({ message: "Failed to analyze image" });
    }
  });
  
  // Generate a story based on an image - requires authentication
  app.post("/api/generate-story-from-image", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to generate stories from images" });
      }
      
      const { imageBase64, childName, gender, theme } = req.body;
      
      if (!imageBase64 || typeof imageBase64 !== 'string') {
        return res.status(400).json({ message: "Valid image data is required" });
      }
      
      if (!childName || !gender) {
        return res.status(400).json({ message: "Child's name and gender are required" });
      }
      
      // Get the user ID to check for API key
      const userId = (req.user as any).id;
      
      // Check if user has their own OpenAI API key
      const userOpenAIKey = await storage.getUserOpenAIKey(userId);
      
      if (!userOpenAIKey) {
        return res.status(403).json({ 
          message: "Generating stories from images requires your own OpenAI API key. Please add your API key in Settings."
        });
      }
      
      // Generate a story based on the image
      const { generateStoryFromImage } = await import('./lib/openai-vision');
      const story = await generateStoryFromImage(imageBase64, childName, gender, theme || 'faith', userId);
      
      // Generate a Bible verse related to the theme
      const bibleVerse = getBibleVerseByTheme(theme || 'faith');
      
      // Create the full story response
      const storyResponse = {
        title: story.title,
        content: story.content,
        bibleVerse,
        imageUrl: undefined // No image URL since we're using the uploaded image
      };
      
      res.json(storyResponse);
    } catch (error) {
      console.error("Error generating story from image:", error);
      res.status(500).json({ 
        title: "Story Generation Error",
        content: "There was an error generating your story from the image. Please check your API key and try again.",
        bibleVerse: {
          text: "Trust in the LORD with all your heart and lean not on your own understanding.",
          reference: "Proverbs 3:5"
        }
      });
    }
  });
  
  // Analyze an attached asset image - requires authentication
  app.post("/api/analyze-attached-image", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to analyze images" });
      }
      
      const { filename } = req.body;
      
      if (!filename || typeof filename !== 'string') {
        return res.status(400).json({ message: "Valid filename is required" });
      }
      
      // Get the user ID to check for API key
      const userId = (req.user as any).id;
      
      // Check if user has their own OpenAI API key
      const userOpenAIKey = await storage.getUserOpenAIKey(userId);
      
      if (!userOpenAIKey) {
        return res.status(403).json({ 
          message: "Image analysis requires your own OpenAI API key. Please add your API key in Settings."
        });
      }
      
      // Load the image from the attached_assets directory
      const { loadAttachedImage } = await import('./lib/openai-vision');
      const imageBase64 = await loadAttachedImage(filename);
      
      if (!imageBase64) {
        return res.status(404).json({ message: `Image file ${filename} not found` });
      }
      
      // Analyze the image with OpenAI
      const analysis = await analyzeImageWithOpenAI(imageBase64, userId);
      
      res.json({ analysis });
    } catch (error) {
      console.error("Error analyzing attached image:", error);
      res.status(500).json({ message: "Failed to analyze image" });
    }
  });

  // Get story generation statistics - requires authentication
  app.get("/api/stats/story-generation", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to view statistics" });
      }
      
      // Get the user ID from the authenticated user
      const userId = (req.user as any).id;
      const count = await storage.getStoryGenerationCount(userId);
      const lastResetDate = await storage.getLastResetDate(userId);
      
      // Calculate quotas
      const initialQuota = 50;
      const monthlyQuota = 10;
      const used = count;
      let remaining = initialQuota - used;
      
      // Add monthly quotas if applicable
      if (lastResetDate) {
        const now = new Date();
        const monthsSinceReset = Math.floor((now.getTime() - lastResetDate.getTime()) / (30 * 24 * 60 * 60 * 1000));
        
        if (monthsSinceReset > 0) {
          remaining += monthsSinceReset * monthlyQuota;
        }
      }
      
      remaining = Math.max(0, remaining);
      
      res.json({
        used,
        remaining,
        total: initialQuota + (lastResetDate ? monthlyQuota : 0),
        lastResetDate
      });
    } catch (error) {
      console.error("Error fetching story generation stats:", error);
      res.status(500).json({ message: "Failed to fetch story statistics" });
    }
  });

  // Hero Stories Library API Routes
  // Get all hero stories
  app.get("/api/hero-stories", async (req, res) => {
    try {
      const heroId = req.query.heroId as string;
      const stories = await storage.getAllHeroStories(heroId);
      res.json(stories);
    } catch (error) {
      console.error("Error fetching hero stories:", error);
      res.status(500).json({ message: "Failed to fetch hero stories" });
    }
  });
  
  // Get a specific hero story
  app.get("/api/hero-stories/:id", async (req, res) => {
    try {
      const story = await storage.getHeroStoryById(req.params.id);
      if (!story) {
        return res.status(404).json({ message: "Hero story not found" });
      }
      res.json(story);
    } catch (error) {
      console.error("Error fetching hero story:", error);
      res.status(500).json({ message: "Failed to fetch hero story" });
    }
  });
  
  // Create a new hero story
  app.post("/api/hero-stories", requireAdmin, async (req, res) => {
    try {
      const { id, createdAt, ...storyData } = req.body;
      
      // Validate the storyData
      const validatedData = heroStorySchema.omit({ id: true, createdAt: true }).parse(storyData);
      
      const userId = req.user?.id;
      
      // Create the story
      const story = await storage.createHeroStory(validatedData, userId);
      res.status(201).json(story);
    } catch (error) {
      console.error("Error creating hero story:", error);
      
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      
      res.status(500).json({ message: "Failed to create hero story" });
    }
  });
  
  // Update a hero story
  app.put("/api/hero-stories/:id", requireAdmin, async (req, res) => {
    try {
      const { id: bodyId, createdAt, ...updates } = req.body;
      
      const story = await storage.updateHeroStory(req.params.id, updates);
      
      if (!story) {
        return res.status(404).json({ message: "Hero story not found" });
      }
      
      res.json(story);
    } catch (error) {
      console.error("Error updating hero story:", error);
      
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      
      res.status(500).json({ message: "Failed to update hero story" });
    }
  });
  
  // Delete a hero story
  app.delete("/api/hero-stories/:id", requireAdmin, async (req, res) => {
    try {
      const success = await storage.deleteHeroStory(req.params.id);
      
      if (!success) {
        return res.status(404).json({ message: "Hero story not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting hero story:", error);
      res.status(500).json({ message: "Failed to delete hero story" });
    }
  });
  
  // Toggle a hero story's featured status
  app.patch("/api/hero-stories/:id/featured", requireAdmin, async (req, res) => {
    try {
      const { isFeatured } = req.body;
      
      if (typeof isFeatured !== 'boolean') {
        return res.status(400).json({ message: "isFeatured must be a boolean" });
      }
      
      const story = await storage.toggleHeroStoryFeatured(req.params.id, isFeatured);
      
      if (!story) {
        return res.status(404).json({ message: "Hero story not found" });
      }
      
      res.json(story);
    } catch (error) {
      console.error("Error toggling hero story featured status:", error);
      res.status(500).json({ message: "Failed to toggle hero story featured status" });
    }
  });

  // Liveness/readiness probe used by the container healthcheck.
  // See docs/decisions.md §6 before changing the status code or the probe.
  //
  // Returns 503 when a database is configured but unreachable, so that a
  // container which silently fell back to in-memory storage FAILS its
  // healthcheck instead of reporting success while quietly losing every write
  // on the next restart. The compose healthcheck only inspects the status
  // code, so the status code has to carry that meaning.
  //
  // The check probes the pool live rather than reading dbConnectionStatus:
  // that flag is only ever set to "connected" during startup, so a transient
  // idle-client error would otherwise latch it to "error" for the lifetime of
  // the process and the container could never recover its healthy state.
  app.get("/api/health", async (_req, res) => {
    const uptime = Math.round(process.uptime());

    // No DATABASE_URL means in-memory storage was chosen deliberately, so this
    // is healthy-but-not-persistent rather than broken.
    if (!process.env.DATABASE_URL) {
      return res.status(200).json({
        status: "ok",
        db: "not_configured",
        persistence: false,
        uptime,
      });
    }

    let timer: NodeJS.Timeout | undefined;
    let live = false;
    try {
      live = await Promise.race([
        pool
          ? pool.query("SELECT 1").then(() => true)
          : Promise.resolve(false),
        new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(false), 5000);
        }),
      ]);
    } catch {
      live = false;
    } finally {
      if (timer) clearTimeout(timer);
    }

    // A reachable database is not the same as a correct one: the schema
    // drifted once and the only symptom was a 500 on the first signup. Treat a
    // mismatch as unhealthy so it fails the deploy rather than a user.
    const schemaOk = schemaStatus !== "mismatch";
    const healthy = live && schemaOk;

    res.status(healthy ? 200 : 503).json({
      status: healthy ? "ok" : "degraded",
      db: live ? "connected" : dbConnectionStatus,
      persistence: live,
      schema: schemaStatus,
      ...(schemaOk ? {} : { schemaProblems }),
      uptime,
    });
  });

  // Database status endpoint - useful for monitoring
  app.get("/api/system/db-status", async (req, res) => {
    try {
      // Check if DATABASE_URL is even set
      if (!process.env.DATABASE_URL) {
        return res.json({
          status: "not_configured",
          message: "Database connection not configured. Using in-memory storage.",
          persistence: false
        });
      }

      // We'll use the Pool class directly to test the connection
      import('pg').then(async ({ default: pgModule }) => {
        const { Pool } = pgModule;
        try {
          const pool = new Pool({ connectionString: process.env.DATABASE_URL });
          
          // Test a simple query to verify connection
          const client = await pool.connect();
          await client.query('SELECT NOW() as time');
          client.release();
          
          return res.json({
            status: "connected",
            message: "Database connection successful. Data will persist across deployments.",
            persistence: true
          });
        } catch (dbError: any) {
          console.error("Database check failed:", dbError);
          return res.json({
            status: "error",
            message: "Database connection failed. Using in-memory storage as fallback.",
            persistence: false,
            error: dbError?.message || String(dbError)
          });
        }
      }).catch(importError => {
        console.error("Error importing database module:", importError);
        return res.json({
          status: "error",
          message: "Error importing database module. Using in-memory storage as fallback.",
          persistence: false,
          error: importError?.message || String(importError)
        });
      });
    } catch (error: any) {
      console.error("Database check failed:", error);
      return res.json({
        status: "error",
        message: "Database check failed. Using in-memory storage as fallback.",
        persistence: false,
        error: error?.message || String(error)
      });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
