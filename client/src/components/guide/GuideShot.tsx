import { GUIDE_BOXES, GUIDE_PLATE_IMAGES } from "@shared/guideShots";
import type { GuideNodeSpec } from "@shared/guide";

/**
 * A screenshot with one control ringed, and the rest of it dimmed.
 *
 * THE RING IS DRAWN HERE, not painted into the file. The capture script
 * recorded the control's box as FRACTIONS of the picture, so the same
 * screenshot rings correctly at 340px on a phone and 600px in the dialog, and
 * the ring is a theme colour rather than a red that only suits one palette.
 * Re-recording is a script run; a baked-in box would be a redraw.
 *
 * The red Blake asked for is `--destructive`, the theme's own red, so it
 * passes the hardcoded-colour gate and stays visible in every palette.
 *
 * The dim is ONE inline box-shadow spreading out from the ring
 * (`0 0 0 9999px`), clipped by the figure's `overflow-hidden`, so the ringed
 * control is the only part of the picture at full brightness. Inline rather
 * than an arbitrary Tailwind class holding a slash and brackets, which is
 * exactly the interpolation this repo has been bitten by.
 *
 * `width`/`height` come from the manifest so the box reserves its aspect ratio
 * before the image loads -- otherwise opening a node jumps the dialog's scroll.
 */
export default function GuideShot({ node }: { node: GuideNodeSpec }) {
  if (!node.shot) return null;
  const image = GUIDE_PLATE_IMAGES[node.shot.plate];
  const box = GUIDE_BOXES[node.id as keyof typeof GUIDE_BOXES] as
    | { x: number; y: number; w: number; h: number }
    | undefined;
  if (!image) return null;
  /**
   * A ring around the WHOLE picture is not a ring.
   *
   * Some nodes are about a container the plate already frames -- the reader's
   * bar, the row of actions -- so their box is the entire plate. Outlining
   * that draws a red line the figure's own `overflow-hidden` clips, and dims
   * nothing at all. The picture is the subject; show it plainly.
   */
  const ringsEverything = Boolean(box && box.w > 0.98 && box.h > 0.98);

  return (
    <figure className="relative m-0 overflow-hidden rounded-lg border border-border bg-muted">
      <img
        src={image.file}
        width={image.width}
        height={image.height}
        loading="lazy"
        decoding="async"
        alt={`${node.title}, on a phone`}
        className="block h-auto w-full max-w-full"
      />
      {box && !ringsEverything && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute rounded-md"
          style={{
            left: `${box.x * 100}%`,
            top: `${box.y * 100}%`,
            width: `${box.w * 100}%`,
            height: `${box.h * 100}%`,
            // A SCRIM, not a tint of the theme. `--background` at 55% was a
            // pale wash over a pale screenshot: measured in a browser, the
            // whole picture looked faded and the ring did not stand out at
            // all. Black at 45% is the same scrim the app already uses behind
            // its own dialogs, and it makes the ringed control the only
            // bright thing in the frame in every palette.
            // AN OUTLINE, NOT A RING. Tailwind's `ring-*` IS a box-shadow, so
            // the scrim below overwrote it and the picture came back dimmed
            // with no red anywhere (measured in a browser). An outline is a
            // separate property and survives.
            outline: "3px solid hsl(var(--destructive))",
            boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.45)",
          }}
        />
      )}
    </figure>
  );
}
