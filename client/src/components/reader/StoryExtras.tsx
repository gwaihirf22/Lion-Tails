import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { DIGGING_DEEPER_HEADING } from "@shared/storyAppendices";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ImagePlus, Loader2, RefreshCw } from "lucide-react";
import { DebugPanel } from "@/components/DebugPanel";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { StoryResponse, HeroOfFaith, SavedStory, StoryPicture } from "@shared/schema";
import { MAX_STORY_IMAGES } from "@shared/schema";
import { Trash2 } from "lucide-react";
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
  builtIn,
  images,
  onPictures,
}: {
  story: StoryResponse;
  storyId?: string;
  doc: StoryDoc | null;
  /** True while focus mode has faded this block out. */
  focusHidden: boolean;
  /** Ships with the app: the server refuses to illustrate or link it. */
  builtIn?: boolean;
  /** Every picture this story has had. The chosen one is story.imageUrl. */
  images?: StoryPicture[];
  /**
   * The list changed here. It has to leave this component, because the same
   * pictures are drawn INSIDE the story: deleting an anchored one from this
   * strip must take it out of the text as well, and a local copy cannot.
   */
  onPictures?: (images: StoryPicture[]) => void;
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

  // Whether this account may illustrate at all. Derived server-side from the
  // same policy call the generation path uses, so the button is never offered
  // for something the server will refuse.
  const { data: modelInfo } = useQuery<{ canIllustrate?: boolean }>({
    queryKey: ["/api/settings/models"],
    enabled: Boolean(storyId),
  });

  // The picture the story was saved with, or the one we just made for it.
  const [imageUrl, setImageUrl] = useState<string | undefined>(story.imageUrl);
  useEffect(() => setImageUrl(story.imageUrl), [story.imageUrl]);
  // And every picture it has had. A redraw APPENDS -- nothing here throws a
  // picture away except the delete below, which asks first. Blake: "the
  // chances are that the old one may be better than the last with AI."
  const [gallery, setGallery] = useState<StoryPicture[]>(images ?? []);
  useEffect(() => setGallery(images ?? []), [images]);

  /**
   * Make a picture, or make a different one.
   *
   * ONE mutation for both, because they are one route and one spend. A redraw
   * replaces the file the story has -- the server deletes the old one only
   * after the new one is attached -- so it asks first.
   */
  const illustrate = useMutation({
    mutationFn: async (redraw: boolean = false) => {
      const response = await apiRequest("POST", `/api/stories/${storyId}/illustrate`, { redraw });
      return (await response.json()) as { imageUrl: string; images?: StoryPicture[] };
    },
    onSuccess: (data) => {
      setImageUrl(data.imageUrl);
      if (data.images) {
        setGallery(data.images);
        onPictures?.(data.images);
      }
      queryClient.invalidateQueries({ queryKey: [`/api/stories/${storyId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/stories"] });
      toast({ title: "Picture added", description: "It is saved with the story." });
    },
    onError: (error) => {
      toast({
        title: "Could not make a picture",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  /** Show a different one of the pictures this story already has. No spend. */
  const choosePicture = useMutation({
    mutationFn: async (imageId: string) => {
      const response = await apiRequest("PUT", `/api/stories/${storyId}/image/${imageId}`, {});
      return (await response.json()) as { imageUrl: string; images: StoryPicture[] };
    },
    onSuccess: (data) => {
      setImageUrl(data.imageUrl);
      setGallery(data.images);
      onPictures?.(data.images);
      queryClient.invalidateQueries({ queryKey: [`/api/stories/${storyId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/stories"] });
    },
    onError: (error) => {
      toast({
        title: "Could not change the picture",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  /** The only thing that removes a picture, and it is asked for twice. */
  const deletePicture = useMutation({
    mutationFn: async (imageId: string) => {
      const response = await apiRequest("DELETE", `/api/stories/${storyId}/image/${imageId}`, {});
      return (await response.json()) as { imageUrl: string | null; images: StoryPicture[] };
    },
    onSuccess: (data) => {
      setImageUrl(data.imageUrl ?? undefined);
      setGallery(data.images);
      onPictures?.(data.images);
      queryClient.invalidateQueries({ queryKey: [`/api/stories/${storyId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/stories"] });
      toast({ title: "Picture deleted" });
    },
    onError: (error) => {
      toast({
        title: "Could not delete the picture",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  /**
   * The five generic questions, and when NOT to show them.
   *
   * They are hard-required on the response -- min(5).max(5) -- so they cannot
   * be dropped, only left unrendered. And for a long story they are written by
   * a call that receives only the "image" projection of the brief, so it has no
   * idea what account the story was about: they are as generic as it gets.
   *
   * A story with a Digging deeper section has the reader's OWN questions in it,
   * answered from the real source material. Showing five invented ones
   * underneath would put a visibly worse version of the same idea directly
   * below a better one.
   */
  const answeredTheirOwn = (story.content ?? "").includes(DIGGING_DEEPER_HEADING);
  const questions = answeredTheirOwn ? [] : (story.applicationQuestions ?? []);
  const further = doc?.furtherLearning ?? [];

  return (
    <div
      ref={ref}
      className="reader-chrome mx-auto w-full max-w-3xl px-4 pb-16"
      style={{ color: "var(--reader-fg)" }}
    >
      {/* A picture made FOR this story is part of it, so it is shown rather
          than filed away: no accordion, nothing to expand. */}
      {imageUrl && (
        <figure className="my-8">
          <img
            src={imageUrl}
            alt={story.imagePrompt || `An illustration for ${story.title}`}
            className="mx-auto max-h-[70vh] w-auto rounded-lg"
            style={{ border: "1px solid var(--reader-border)" }}
          />
          {/*
            THE GALLERY. Every picture the story has had, oldest first, and
            nothing here throws one away by itself -- a redraw appends and the
            bin asks first. Hidden at one picture, because a strip of one is
            just the picture again.
          */}
          {gallery.length > 1 && storyId && (
            <figcaption className="mt-3 flex flex-wrap justify-center gap-2">
              {gallery.map((picture) => {
                const chosen = picture.url === imageUrl;
                return (
                  <span key={picture.id} className="relative">
                    <button
                      type="button"
                      onClick={() => !chosen && choosePicture.mutate(picture.id)}
                      disabled={chosen || choosePicture.isPending}
                      aria-label={chosen ? "The picture this story shows" : "Show this picture instead"}
                      aria-pressed={chosen}
                      className="block rounded-md"
                      style={{
                        // The chosen one is ringed rather than moved or
                        // resized: a strip that reflows when you pick is a
                        // strip you pick the wrong thing from.
                        outline: chosen ? "2px solid var(--reader-fg)" : "1px solid var(--reader-border)",
                        outlineOffset: chosen ? "2px" : "0",
                        opacity: chosen ? 1 : 0.75,
                      }}
                    >
                      <img
                        src={picture.url}
                        alt=""
                        loading="lazy"
                        className="h-16 w-16 rounded-md object-cover"
                      />
                    </button>
                    {!builtIn && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button
                            type="button"
                            aria-label="Delete this picture"
                            disabled={deletePicture.isPending}
                            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this picture?</AlertDialogTitle>
                            <AlertDialogDescription>
                              It is removed from &ldquo;{story.title}&rdquo; for good and cannot be
                              got back. The other {gallery.length - 1}{" "}
                              {gallery.length - 1 === 1 ? "picture stays" : "pictures stay"}, and
                              the story itself is not changed.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep it</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => deletePicture.mutate(picture.id)}
                            >
                              Delete it
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </span>
                );
              })}
            </figcaption>
          )}

          {/* Quiet, and under the picture: a redraw spends a generation, so it
              is not a thing to fall over. Shown on the same condition the
              server enforces. */}
          {modelInfo?.canIllustrate && !builtIn && storyId && (
            <figcaption className="mt-2 text-center">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    // Full is full: the server answers 409 rather than dropping
                    // the oldest, so the button says so before it is pressed.
                    disabled={illustrate.isPending || gallery.length >= MAX_STORY_IMAGES}
                    title={
                      gallery.length >= MAX_STORY_IMAGES
                        ? `This story keeps ${MAX_STORY_IMAGES} pictures. Delete one to draw another.`
                        : undefined
                    }
                    style={{ color: "var(--reader-muted)" }}
                  >
                    {illustrate.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Painting…
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Draw it again
                      </>
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Draw a new picture?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This makes another picture for &ldquo;{story.title}&rdquo;. The one
                      here now is kept — you can switch back to it, and it is deleted only
                      if you say so. A story keeps up to {MAX_STORY_IMAGES}. The story
                      itself is not changed.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep this one</AlertDialogCancel>
                    <AlertDialogAction onClick={() => illustrate.mutate(true)}>
                      Draw it again
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </figcaption>
          )}
        </figure>
      )}

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

        {/* A story with no picture keeps the stock lion tucked away in the
            accordion -- it is a placeholder, not part of the story, and it
            should not be the first thing you meet at the end of the text. */}
        {!imageUrl && (
          <AccordionItem value="picture" style={{ borderColor: "var(--reader-border)" }}>
            <AccordionTrigger className="text-base">Picture (stock)</AccordionTrigger>
            <AccordionContent>
              <img
                src={lionTailsImage}
                alt="The Lion Tails lion, shown when a story has no illustration of its own"
                className="mx-auto max-h-[50vh] w-auto rounded-lg"
                loading="lazy"
              />
              <p className="mt-3 text-center text-sm" style={{ color: "var(--reader-muted)" }}>
                This is the standard Lion Tails picture — this story does not have
                one of its own.
              </p>
              {modelInfo?.canIllustrate && !builtIn ? (
                <div className="mt-4 flex justify-center">
                  <Button
                    size="sm"
                    onClick={() => illustrate.mutate(false)}
                    disabled={illustrate.isPending || !storyId}
                  >
                    {illustrate.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Painting…
                      </>
                    ) : (
                      <>
                        <ImagePlus className="mr-2 h-4 w-4" />
                        Make a picture for this story
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <p className="mt-3 text-center text-sm" style={{ color: "var(--reader-muted)" }}>
                  Pictures are made individually when you add your own OpenAI key
                  in Settings.
                </p>
              )}
            </AccordionContent>
          </AccordionItem>
        )}

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

        {storyId && !builtIn && (
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

        {/* What a parent changed, beside what the app wrote -- so a story
            is never passed off as all the AI's, or all a person's. */}
        {saved?.editLog && saved.editLog.length > 0 && (
          <AccordionItem value="edits" style={{ borderColor: "var(--reader-border)" }}>
            <AccordionTrigger className="text-base">Changes to this story</AccordionTrigger>
            <AccordionContent>
              <p className="mb-2 text-sm" style={{ color: "var(--reader-muted)" }}>
                The app wrote this story; a parent has changed it since. What the app
                wrote is under &ldquo;How this story was made&rdquo;.
              </p>
              <ul className="ml-5 list-disc space-y-1 text-sm">
                {[...saved.editLog].reverse().map((e, i) => (
                  <li key={i}>
                    {new Date(e.at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
                    {" — "}
                    {e.changed.map((c) => (c === "content" ? "the text" : c === "title" ? "the title" : c)).join(" and ")}
                    {" edited by a parent"}
                  </li>
                ))}
              </ul>
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
