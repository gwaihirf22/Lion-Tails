import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { storyRequestSchema, savedStorySchema, songSchema, characterSchema, heroOfFaithSchema } from "@shared/schema";
import { heroesOfFaithData } from "./data/heroesOfFaith";
import { generateStory } from "./lib/openai";
import { generateSongChords } from "./lib/songGenerator";
import { analyzeImageWithOpenAI } from "./lib/openai-implementation";
import { songs } from "./data/songs";
import { searchSongs, findSongById, getPopularSongs } from "./lib/songSearch";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import { v4 as uuidv4 } from "uuid";
import { authenticate } from "./lib/middleware";
import { setupAuth } from "./auth";

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication with passport and session
  setupAuth(app);
  
  // Apply authentication middleware globally
  app.use(authenticate);
  
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
  
  // API routes for songs
  
  // Get all songs
  app.get("/api/songs", (req, res) => {
    res.json(songs);
  });

  // Search for songs - must come before /:id route
  app.get("/api/songs/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      
      if (!query || query.length < 2) {
        return res.status(400).json({ message: "Search query must be at least 2 characters" });
      }
      
      console.log(`Searching songs with query: ${query}`);
      const results = searchSongs(query);
      console.log(`Found ${results.length} song matches`);
      
      return res.json(results);
    } catch (error) {
      console.error("Error searching songs:", error);
      return res.status(500).json({ message: "Failed to search songs" });
    }
  });
  
  // Get popular songs - must come before /:id route
  app.get("/api/songs/popular", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string || "10");
      console.log(`Getting popular songs, limit: ${limit}`);
      
      const results = getPopularSongs(limit);
      console.log(`Returning ${results.length} popular songs`);
      
      return res.json(results);
    } catch (error) {
      console.error("Error fetching popular songs:", error);
      return res.status(500).json({ message: "Failed to fetch popular songs" });
    }
  });
  
  // Find song lyrics by ID and generate chords - must come before /:id route
  app.get("/api/songs/find/:id/generate-chords", async (req, res) => {
    try {
      const songEntry = findSongById(req.params.id);
      
      if (!songEntry) {
        return res.status(404).json({ message: "Song not found" });
      }
      
      // Generate chords for the found song
      const songWithChords = await generateSongChords(songEntry.title, songEntry.lyrics);
      
      // Save the song with chords
      const savedSong = await storage.createSong(songWithChords);
      
      res.json(savedSong);
    } catch (error) {
      console.error("Error finding song and generating chords:", error);
      res.status(500).json({ message: "Failed to generate chords for the song" });
    }
  });

  // Generate a story - requires authentication
  app.post("/api/generate-story", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to generate stories" });
      }
      
      // Validate request body
      const validatedData = storyRequestSchema.parse(req.body);
      
      // Generate the story using OpenAI
      const story = await generateStory(validatedData);
      
      // Save the story for the authenticated user
      const userId = (req.user as any).id;
      const savedStory = await storage.saveStory(story, validatedData, userId);
      
      res.json(story);
    } catch (error) {
      console.error("Error generating story:", error);
      
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      
      res.status(500).json({ message: "Failed to generate story" });
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
  
  // Create a new song
  app.post("/api/songs", async (req, res) => {
    try {
      const songData = songSchema.parse(req.body);
      const song = await storage.createSong(songData);
      res.status(201).json(song);
    } catch (error) {
      console.error("Error creating song:", error);
      
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      
      res.status(500).json({ message: "Failed to create song" });
    }
  });
  
  // Generate chords for a song
  app.post("/api/generate-chords", async (req, res) => {
    try {
      const { title, lyrics } = req.body;
      
      if (!title || !lyrics || !lyrics.length) {
        return res.status(400).json({ message: "Title and lyrics are required" });
      }
      
      const song = await generateSongChords(title, lyrics);
      res.json(song);
    } catch (error) {
      console.error("Error generating chords:", error);
      res.status(500).json({ message: "Failed to generate chords" });
    }
  });
  
  // Get song by ID
  app.get("/api/songs/:id", async (req, res) => {
    try {
      const songId = req.params.id;
      const song = findSongById(songId);
      
      if (!song) {
        return res.status(404).json({ message: "Song not found" });
      }
      
      res.json(song);
    } catch (error) {
      console.error("Error fetching song:", error);
      res.status(500).json({ message: "Failed to fetch song" });
    }
  });
  
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
      
      await storage.setUserOpenAIModel(userId, model);
      res.json({ success: true });
    } catch (error) {
      console.error("Error setting OpenAI model:", error);
      res.status(500).json({ message: "Failed to set model" });
    }
  });
  
  // API routes for Heroes of Faith
  
  // Initialize the storage with heroes of faith data if empty
  (async () => {
    try {
      const existingHeroes = await storage.getAllHeroesOfFaith();
      if (existingHeroes.length === 0) {
        console.log("Initializing Heroes of Faith data");
        for (const hero of heroesOfFaithData) {
          await storage.createHeroOfFaith({
            name: hero.name,
            description: hero.description,
            timePeriod: hero.timePeriod,
            contribution: hero.contribution,
            birthYear: hero.birthYear,
            deathYear: hero.deathYear,
            famousQuote: hero.famousQuote,
            bibleVerse: hero.bibleVerse,
            imageUrl: hero.imageUrl
          });
        }
      }
    } catch (error) {
      console.error("Error initializing Heroes of Faith data:", error);
    }
  })();
  
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
  app.post("/api/heroes", async (req, res) => {
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
  app.put("/api/heroes/:id", async (req, res) => {
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
  app.delete("/api/heroes/:id", async (req, res) => {
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
      
      // Analyze the image with OpenAI using user's API key
      const analysis = await analyzeImageWithOpenAI(imageBase64, userOpenAIKey);
      
      res.json({ analysis });
    } catch (error) {
      console.error("Error analyzing image:", error);
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

  const httpServer = createServer(app);

  return httpServer;
}
