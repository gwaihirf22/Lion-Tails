/**
 * Where a photograph sits inside a square portrait.
 *
 * Blake: "the upload your own photo feature needs a crop or zoom out option so
 * that the file can fit where it needs to in the window." Every portrait in the
 * app is a SQUARE shown `object-cover` (CharacterAvatar, the gallery tiles), so
 * a tall photo used to lose its top and bottom and a wide one its sides -- cut
 * by the display, with no say over which part. This is the say.
 *
 * PURE, and separate from imageFile.ts, for one reason: the preview in the
 * cropper and the file that gets saved are drawn by the same `placement()`.
 * If they were computed twice, what you framed and what you got could differ
 * by exactly the amount nobody would notice until a face came back with its
 * chin cut off. Pure also means it is tested without a browser.
 *
 * UNITS. The view is stored in units of the square's own side, not pixels, so
 * the same view renders identically into a 300px preview and a 1024px file:
 *
 *   zoom -- 1 fills the square exactly (the old `object-cover` framing, and the
 *           default, so doing nothing changes nothing). Below 1 zooms OUT until
 *           the whole photo fits; the gap is filled. Above 1 zooms in.
 *   x, y -- how far the photo's centre sits from the square's centre, as a
 *           fraction of the square's side. 0,0 is centred.
 */

export type CropView = { zoom: number; x: number; y: number };

/** How far in. Four times "fills the square" is a face in a crowd; enough. */
export const MAX_ZOOM = 4;

/** Centred, filling the square: what the display did before there was a choice. */
export const DEFAULT_VIEW: CropView = { zoom: 1, x: 0, y: 0 };

/**
 * The zoom at which the WHOLE photo fits the square, for Blake's "zoom out".
 *
 * A square photo is already both, so this is 1 and there is nothing to zoom
 * out to. A 3:4 portrait fits at 0.75.
 */
export function minZoomFor(width: number, height: number): number {
  if (!(width > 0 && height > 0)) return 1;
  return Math.min(width, height) / Math.max(width, height);
}

/** The photo's drawn size, in units of the square's side. */
function drawnSize(width: number, height: number, zoom: number) {
  // At zoom 1 the SHORT side exactly spans the square -- that is "cover".
  const short = Math.min(width, height);
  return { w: (width / short) * zoom, h: (height / short) * zoom };
}

/**
 * Keep a view legal: zoom in range, and no photo dragged off the square.
 *
 * One rule for both cases, which is why it is `abs`. When the photo is BIGGER
 * than the square along an axis, its edge may not come inside the square --
 * no gap appears where there was picture to show. When it is SMALLER (zoomed
 * out), it may not leave the square -- it can slide within the frame but never
 * be pushed half out of it. Either way the slack is |drawn - 1| / 2.
 */
export function clampView(width: number, height: number, view: CropView): CropView {
  const zoom = Math.min(MAX_ZOOM, Math.max(minZoomFor(width, height), view.zoom));
  const size = drawnSize(width, height, zoom);
  const slackX = Math.abs(size.w - 1) / 2;
  const slackY = Math.abs(size.h - 1) / 2;
  const clamp = (v: number, m: number) => Math.min(m, Math.max(-m, Number.isFinite(v) ? v : 0));
  return { zoom, x: clamp(view.x, slackX), y: clamp(view.y, slackY) };
}

/**
 * Zoom, keeping whatever is in the middle of the square in the middle.
 *
 * Scaling the offset with the zoom is what makes that true: without it, zooming
 * in on a face that is off to one side sends the face off the edge, and the
 * person has to chase it with their thumb.
 */
export function zoomView(width: number, height: number, view: CropView, zoom: number): CropView {
  const ratio = view.zoom > 0 ? zoom / view.zoom : 1;
  return clampView(width, height, { zoom, x: view.x * ratio, y: view.y * ratio });
}

/**
 * Move by a drag measured in pixels on a square `size` pixels across.
 *
 * Converted here, rather than by the caller, because the caller only knows
 * pixels and the view only knows fractions -- and the conversion is exactly the
 * kind of thing that gets done once in a component and then again, slightly
 * differently, in the keyboard handler.
 */
export function panView(
  width: number,
  height: number,
  view: CropView,
  dxPixels: number,
  dyPixels: number,
  size: number,
): CropView {
  if (!(size > 0)) return view;
  return clampView(width, height, { ...view, x: view.x + dxPixels / size, y: view.y + dyPixels / size });
}

/**
 * Where to draw the photo in a square `size` pixels across.
 *
 * The one function both the preview and the saved file are drawn with. The
 * view is clamped here too, so a caller holding a stale view -- a photo
 * swapped underneath it -- still draws something legal.
 */
export function placement(
  width: number,
  height: number,
  size: number,
  view: CropView,
): { x: number; y: number; w: number; h: number } {
  const v = clampView(width, height, view);
  const d = drawnSize(width, height, v.zoom);
  const w = d.w * size;
  const h = d.h * size;
  return {
    x: size / 2 + v.x * size - w / 2,
    y: size / 2 + v.y * size - h / 2,
    w,
    h,
  };
}
