import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { StoryPicture } from "@shared/schema";
import { withoutPictureRefs } from "@shared/family";

/**
 * A picture, as big as the screen allows -- and bigger, on a tap.
 *
 * NO .reader-chrome ON ANY OF THIS. That class is what focus mode fades to
 * `opacity: 0; pointer-events: none`, and a viewer that disappears while
 * armed -- taking its close button with it -- is the one state this must not
 * have. It is a portalled dialog, so it is not inside the reader anyway; the
 * rule is written down because the next person to style it will be looking at
 * a file where everything else carries that class.
 *
 * FULL SCREEN, AND ACTUAL SIZE ON A TAP. A cover is six panels in one frame,
 * and fitted to a phone each panel is a thumbnail. Blake: "I need a way to zoom
 * in/make the montage picture bigger or full web page screen to view it
 * better." A tap toggles between fitted and the file's own pixels; at actual
 * size the picture scrolls inside the screen, and a phone's pinch still works
 * on top of either (`touch-action` allows it). The close button sits outside
 * the scrolling box, so it is on screen however far you have scrolled.
 *
 * `dvh`, not `vh`: on iOS `vh` is the LARGE viewport and ignores Safari's
 * chrome, so the bottom of a 90vh box sits underneath it. The character sheet
 * learned this the same way.
 *
 * The prompt is the caption AND the alt text. It is the one description of
 * the picture that exists, it was written to be read by an illustrator, and
 * it reads perfectly well to a person. It is hidden while zoomed, where it
 * would cover the part of the picture you zoomed in to see.
 */
export function PictureLightbox({
  picture,
  onClose,
}: {
  picture: StoryPicture | null;
  onClose: () => void;
}) {
  const [actualSize, setActualSize] = useState(false);
  // Every picture opens fitted, whatever the last one was left at.
  useEffect(() => setActualSize(false), [picture?.url]);
  const caption = withoutPictureRefs(picture?.prompt);

  return (
    <Dialog open={Boolean(picture)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={
          "left-0 top-0 flex h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 " +
          "border-0 bg-transparent p-0 shadow-none sm:rounded-none sm:p-0 " +
          "data-[state=closed]:slide-out-to-left-0 data-[state=closed]:slide-out-to-top-0 " +
          "data-[state=open]:slide-in-from-left-0 data-[state=open]:slide-in-from-top-0 " +
          // The stock close button, made findable on a dark scrim and kept
          // above the picture.
          "[&>button]:z-10 [&>button]:rounded-full [&>button]:bg-background/90 [&>button]:p-2 " +
          "[&>button]:text-foreground [&>button]:opacity-100 [&>button]:shadow"
        }
      >
        {/* Required by Radix for an accessible dialog, and there is nothing
            here a sighted reader needs a heading for -- the picture is the
            content. */}
        <DialogTitle className="sr-only">Picture from this story</DialogTitle>
        <DialogDescription className="sr-only">{caption || "A picture from this story."}</DialogDescription>
        {picture && (
          <>
            <div
              className={
                actualSize
                  ? "min-h-0 flex-1 overflow-auto"
                  : "flex min-h-0 flex-1 items-center justify-center p-2 sm:p-6"
              }
              style={{ touchAction: "pan-x pan-y pinch-zoom" }}
            >
              <button
                type="button"
                onClick={() => setActualSize((on) => !on)}
                aria-label={actualSize ? "Fit the picture to the screen" : "See the picture at full size"}
                aria-pressed={actualSize}
                className={actualSize ? "block cursor-zoom-out" : "block max-h-full max-w-full cursor-zoom-in"}
              >
                <img
                  src={picture.url}
                  alt={caption || "A picture from this story."}
                  className={
                    actualSize
                      ? "block h-auto w-auto max-w-none"
                      : "mx-auto block max-h-[calc(100dvh-7rem)] w-auto max-w-full rounded-lg"
                  }
                />
              </button>
            </div>
            {/* No caption when there is no prompt: a shared story's pictures are
                sent without theirs (shared/sharedStory.ts says why), and an
                empty caption is a small blank box under the picture. */}
            {caption && !actualSize && (
              <p className="mx-auto mb-3 max-h-[5rem] max-w-2xl overflow-y-auto rounded-md bg-background/90 px-3 py-2 text-center text-xs text-muted-foreground">
                {caption}
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default PictureLightbox;
