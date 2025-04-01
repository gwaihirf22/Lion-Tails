import { useState } from "react";
import { Song } from "@shared/schema";
import SongCard from "./SongCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Edit } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface MusicSectionProps {
  songs: Song[];
}

export default function MusicSection({ songs }: MusicSectionProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [viewMode, setViewMode] = useState(false);
  const { toast } = useToast();

  // Handle search input change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  // Filter songs based on search term
  const filteredSongs = songs.filter(song => 
    searchTerm === "" || 
    song.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (song.artist && song.artist.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (song.verses && song.verses.some(verse => 
      verse.lyrics.some(line => line.toLowerCase().includes(searchTerm.toLowerCase()))
    )) ||
    (song.chorus && song.chorus.lyrics.some(line => 
      line.toLowerCase().includes(searchTerm.toLowerCase())
    )) ||
    (song.bridge && song.bridge.lyrics.some(line => 
      line.toLowerCase().includes(searchTerm.toLowerCase())
    ))
  );

  // Handle edit song
  const handleEditSong = (song: Song) => {
    setSelectedSong(song);
    setEditMode(true);
    setViewMode(false);
  };
  
  // Handle view song
  const handleViewSong = (song: Song) => {
    setSelectedSong(song);
    setViewMode(true);
    setEditMode(false);
  };

  // Handle save edited song
  const handleSaveEdit = async () => {
    if (!selectedSong) return;
    
    try {
      toast({
        title: "Saving changes",
        description: "Updating your song...",
      });
      
      // Update the song in the database
      const response = await apiRequest("PATCH", `/api/songs/${selectedSong.id}`, selectedSong);
      
      if (!response.ok) {
        throw new Error("Failed to update song");
      }
      
      // Invalidate songs query to refresh the list
      queryClient.invalidateQueries({ queryKey: ["/api/songs"] });
      
      toast({
        title: "Song updated",
        description: "Your changes have been saved.",
      });
      
      // Reset state
      setSelectedSong(null);
      setEditMode(false);
    } catch (error) {
      console.error("Error updating song:", error);
      toast({
        title: "Error",
        description: "Failed to update the song. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <section className="mt-4">
      <div 
        className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl p-6"
        style={{ 
          backgroundImage: `url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxkZWZzPjxwYXR0ZXJuIGlkPSJjbG91ZHMiIHBhdHRlcm5Vbml0cz0idXNlclNwYWNlT25Vc2UiIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiB2aWV3Qm94PSIwIDAgMjAwIDIwMCI+PGNpcmNsZSBmaWxsPSIjZmZmZmZmIiBmaWxsLW9wYWNpdHk9IjAuMiIgY3g9IjQwIiBjeT0iNDAiIHI9IjE1Ii8+PGNpcmNsZSBmaWxsPSIjZmZmZmZmIiBmaWxsLW9wYWNpdHk9IjAuMiIgY3g9IjYwIiBjeT0iNDUiIHI9IjE4Ii8+PGNpcmNsZSBmaWxsPSIjZmZmZmZmIiBmaWxsLW9wYWNpdHk9IjAuMiIgY3g9IjUwIiBjeT0iMzAiIHI9IjIwIi8+PGNpcmNsZSBmaWxsPSIjZmZmZmZmIiBmaWxsLW9wYWNpdHk9IjAuMiIgY3g9IjE2MCIgY3k9IjE2MCIgcj0iMTUiLz48Y2lyY2xlIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4yIiBjeD0iMTgwIiBjeT0iMTY1IiByPSIxOCIvPjxjaXJjbGUgZmlsbD0iI2ZmZmZmZiIgZmlsbC1vcGFjaXR5PSIwLjIiIGN4PSIxNzAiIGN5PSIxNTAiIHI9IjIwIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2Nsb3VkcykiLz48L3N2Zz4=')` 
        }}
      >
        <h2 className="text-3xl font-heading font-bold mb-4 text-textDark text-center">Bedtime Songs</h2>
        <p className="text-center mb-4">Simple Christian songs with guitar chords to sing with your little ones before bed</p>
        
        {/* Search input */}
        <div className="mb-6 max-w-md mx-auto">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search songs by title, artist, or lyrics..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="pl-8"
            />
          </div>
        </div>
        
        {/* Song list */}
        {filteredSongs.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {filteredSongs.map((song) => (
              <div key={song.id} className="relative group">
                <div 
                  className="cursor-pointer"
                  onClick={() => handleViewSong(song)}
                >
                  <SongCard song={song} />
                </div>
                <button 
                  onClick={() => handleEditSong(song)}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-primary text-white rounded-full p-2"
                  title="Edit song"
                >
                  <Edit className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            {searchTerm ? (
              <p>No songs found matching "{searchTerm}". Try another search term or add a new song.</p>
            ) : (
              <p>No songs available. Add songs in the "Find & Add Songs" tab.</p>
            )}
          </div>
        )}
        
        {/* View song dialog */}
        {selectedSong && viewMode && (
          <Dialog open={viewMode} onOpenChange={(open) => !open && setViewMode(false)}>
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto" aria-describedby="song-view-description">
              <DialogHeader>
                <DialogTitle className="text-2xl">{selectedSong.title}</DialogTitle>
                {selectedSong.artist && <p className="text-muted-foreground">by {selectedSong.artist}</p>}
                <p id="song-view-description" className="sr-only">Full song details with lyrics and guitar chords</p>
              </DialogHeader>
              
              <div className="mt-4 space-y-6">
                {/* Display the complete song with SongCard component */}
                <SongCard song={selectedSong} />
                
                <div className="flex justify-end space-x-2 mt-4">
                  <Button variant="outline" onClick={() => setViewMode(false)}>Close</Button>
                  <Button onClick={() => handleEditSong(selectedSong)}>Edit Song</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
        
        {/* Edit song dialog */}
        {selectedSong && editMode && (
          <Dialog open={editMode} onOpenChange={(open) => !open && setEditMode(false)}>
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto" aria-describedby="song-edit-description">
              <DialogHeader>
                <DialogTitle>Edit Song: {selectedSong.title}</DialogTitle>
                <p id="song-edit-description" className="sr-only">Edit song lyrics and chords</p>
              </DialogHeader>
              
              <div className="grid gap-4 py-4">
                {/* Title */}
                <div>
                  <label className="block text-sm font-medium mb-1">Title</label>
                  <Input 
                    value={selectedSong.title} 
                    onChange={(e) => setSelectedSong({...selectedSong, title: e.target.value})}
                  />
                </div>
                
                {/* Artist */}
                <div>
                  <label className="block text-sm font-medium mb-1">Artist</label>
                  <Input 
                    value={selectedSong.artist || ''} 
                    onChange={(e) => setSelectedSong({...selectedSong, artist: e.target.value})}
                  />
                </div>
                
                {/* Verses */}
                <div>
                  <label className="block text-sm font-medium mb-1">Verses</label>
                  {selectedSong.verses && selectedSong.verses.map((verse, verseIndex) => (
                    <div key={verseIndex} className="mb-4 p-2 border rounded">
                      <h4 className="text-sm font-medium mb-2">Verse {verseIndex + 1}</h4>
                      {verse.lyrics.map((line, lineIndex) => (
                        <div key={lineIndex} className="flex mb-2">
                          <Input 
                            className="w-24 mr-2"
                            value={verse.chords[lineIndex] || ''} 
                            onChange={(e) => {
                              const updatedVerses = [...selectedSong.verses];
                              updatedVerses[verseIndex].chords[lineIndex] = e.target.value;
                              setSelectedSong({...selectedSong, verses: updatedVerses});
                            }}
                            placeholder="Chord"
                          />
                          <Input 
                            className="flex-1"
                            value={line} 
                            onChange={(e) => {
                              const updatedVerses = [...selectedSong.verses];
                              updatedVerses[verseIndex].lyrics[lineIndex] = e.target.value;
                              setSelectedSong({...selectedSong, verses: updatedVerses});
                            }}
                            placeholder="Lyrics"
                          />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                
                {/* Chorus */}
                {selectedSong.chorus && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Chorus</label>
                    <div className="mb-4 p-2 border rounded bg-secondary/10">
                      {selectedSong.chorus.lyrics.map((line, lineIndex) => (
                        <div key={lineIndex} className="flex mb-2">
                          <Input 
                            className="w-24 mr-2"
                            value={selectedSong.chorus?.chords[lineIndex] || ''} 
                            onChange={(e) => {
                              if (selectedSong.chorus) {
                                const updatedChorus = {
                                  lyrics: [...selectedSong.chorus.lyrics],
                                  chords: [...selectedSong.chorus.chords]
                                };
                                updatedChorus.chords[lineIndex] = e.target.value;
                                setSelectedSong({...selectedSong, chorus: updatedChorus});
                              }
                            }}
                            placeholder="Chord"
                          />
                          <Input 
                            className="flex-1"
                            value={line} 
                            onChange={(e) => {
                              if (selectedSong.chorus) {
                                const updatedChorus = {
                                  lyrics: [...selectedSong.chorus.lyrics],
                                  chords: [...selectedSong.chorus.chords]
                                };
                                updatedChorus.lyrics[lineIndex] = e.target.value;
                                setSelectedSong({...selectedSong, chorus: updatedChorus});
                              }
                            }}
                            placeholder="Lyrics"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Bridge */}
                {selectedSong.bridge && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Bridge</label>
                    <div className="mb-4 p-2 border rounded bg-primary/10">
                      {selectedSong.bridge.lyrics.map((line, lineIndex) => (
                        <div key={lineIndex} className="flex mb-2">
                          <Input 
                            className="w-24 mr-2"
                            value={selectedSong.bridge?.chords[lineIndex] || ''} 
                            onChange={(e) => {
                              if (selectedSong.bridge) {
                                const updatedBridge = {
                                  lyrics: [...selectedSong.bridge.lyrics],
                                  chords: [...selectedSong.bridge.chords]
                                };
                                updatedBridge.chords[lineIndex] = e.target.value;
                                setSelectedSong({...selectedSong, bridge: updatedBridge});
                              }
                            }}
                            placeholder="Chord"
                          />
                          <Input 
                            className="flex-1"
                            value={line} 
                            onChange={(e) => {
                              if (selectedSong.bridge) {
                                const updatedBridge = {
                                  lyrics: [...selectedSong.bridge.lyrics],
                                  chords: [...selectedSong.bridge.chords]
                                };
                                updatedBridge.lyrics[lineIndex] = e.target.value;
                                setSelectedSong({...selectedSong, bridge: updatedBridge});
                              }
                            }}
                            placeholder="Lyrics"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={() => setEditMode(false)}>Cancel</Button>
                  <Button onClick={handleSaveEdit}>Save Changes</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </section>
  );
}
