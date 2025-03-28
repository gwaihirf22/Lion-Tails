import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Search, Music } from "lucide-react";

interface SongSearchProps {
  onSave: () => void;
}

interface SearchResult {
  id: string;
  title: string;
  artist?: string;
  lyrics: string;
  tags?: string[];
}

export default function SongSearch({ onSave }: SongSearchProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSong, setSelectedSong] = useState<SearchResult | null>(null);
  const { toast } = useToast();

  // Query for search results
  const { data: searchResults, isLoading: isSearching } = useQuery<SearchResult[]>({
    queryKey: ["/api/songs/search", searchTerm],
    enabled: searchTerm.length > 2, // Only search if at least 3 characters
    queryFn: async () => {
      const response = await fetch(`/api/songs/search?q=${encodeURIComponent(searchTerm)}`);
      if (!response.ok) throw new Error("Failed to search songs");
      return response.json();
    }
  });

  // Query for popular songs
  const { data: popularSongs, isLoading: isLoadingPopular } = useQuery<SearchResult[]>({
    queryKey: ["/api/songs/popular"],
    queryFn: async () => {
      const response = await fetch("/api/songs/popular");
      if (!response.ok) throw new Error("Failed to fetch popular songs");
      return response.json();
    }
  });

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // The search is already triggered by the query
  };

  const handleSelectSong = (song: SearchResult) => {
    setSelectedSong(song);
  };

  const handleGenerateChords = async () => {
    if (!selectedSong) return;

    try {
      toast({
        title: "Generating Chords",
        description: "Please wait while we generate chords for this song...",
      });

      // Call API to generate chords for the selected song
      const response = await apiRequest(
        "GET", 
        `/api/songs/find/${selectedSong.id}/generate-chords`
      );

      if (!response.ok) throw new Error("Failed to generate chords");

      // Invalidate song queries to refresh the list
      queryClient.invalidateQueries({ queryKey: ["/api/songs"] });
      
      toast({
        title: "Song Added!",
        description: "The song has been added with guitar chords.",
      });

      // Trigger parent component refresh
      onSave();
      
      // Clear selection
      setSelectedSong(null);
      setSearchTerm("");
    } catch (error) {
      console.error("Error generating chords:", error);
      toast({
        title: "Error",
        description: "Failed to generate chords. Try again later.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="mb-8">
      <h3 className="text-xl font-heading font-semibold mb-4">Find a Song</h3>
      
      <form onSubmit={handleSearchSubmit} className="flex gap-2 mb-6">
        <div className="relative flex-grow">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by title, artist, or lyrics..."
            value={searchTerm}
            onChange={handleSearchChange}
            className="pl-8"
          />
        </div>
        <Button type="submit" disabled={isSearching}>
          Search
        </Button>
      </form>

      {/* Selected song details */}
      {selectedSong && (
        <Card className="mb-6 bg-background/60 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="flex justify-between mb-2">
              <h4 className="font-heading font-semibold text-lg">{selectedSong.title}</h4>
              <Button onClick={handleGenerateChords}>Generate Chords</Button>
            </div>
            {selectedSong.artist && <p className="text-sm text-muted-foreground mb-2">By {selectedSong.artist}</p>}
            <p className="whitespace-pre-line bg-background/50 p-3 rounded text-sm">{selectedSong.lyrics}</p>
          </CardContent>
        </Card>
      )}
      
      {/* Search results */}
      {searchTerm.length > 2 && (
        <div className="mb-6">
          <h4 className="text-lg font-medium mb-2">Search Results</h4>
          {isSearching ? (
            <div className="flex justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-primary"></div>
            </div>
          ) : searchResults?.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {searchResults.map((song) => (
                <Card 
                  key={song.id} 
                  className={`cursor-pointer hover:shadow-md transition-shadow ${
                    selectedSong?.id === song.id ? 'ring-2 ring-primary' : ''
                  }`}
                  onClick={() => handleSelectSong(song)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <Music className="h-4 w-4 text-primary" />
                      <h5 className="font-medium">{song.title}</h5>
                    </div>
                    {song.artist && <p className="text-sm text-muted-foreground">{song.artist}</p>}
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{song.lyrics.substring(0, 100)}...</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-center py-4 text-muted-foreground">No songs found matching your search</p>
          )}
        </div>
      )}
      
      {/* Popular songs */}
      {(!searchTerm || searchTerm.length <= 2) && (
        <div>
          <h4 className="text-lg font-medium mb-2">Popular Songs</h4>
          {isLoadingPopular ? (
            <div className="flex justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-primary"></div>
            </div>
          ) : popularSongs?.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {popularSongs.map((song) => (
                <Card 
                  key={song.id} 
                  className={`cursor-pointer hover:shadow-md transition-shadow ${
                    selectedSong?.id === song.id ? 'ring-2 ring-primary' : ''
                  }`}
                  onClick={() => handleSelectSong(song)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <Music className="h-4 w-4 text-primary" />
                      <h5 className="font-medium">{song.title}</h5>
                    </div>
                    {song.artist && <p className="text-sm text-muted-foreground">{song.artist}</p>}
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{song.lyrics.substring(0, 100)}...</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-center py-4 text-muted-foreground">No popular songs available</p>
          )}
        </div>
      )}
    </div>
  );
}