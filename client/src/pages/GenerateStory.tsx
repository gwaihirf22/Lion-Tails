import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import StoryGeneratorTabs from "@/components/StoryGeneratorTabs";
import StoryDisplay from "@/components/StoryDisplay";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Star, StarOff } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import type { StoryRequest, StoryResponse } from "@shared/schema";

export default function GenerateStory() {
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [generatedStory, setGeneratedStory] = useState<StoryResponse | null>(null);
  const [storyRequest, setStoryRequest] = useState<StoryRequest | null>(null);
  const [generating, setGenerating] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  // Query for remaining story generations
  const { data: generationStats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/story/usage"],
    queryFn: async () => {
      const res = await fetch("/api/story/usage");
      if (!res.ok) throw new Error("Failed to fetch usage stats");
      return res.json();
    },
    enabled: !!user,
    refetchOnWindowFocus: false,
  });

  // Save story mutation
  const saveStoryMutation = useMutation({
    mutationFn: async () => {
      if (!generatedStory || !storyRequest) {
        throw new Error("No story to save");
      }
      const res = await apiRequest("POST", "/api/story/save", {
        story: generatedStory,
        request: storyRequest,
        isFavorite: false,
      });
      return await res.json();
    },
    onSuccess: (data) => {
      setSavedId(data.id);
      toast({
        title: "Story saved!",
        description: "You can find it in your saved stories.",
      });
      // Refresh usage stats
      queryClient.invalidateQueries({ queryKey: ["/api/story/usage"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to save story",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Toggle favorite mutation
  const toggleFavoriteMutation = useMutation({
    mutationFn: async () => {
      if (!savedId) throw new Error("Story must be saved first");
      
      const res = await apiRequest("POST", `/api/story/favorite/${savedId}`, {
        isFavorite: !isFavorite,
      });
      return await res.json();
    },
    onSuccess: (data) => {
      setIsFavorite(data.isFavorite);
      toast({
        title: data.isFavorite ? "Added to favorites!" : "Removed from favorites",
        description: data.isFavorite 
          ? "This story will be kept indefinitely." 
          : "This story will expire after one year.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update favorite status",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleGenerateStory = async (data: StoryRequest) => {
    setGenerating(true);
    setGeneratedStory(null);
    setStoryRequest(data);
    setSavedId(null);
    setIsFavorite(false);
    
    try {
      const response = await fetch("/api/story/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to generate story");
      }
      
      const storyData = await response.json();
      setGeneratedStory(storyData);
      
      // Refresh usage stats
      queryClient.invalidateQueries({ queryKey: ["/api/story/usage"] });
    } catch (error) {
      toast({
        title: "Failed to generate story",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      toast({
        title: "Authentication required",
        description: "Please log in to generate stories",
        variant: "destructive",
      });
      setLocation("/auth");
    }
  }, [user, authLoading, setLocation, toast]);

  // If still loading auth status, show loading
  if (authLoading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-heading font-bold text-primary mb-2">
            Create a Story
          </h1>
          <p className="text-muted-foreground">
            Generate personalized faith-based stories for children
          </p>
        </div>
        {!statsLoading && generationStats && (
          <div className="bg-primary/10 rounded-lg p-3 mt-4 md:mt-0 text-sm">
            <p className="font-medium">
              {generationStats.remaining} / {generationStats.limit} stories remaining this month
            </p>
            <p className="text-xs text-muted-foreground">
              Next reset: {new Date(generationStats.nextReset).toLocaleDateString()}
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-8">
        <div className="relative">
          <StoryGeneratorTabs 
            onSubmit={handleGenerateStory} 
            loading={generating}
          />
        </div>

        {generating && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-lg text-center">
              Creating your story...
              <br />
              <span className="text-sm text-muted-foreground">
                This may take a minute or two
              </span>
            </p>
          </div>
        )}

        {generatedStory && !generating && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-heading font-bold">{generatedStory.title}</h2>
              <div className="flex space-x-2">
                {!savedId && (
                  <Button
                    onClick={() => saveStoryMutation.mutate()}
                    disabled={saveStoryMutation.isPending}
                    variant="outline"
                    size="sm"
                  >
                    {saveStoryMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save Story
                  </Button>
                )}
                
                {savedId && (
                  <Button
                    onClick={() => toggleFavoriteMutation.mutate()}
                    disabled={toggleFavoriteMutation.isPending}
                    variant="outline"
                    size="sm"
                  >
                    {toggleFavoriteMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : isFavorite ? (
                      <StarOff className="h-4 w-4 mr-2" />
                    ) : (
                      <Star className="h-4 w-4 mr-2" />
                    )}
                    {isFavorite ? "Remove Favorite" : "Add to Favorites"}
                  </Button>
                )}
              </div>
            </div>

            <StoryDisplay story={generatedStory} />
          </div>
        )}
      </div>
    </div>
  );
}