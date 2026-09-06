// Song-related routes
import { Express } from "express";
import { getAllSongs, getSongById, searchSongs, getPopularSongs, addSong, updateSong, deleteSong } from './data/songDatabase';
import { generateSongChords } from "./lib/songGenerator";
import { StoryGenerationError } from "./lib/storyErrors";
import { requireAdmin } from "./lib/requireAuth";
import { Song, songSchema } from "@shared/schema";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import { v4 as uuidv4 } from "uuid";

export function registerSongRoutes(app: Express) {
  // Get all songs
  app.get("/api/songs", (_, res) => {
    try {
      const songs = getAllSongs();
      res.json(songs);
    } catch (error) {
      console.error("Error fetching all songs:", error);
      res.status(500).json({ message: "Failed to fetch songs" });
    }
  });

  // Search for songs
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
  
  // Get popular songs
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
  
  // Get a song by ID
  app.get("/api/songs/:id", async (req, res) => {
    try {
      const song = getSongById(req.params.id);
      
      if (!song) {
        return res.status(404).json({ message: "Song not found" });
      }
      
      return res.json(song);
    } catch (error) {
      console.error("Error fetching song:", error);
      return res.status(500).json({ message: "Failed to fetch song" });
    }
  });
  
  // Create a new song
  app.post("/api/songs", requireAdmin, async (req, res) => {
    try {
      const songData = songSchema.parse(req.body);
      const song = addSong(songData);
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

  // Update a song by ID
  app.put("/api/songs/:id", requireAdmin, async (req, res) => {
    try {
      const updates = req.body;
      const updatedSong = updateSong(req.params.id, updates);
      
      if (!updatedSong) {
        return res.status(404).json({ message: "Song not found" });
      }
      
      return res.json(updatedSong);
    } catch (error) {
      console.error("Error updating song:", error);
      
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      
      return res.status(500).json({ message: "Failed to update song" });
    }
  });

  // Delete a song by ID
  app.delete("/api/songs/:id", requireAdmin, async (req, res) => {
    try {
      const deleted = deleteSong(req.params.id);
      
      if (!deleted) {
        return res.status(404).json({ message: "Song not found" });
      }
      
      return res.status(204).end();
    } catch (error) {
      console.error("Error deleting song:", error);
      return res.status(500).json({ message: "Failed to delete song" });
    }
  });
  
  // Generate chords for a song
  app.post("/api/generate-chords", async (req, res) => {
    try {
      // This route was completely unauthenticated while calling a paid model on
      // the server owner's API key -- anyone who could reach the site could
      // spend his OpenAI credits in a loop.
      if (!req.user || !req.isAuthenticated?.()) {
        return res.status(401).json({ message: "Authentication required to generate chords" });
      }
      const userId = (req.user as any).id;

      const { title, lyrics, artist = "Unknown Artist" } = req.body;
      
      if (!title || !lyrics) {
        return res.status(400).json({ 
          message: "Title and lyrics are required."
        });
      }
      
      console.log(`Generating chords for custom song: ${title}`);
      
      // Convert lyrics to array if it's a string
      const lyricsList = Array.isArray(lyrics) ? lyrics : lyrics.split('\n');
      
      // Generate chords for the song
      const songWithChords = await generateSongChords(title, lyricsList, artist, userId);
      
      // Add the song to our database
      const savedSong = addSong(songWithChords);
      
      res.status(201).json(savedSong);
    } catch (error) {
      // addSong() is only reached on success now, so a failed generation no
      // longer persists invented chords to the library.
      if (error instanceof StoryGenerationError) {
        return res.status(error.statusCode).json({ message: error.message, code: error.code });
      }
      console.error("Error generating chords:", error);
      res.status(500).json({ message: "Failed to generate chords" });
    }
  });
}

// Helper function to process raw lyrics into verses
function processLyricsIntoVerses(lyrics: string[]): { lyrics: string[], chords: string[] }[] {
  // Split lyrics into verses (empty line indicates verse break)
  const verses: { lyrics: string[], chords: string[] }[] = [];
  let currentVerse: string[] = [];
  
  // Process all lyrics
  for (const line of lyrics) {
    if (line.trim() === "") {
      if (currentVerse.length > 0) {
        verses.push({
          lyrics: [...currentVerse],
          chords: currentVerse.map(() => "") // Empty chords initially
        });
        currentVerse = [];
      }
    } else {
      currentVerse.push(line);
    }
  }
  
  // Add the last verse if any
  if (currentVerse.length > 0) {
    verses.push({
      lyrics: [...currentVerse],
      chords: currentVerse.map(() => "") // Empty chords initially
    });
  }
  
  return verses;
}