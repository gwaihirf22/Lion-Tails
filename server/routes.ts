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
  
  // API routes for characters
  
  // Get all characters
  app.get("/api/characters", async (req, res) => {
    try {
      const characters = await storage.getAllCharacters();
      res.json(characters);
    } catch (error) {
      console.error("Error fetching characters:", error);
      res.status(500).json({ message: "Failed to fetch characters" });
    }
  });
  
  // Get a specific character
  app.get("/api/characters/:id", async (req, res) => {
    try {
      const character = await storage.getCharacterById(req.params.id);
      if (!character) {
        return res.status(404).json({ message: "Character not found" });
      }
      res.json(character);
    } catch (error) {
      console.error("Error fetching character:", error);
      res.status(500).json({ message: "Failed to fetch character" });
    }
  });
  
  // Create a new character
  app.post("/api/characters", async (req, res) => {
    try {
      // The id and createdAt fields will be added by the storage method
      const { id, createdAt, ...characterData } = req.body;
      
      // Create the character
      const character = await storage.createCharacter(characterData);
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
  
  // Update a character
  app.put("/api/characters/:id", async (req, res) => {
    try {
      const { id: bodyId, createdAt, ...updates } = req.body;
      
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
  
  // Delete a character
  app.delete("/api/characters/:id", async (req, res) => {
    try {
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

  // Generate a story
  app.post("/api/generate-story", async (req, res) => {
    try {
      // Validate request body
      const validatedData = storyRequestSchema.parse(req.body);
      
      // Generate the story using OpenAI
      const story = await generateStory(validatedData);
      
      // Save the story automatically
      await storage.saveStory(story, validatedData);
      
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
  
  // Get all saved stories
  app.get("/api/stories", async (req, res) => {
    try {
      const stories = await storage.getAllStories();
      res.json(stories);
    } catch (error) {
      console.error("Error fetching stories:", error);
      res.status(500).json({ message: "Failed to fetch stories" });
    }
  });
  
  // Get a specific story
  app.get("/api/stories/:id", async (req, res) => {
    try {
      const story = await storage.getStoryById(req.params.id);
      if (!story) {
        return res.status(404).json({ message: "Story not found" });
      }
      res.json(story);
    } catch (error) {
      console.error("Error fetching story:", error);
      res.status(500).json({ message: "Failed to fetch story" });
    }
  });
  
  // Toggle a story as favorite
  app.put("/api/stories/:id/favorite", async (req, res) => {
    try {
      const { isFavorite } = req.body;
      
      if (typeof isFavorite !== 'boolean') {
        return res.status(400).json({ message: "isFavorite must be a boolean" });
      }
      
      const story = await storage.toggleFavorite(req.params.id, isFavorite);
      
      if (!story) {
        return res.status(404).json({ message: "Story not found" });
      }
      
      res.json(story);
    } catch (error) {
      console.error("Error updating story:", error);
      res.status(500).json({ message: "Failed to update story" });
    }
  });
  
  // Delete a story
  app.delete("/api/stories/:id", async (req, res) => {
    try {
      const success = await storage.deleteStory(req.params.id);
      
      if (!success) {
        return res.status(404).json({ message: "Story not found" });
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
  
  // API routes for OpenAI settings
  
  // Get user's OpenAI API key (note: we never return the actual key for security, just if it exists)
  app.get("/api/settings/openai-key-status", async (req, res) => {
    try {
      const key = await storage.getUserOpenAIKey();
      res.json({ hasKey: !!key });
    } catch (error) {
      console.error("Error fetching OpenAI key status:", error);
      res.status(500).json({ message: "Failed to fetch API key status" });
    }
  });
  
  // Set user's OpenAI API key
  app.post("/api/settings/openai-key", async (req, res) => {
    try {
      const { key } = req.body;
      
      if (!key || typeof key !== 'string') {
        return res.status(400).json({ message: "Valid API key is required" });
      }
      
      await storage.setUserOpenAIKey(key);
      res.json({ success: true });
    } catch (error) {
      console.error("Error setting OpenAI key:", error);
      res.status(500).json({ message: "Failed to set API key" });
    }
  });
  
  // Delete user's OpenAI API key
  app.delete("/api/settings/openai-key", async (req, res) => {
    try {
      await storage.setUserOpenAIKey('');
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting OpenAI key:", error);
      res.status(500).json({ message: "Failed to delete API key" });
    }
  });
  
  // Get user's OpenAI model
  app.get("/api/settings/openai-model", async (req, res) => {
    try {
      const model = await storage.getUserOpenAIModel();
      res.json({ model: model || 'gpt-4o-mini' });
    } catch (error) {
      console.error("Error fetching OpenAI model:", error);
      res.status(500).json({ message: "Failed to fetch model setting" });
    }
  });
  
  // Set user's OpenAI model
  app.post("/api/settings/openai-model", async (req, res) => {
    try {
      const { model } = req.body;
      
      if (!model || typeof model !== 'string') {
        return res.status(400).json({ message: "Valid model name is required" });
      }
      
      await storage.setUserOpenAIModel(model);
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

  // Analyze an image with OpenAI Vision API
  app.post("/api/analyze-image", async (req, res) => {
    try {
      const { imageBase64 } = req.body;
      
      if (!imageBase64 || typeof imageBase64 !== 'string') {
        return res.status(400).json({ message: "Valid image data is required" });
      }
      
      // Analyze the image with OpenAI
      const analysis = await analyzeImageWithOpenAI(imageBase64);
      
      res.json({ analysis });
    } catch (error) {
      console.error("Error analyzing image:", error);
      res.status(500).json({ message: "Failed to analyze image" });
    }
  });

  // Get story generation statistics
  app.get("/api/stats/story-generation", async (req, res) => {
    try {
      const count = await storage.getStoryGenerationCount();
      const lastResetDate = await storage.getLastResetDate();
      
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
