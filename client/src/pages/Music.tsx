import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MusicSection from "@/components/MusicSection";
import SongSearch from "@/components/SongSearch";
import { Song } from "@shared/schema";
import { PlusCircle, Music as MusicIcon, Search } from "lucide-react";

export default function Music() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState("browse");
  const { data: songs, isLoading, error, refetch } = useQuery<Song[]>({
    queryKey: ["/api/songs"],
  });

  const handleSongSaved = () => {
    // Refetch the songs list when a new song is added
    refetch();
    // Switch to the browse tab to show the newly added song
    setActiveTab("browse");
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-secondary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center p-8">
        <h2 className="text-2xl font-heading font-bold text-destructive mb-4">Error Loading Songs</h2>
        <p className="mb-4">We couldn't load the songs. Please try again later.</p>
        <Button onClick={() => navigate("/")}>Back to Home</Button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex justify-between items-center">
        <h2 className="text-3xl font-heading font-bold text-secondary">Bedtime Songs</h2>
        <Button variant="outline" onClick={() => navigate("/")}>
          Back to Stories
        </Button>
      </div>
      
      <Tabs defaultValue="browse" value={activeTab} onValueChange={setActiveTab} className="mb-8">
        <TabsList className="w-full mb-6">
          <TabsTrigger value="browse" className="flex-1">
            <MusicIcon className="mr-2 h-4 w-4" />
            Browse Songs
          </TabsTrigger>
          <TabsTrigger value="search" className="flex-1">
            <Search className="mr-2 h-4 w-4" />
            Find & Add Songs
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="browse" className="content-container rounded-lg p-0">
          <MusicSection songs={songs || []} />
        </TabsContent>
        
        <TabsContent value="search" className="content-container rounded-lg p-6 bg-white/90 backdrop-blur-sm">
          <div className="mb-4">
            <h3 className="text-2xl font-heading font-bold mb-2">Find Christian Songs</h3>
            <p className="text-muted-foreground">
              Search for popular Christian songs and we'll generate guitar chords for bedtime singing.
              Added songs will be saved in your collection.
            </p>
          </div>
          <SongSearch onSave={handleSongSaved} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
