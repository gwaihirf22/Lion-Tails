import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { MAX_PICTURE_NOTE_CHARS } from "@shared/pictureNote";
import { MAX_STORY_IMAGES, priceLabel, type PriceList } from "@shared/schema";

/**
 * Ask before drawing: what it costs, and anything that must be in it.
 *
 * ASK BEFORE SPENDING -- the rule the avatar dialog already states
 * (CharacterForm.tsx). A picture is minutes of waiting and real money, and
 * until now the reader's "Draw this" spent both on one tap with nothing said.
 * Blake: *"it should pop up a dialogue box with information on pricing and ask
 * them if there are any additional or imperatives that should be included in
 * the picture."*
 *
 * A Dialog rather than an AlertDialog because it holds a text field, which is
 * the rule every text input in this app already follows.
 *
 * NO autoFocus ON THE FIELD, deliberately unlike the avatar dialog: the first
 * job of this box is to say what a picture costs, and on a phone an instant
 * keyboard covers the price line and both buttons.
 *
 * IT OWNS THE PRICE QUERY, so both call sites -- the passage picture and the
 * redraw -- get the number with no prop drilling, and there is one consumer of
 * /api/pricing.
 */
export default function PictureDialog({
  open,
  onOpenChange,
  mode,
  quote,
  storyTitle,
  galleryCount,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Which of the three spends this is: a picture for a highlighted moment, a
   * story's first picture, or another one to choose between. All three are the
   * same route and the same money, so all three ask.
   */
  mode: "passage" | "first" | "redraw";
  /** What was highlighted. Shown so the reader can see what will be drawn. */
  quote?: string;
  storyTitle: string;
  /** How many pictures the story already has, against MAX_STORY_IMAGES. */
  galleryCount: number;
  pending: boolean;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  const card = useRef<HTMLDivElement | null>(null);

  // A note belongs to ONE picture. Cleared when the box opens, so the last
  // one's instruction cannot ride along with the next, unasked.
  useEffect(() => {
    if (open) setNote("");
  }, [open]);

  /**
   * What a picture costs, from the published price list.
   *
   * Null until prices are approved and published on /admin/costs, and then
   * this reads a real number with no change here. The sentence never invents
   * one: with no price it says what is true in words instead.
   */
  const { data: pricing } = useQuery<PriceList>({
    queryKey: ["/api/pricing"],
    enabled: open,
    staleTime: 10 * 60 * 1000,
  });
  const cents = pricing?.pictureCents ?? null;

  const passage = mode === "passage";
  const title =
    mode === "passage"
      ? "Draw a picture of this moment?"
      : mode === "first"
        ? "Make a picture for this story?"
        : "Draw a new picture?";
  const confirmLabel = mode === "passage" ? "Draw this" : mode === "first" ? "Make it" : "Draw it again";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={card}
        className="sm:max-w-md"
        data-guide="picture-dialog"
        // RADIX FOCUSES THE FIRST TABBABLE THING, which here is the note
        // field -- and on a phone that opens the keyboard over the price line
        // and both buttons the moment the box appears. The card itself takes
        // focus instead (Radix gives it tabIndex -1), so it still reads from
        // the top, Tab still reaches the field, and Escape still closes it.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          card.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {mode === "passage" ? (
              <>
                The picture goes into the story beside the part you chose, and the text wraps
                around it.
              </>
            ) : mode === "first" ? (
              <>
                This draws the picture that goes at the end of &ldquo;{storyTitle}&rdquo;. The
                story itself is not changed.
              </>
            ) : (
              <>
                This makes another picture for &ldquo;{storyTitle}&rdquo;. The one there now is
                kept — you can switch back to it, and it is deleted only if you say so. The story
                itself is not changed.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {passage && quote && (
          <p className="m-0 max-h-24 overflow-y-auto rounded-md border border-border bg-muted/40 p-2 text-sm italic">
            &ldquo;{quote}&rdquo;
          </p>
        )}

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="picture-note">
            Anything that must be in the picture?
          </label>
          <Textarea
            id="picture-note"
            data-guide="picture-note"
            rows={3}
            maxLength={MAX_PICTURE_NOTE_CHARS}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={passage ? "e.g. show it raining hard" : "e.g. the same scene, but at night"}
          />
          <p className="m-0 text-xs text-muted-foreground">
            Optional. The picture is drawn from the story, so it already knows who is in this
            part and where it happens. This is for what it would not think of.
          </p>
        </div>

        {/* What it costs, and what it uses up. Not a footnote: it is the
            reason this box exists. */}
        <p className="m-0 text-xs text-muted-foreground" data-guide="picture-cost">
          {cents === null
            ? "Pictures cost real money to make and take a few minutes."
            : `Pictures cost about ${priceLabel(cents)} to make and take a few minutes.`}{" "}
          This story has {galleryCount} of {MAX_STORY_IMAGES} pictures.
        </p>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={() => onConfirm(note.trim())} disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Painting…
              </>
            ) : (
              <>
                <ImagePlus className="mr-2 h-4 w-4" aria-hidden="true" />
                {confirmLabel}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
