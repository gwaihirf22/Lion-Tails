import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { storyRequestSchema, savedStorySchema, songSchema, characterSchema } from "@shared/schema";
import { generateStory } from "./lib/openai";
import { generateSongChords } from "./lib/songGenerator";
import { songs } from "./data/songs";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import { v4 as uuidv4 } from "uuid";

export async function registerRoutes(app: Express): Promise<Server> {
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

  // Get a specific song by ID
  app.get("/api/songs/:id", (req, res) => {
    const song = songs.find(s => s.id === req.params.id);
    if (!song) {
      return res.status(404).json({ message: "Song not found" });
    }
    res.json(song);
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
      res.json({ model: model || 'gpt-4o' });
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
