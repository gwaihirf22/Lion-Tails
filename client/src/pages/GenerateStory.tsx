import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import StoryGeneratorTabs from "@/components/StoryGeneratorTabs";
import StoryDisplay from "@/components/StoryDisplay";
import ParentModeToggle from "@/components/ParentModeToggle";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Star, StarOff } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import type { StoryRequest, StoryResponse } from "@shared/schema";
import { useStoryJobs, describeJob } from "@/hooks/use-story-jobs";

export default function GenerateStory() {
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [generatedStory, setGeneratedStory] = useState<StoryResponse | null>(null);
  const [storyRequest, setStoryRequest] = useState<StoryRequest | null>(null);
  const [generating, setGenerating] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [watchingJobId, setWatchingJobId] = useState<string | null>(null);
  const { jobs, enqueue, cancel } = useStoryJobs();

  // The job we started this visit, if it is still in the provider list. Reading
  // it from the shared list rather than holding a local copy means a reload or
  // a navigation away and back picks the job up again.
  const watchedJob = jobs.find(
    (j) =>
      j.job_id === watchingJobId &&
      (j.status === "queued" || j.status === "running"),
  );

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

    // Enqueue and return. The story is written by the server worker and saved
    // by it, so this no longer holds a request open for the whole generation.
    // A gpt-oss "extended" story measured 342 seconds against SWAG's 240s
    // proxy timeout -- past that, nginx returns its own HTML error page and
    // response.json() throws the Unexpected-token-'<' error.
    //
    // The auto-save block that used to live here is GONE. The worker saves, so
    // "Story generated but not saved" no longer exists as a state -- and that
    // block is also what used to persist canned error stories to the library
    // with a success toast.
    const outcome = await enqueue(data);
    setGenerating(false);

    if (!outcome.ok) {
      // 409 is a state conflict, not a failure: the user already has one
      // running. Point them at it rather than presenting a dead end.
      if (outcome.status === 409) {
        toast({
          title: "A story is already being written",
          description: outcome.message,
        });
        return;
      }
      toast({
        title: "Could not start the story",
        description: outcome.message,
        variant: "destructive",
      });
      return;
    }

    setWatchingJobId(outcome.jobId);
    toast({
      title: "Writing your story",
      description:
        "You can leave this page. It will appear in your library when it is done.",
    });
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
            loading={generating || Boolean(watchedJob)}
          />
        </div>

        {/* Progress comes from the job's own step rather than a local boolean,
            so it survives a reload and reports where the worker actually is. */}
        {watchedJob && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-lg text-center">
              {describeJob(watchedJob)}
              <br />
              <span className="text-sm text-muted-foreground">
                You can leave this page — it keeps writing, and the story will
                be in your library when it is done.
              </span>
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-4"
              onClick={() => cancel(watchedJob.job_id)}
            >
              Cancel
            </Button>
            <span className="text-xs text-muted-foreground mt-1">
              Cancelling stops the next part; the one being written is still paid for.
            </span>
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

      <ParentModeToggle />
    </div>
  );
}