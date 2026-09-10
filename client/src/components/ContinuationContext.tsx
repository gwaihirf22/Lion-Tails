import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Loader2 } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequestAllowingErrors } from "@/lib/queryClient";
import { parseStoryContent } from "@/lib/storyContent";
import StoryContent from "@/components/reader/StoryContent";
import { useUniverses } from "@/hooks/use-universes";
import { UniverseWorldItem } from "@/components/UniverseContext";
import type { SavedStory } from "@shared/schema";

/**
 * What you are continuing, shown on the Create Story page.
 *
 * This replaced a banner that said "Continuing an earlier story" and nothing
 * else -- you could not see the story, its plan, or what the world already
 * holds, which made "continue" an act of faith.
 *
 * EVERYTHING HERE IS FREE. No model call is made to render any of it:
 *
 *   - the outline was written during the original generation as a resume
 *     checkpoint and is now copied onto the story, so the recap is a by-product
 *     of work already paid for;
 *   - the story text is the row itself;
 *   - the universe summary is only DISPLAYED. Generating one costs a call and
 *     is gated elsewhere; showing one that already exists costs nothing.
 *
 * Display only. Nothing here gates or blocks generation -- the form below works
 * exactly the same whether this panel is open, closed, or still loading.
 */
export function ContinuationContext({ storyId }: { storyId: string }) {
  const { universes } = useUniverses();

  const { data: parent, isLoading } = useQuery<SavedStory | null>({
    queryKey: [`/api/stories/${storyId}`],
    queryFn: async () => {
      // Non-throwing: a deleted or foreign parent is a normal answer to render,
      // not an exception that should blank the whole Create Story page.
      const r = await apiRequestAllowingErrors("GET", `/api/stories/${storyId}`);
      return r.ok ? ((await r.json()) as SavedStory) : null;
    },
  });

  const doc = useMemo(
    () =>
      parent?.story?.content
        ? parseStoryContent(
            parent.story.content,
            parent.story.storyType === "poem" ? { verse: true } : undefined,
          )
        : null,
    [parent?.story?.content, parent?.story?.storyType],
  );

  if (isLoading) {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Loading the story you are continuing…
      </div>
    );
  }

  // The parent is gone, or was never the user's. Say so and let them carry on:
  // the generation itself does not depend on this panel.
  if (!parent) {
    return (
      <div className="mb-4 rounded-lg border border-border bg-card p-4">
        <p className="text-sm">
          <strong>Continuing an earlier story.</strong> That story could not be
          loaded, so there is nothing to show here — but this one will still join
          the same world.
        </p>
      </div>
    );
  }

  const outline = parent.outline ?? [];
  const universe = universes.find((u) => u.universeId === (parent as { universeId?: string }).universeId);
  const written = new Date(parent.createdAt);

  return (
    <div className="mb-4 rounded-lg border-2 border-primary/30 bg-primary/5 p-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2">
        <BookOpen className="h-4 w-4 shrink-0 self-center text-primary" aria-hidden="true" />
        <span className="text-sm">Continuing</span>
        <strong className="text-sm">{parent.story.title}</strong>
        <span className="text-xs text-muted-foreground">
          written {written.toLocaleDateString(undefined, { day: "numeric", month: "long" })}
        </span>
      </div>

      <p className="mb-3 text-sm text-muted-foreground">
        This one joins the same world and is written against what has already
        happened there — a new episode, not a retelling.
      </p>

      <Accordion type="multiple" className="w-full">
        {/* Deliberately "the plan", not "what happened". This is the outline the
            story was generated FROM, and a chapter can drift from its plan. The
            full text below is the authority; claiming otherwise would be a
            small lie that only shows up when someone notices a mismatch. */}
        {outline.length > 0 && (
          <AccordionItem value="plan">
            <AccordionTrigger className="text-sm">
              The plan this story was written from
              <Badge variant="outline" className="ml-2 text-xs">
                {outline.length} {outline.length === 1 ? "part" : "parts"}
              </Badge>
            </AccordionTrigger>
            <AccordionContent>
              <ol className="list-decimal space-y-1.5 pl-5 text-sm">
                {outline.map((part, i) => (
                  <li key={i}>{part}</li>
                ))}
              </ol>
            </AccordionContent>
          </AccordionItem>
        )}

        <AccordionItem value="story">
          <AccordionTrigger className="text-sm">Read the full story</AccordionTrigger>
          <AccordionContent>
            {/* A fixed-height scroller, the pattern DebugPanel already uses, so
                a 3,000-word story does not push the form it belongs to off the
                screen. Rendered through the reader's own parser and component
                rather than a second renderer, so the text looks like the text. */}
            <ScrollArea className="h-72 rounded border border-border bg-background p-4">
              {doc ? (
                <StoryContent doc={doc} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  This story has no text saved.
                </p>
              )}
            </ScrollArea>
          </AccordionContent>
        </AccordionItem>

        {/* Only when one already exists. This panel never OFFERS to make one --
            that costs a model call and lives behind its own gate. */}
        {universe && <UniverseWorldItem universe={universe} />}
      </Accordion>

      {outline.length === 0 && (
        // Not an empty box and not a fake recap. Poems and very short stories
        // are generated in a single call, so no plan was ever made for them --
        // there is nothing to show, and saying so is better than a heading with
        // nothing under it.
        <p className="mt-3 text-xs text-muted-foreground">
          This one was written in a single pass, so there is no chapter plan to
          show — the full story is above.
        </p>
      )}
    </div>
  );
}

export default ContinuationContext;
