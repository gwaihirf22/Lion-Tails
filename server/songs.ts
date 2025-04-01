// Song-related routes
import { Express } from "express";
import { allSongsForSearch, getStructuredSongById } from './data/songDatabase';
import { generateSongChords } from "./lib/songGenerator";
import { storage } from "./storage";
import { Song, songSchema } from "@shared/schema";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import { v4 as uuidv4 } from "uuid";

export function registerSongRoutes(app: Express) {
  // Get all songs for searching
  app.get("/api/songs", (_, res) => {
    res.json(allSongsForSearch);
  });

  // Search for songs
  app.get("/api/songs/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      
      if (!query || query.length < 2) {
        return res.status(400).json({ message: "Search query must be at least 2 characters" });
      }
      
      console.log(`Searching songs with query: ${query}`);
      // Search by title, artist or lyrics
      const results = allSongsForSearch.filter(song => 
        song.title.toLowerCase().includes(query.toLowerCase()) ||
        (song.artist && song.artist.toLowerCase().includes(query.toLowerCase())) ||
        song.lyrics.toLowerCase().includes(query.toLowerCase())
      );
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
      
      // Get a randomized selection of songs for "popular"
      const shuffled = [...allSongsForSearch].sort(() => 0.5 - Math.random());
      const results = shuffled.slice(0, limit);
      
      console.log(`Returning ${results.length} popular songs`);
      
      return res.json(results);
    } catch (error) {
      console.error("Error fetching popular songs:", error);
      return res.status(500).json({ message: "Failed to fetch popular songs" });
    }
  });
  
  // Get a full structured song by ID
  app.get("/api/songs/:id", async (req, res) => {
    try {
      const song = getStructuredSongById(req.params.id);
      
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

  // Find song by ID and generate chords
  app.get("/api/songs/:id/generate-chords", async (req, res) => {
    try {
      const songEntry = allSongsForSearch.find(s => s.id === req.params.id);
      
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

  // Generate chords for a custom song
  app.post("/api/generate-chords", async (req, res) => {
    try {
      const { title, lyrics } = req.body;
      
      if (!title || !lyrics) {
        return res.status(400).json({ message: "Title and lyrics are required" });
      }
      
      console.log(`Generating chords for custom song: ${title}`);
      
      // Generate chords for the song
      const songWithChords = await generateSongChords(title, lyrics);
      
      // Save the song with chords
      const savedSong = await storage.createSong(songWithChords);
      
      res.status(201).json(savedSong);
    } catch (error) {
      console.error("Error generating chords:", error);
      res.status(500).json({ message: "Failed to generate chords" });
    }
  });
}