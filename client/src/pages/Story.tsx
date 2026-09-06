import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import StoryDisplay from "@/components/StoryDisplay";
import { StoryResponse } from "@shared/schema";
import { apiRequestAllowingErrors } from "@/lib/queryClient";

export default function Story() {
  const [location, navigate] = useLocation();
  const [storyData, setStoryData] = useState<StoryResponse | null>(null);
  const [storyId, setStoryId] = useState<string | null>(null);

  useEffect(() => {
    // Scroll to the top of the page when component mounts
    window.scrollTo({ top: 0, behavior: 'auto' });
    
    const urlParams = new URLSearchParams(window.location.search);
    const idParam = urlParams.get("id");
    const dataParam = urlParams.get("data");

    if (!idParam && !dataParam) {
      navigate("/");
      return;
    }
    if (idParam) setStoryId(idParam);

    // Fetch by id rather than reading the story out of the query string.
    // The old links serialised the ENTIRE story into the URL -- including
    // debugData, which holds every prompt and every raw model reply -- so
    // opening a story put all of it in the address bar, in history, and in any
    // proxy log along the way.
    //
    // dataParam is still honoured so links already in someone browser history
    // keep working, but nothing produces them any more.
    const load = async () => {
      if (idParam) {
        try {
          // Non-throwing: a story that is not found is a normal case here,
          // and we fall back rather than surfacing an error.
          const response = await apiRequestAllowingErrors("GET", `/api/stories/${idParam}`);
          if (response.ok) {
            const saved = await response.json();
            setStoryData(saved.story ?? saved);
            return;
          }
        } catch (error) {
          console.error("Failed to load story:", error);
        }
      }
      if (dataParam) {
        try {
          setStoryData(JSON.parse(decodeURIComponent(dataParam)));
          return;
        } catch (error) {
          console.error("Failed to parse story data:", error);
        }
      }
      navigate("/");
    };
    void load();
  }, [navigate]);

  if (!storyData) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-secondary"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex justify-between items-center">
        <h2 className="text-3xl font-heading font-bold text-secondary">Your Bedtime Story</h2>
        <div className="space-x-3">
          <Button variant="outline" onClick={() => navigate("/")}>
            Create New Story
          </Button>
          <Button variant="outline" onClick={() => navigate("/music")}>
            Bedtime Songs
          </Button>
        </div>
      </div>
      
      <StoryDisplay story={storyData} storyId={storyId || undefined} />
    </div>
  );
}
