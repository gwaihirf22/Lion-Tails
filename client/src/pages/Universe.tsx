import { useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { useParentMode } from "@/hooks/use-parent-mode";
import { useChipSources } from "@/lib/useChipSources";
import { storyChips } from "@/lib/storyChips";
import { EDITED_BY_PARENT, lastEditedAt } from "@shared/editLog";
import StoryCard from "@/components/StoryCard";
import UniverseDetails, { Section } from "@/components/UniverseDetails";

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
  const { isActive: parentMode } = useParentMode();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const {
    universes,
    isLoading: universesLoading,
    makeSummary,
    editSummary,
    addCanon,
    removeCanon,
    remove,
    rename,
    moveStory,
  } = useUniverses();
  const { stories, isLoading: storiesLoading, toggleFavorite, deleteStory } = useStories();
  const { jobs } = useStoryJobs();
  const chipSources = useChipSources();

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

  const saveName = async () => {
    if (!universe) return;
    const r = await rename(universe.universeId, nameDraft);
    if (!r.ok) {
      toast({
        title: r.code === "parent_mode_required" ? "Parent Mode needed" : "Could not rename",
        description: r.message,
        variant: "destructive",
      });
      return;
    }
    setRenaming(false);
    toast({ title: "Universe renamed" });
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

  const editedAt = lastEditedAt(universe.editLog);
  const addHere = () => navigate(`/generate-story?universe=${universe.universeId}`);

  return (
    <div className="max-w-4xl mx-auto">
      <p className="mb-2 text-sm">
        <Link href="/saved-stories" className="text-muted-foreground hover:underline">
          ← My Stories
        </Link>
      </p>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                aria-label="Universe name"
                className="max-w-md text-lg font-semibold"
                autoFocus
              />
              <Button size="sm" onClick={saveName} disabled={!nameDraft.trim()}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRenaming(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <h2 className="flex items-center gap-2 text-3xl font-heading font-bold text-secondary">
              <span className="min-w-0">{universe.name}</span>
              {/* Parent Mode on the server too; this only hides the pencil. */}
              {parentMode && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2"
                  aria-label="Rename universe"
                  onClick={() => {
                    setNameDraft(universe.name);
                    setRenaming(true);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
            </h2>
          )}
          <p className="text-sm text-muted-foreground">
            {inThis.length} {inThis.length === 1 ? "story" : "stories"}
            {editedAt && (
              <>
                {" · "}
                {EDITED_BY_PARENT} ·{" "}
                {new Date(editedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
              </>
            )}
            {busy && (
              <Badge variant="outline" className="ml-2 gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> summarising
              </Badge>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button onClick={addHere}>Add to this Universe</Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            Delete universe
          </Button>
        </div>
      </div>

      <UniverseDetails
        universe={universe}
        busy={busy}
        onMakeSummary={handleMakeSummary}
        onEditSummary={(text) => editSummary(universe.universeId, text)}
        onAddCanon={(text) => addCanon(universe.universeId, text)}
        onRemoveCanon={(canonId) => removeCanon(universe.universeId, canonId)}
      />

      {universe.editLog.length > 0 && (
        <div className="mt-3">
          <Section title="Changes by a parent" hint={`${universe.editLog.length}`}>
            <ul className="ml-5 list-disc space-y-1 text-sm">
              {[...universe.editLog].reverse().map((e, i) => (
                <li key={i}>
                  {new Date(e.at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
                  {" — "}
                  {e.changed.map((c) => (c === "name" ? "the name" : c === "summary" ? "the summary" : c)).join(" and ")}
                  {" edited by a parent"}
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}

      <h3 className="mt-8 mb-3 text-lg font-heading font-bold text-secondary">
        Stories in this universe
      </h3>
      <div className="grid gap-4">
        {inThis.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-muted-foreground mb-4">
              No stories here yet.
            </p>
            <Button onClick={addHere}>Add to this Universe</Button>
          </Card>
        ) : (
          inThis.map((story) => (
            <StoryCard
              key={story.id}
              story={story}
              chips={storyChips(story, chipSources)}
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
