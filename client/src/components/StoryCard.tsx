import { useState } from "react";
import { Link, useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShareStoryDialog } from "@/components/ShareStoryDialog";
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
  chips = [],
}: {
  story: SavedStory;
  /** The name of the universe it is in, for the chip. Absent means no chip. */
  universeName?: string;
  onToggleFavorite: (id: string, isFavorite: boolean) => void;
  onDelete: (id: string) => void;
  /** Only the universe page passes this; only there does the button exist. */
  onRemoveFromUniverse?: (id: string) => void;
  /** What to say about the story -- storyChips(), computed by the page. */
  chips?: string[];
}) {
  const [, navigate] = useLocation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const href = `/story?id=${story.id}`;
  const imageUrl = story.story.imageUrl;

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
          {/* WRAPS. Thumbnail + title + icons do not share a 390px line: with
              three icons the title column fell to 82px, a few characters of a
              text-xl title. The text column may not shrink below 11rem, so on
              a phone the icons drop to their own row instead and the title
              keeps its width. Unchanged from sm up, where it all fits. */}
          <div className="flex flex-wrap items-start gap-4">
            {imageUrl && (
              <img
                src={imageUrl}
                alt=""
                loading="lazy"
                className="h-16 w-24 shrink-0 rounded-md object-cover sm:h-20 sm:w-[7.5rem]"
              />
            )}

            <div className="min-w-0 flex-[1_1_11rem]">
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

            {/* h-8 w-8 p-0 on every icon here: the stock small button carries
                12px of side padding it does not need for a lone icon, and with
                three of them a 390px card's title column fell from 102px to
                58px -- titles that fitted before were clipped. */}
            {!story.builtIn && (
              <div className="ml-auto flex shrink-0 gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className={`h-8 w-8 p-0 ${story.isFavorite ? "text-warning hover:text-warning" : "text-muted-foreground hover:text-warning"}`}
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
                {/* Lucide, not an inline svg like this row's other icons: it is
                    the same action as the reader's Share button and should be
                    the same glyph. stopPropagation, or the card opens the story
                    underneath the tap. */}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 text-muted-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShareOpen(true);
                  }}
                  title="Share this story"
                >
                  <Share2 className="h-[18px] w-[18px]" aria-hidden="true" />
                </Button>
                {onRemoveFromUniverse && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-muted-foreground"
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
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
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
                {/* From what the story actually has (storyChips). The old row
                    read childName/gender/animal/theme, which a modern request
                    does not carry, and printed a label over nothing. */}
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  {chips.map((c) => (
                    <Badge key={c} variant="outline" className="bg-primary/10">
                      {c}
                    </Badge>
                  ))}
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

      {/* OUTSIDE the card, like the two dialogs below and for the same reason:
          the card navigates on click, and React events follow the React tree,
          so every button and the overlay inside a dialog nested in <Card
          onClick> would open the story. */}
      {!story.builtIn && (
        <ShareStoryDialog
          storyId={story.id}
          title={story.story.title}
          open={shareOpen}
          onOpenChange={setShareOpen}
        />
      )}

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
