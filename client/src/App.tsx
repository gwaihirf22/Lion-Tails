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
import Header from "@/components/Header";
import Footer from "@/components/Footer";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/story" component={Story} />
      <Route path="/music" component={Music} />
      <Route path="/saved-stories" component={SavedStories} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen flex flex-col font-body text-textDark">
        <Header />
        <main className="flex-grow container mx-auto p-4 md:px-8 md:py-6">
          <Router />
        </main>
        <Footer />
      </div>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
