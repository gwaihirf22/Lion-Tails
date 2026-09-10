import { useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useStoryJobs } from "@/hooks/use-story-jobs";
import { useUniverses } from "@/hooks/use-universes";
import { useStories } from "@/hooks/use-stories";
import StoryCard from "@/components/StoryCard";
import UniverseDetails from "@/components/UniverseDetails";

/**
 * A universe's own page.
 *
 * Everything the old inline card showed, behind sections that open when
 * asked, and its stories as the same card they are everywhere else -- with
 * "remove from this universe" and "delete" as two different buttons behind
 * two different dialogs.
 *
 * The universe comes from the list query: there is no GET /api/universes/:id
 * and the list already carries everything this page shows. The story count
 * is derived from the stories the library can see, never universe.storyCount
 * (the server counts expired rows the library hides).
 *
 * Named UniversePage: the file imports the Universe TYPE.
 */
export default function UniversePage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const {
    universes,
    isLoading: universesLoading,
    makeSummary,
    editSummary,
    addCanon,
    removeCanon,
    remove,
    moveStory,
  } = useUniverses();
  const { stories, isLoading: storiesLoading, toggleFavorite, deleteStory } = useStories();
  const { jobs } = useStoryJobs();

  const universe = universes.find((u) => u.universeId === id);
  const inThis = stories.filter((s) => s.universeId === id);

  // A running summary job for this universe, so the page can say so from
  // the same fact the server used.
  const busy = jobs.some(
    (j) =>
      j.kind === "summary" &&
      j.universe_id === id &&
      (j.status === "queued" || j.status === "running"),
  );

  const handleMakeSummary = async (force = false) => {
    if (!universe) return;
    const r = await makeSummary(universe.universeId, force);
    if (!r.ok) {
      toast({
        title: r.code === "parent_mode_required" ? "Parent Mode needed" : "Could not start",
        description: r.message,
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Writing the summary",
      description:
        r.droppedCount > 0
          ? `Reading the ${r.coveredCount} most recent stories in full; ${r.droppedCount} earlier ones are covered by the previous summary.`
          : `Reading ${r.coveredCount} ${r.coveredCount === 1 ? "story" : "stories"}.`,
    });
  };

  if (universesLoading || storiesLoading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!universe) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card className="bg-card rounded-2xl">
          <CardContent className="p-8 text-center">
            <h2 className="text-2xl font-medium text-foreground mb-2">No such universe</h2>
            <p className="text-muted-foreground mb-6">
              It may have been deleted. Its stories, if it had any, are still in your library.
            </p>
            <Button onClick={() => navigate("/saved-stories")}>Back to My Stories</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <p className="mb-2 text-sm">
        <Link href="/saved-stories" className="text-muted-foreground hover:underline">
          ← My Stories
        </Link>
      </p>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-heading font-bold text-secondary">{universe.name}</h2>
          <p className="text-sm text-muted-foreground">
            {inThis.length} {inThis.length === 1 ? "story" : "stories"}
            {busy && (
              <Badge variant="outline" className="ml-2 gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> summarising
              </Badge>
            )}
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive"
          onClick={() => setConfirmDelete(true)}
        >
          Delete universe
        </Button>
      </div>

      <UniverseDetails
        universe={universe}
        busy={busy}
        onMakeSummary={handleMakeSummary}
        onEditSummary={(text) => editSummary(universe.universeId, text)}
        onAddCanon={(text) => addCanon(universe.universeId, text)}
        onRemoveCanon={(canonId) => removeCanon(universe.universeId, canonId)}
      />

      <h3 className="mt-8 mb-3 text-lg font-heading font-bold text-secondary">
        Stories in this universe
      </h3>
      <div className="grid gap-4">
        {inThis.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-muted-foreground">
              No stories here yet. Continue a story to write the next one in this world.
            </p>
          </Card>
        ) : (
          inThis.map((story) => (
            <StoryCard
              key={story.id}
              story={story}
              onToggleFavorite={(sid, isFavorite) => toggleFavorite.mutate({ id: sid, isFavorite })}
              onDelete={(sid) => deleteStory.mutate(sid)}
              onRemoveFromUniverse={(sid) => moveStory(sid, null)}
            />
          ))
        )}
      </div>

      {/* Beside the page, never inside a clickable card. */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this universe?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{universe.name}&rdquo; and what it remembers will be deleted. Its{" "}
              {inThis.length} {inThis.length === 1 ? "story is" : "stories are"} kept — they
              go back to your library on their own.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                // Navigate AFTER the delete resolves, or the page flashes
                // "No such universe" while the list refetches.
                await remove(universe.universeId);
                navigate("/saved-stories");
              }}
            >
              Delete universe
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
