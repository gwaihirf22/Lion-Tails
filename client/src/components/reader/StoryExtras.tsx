import { useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { DebugPanel } from "@/components/DebugPanel";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { StoryResponse, HeroOfFaith, SavedStory } from "@shared/schema";
import type { StoryDoc } from "@/lib/storyContent";
import lionTailsImage from "@/assets/illustrations/lion-tails.jpg";

/**
 * Everything that is not the story: verse, questions, picture, further
 * reading, the hero associator and the debug panel.
 *
 * All of it collapses below the end of the text, and all of it is painted from
 * the reader's palette tokens rather than a hard-coded gradient -- the old
 * "Think About It" card was fixed blue-on-purple and stayed bright white while
 * the reader was in Night.
 */
export function StoryExtras({
  story,
  storyId,
  doc,
  focusHidden,
}: {
  story: StoryResponse;
  storyId?: string;
  doc: StoryDoc | null;
  /** True while focus mode has faded this block out. */
  focusHidden: boolean;
}) {
  const { toast } = useToast();
  const ref = useRef<HTMLDivElement>(null);

  // React 18 does not forward `inert` as a prop, so it has to be set on the
  // node. Without this, a keyboard user tabbing through focus mode lands
  // inside content they cannot see -- and nothing about that failure is
  // visible on screen, which is why it needs saying here.
  useEffect(() => {
    const el = ref.current as (HTMLDivElement & { inert?: boolean }) | null;
    if (el) el.inert = focusHidden;
  }, [focusHidden]);

  // ONE fetch of the saved story. StoryDisplay used to do this twice, in two
  // separate effects, for two different fields.
  const { data: saved } = useQuery<SavedStory & { heroId?: string }>({
    queryKey: [`/api/stories/${storyId}`],
    enabled: Boolean(storyId),
  });
  const { data: heroes = [] } = useQuery<HeroOfFaith[]>({
    queryKey: ["/api/heroes"],
    enabled: Boolean(storyId),
  });

  const associate = useMutation({
    mutationFn: async (heroId: string) => {
      const response = await apiRequest("POST", `/api/stories/${storyId}/associate-hero`, { heroId });
      return await response.json();
    },
    onSuccess: () => {
      toast({ title: "Story associated", description: "Linked to that Hero of Faith." });
      queryClient.invalidateQueries({ queryKey: [`/api/stories/${storyId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/stories"] });
    },
    onError: (error) => {
      toast({
        title: "Could not associate",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  const questions = story.applicationQuestions ?? [];
  const further = doc?.furtherLearning ?? [];

  return (
    <div
      ref={ref}
      className="reader-chrome mx-auto w-full max-w-3xl px-4 pb-16"
      style={{ color: "var(--reader-fg)" }}
    >
      {story.bibleVerse && (
        <blockquote
          className="my-8 border-y py-6 text-center italic"
          style={{ borderColor: "var(--reader-border)" }}
        >
          <p className="text-[1.05em]">{story.bibleVerse.text}</p>
          <cite className="mt-2 block not-italic text-sm" style={{ color: "var(--reader-muted)" }}>
            — {story.bibleVerse.reference}
          </cite>
        </blockquote>
      )}

      <Accordion type="multiple" className="w-full">
        {questions.length > 0 && (
          <AccordionItem value="questions" style={{ borderColor: "var(--reader-border)" }}>
            <AccordionTrigger className="text-base">Questions to talk about</AccordionTrigger>
            <AccordionContent>
              <ol className="ml-5 list-decimal space-y-2">
                {questions.map((q, i) => (
                  <li key={i}>{typeof q === "string" ? q : (q as { question?: string }).question}</li>
                ))}
              </ol>
              {story.moralOutcome === "consequences" && (
                <p className="mt-4 text-sm" style={{ color: "var(--reader-muted)" }}>
                  Sometimes the best lessons come from thinking about what we would do differently.
                </p>
              )}
            </AccordionContent>
          </AccordionItem>
        )}

        <AccordionItem value="picture" style={{ borderColor: "var(--reader-border)" }}>
          <AccordionTrigger className="text-base">
            Picture{!story.imageUrl && " (stock)"}
          </AccordionTrigger>
          <AccordionContent>
            <img
              src={story.imageUrl || lionTailsImage}
              alt={
                story.imageUrl
                  ? story.imagePrompt || `An illustration for ${story.title}`
                  : "The Lion Tails lion, shown when a story has no illustration of its own"
              }
              className="mx-auto max-h-[60vh] w-auto rounded-lg"
              loading="lazy"
            />
            {/* Illustration is DALL-E 3, which modelPolicy classes as premium:
                admins, or a user with their own OpenAI key. Everyone else gets
                the stock lion and, until now, no way to know that is what they
                were looking at. */}
            {!story.imageUrl && (
              <p className="mt-3 text-center text-sm" style={{ color: "var(--reader-muted)" }}>
                This is the standard Lion Tails picture. Stories are illustrated
                individually only when you add your own OpenAI key in Settings.
              </p>
            )}
          </AccordionContent>
        </AccordionItem>

        {further.length > 0 && (
          <AccordionItem value="further" style={{ borderColor: "var(--reader-border)" }}>
            <AccordionTrigger className="text-base">Further reading</AccordionTrigger>
            <AccordionContent>
              <ul className="ml-5 list-disc space-y-1">
                {further.map((r, i) => (
                  <li key={i}>
                    {r.url ? (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                        style={{ color: "var(--reader-accent)" }}
                      >
                        {r.label}
                      </a>
                    ) : (
                      // A line without a URL is still a resource. The previous
                      // implementation dropped every one of these.
                      r.label
                    )}
                  </li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
        )}

        {storyId && (
          <AccordionItem value="hero" style={{ borderColor: "var(--reader-border)" }}>
            <AccordionTrigger className="text-base">Link to a Hero of Faith</AccordionTrigger>
            <AccordionContent>
              <Label className="mb-2 block text-sm" style={{ color: "var(--reader-muted)" }}>
                Group this story with a hero so it shows up on their page.
              </Label>
              <Select
                value={saved?.heroId ?? ""}
                onValueChange={(v) => v && associate.mutate(v)}
                disabled={associate.isPending}
              >
                <SelectTrigger className="max-w-sm">
                  <SelectValue placeholder="Choose a Hero of Faith" />
                </SelectTrigger>
                <SelectContent>
                  {heroes.map((h) => (
                    <SelectItem key={h.id} value={h.id}>
                      {h.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </AccordionContent>
          </AccordionItem>
        )}

        {story.debugData && story.debugData.length > 0 && (
          <AccordionItem value="debug" style={{ borderColor: "var(--reader-border)" }}>
            <AccordionTrigger className="text-base">How this story was made</AccordionTrigger>
            <AccordionContent>
              <DebugPanel debugData={story.debugData} />
            </AccordionContent>
          </AccordionItem>
        )}
      </Accordion>
    </div>
  );
}

export default StoryExtras;
