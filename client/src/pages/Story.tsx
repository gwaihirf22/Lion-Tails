import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import StoryDisplay from "@/components/StoryDisplay";
import { StoryResponse } from "@shared/schema";

export default function Story() {
  const [location, navigate] = useLocation();
  const [storyData, setStoryData] = useState<StoryResponse | null>(null);
  const [storyId, setStoryId] = useState<string | null>(null);

  useEffect(() => {
    // Scroll to the top of the page when component mounts
    window.scrollTo({ top: 0, behavior: 'auto' });
    
    const urlParams = new URLSearchParams(window.location.search);
    const dataParam = urlParams.get("data");
    const idParam = urlParams.get("id");
    
    if (idParam) {
      setStoryId(idParam);
    }
    
    if (dataParam) {
      try {
        const decodedData = JSON.parse(decodeURIComponent(dataParam));
        setStoryData(decodedData);
      } catch (error) {
        console.error("Failed to parse story data:", error);
        navigate("/");
      }
    } else {
      navigate("/");
    }
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
