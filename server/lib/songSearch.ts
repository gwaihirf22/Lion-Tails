import { allSongsForSearch, SongSearchEntry } from "../data/songDatabase";

/**
 * Search for songs by title, artist, lyrics, or tags
 * @param query The search query
 * @returns Array of matching songs
 */
export function searchSongs(query: string): SongSearchEntry[] {
  if (!query || query.trim() === "") {
    return [];
  }

  const searchTerms = query.toLowerCase().split(/\s+/);
  
  return allSongsForSearch.filter(song => {
    // Check if any search term matches any of the song's searchable fields
    return searchTerms.some(term => 
      song.title.toLowerCase().includes(term) ||
      (song.artist && song.artist.toLowerCase().includes(term)) ||
      song.lyrics.toLowerCase().includes(term) ||
      (song.tags && song.tags.some(tag => tag.toLowerCase().includes(term)))
    );
  });
}

/**
 * Find a song by ID
 * @param id The song ID
 * @returns The song or undefined if not found
 */
export function findSongById(id: string): SongSearchEntry | undefined {
  return allSongsForSearch.find(song => song.id === id);
}

/**
 * Get the most popular songs
 * @param limit Maximum number of songs to return
 * @returns Array of popular songs
 */
export function getPopularSongs(limit: number = 10): SongSearchEntry[] {
  // In a real application, this would be based on actual popularity metrics
  // For now, we'll just return a selection of songs
  return allSongsForSearch.slice(0, limit);
}

/**
 * Get songs by category (tag)
 * @param category The category/tag to filter by
 * @param limit Maximum number of songs to return
 * @returns Array of matching songs
 */
export function getSongsByCategory(category: string, limit: number = 10): SongSearchEntry[] {
  const matchingSongs = allSongsForSearch.filter(song => 
    song.tags && song.tags.some(tag => tag.toLowerCase() === category.toLowerCase())
  );
  
  return matchingSongs.slice(0, limit);
}