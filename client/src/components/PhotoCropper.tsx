import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  DEFAULT_VIEW,
  MAX_ZOOM,
  minZoomFor,
  panView,
  zoomView,
  type CropView,
} from "@/lib/imageCrop";
import { edgeColour, imageSize, renderCrop, type DecodedImage } from "@/lib/imageFile";

/**
 * Frame a photo as a square portrait before it is uploaded.
 *
 * Blake: "needs a crop or zoom out option so that the file can fit where it
 * needs to in the window." Every portrait is shown square, so this is where
 * somebody decides WHICH square: drag to move, pinch or the slider to zoom,
 * and two buttons for the two framings people actually want -- the whole photo,
 * or the square filled.
 *
 * THE PREVIEW IS THE FILE. It is drawn by `renderCrop`, which is what
 * `croppedPng` draws the 1024px upload with, and both place the photo with
 * imageCrop's `placement()`. There is no CSS transform standing in for the
 * real crop, so there is nothing that can drift from it.
 *
 * Reports the framing, not a file. The caller already owns the upload's busy
 * state and its error toasts; encoding a png here would mean a second copy of
 * both, and a failure here reported differently from one there.
 */
export function PhotoCropper({
  image,
  title,
  description,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  image: DecodedImage | null;
  title: string;
  description: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: (view: CropView, fill: string) => void;
}) {
  const { width, height } = image ? imageSize(image) : { width: 1, height: 1 };
  const minZoom = minZoomFor(width, height);
  const [view, setView] = useState<CropView>(DEFAULT_VIEW);

  // A new photo starts centred and filling the square: what the display showed
  // before there was a cropper, so "Use this" without touching anything gives
  // exactly the old result.
  useEffect(() => setView(DEFAULT_VIEW), [image]);

  const fill = useMemo(() => (image ? edgeColour(image) : ""), [image]);

  /**
   * The square's size on screen, measured, because it is fluid -- as wide as
   * the dialog allows, up to a cap -- and a drag has to be converted from
   * screen pixels to fractions of THAT width.
   *
   * CALLBACK REFS, held in state, not useRef. The dialog renders through a
   * portal, and an effect reading `ref.current` can run before the portalled
   * node exists -- the preview would then never be measured and stay blank,
   * with no error. State set by the ref callback re-runs the effects when the
   * element actually arrives.
   */
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [cssSize, setCssSize] = useState(0);
  useEffect(() => {
    if (!box) return;
    const measure = () => setCssSize(box.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [box]);

  // Redraw. Backed at the device's pixel ratio so a phone's preview is sharp
  // rather than a quarter-resolution blur of the file it stands for.
  useEffect(() => {
    if (!canvas || !image || !cssSize) return;
    const px = Math.round(cssSize * (window.devicePixelRatio || 1));
    if (canvas.width !== px) {
      canvas.width = px;
      canvas.height = px;
    }
    const ctx = canvas.getContext("2d");
    if (ctx) renderCrop(ctx, image, px, view, fill);
  }, [canvas, image, view, cssSize, fill]);

  /**
   * Drag with one finger or the mouse; pinch with two.
   *
   * Pointer events rather than touch AND mouse handlers, so there is one path.
   * Every update goes through setView(v => ...) because moves arrive faster
   * than renders, and a handler reading `view` from its closure would apply
   * each drag to a view several moves out of date.
   */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const map = pointers.current;
    const prev = map.get(e.pointerId);
    if (!prev || !cssSize) return;
    const next = { x: e.clientX, y: e.clientY };

    if (map.size === 1) {
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      setView((v) => panView(width, height, v, dx, dy, cssSize));
    } else if (map.size === 2) {
      // The distance between the two fingers, before and after THIS finger
      // moved. Their ratio is the zoom; the other finger is where it was.
      const other = [...map.entries()].find(([id]) => id !== e.pointerId)?.[1];
      if (other) {
        const before = Math.hypot(prev.x - other.x, prev.y - other.y);
        const after = Math.hypot(next.x - other.x, next.y - other.y);
        if (before > 0) setView((v) => zoomView(width, height, v, v.zoom * (after / before)));
      }
    }
    map.set(e.pointerId, next);
  };
  const onPointerEnd = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId);
  };

  /**
   * The mouse wheel zooms, on a desktop.
   *
   * Attached by hand because React's onWheel is passive: preventDefault is
   * ignored there, and the page behind the dialog would scroll every time
   * someone zoomed.
   */
  useEffect(() => {
    if (!canvas || !image) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.0015);
      setView((v) => zoomView(width, height, v, v.zoom * factor));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [canvas, image, width, height]);

  // Arrow keys move and +/- zoom, so the frame can be set without a pointer.
  const onKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    const step = e.shiftKey ? 40 : 10;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
    };
    if (moves[e.key]) {
      e.preventDefault();
      const [dx, dy] = moves[e.key];
      setView((v) => panView(width, height, v, dx, dy, cssSize || 1));
    } else if (e.key === "+" || e.key === "=" || e.key === "-") {
      e.preventDefault();
      const factor = e.key === "-" ? 1 / 1.1 : 1.1;
      setView((v) => zoomView(width, height, v, v.zoom * factor));
    }
  };

  /**
   * The slider is LOGARITHMIC in zoom.
   *
   * Linear, a 3:4 photo's whole zoom-out range -- 0.75 to 1, the part Blake
   * asked for -- would be the first 8% of the track, under one thumb-width.
   * On a log scale it is 17%, and equal slider distances feel like equal
   * changes in size, which is how zoom is perceived.
   */
  const logMin = Math.log(minZoom);
  const logMax = Math.log(MAX_ZOOM);
  const canZoomOut = minZoom < 0.999;

  return (
    <Dialog open={Boolean(image)} onOpenChange={(open) => !open && onCancel()}>
      {/*
        Anchored near the top rather than centred, like the other dialogs
        that sit over the character sheet: this one opens ON TOP of that
        sheet, and a centred dialog on a phone puts the buttons under the
        thumb that is trying to drag the photo.
      */}
      <DialogContent className="top-[4vh] max-w-md translate-y-0">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div ref={setBox} className="mx-auto aspect-square w-full max-w-[20rem]">
          <canvas
            ref={setCanvas}
            tabIndex={0}
            role="img"
            aria-label="The photo, framed as it will be saved. Drag to move it, use the slider or pinch to zoom."
            className="h-full w-full cursor-grab touch-none rounded-lg border border-border active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onLostPointerCapture={onPointerEnd}
            onKeyDown={onKeyDown}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Minimize2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <Slider
              aria-label="Zoom"
              min={logMin}
              max={logMax}
              step={0.005}
              value={[Math.log(view.zoom)]}
              onValueChange={([s]) => setView((v) => zoomView(width, height, v, Math.exp(s)))}
            />
            <Maximize2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          </div>

          <div className="flex flex-wrap gap-2">
            {/*
              The two framings people actually want, one tap each. "Whole
              photo" is Blake's zoom-out and is only offered when there is
              something to zoom out to -- a square photo already fits.
            */}
            {canZoomOut && (
              <Button type="button" variant="outline" size="sm"
                      onClick={() => setView(zoomView(width, height, { zoom: minZoom, x: 0, y: 0 }, minZoom))}>
                Whole photo
              </Button>
            )}
            <Button type="button" variant="outline" size="sm"
                    onClick={() => setView(DEFAULT_VIEW)}>
              Fill the square
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Drag to move it. Pinch or use the slider to zoom.
            {canZoomOut && " Zoomed out, the space around it is filled to match the edges of the photo."}
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={() => onConfirm(view, fill)}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PhotoCropper;
