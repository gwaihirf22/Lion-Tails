import { useState } from "react";
import { Link, useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
import type { SavedStory } from "@shared/schema";
import { QUEST_SERIES_TITLE } from "@shared/quests";

/**
 * A story, wherever it is listed: My Stories, and a universe's own page.
 *
 * ONE card. Inside a universe a story used to be a bare title with a
 * "remove" link beside it -- hard to find, and the remove fired with no
 * confirmation. Now it is this card there too, and "remove from universe"
 * and "delete" are two different buttons behind two different dialogs whose
 * wording cannot be mistaken for each other: one keeps the story, the other
 * cannot be undone.
 *
 * THE DIALOGS ARE SIBLINGS OF THE CARD, NOT CHILDREN. The card navigates on
 * click, and React events follow the React tree, not the DOM -- a portalled
 * AlertDialog rendered inside <Card onClick> sends Cancel, Delete and the
 * overlay click up to the card, which opens the story. Characters.tsx keeps
 * its dialog beside its cards for the same reason. Every link inside the
 * card stops propagation for the same reason again.
 *
 * The thumbnail is shown only when the story has a picture of its own, on
 * the left and square, so a card with one and a card without are the same
 * height and share one grid.
 */
export default function StoryCard({
  story,
  universeName,
  onToggleFavorite,
  onDelete,
  onRemoveFromUniverse,
}: {
  story: SavedStory;
  /** The name of the universe it is in, for the chip. Absent means no chip. */
  universeName?: string;
  onToggleFavorite: (id: string, isFavorite: boolean) => void;
  onDelete: (id: string) => void;
  /** Only the universe page passes this; only there does the button exist. */
  onRemoveFromUniverse?: (id: string) => void;
}) {
  const [, navigate] = useLocation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const href = `/story?id=${story.id}`;
  const imageUrl = story.story.imageUrl;
  const details = story.request;
  const animal = details.animal?.trim().toLowerCase();

  const open = (e: React.MouseEvent) => {
    // Let a modifier-click do what the browser does with a link.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    navigate(href);
  };

  return (
    <>
      <Card
        className="bg-card overflow-hidden transition-all duration-200 hover:shadow-md cursor-pointer"
        onClick={open}
      >
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            {imageUrl && (
              <img
                src={imageUrl}
                alt=""
                loading="lazy"
                className="h-20 w-20 shrink-0 rounded-md object-cover"
              />
            )}

            <div className="min-w-0 flex-1">
              {story.builtIn && (
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {QUEST_SERIES_TITLE}
                </p>
              )}
              <h3 className="text-xl font-bold text-primary mb-1 line-clamp-1">
                <Link href={href} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                  {story.story.title}
                </Link>
              </h3>

              {story.builtIn ? (
                <p className="text-sm text-muted-foreground">
                  Where every library begins. It is always here.
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    Created {formatDistanceToNow(new Date(story.createdAt))} ago
                  </span>
                  {story.isFavorite ? (
                    <Badge variant="secondary" className="bg-warning-surface text-warning hover:bg-warning-surface">
                      Favorite
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      Kept for a year
                    </Badge>
                  )}
                  {universeName && story.universeId && (
                    <Badge variant="outline" className="bg-tab-appearance text-foreground">
                      <Link
                        href={`/universes/${story.universeId}`}
                        className="hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {universeName}
                      </Link>
                    </Badge>
                  )}
                </div>
              )}
            </div>

            {!story.builtIn && (
              <div className="flex shrink-0 gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className={story.isFavorite ? "text-warning hover:text-warning" : "text-muted-foreground hover:text-warning"}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite(story.id, !story.isFavorite);
                  }}
                  title={story.isFavorite ? "Remove from favorites" : "Add to favorites"}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill={story.isFavorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </Button>
                {onRemoveFromUniverse && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmRemove(true);
                    }}
                    title="Remove from this universe (the story is kept)"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    </svg>
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDelete(true);
                  }}
                  title="Delete story"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                </Button>
              </div>
            )}
          </div>

          {!story.builtIn && (
            <>
              <Separator className="my-3" />
              <div className="flex flex-col md:flex-row justify-between gap-3">
                <div className="flex-1">
                  <div className="text-sm text-muted-foreground mb-1">Story details:</div>
                  <div className="flex flex-wrap gap-2">
                    {details.childName && (
                      <Badge variant="outline" className="bg-primary/10">{details.childName}</Badge>
                    )}
                    {/* Guarded on purpose: a character may be a dragon, and
                        "Boy" on a dragon is the app confusing two facts. */}
                    {details.gender && (
                      <Badge variant="outline" className="bg-primary/10">
                        {details.gender === "boy" ? "Boy" : "Girl"}
                      </Badge>
                    )}
                    {animal && !["none", "n/a"].includes(animal) && (
                      <Badge variant="outline" className="bg-primary/10">{details.animal}</Badge>
                    )}
                    {details.theme && (
                      <Badge variant="outline" className="bg-primary/10">{details.theme}</Badge>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(href);
                  }}
                >
                  Read Story
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this story?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{story.story.title}&rdquo; will be deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => onDelete(story.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {onRemoveFromUniverse && (
        <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove from this universe?</AlertDialogTitle>
              <AlertDialogDescription>
                &ldquo;{story.story.title}&rdquo; is kept in your library; it just leaves this
                universe, and later stories here will no longer be written against it.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Leave it here</AlertDialogCancel>
              <AlertDialogAction onClick={() => onRemoveFromUniverse(story.id)}>
                Remove from universe
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
