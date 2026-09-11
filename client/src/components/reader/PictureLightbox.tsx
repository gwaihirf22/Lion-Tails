import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { StoryPicture } from "@shared/schema";

/**
 * A picture, as big as the screen allows.
 *
 * NO .reader-chrome ON ANY OF THIS. That class is what focus mode fades to
 * `opacity: 0; pointer-events: none`, and a viewer that disappears while
 * armed -- taking its close button with it -- is the one state this must not
 * have. It is a portalled dialog, so it is not inside the reader anyway; the
 * rule is written down because the next person to style it will be looking at
 * a file where everything else carries that class.
 *
 * `dvh`, not `vh`: on iOS `vh` is the LARGE viewport and ignores Safari's
 * chrome, so the bottom of a 90vh box sits underneath it. The character sheet
 * learned this the same way.
 *
 * The prompt is the caption AND the alt text. It is the one description of
 * the picture that exists, it was written to be read by an illustrator, and
 * it reads perfectly well to a person.
 */
export function PictureLightbox({
  picture,
  onClose,
}: {
  picture: StoryPicture | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(picture)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl border-0 bg-transparent p-0 shadow-none sm:p-0">
        {/* Required by Radix for an accessible dialog, and there is nothing
            here a sighted reader needs a heading for -- the picture is the
            content. */}
        <DialogTitle className="sr-only">Picture from this story</DialogTitle>
        <DialogDescription className="sr-only">
          {picture?.prompt ?? "A picture from this story."}
        </DialogDescription>
        {picture && (
          <figure className="m-0">
            <img
              src={picture.url}
              alt={picture.prompt}
              className="mx-auto max-h-[85dvh] w-auto max-w-full rounded-lg"
            />
            <figcaption className="mx-auto mt-3 max-w-2xl rounded-md bg-background/90 px-3 py-2 text-center text-xs text-muted-foreground">
              {picture.prompt}
            </figcaption>
          </figure>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default PictureLightbox;
