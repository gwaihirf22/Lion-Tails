import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import MusicSection from "@/components/MusicSection";
import { Song } from "@shared/schema";

export default function Music() {
  const [, navigate] = useLocation();
  const { data: songs, isLoading, error } = useQuery<Song[]>({
    queryKey: ["/api/songs"],
  });

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
      
      <MusicSection songs={songs || []} />
    </div>
  );
}
