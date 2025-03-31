import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import appIcon from "@/assets/app-icon.jpg";
import { useAuth } from "@/hooks/use-auth";
import { Book, Music, PenTool, User, CalendarDays, History, BookOpen } from "lucide-react";

export default function Home() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  return (
    <div>
      {/* Hero Section */}
      <section className="mb-8 text-center">
        <div className="max-w-5xl mx-auto rounded-2xl shadow-xl p-6 relative overflow-hidden content-container">
          <h1 className="text-4xl md:text-5xl font-heading font-bold mb-4 text-secondary drop-shadow-sm">Lion Tails: Christian Bedtime Stories</h1>
          <p className="text-lg md:text-xl mb-6 max-w-3xl mx-auto">Create beautiful faith-based stories for your little ones, filled with Biblical wisdom and heartwarming lessons.</p>
          <div className="flex flex-col md:flex-row justify-center items-center gap-8">
            <div className="flex-1 p-4">
              <div className="animate-[float_6s_ease-in-out_infinite] w-64 h-64 md:w-80 md:h-80 mx-auto">
                <img src={appIcon} alt="Lion Tails" className="w-full h-full object-cover rounded-full shadow-lg border-2 border-white" />
              </div>
            </div>
            <div className="flex-1 p-4">
              <div className="bg-white/70 backdrop-blur-sm rounded-lg p-4 shadow-md">
                <h3 className="text-xl font-heading font-bold mb-4">Features:</h3>
                <ul className="text-left space-y-3">
                  <li className="flex items-center">
                    <span className="text-primary mr-3 bg-primary/10 p-1 rounded-full"><Book size={18} /></span> 
                    <span>Personalized bedtime stories with your child's name</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-primary mr-3 bg-primary/10 p-1 rounded-full"><BookOpen size={18} /></span> 
                    <span>Biblical wisdom and moral lessons in every story</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-primary mr-3 bg-primary/10 p-1 rounded-full"><History size={18} /></span> 
                    <span>Time travel adventures to Bible events</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-primary mr-3 bg-primary/10 p-1 rounded-full"><CalendarDays size={18} /></span> 
                    <span>Discover Heroes of Faith from history</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-primary mr-3 bg-primary/10 p-1 rounded-full"><Music size={18} /></span> 
                    <span>Christian music with guitar chords and lyrics</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Button 
              size="lg"
              className="bg-primary text-white hover:bg-primary/90 border-none shadow-md font-bold"
              onClick={() => navigate("/generate-story")}
            >
              <PenTool className="mr-2 h-5 w-5" />
              Create a Story
            </Button>
            {!user && (
              <Button 
                variant="outline"
                size="lg"
                className="bg-white/50 backdrop-blur-sm hover:bg-white/70 shadow-md font-bold"
                onClick={() => navigate("/auth")}
              >
                <User className="mr-2 h-5 w-5" />
                Sign In or Register
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="mb-8">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-heading font-bold mb-6 text-center">Explore Lion Tails</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-6 text-center hover:shadow-xl transition-all transform hover:-translate-y-1">
              <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
                <PenTool className="h-8 w-8 text-blue-600" />
              </div>
              <h3 className="text-xl font-heading font-bold mb-2">Create Stories</h3>
              <p className="mb-4">Generate personalized Christian bedtime stories with moral lessons and Scripture.</p>
              <Button 
                className="bg-blue-500 hover:bg-blue-600 text-white border-none shadow-md"
                onClick={() => navigate("/generate-story")}
              >
                Start Creating
              </Button>
            </div>
            
            <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-6 text-center hover:shadow-xl transition-all transform hover:-translate-y-1">
              <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
                <CalendarDays className="h-8 w-8 text-amber-600" />
              </div>
              <h3 className="text-xl font-heading font-bold mb-2">Heroes of Faith</h3>
              <p className="mb-4">Discover inspiring historical figures who exemplified Christian values.</p>
              <Button 
                className="bg-amber-500 hover:bg-amber-600 text-white border-none shadow-md"
                onClick={() => navigate("/heroes-of-faith")}
              >
                Meet Heroes
              </Button>
            </div>
            
            <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-6 text-center hover:shadow-xl transition-all transform hover:-translate-y-1">
              <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center mx-auto mb-4">
                <Music className="h-8 w-8 text-purple-600" />
              </div>
              <h3 className="text-xl font-heading font-bold mb-2">Christian Music</h3>
              <p className="mb-4">Browse lyrics and guitar chords for popular Christian children's songs.</p>
              <Button 
                className="bg-purple-500 hover:bg-purple-600 text-white border-none shadow-md"
                onClick={() => navigate("/music")}
              >
                Explore Music
              </Button>
            </div>
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
      
      {/* Call to Action */}
      <div className="max-w-4xl mx-auto mb-12 text-center">
        <h2 className="text-3xl font-heading font-bold mb-4">Ready to Begin?</h2>
        <p className="text-lg mb-6 max-w-2xl mx-auto">Start creating personalized faith-based stories that teach Biblical values in an engaging way.</p>
        <Button 
          size="lg"
          className="bg-primary text-white hover:bg-primary/90 border-none shadow-md font-bold"
          onClick={() => navigate("/generate-story")}
        >
          Create Your First Story
        </Button>
      </div>
    </div>
  );
}
