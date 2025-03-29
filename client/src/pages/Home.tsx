import { useCallback, useState } from "react";
import { useLocation } from "wouter";
import StoryForm from "@/components/StoryForm";
import { StoryRequest } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import appIcon from "@/assets/app-icon.jpg";
import { useAuth } from "@/hooks/use-auth";

export default function Home() {
  const [, navigate] = useLocation();
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { user, isLoading } = useAuth();

  const handleSubmitStory = useCallback(async (data: StoryRequest) => {
    // Check if user is authenticated before generating story
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please log in or create an account to generate stories.",
        variant: "default",
      });
      navigate("/auth");
      return;
    }

    try {
      setLoading(true);
      
      const response = await apiRequest('POST', '/api/generate-story', data);
      
      if (response.status === 401) {
        toast({
          title: "Authentication Required",
          description: "Please log in or create an account to generate stories.",
          variant: "default",
        });
        navigate("/auth");
        return;
      }
      
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
  }, [navigate, toast, user]);

  return (
    <div>
      {/* Hero Section */}
      <section className="mb-8 text-center">
        <div className="max-w-3xl mx-auto content-container rounded-2xl shadow-xl p-6 relative overflow-hidden">
          <h2 className="text-3xl md:text-4xl font-heading font-bold mb-4 text-secondary drop-shadow-sm">Lion Tails: Christian Bedtime Stories</h2>
          <p className="text-lg mb-6">Create beautiful faith-based stories for your little ones, filled with Biblical wisdom and heartwarming lessons.</p>
          <div className="flex flex-col md:flex-row justify-center items-center gap-4">
            <div className="flex-1 p-4">
              <div className="animate-[float_6s_ease-in-out_infinite] w-64 h-64 mx-auto">
                <img src={appIcon} alt="Lion Tails" className="w-full h-full object-cover rounded-full shadow-lg border-2 border-white" />
              </div>
            </div>
            <div className="flex-1 p-4">
              <div className="bg-white/70 backdrop-blur-sm rounded-lg p-4 shadow-md">
                <h3 className="text-xl font-heading font-bold mb-2">Features:</h3>
                <ul className="text-left space-y-2">
                  <li className="flex items-center">
                    <span className="text-primary mr-2">✓</span> 
                    <span>Personalized bedtime stories with your child's name</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-primary mr-2">✓</span> 
                    <span>Biblical wisdom and moral lessons</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-primary mr-2">✓</span> 
                    <span>Time travel adventures to Bible events</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-primary mr-2">✓</span> 
                    <span>Discover Heroes of Faith from history</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-4">
            <Button 
              className="bg-primary text-white hover:bg-primary/90 border-none shadow-md"
              onClick={() => navigate("/music")}
            >
              Check Out Music & Chords
            </Button>
            <Button 
              variant="outline"
              className="bg-white/50 backdrop-blur-sm hover:bg-white/70 shadow-md"
              onClick={() => navigate("/heroes-of-faith")}
            >
              Explore Heroes of Faith
            </Button>
          </div>
        </div>
      </section>

      {/* Story Generation Info */}
      <div className="max-w-4xl mx-auto mb-8">
        <div className="content-container rounded-xl shadow-lg p-6 text-center">
          <div className="inline-block bg-secondary/20 px-4 py-2 rounded-full text-secondary font-medium text-sm mb-3">
            ✨ AI-Powered Stories
          </div>
          <h3 className="text-2xl font-heading font-bold mb-2">Your First 50 Stories Are Free!</h3>
          <p className="text-gray-700 mb-2">
            Enjoy 50 free AI-generated stories to start, plus 10 more each month. Want unlimited stories?
            Add your own OpenAI API key in the <a href="/settings" className="text-secondary hover:underline font-medium">Settings</a> page.
          </p>
        </div>
      </div>
      
      {/* Story Form Section */}
      <div className="max-w-4xl mx-auto">
        {!isLoading && (
          <>
            {!user ? (
              <div className="bg-white/80 backdrop-blur-sm rounded-lg p-6 shadow-lg text-center">
                <h3 className="text-2xl font-heading font-bold mb-4">Create Your First Story</h3>
                <p className="mb-4">You need to sign in or create an account to generate personalized stories.</p>
                <Button 
                  className="bg-primary text-white hover:bg-primary/90 border-none shadow-md"
                  onClick={() => navigate("/auth")}
                >
                  Sign In or Register
                </Button>
              </div>
            ) : (
              <StoryForm onSubmit={handleSubmitStory} loading={loading} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
