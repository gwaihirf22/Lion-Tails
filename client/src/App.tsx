import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Story from "@/pages/Story";
import Music from "@/pages/Music";
import SavedStories from "@/pages/SavedStories";
import Settings from "@/pages/Settings";
import AdminStats from "@/pages/AdminStats";
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
import { ReadingPrefsProvider } from "@/hooks/use-reading-prefs";
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
      {/* The page itself renders the server 403 for a non-admin; the guard that
          matters is requireAdmin on the endpoint, not route visibility. */}
      <ProtectedRoute path="/admin/stats" component={AdminStats} />
      <ProtectedRoute path="/characters" component={Characters} />
      <Route path="/heroes-of-faith" component={HeroesOfFaith} />
      <Route path="/image-analysis" component={ImageAnalysis} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  /**
   * On the reader route the app shell steps aside so the chosen palette fills
   * the viewport -- otherwise Night is a dark rectangle floating on a bright
   * photograph, which is worse than no dark mode at all.
   *
   * Done here, in JS, rather than with CSS. The photo background and the white
   * overlay below are INLINE styles, and an inline style cannot be overridden
   * from a stylesheet without !important -- which would then break silently
   * the first time someone edits the object it is fighting. Not rendering them
   * is honest; out-shouting them is not.
   */
  const [location] = useLocation();
  const bareReader = location.startsWith("/story");

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
        <ReadingPrefsProvider>
        <ParentModeProvider>
          {/* Above Header and Router on purpose: the job must keep being
              watched after the user navigates away from the generate page,
              which is the whole point of the change. */}
          <StoryJobsProvider>
          <div
            className="min-h-screen flex flex-col font-body text-textDark"
            style={bareReader ? undefined : appBackgroundStyle}
          >
            {!bareReader && <div style={overlayStyle}></div>}
            <Header />
            <main
              className={
                bareReader
                  ? "flex-grow relative z-10"
                  : "flex-grow container mx-auto p-4 md:px-8 md:py-6 relative z-10"
              }
            >
              <div
                className={
                  bareReader
                    ? ""
                    : "content-container rounded-2xl shadow-xl p-4 md:p-6 border border-primary/10 bg-white/80 backdrop-blur-sm"
                }
              >
                <Router />
              </div>
            </main>
            <Footer />
          </div>
          <Toaster />
          </StoryJobsProvider>
        </ParentModeProvider>
        </ReadingPrefsProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
