import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { storyRequestSchema, savedStorySchema, songSchema } from "@shared/schema";
import { generateStory } from "./lib/openai";
import { generateSongChords } from "./lib/songGenerator";
import { songs } from "./data/songs";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import { v4 as uuidv4 } from "uuid";

export async function registerRoutes(app: Express): Promise<Server> {
  // API routes
  
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

  const httpServer = createServer(app);

  return httpServer;
}
