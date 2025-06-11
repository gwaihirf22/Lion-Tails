import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Music, Info, Plus, Play, Pause, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { Song, Verse, ChordDiagram } from "@shared/schema";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import SongDisplay from './SongDisplay';

const SongLibrary: React.FC = () => {
  const [songs, setSongs] = useState<Song[]>([]);
  const [popularSongs, setPopularSongs] = useState<Song[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Song[]>([]);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [isSongDialogOpen, setIsSongDialogOpen] = useState(false);
  const [isNewSongDialogOpen, setIsNewSongDialogOpen] = useState(false);
  const [newSongTitle, setNewSongTitle] = useState('');
  const [newSongLyrics, setNewSongLyrics] = useState('');
  const [newSongArtist, setNewSongArtist] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  
  useEffect(() => {
    // Fetch all songs when component mounts
    fetchSongs();
    fetchPopularSongs();
  }, []);
  
  const fetchSongs = async () => {
    try {
      const response = await fetch('/api/songs');
      if (!response.ok) throw new Error('Failed to fetch songs');
      const data = await response.json();
      setSongs(data);
    } catch (error) {
      console.error('Error fetching songs:', error);
      toast({
        title: "Error",
        description: "Failed to load songs. Please try again later.",
        variant: "destructive"
      });
    }
  };
  
  const fetchPopularSongs = async () => {
    try {
      const response = await fetch('/api/songs/popular?limit=6');
      if (!response.ok) throw new Error('Failed to fetch popular songs');
      const data = await response.json();
      setPopularSongs(data);
    } catch (error) {
      console.error('Error fetching popular songs:', error);
    }
  };
  
  const handleSearch = async () => {
    if (searchQuery.trim().length < 2) {
      toast({
        description: "Please enter at least 2 characters to search",
      });
      return;
    }
    
    try {
      const response = await fetch(`/api/songs/search?q=${encodeURIComponent(searchQuery)}`);
      if (!response.ok) throw new Error('Search failed');
      const data = await response.json();
      setSearchResults(data);
    } catch (error) {
      console.error('Error searching songs:', error);
      toast({
        title: "Search Error",
        description: "Failed to search songs. Please try again.",
        variant: "destructive"
      });
    }
  };
  
  const handleGenerateChords = async () => {
    if (!newSongTitle.trim() || !newSongLyrics.trim()) {
      toast({
        description: "Please enter both a title and lyrics",
        variant: "destructive"
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const response = await fetch('/api/generate-chords', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: newSongTitle,
          lyrics: newSongLyrics,
          artist: newSongArtist || 'Unknown Artist'
        }),
      });
      
      if (!response.ok) throw new Error('Failed to generate chords');
      
      const song = await response.json();
      
      toast({
        title: "Success!",
        description: "Song created with chord suggestions",
      });
      
      setIsNewSongDialogOpen(false);
      setNewSongTitle('');
      setNewSongLyrics('');
      setNewSongArtist('');
      
      // Refresh the song list and show the newly created song
      await fetchSongs();
      setSelectedSong(song);
      setIsSongDialogOpen(true);
      
    } catch (error) {
      console.error('Error generating chords:', error);
      toast({
        title: "Generation Failed",
        description: "Could not generate chord suggestions. Please try again or use simpler lyrics.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleSongClick = (song: Song) => {
    setSelectedSong(song);
    setIsSongDialogOpen(true);
  };
  
  const renderSongCard = (song: Song) => (
    <Card 
      key={song.id} 
      className="cursor-pointer hover:shadow-md transition-shadow duration-200"
      onClick={() => handleSongClick(song)}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-md leading-tight">{song.title}</CardTitle>
        <CardDescription>{song.artist}</CardDescription>
      </CardHeader>
      <CardContent className="pb-3">
        {song.tags && song.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {song.tags.slice(0, 3).map((tag, idx) => (
              <Badge key={idx} variant="outline" className="text-xs">{tag}</Badge>
            ))}
            {song.tags.length > 3 && (
              <Badge variant="outline" className="text-xs">+{song.tags.length - 3} more</Badge>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-between pt-0 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Music className="h-3 w-3" />
          <span>{song.key}</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          <span>{song.tempo} BPM</span>
        </div>
        <div>
          <Badge variant={song.difficulty === 'beginner' ? 'secondary' : 
                         song.difficulty === 'intermediate' ? 'default' : 
                         'destructive'} 
                 className="text-[10px]">
            {song.difficulty}
          </Badge>
        </div>
      </CardFooter>
    </Card>
  );
  
  return (
    <div className="container mx-auto p-4">
      <h2 className="text-2xl font-bold mb-6">Christian Song Library</h2>
      
      <Tabs defaultValue="browse">
        <TabsList className="mb-4">
          <TabsTrigger value="browse">Browse Songs</TabsTrigger>
          <TabsTrigger value="search">Search</TabsTrigger>
          <TabsTrigger value="add">Add New Song</TabsTrigger>
        </TabsList>
        
        <TabsContent value="browse" className="space-y-6">
          <div>
            <h3 className="text-xl font-semibold mb-3">Popular Songs</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {popularSongs.map(renderSongCard)}
            </div>
          </div>
          
          <Separator className="my-6" />
          
          <div>
            <h3 className="text-xl font-semibold mb-3">All Songs</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {songs.map(renderSongCard)}
            </div>
            
            {songs.length === 0 && (
              <div className="text-center p-8 text-muted-foreground">
                <Music className="mx-auto h-12 w-12 mb-3 opacity-20" />
                <p>No songs in the library yet. Add your first song!</p>
                <Button 
                  className="mt-4" 
                  onClick={() => setIsNewSongDialogOpen(true)}
                >
                  Add New Song
                </Button>
              </div>
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="search">
          <div className="flex gap-2 mb-6">
            <Input
              placeholder="Search by title, artist, or lyrics..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="flex-1"
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
            <Button onClick={handleSearch} className="flex gap-2 items-center">
              <Search className="h-4 w-4" />
              Search
            </Button>
          </div>
          
          {searchResults.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3">
                Search Results ({searchResults.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {searchResults.map(renderSongCard)}
              </div>
            </div>
          )}
          
          {searchQuery && searchResults.length === 0 && (
            <div className="text-center p-8 border rounded-lg">
              <Info className="mx-auto h-12 w-12 mb-3 opacity-20" />
              <p className="text-muted-foreground">No songs found matching your search.</p>
              <p className="text-sm text-muted-foreground mt-2">
                Try different keywords or add a new song!
              </p>
              <Button 
                className="mt-4" 
                onClick={() => setIsNewSongDialogOpen(true)}
              >
                Add New Song
              </Button>
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="add">
          <Card>
            <CardHeader>
              <CardTitle>Add a New Song</CardTitle>
              <CardDescription>
                Enter the song title and lyrics to generate chord suggestions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Song Title</Label>
                <Input
                  id="title"
                  placeholder="Enter the song title"
                  value={newSongTitle}
                  onChange={e => setNewSongTitle(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="artist">Artist (Optional)</Label>
                <Input
                  id="artist"
                  placeholder="Enter the artist name"
                  value={newSongArtist}
                  onChange={e => setNewSongArtist(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="lyrics">Lyrics</Label>
                <Textarea
                  id="lyrics"
                  placeholder="Enter the song lyrics here. Use empty lines to separate verses, and mark the chorus and bridge sections."
                  className="min-h-[200px]"
                  value={newSongLyrics}
                  onChange={e => setNewSongLyrics(e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  Tip: Mark chorus sections with "Chorus:" and bridge sections with "Bridge:" on their own lines.
                </p>
              </div>
            </CardContent>
            <CardFooter>
              <Button 
                onClick={handleGenerateChords} 
                className="w-full"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <span className="animate-spin mr-2">⟳</span>
                    Generating Chords...
                  </>
                ) : (
                  <>
                    <Music className="mr-2 h-4 w-4" />
                    Generate Chord Suggestions
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Song Detail Dialog */}
      {selectedSong && (
        <Dialog open={isSongDialogOpen} onOpenChange={setIsSongDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedSong.title}</DialogTitle>
              <DialogDescription>
                By {selectedSong.artist || 'Unknown'} • Key of {selectedSong.key} • {selectedSong.tempo} BPM
              </DialogDescription>
            </DialogHeader>
            
            <Separator className="my-2" />
            
            <SongDisplay song={selectedSong} />
            
            <div className="mt-4 flex flex-wrap gap-2">
              {selectedSong.tags && selectedSong.tags.map((tag, idx) => (
                <Badge key={idx} variant="outline">{tag}</Badge>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
      
      {/* New Song Dialog */}
      <Dialog open={isNewSongDialogOpen} onOpenChange={setIsNewSongDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Add a New Song</DialogTitle>
            <DialogDescription>
              Enter the song details and we'll help you generate chord suggestions
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div className="sm:col-span-3">
                <Label htmlFor="dialog-title">Song Title</Label>
                <Input
                  id="dialog-title"
                  placeholder="Enter the song title"
                  value={newSongTitle}
                  onChange={e => setNewSongTitle(e.target.value)}
                />
              </div>
              
              <div>
                <Label htmlFor="dialog-artist">Artist</Label>
                <Input
                  id="dialog-artist"
                  placeholder="Artist name"
                  value={newSongArtist}
                  onChange={e => setNewSongArtist(e.target.value)}
                />
              </div>
            </div>
            
            <div>
              <Label htmlFor="dialog-lyrics">Lyrics</Label>
              <Textarea
                id="dialog-lyrics"
                placeholder="Enter the song lyrics here. Use empty lines to separate verses. Mark the chorus and bridge sections with 'Chorus:' and 'Bridge:' on their own lines."
                className="min-h-[300px]"
                value={newSongLyrics}
                onChange={e => setNewSongLyrics(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Include verse, chorus, and bridge sections to get the best chord suggestions.
              </p>
            </div>
            
            <Button 
              onClick={handleGenerateChords} 
              className="w-full"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <span className="animate-spin mr-2">⟳</span>
                  Generating Chords...
                </>
              ) : (
                <>
                  <Music className="mr-2 h-4 w-4" />
                  Generate Chord Suggestions
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SongLibrary;