import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { SavedStory } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";

export default function SavedStories() {
  const [, navigate] = useLocation();
  const [stories, setStories] = useState<SavedStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const { toast } = useToast();

  // Fetch all stories
  useEffect(() => {
    // Scroll to the top of the page when component mounts
    window.scrollTo({ top: 0, behavior: 'auto' });
    
    const fetchStories = async () => {
      try {
        setLoading(true);
        const response = await apiRequest('GET', '/api/stories');
        const data = await response.json();
        setStories(data);
      } catch (error) {
        console.error('Error fetching stories:', error);
        toast({
          title: "Error",
          description: "Failed to load your stories. Please try again.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchStories();
  }, [toast]);

  // Handle toggling favorite
  const handleToggleFavorite = async (id: string, isFavorite: boolean) => {
    try {
      const response = await apiRequest('PUT', `/api/stories/${id}/favorite`, { isFavorite });
      
      if (response.ok) {
        const updatedStory = await response.json();
        
        setStories(prevStories => 
          prevStories.map(story => 
            story.id === id ? updatedStory : story
          )
        );
        
        toast({
          title: isFavorite ? "Story Favorited" : "Removed from Favorites",
          description: isFavorite 
            ? "This story will be saved permanently." 
            : "This story will be automatically deleted after one year if not favorited again.",
        });
      }
    } catch (error) {
      console.error('Error updating favorite status:', error);
      toast({
        title: "Error",
        description: "Failed to update favorite status. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Handle story deletion
  const handleDeleteStory = async (id: string) => {
    if (!confirm('Are you sure you want to delete this story? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await apiRequest('DELETE', `/api/stories/${id}`);
      
      if (response.ok) {
        setStories(prevStories => prevStories.filter(story => story.id !== id));
        
        toast({
          title: "Story Deleted",
          description: "The story has been successfully deleted.",
        });
      }
    } catch (error) {
      console.error('Error deleting story:', error);
      toast({
        title: "Error",
        description: "Failed to delete the story. Please try again.",
        variant: "destructive",
      });
    }
  };

  // View a specific story
  const handleViewStory = (story: SavedStory) => {
    navigate(`/story?data=${encodeURIComponent(JSON.stringify(story.story))}&id=${story.id}`);
  };

  // Filter stories based on active tab
  const filteredStories = activeTab === 'all' 
    ? stories 
    : activeTab === 'favorites' 
      ? stories.filter(story => story.isFavorite)
      : stories.filter(story => !story.isFavorite);

  // Render loading state
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex justify-between items-center">
        <h2 className="text-3xl font-heading font-bold text-secondary">Your Saved Stories</h2>
        <div>
          <Button onClick={() => navigate("/")} className="mr-2">
            Create New Story
          </Button>
          <Button variant="outline" onClick={() => navigate("/music")}>
            Bedtime Songs
          </Button>
        </div>
      </div>

      {stories.length === 0 ? (
        <Card className="bg-white/90 rounded-2xl shadow-lg">
          <CardContent className="p-8 text-center">
            <h3 className="text-2xl font-medium text-gray-700 mb-4">No Stories Yet</h3>
            <p className="text-gray-500 mb-6">You haven't created any stories yet. Create your first personalized story now!</p>
            <Button onClick={() => navigate("/")}>Create Your First Story</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="mb-4 bg-white/90 rounded-lg">
            <CardContent className="p-4">
              <p className="text-sm text-gray-600">
                <span className="font-semibold">Note:</span> Stories are automatically saved for one year. Favorite stories are kept indefinitely.
              </p>
            </CardContent>
          </Card>

          <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="all">All Stories ({stories.length})</TabsTrigger>
              <TabsTrigger value="favorites">Favorites ({stories.filter(s => s.isFavorite).length})</TabsTrigger>
              <TabsTrigger value="temporary">Temporary ({stories.filter(s => !s.isFavorite).length})</TabsTrigger>
            </TabsList>
            
            <TabsContent value={activeTab}>
              <div className="grid gap-4">
                {filteredStories.length === 0 ? (
                  <Card className="p-6 text-center">
                    <p className="text-gray-500">No stories in this category.</p>
                  </Card>
                ) : (
                  filteredStories.map((savedStory) => (
                    <Card key={savedStory.id} className="bg-white/95 overflow-hidden transition-all duration-200 hover:shadow-md">
                      <CardContent className="p-5">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h3 className="text-xl font-bold text-primary mb-1 line-clamp-1">
                              {savedStory.story.title}
                            </h3>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-sm text-gray-500">
                                Created {formatDistanceToNow(new Date(savedStory.createdAt))} ago
                              </span>
                              {savedStory.isFavorite ? (
                                <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200">
                                  Favorite
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-gray-500">
                                  Temporary
                                </Badge>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              variant="ghost"
                              className={savedStory.isFavorite ? "text-yellow-500 hover:text-yellow-600" : "text-gray-400 hover:text-yellow-500"}
                              onClick={() => handleToggleFavorite(savedStory.id, !savedStory.isFavorite)}
                              title={savedStory.isFavorite ? "Remove from favorites" : "Add to favorites"}
                            >
                              {savedStory.isFavorite ? (
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                                </svg>
                              ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                                </svg>
                              )}
                            </Button>
                            <Button 
                              size="sm"
                              variant="ghost"
                              className="text-red-500 hover:text-red-600"
                              onClick={() => handleDeleteStory(savedStory.id)}
                              title="Delete story"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
                              </svg>
                            </Button>
                          </div>
                        </div>
                        
                        <Separator className="my-3" />
                        
                        <div className="flex flex-col md:flex-row justify-between gap-3">
                          <div className="flex-1">
                            <div className="text-sm text-gray-500 mb-1">Story details:</div>
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="outline" className="bg-primary/10">
                                {savedStory.request.childName}
                              </Badge>
                              <Badge variant="outline" className="bg-primary/10">
                                {savedStory.request.gender === 'boy' ? 'Boy' : 'Girl'}
                              </Badge>
                              <Badge variant="outline" className="bg-primary/10">
                                {savedStory.request.animal}
                              </Badge>
                              <Badge variant="outline" className="bg-primary/10">
                                {savedStory.request.theme}
                              </Badge>
                            </div>
                          </div>
                          
                          <Button size="sm" onClick={() => handleViewStory(savedStory)}>
                            Read Story
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}