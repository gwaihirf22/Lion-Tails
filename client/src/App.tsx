import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Story from "@/pages/Story";
import Music from "@/pages/Music";
import SavedStories from "@/pages/SavedStories";
import Settings from "@/pages/Settings";
import Characters from "@/pages/Characters";
import HeroesOfFaith from "@/pages/HeroesOfFaith";
import ImageAnalysis from "@/pages/ImageAnalysis";
import GenerateStory from "@/pages/GenerateStory";
import AuthPage from "@/pages/auth-page";

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { ProtectedRoute } from "@/lib/protected-route";
import { AuthProvider } from "@/hooks/use-auth";
import { ParentModeProvider } from "@/hooks/use-parent-mode";
import { StoryJobsProvider } from "@/hooks/use-story-jobs";

// Import the background image
import lionTailsBackground from "@assets/Lion tails.jpg";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <ProtectedRoute path="/story" component={Story} />
      <ProtectedRoute path="/generate-story" component={GenerateStory} />
      <Route path="/music" component={Music} />
      <Route path="/auth" component={AuthPage} />
      <ProtectedRoute path="/saved-stories" component={SavedStories} />
      <ProtectedRoute path="/settings" component={Settings} />
      <ProtectedRoute path="/characters" component={Characters} />
      <Route path="/heroes-of-faith" component={HeroesOfFaith} />
      <Route path="/image-analysis" component={ImageAnalysis} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // Style for app background
  const appBackgroundStyle = {
    backgroundImage: `url(${lionTailsBackground})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundAttachment: 'fixed',
    backgroundRepeat: 'no-repeat',
    position: 'relative' as const,
  };

  // Style for overlay to improve text readability
  const overlayStyle = {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    zIndex: -1,
  };

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ParentModeProvider>
          {/* Above Header and Router on purpose: the job must keep being
              watched after the user navigates away from the generate page,
              which is the whole point of the change. */}
          <StoryJobsProvider>
          <div className="min-h-screen flex flex-col font-body text-textDark" style={appBackgroundStyle}>
            <div style={overlayStyle}></div>
            <Header />
            <main className="flex-grow container mx-auto p-4 md:px-8 md:py-6 relative z-10">
              <div className="content-container rounded-2xl shadow-xl p-4 md:p-6 border border-primary/10 bg-white/80 backdrop-blur-sm">
                <Router />
              </div>
            </main>
            <Footer />
          </div>
          <Toaster />
          </StoryJobsProvider>
        </ParentModeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
