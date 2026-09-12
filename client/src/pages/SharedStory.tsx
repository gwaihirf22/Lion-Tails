import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { Loader2 } from "lucide-react";
import StoryDisplay from "@/components/StoryDisplay";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { isShareTarget, type SharedStoryView } from "@shared/sharedStory";

/**
 * A story someone shared, for anybody with the link.
 *
 * Blake: "a link that would allow a person to view the story without having
 * an account. And this would be a good way to also have attached to this
 * share page an invitation for them to create their own stories."
 *
 * The SAME reader as a story in your own library -- StoryDisplay with no
 * storyId, which is the read-only path, plus `shared` for the last two owner
 * controls. Not a second reader that would drift from the first: text size,
 * palette and focus mode all work here, from the reader's own browser.
 *
 * A plain fetch, not the app's query helpers: there may be no session, and
 * nothing here should behave differently if there is one.
 */
export default function SharedStoryPage() {
  const { token } = useParams<{ token: string }>();
  const [view, setView] = useState<SharedStoryView | null>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    if (!token || !isShareTarget(token)) {
      setGone(true);
      return;
    }
    let cancelled = false;
    fetch(`/api/shared/${token}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((v: SharedStoryView) => !cancelled && setView(v))
      .catch(() => !cancelled && setGone(true));
    return () => {
      cancelled = true;
    };
  }, [token]);

  // The tab title. The server sets it for crawlers on the first load (see
  // server/lib/pageMeta.ts); this keeps it right after client navigation.
  useEffect(() => {
    if (view) document.title = `${view.title} — Lion Tails`;
  }, [view]);

  if (gone) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 py-8">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold">This story is no longer shared</h1>
          <p className="text-muted-foreground">
            Whoever sent you the link has stopped sharing it, or the story has been removed.
          </p>
        </div>
        <Invitation />
      </div>
    );
  }

  if (!view) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading the story" />
      </div>
    );
  }

  return (
    <div>
      <StoryDisplay
        shared
        story={{
          title: view.title,
          content: view.content,
          storyType: view.storyType,
          moralOutcome: view.moralOutcome,
          bibleVerse: view.bibleVerse,
          applicationQuestions: view.applicationQuestions,
          imageUrl: view.imageUrl,
        }}
        storyType={view.storyType}
        // createdAt is required by the picture type and read by nothing on
        // this page, so it is filled here rather than published by the server.
        images={view.images.map((p) => ({ ...p, createdAt: "" }))}
        editLog={view.editLog}
      />
      <div className="mx-auto max-w-3xl px-3 pb-10">
        <Invitation />
      </div>
    </div>
  );
}

/**
 * The invitation. BELOW the story's own ending, never inside it -- somebody
 * came here to read a story, and the story comes first.
 *
 * Signed in already, it points at writing one rather than at a sign-up form
 * that would only redirect them home.
 *
 * Every colour has a FALLBACK. The --reader-* variables exist only under a
 * [data-palette] that StoryDisplay puts on <body> while it is mounted -- and
 * on the "no longer shared" page it is not, so without the fallbacks this
 * box would lose its background and border there.
 */
function Invitation() {
  const { user } = useAuth();
  return (
    <aside
      className="mt-8 space-y-3 rounded-lg border p-5 text-center"
      style={{
        borderColor: "var(--reader-border, hsl(var(--border)))",
        background: "var(--reader-surface, hsl(var(--card)))",
        color: "var(--reader-fg, hsl(var(--foreground)))",
      }}
      aria-label="About Lion Tails"
    >
      <h2 className="text-xl font-semibold">Stories where your child is the hero</h2>
      <p className="mx-auto max-w-prose text-sm" style={{ color: "var(--reader-muted, hsl(var(--muted-foreground)))" }}>
        Lion Tails writes Christian bedtime stories starring the people you love — their
        name, what they are like, what happened this week. Real history and Scripture,
        with your child walking through it.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
        {user ? (
          <Button asChild>
            <Link href="/generate-story">Write a story of your own</Link>
          </Button>
        ) : (
          <Button asChild>
            <Link href="/auth?tab=register">Make your own story — free to start</Link>
          </Button>
        )}
        <a
          href="https://paul-blake.com/blog/technology/how-to-use-lion-tails"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm underline underline-offset-4"
        >
          How it works
        </a>
      </div>
    </aside>
  );
}
