import { useCallback, useState } from "react";
import { useLocation } from "wouter";
import StoryForm from "@/components/StoryForm";
import { StoryRequest } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

export default function Home() {
  const [, navigate] = useLocation();
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmitStory = useCallback(async (data: StoryRequest) => {
    try {
      setLoading(true);
      
      const response = await apiRequest('POST', '/api/generate-story', data);
      const storyData = await response.json();
      
      // Navigate to the story page with the data
      navigate(`/story?data=${encodeURIComponent(JSON.stringify(storyData))}`);
    } catch (error) {
      console.error('Error generating story:', error);
      toast({
        title: "Error",
        description: "Failed to generate story. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [navigate, toast]);

  return (
    <div>
      {/* Hero Section */}
      <section className="mb-8 text-center">
        <div className="max-w-3xl mx-auto bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-6 relative overflow-hidden" 
             style={{ 
               backgroundImage: `url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxkZWZzPjxwYXR0ZXJuIGlkPSJjbG91ZHMiIHBhdHRlcm5Vbml0cz0idXNlclNwYWNlT25Vc2UiIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiB2aWV3Qm94PSIwIDAgMjAwIDIwMCI+PGNpcmNsZSBmaWxsPSIjZmZmZmZmIiBmaWxsLW9wYWNpdHk9IjAuMiIgY3g9IjQwIiBjeT0iNDAiIHI9IjE1Ii8+PGNpcmNsZSBmaWxsPSIjZmZmZmZmIiBmaWxsLW9wYWNpdHk9IjAuMiIgY3g9IjYwIiBjeT0iNDUiIHI9IjE4Ii8+PGNpcmNsZSBmaWxsPSIjZmZmZmZmIiBmaWxsLW9wYWNpdHk9IjAuMiIgY3g9IjUwIiBjeT0iMzAiIHI9IjIwIi8+PGNpcmNsZSBmaWxsPSIjZmZmZmZmIiBmaWxsLW9wYWNpdHk9IjAuMiIgY3g9IjE2MCIgY3k9IjE2MCIgcj0iMTUiLz48Y2lyY2xlIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4yIiBjeD0iMTgwIiBjeT0iMTY1IiByPSIxOCIvPjxjaXJjbGUgZmlsbD0iI2ZmZmZmZiIgZmlsbC1vcGFjaXR5PSIwLjIiIGN4PSIxNzAiIGN5PSIxNTAiIHI9IjIwIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2Nsb3VkcykiLz48L3N2Zz4=')` 
             }}>
          <h2 className="text-3xl md:text-4xl font-heading font-bold mb-4 text-secondary">Christian Bedtime Stories</h2>
          <p className="text-lg mb-6">Create beautiful faith-based stories for your little ones, filled with Biblical wisdom and heartwarming lessons.</p>
          <div className="flex justify-center">
            <div className="animate-[float_6s_ease-in-out_infinite] w-32 h-32 mr-4">
              <img src="https://images.unsplash.com/photo-1579890002580-841359ca1aab?ixlib=rb-1.2.1&auto=format&fit=crop&w=150&q=80" alt="Sleeping child" className="w-full h-full object-cover rounded-full shadow-md" />
            </div>
            <div className="animate-[float_6s_ease-in-out_infinite] w-32 h-32 animation-delay-1000" style={{ animationDelay: "2s" }}>
              <img src="https://images.unsplash.com/photo-1531386151447-fd76ad50012f?ixlib=rb-1.2.1&auto=format&fit=crop&w=150&q=80" alt="Star night sky" className="w-full h-full object-cover rounded-full shadow-md" />
            </div>
          </div>
          <div className="mt-6">
            <Button variant="outline" className="bg-primary text-white hover:bg-primary/90 border-none" onClick={() => navigate("/music")}>
              Check Out Music & Chords
            </Button>
          </div>
        </div>
      </section>

      {/* Story Form Section */}
      <div className="max-w-4xl mx-auto">
        <StoryForm onSubmit={handleSubmitStory} loading={loading} />
      </div>
    </div>
  );
}
