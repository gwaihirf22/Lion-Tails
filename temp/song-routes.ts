// Song-related routes
import { Express } from "express";
import { allSongsForSearch, getStructuredSongById } from '../data/songDatabase';

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
}