import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { storyRequestSchema } from "@shared/schema";
import { generateStory } from "./lib/openai";
import { songs } from "./data/songs";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";

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

  const httpServer = createServer(app);

  return httpServer;
}
