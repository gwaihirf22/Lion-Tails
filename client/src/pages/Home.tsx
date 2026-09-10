import { useLocation , Link } from "wouter";
import { FREE_STORIES, FREE_STORIES_PER_MONTH } from "@shared/schema";
import { Button } from "@/components/ui/button";
import cover from "@/assets/cover.webp";
import coverSmall from "@/assets/cover-1024.webp";
import coverFallback from "@/assets/cover.jpg";
import barnabasSign from "@/assets/barnabas-sign.webp";
import { useAuth } from "@/hooks/use-auth";
import { Music, PenTool, User, CalendarDays } from "lucide-react";

export default function Home() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  return (
    <div>
      {/*
        The cover carries its own wordmark, so there is no <h1> printed over
        it -- two renderings of the name stacked on top of each other read as a
        mistake rather than as branding. The heading is still here for screen
        readers and for search results; it is just not drawn twice.

        <picture> rather than <img>: the full-width file is 236KB and the phone
        one 132KB, from a 2.5MB source. On a tablet over home wifi that is the
        difference between the hero appearing and the hero arriving.

        fetchpriority="high" because this is the largest thing above the fold
        and the browser otherwise discovers it late.
      */}
      <section className="mb-8">
        <div className="max-w-6xl mx-auto rounded-2xl shadow-xl overflow-hidden relative">
          <h1 className="sr-only">Lion Tails — real stories, timeless truths</h1>
          <picture>
            <source srcSet={coverSmall} media="(max-width: 640px)" type="image/webp" />
            <source srcSet={cover} type="image/webp" />
            <img
              src={coverFallback}
              alt="A lion and a lantern-keeper outside Barnabas &amp; Co., with scenes from Scripture and church history winding away behind them"
              className="w-full h-auto block"
              width={1536}
              height={1024}
              fetchPriority="high"
            />
          </picture>
        </div>

        <div className="max-w-3xl mx-auto text-center mt-6 px-4">
          <p className="text-lg md:text-xl mb-6">
            Learn the key events and people of Scripture and church history the way
            anyone actually remembers them &mdash; as stories worth staying awake for,
            with the characters you choose in them.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Button
              size="lg"
              className="bg-primary text-primary-foreground hover:bg-primary/90 border-none shadow-md font-bold"
              onClick={() => navigate("/generate-story")}
            >
              <PenTool className="mr-2 h-5 w-5" />
              Create a Story
            </Button>
            {!user && (
              <Button
                variant="outline"
                size="lg"
                className="bg-card backdrop-blur-sm hover:bg-card shadow-md font-bold"
                onClick={() => navigate("/auth")}
              >
                <User className="mr-2 h-5 w-5" />
                Sign In or Register
              </Button>
            )}
          </div>
        </div>
      </section>

      {/*
        The keeper's shop. Barnabas exists only in server/data/lionTails.ts
        today -- he is lore the story prompts draw on, with no surface of his
        own -- so this is the first place a reader meets the frame the stories
        are told inside. The sign says TIMEKEEPER, which is the whole premise.
      */}
      <section className="mb-10 max-w-4xl mx-auto px-4">
        <div className="content-container rounded-xl shadow-lg p-6 text-center">
          <img
            src={barnabasSign}
            alt="A weathered hanging shop sign reading Barnabas &amp; Co., Timekeeper"
            className="mx-auto w-full max-w-md h-auto mb-4"
            loading="lazy"
          />
          <p className="text-lg max-w-2xl mx-auto">
            Every story starts at the keeper&rsquo;s shop. Mr Barnabas knows what the
            lantern does and never quite explains it &mdash; he just opens the door,
            and the people you have made walk through it into something that really
            happened.
          </p>
        </div>
      </section>

      {/* Features Section */}
      <section className="mb-8">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-heading font-bold mb-6 text-center">Explore Lion Tails</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-card backdrop-blur-sm rounded-lg shadow-lg p-6 text-center hover:shadow-xl transition-all transform hover:-translate-y-1">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <PenTool className="h-8 w-8 text-foreground" />
              </div>
              <h3 className="text-xl font-heading font-bold mb-2">Create Stories</h3>
              <p className="mb-4">Choose your characters, pick a theme or a real account, and read it in a reader made for the dark.</p>
              <Button 
                className="bg-primary hover:bg-primary/90 text-primary-foreground border-none shadow-md"
                onClick={() => navigate("/generate-story")}
              >
                Start Creating
              </Button>
            </div>
            
            <div className="bg-card backdrop-blur-sm rounded-lg shadow-lg p-6 text-center hover:shadow-xl transition-all transform hover:-translate-y-1">
              <div className="w-16 h-16 rounded-full bg-warning-surface flex items-center justify-center mx-auto mb-4">
                <CalendarDays className="h-8 w-8 text-warning" />
              </div>
              <h3 className="text-xl font-heading font-bold mb-2">Heroes of Faith</h3>
              <p className="mb-4">People from Scripture and from church history, each with a written profile you can read without the AI &mdash; every date and passage checked against real sources.</p>
              <Button 
                className="bg-warning hover:bg-warning/90 text-warning-foreground border-none shadow-md"
                onClick={() => navigate("/heroes-of-faith")}
              >
                Meet Heroes
              </Button>
            </div>
            
            <div className="bg-card backdrop-blur-sm rounded-lg shadow-lg p-6 text-center hover:shadow-xl transition-all transform hover:-translate-y-1">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <Music className="h-8 w-8 text-foreground" />
              </div>
              <h3 className="text-xl font-heading font-bold mb-2">Christian Music</h3>
              <p className="mb-4">Browse lyrics and guitar chords for popular Christian songs and hymns.</p>
              <Button 
                className="bg-secondary hover:bg-secondary/90 text-secondary-foreground border-none shadow-md"
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
          <h3 className="text-2xl font-heading font-bold mb-2">
            Your First {FREE_STORIES} Stories Are Free!
          </h3>
          <p className="text-foreground mb-2">
            {/* Read, not restated. These were literals in the copy, which is how
                a marketing sentence outlives the number it describes. */}
            Enjoy {FREE_STORIES} free AI-generated stories to start, then {FREE_STORIES_PER_MONTH} more
            each month up to {FREE_STORIES}. Want unlimited stories?
            Add your own OpenAI API key in the <Link href="/settings" className="text-secondary hover:underline font-medium">Settings</Link> page.
          </p>
        </div>
      </div>
      
      {/* Call to Action */}
      <div className="max-w-4xl mx-auto mb-12 text-center">
        <h2 className="text-3xl font-heading font-bold mb-4">Ready to Begin?</h2>
        <p className="text-lg mb-6 max-w-2xl mx-auto">Start creating personalized faith-based stories that teach Biblical values in an engaging way.</p>
        <Button 
          size="lg"
          className="bg-primary text-primary-foreground hover:bg-primary/90 border-none shadow-md font-bold"
          onClick={() => navigate("/generate-story")}
        >
          Create Your First Story
        </Button>
      </div>
    </div>
  );
}
