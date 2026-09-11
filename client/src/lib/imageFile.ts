/**
 * Turning whatever a person picked into the one thing the server accepts.
 *
 * WHY THE BROWSER AND NOT THE SERVER. Resizing an image server-side means
 * `sharp`, a native dependency, in a Docker build that currently has none --
 * for a job that happens a handful of times per character. The browser already
 * has a decoder and an encoder for every format it can open, so the conversion
 * is free here and costs a build dependency there.
 *
 * It also means the bytes that arrive are ALREADY the format everything
 * downstream assumes. `AVATAR_DIR` holds nothing but png: `readAvatarFile`'s
 * regex says so, and `illustration.ts` hands those files to the images API
 * declaring `image/png`. A jpeg saved under a .png name is not a bug anyone
 * sees until a story generation 400s at the far end.
 *
 * WHAT IS SENT IS WHAT WAS FRAMED. The photo goes through the cropper
 * (PhotoCropper.tsx) and comes out a square, drawn by `placement()` in
 * imageCrop.ts -- the same function that draws the preview. Every portrait in
 * the app is shown square, so a photo that is not square was being cropped
 * anyway, by the display, without anyone choosing where.
 *
 * HEIC. iPhones store photos as HEIC, which Chrome and Firefox cannot decode.
 * In practice iOS transcodes to JPEG when a photo leaves the photo picker for
 * a web upload, so this mostly does not arise -- and when it does, the decode
 * throws here, with a message the form can show, rather than posting bytes the
 * server will reject with something less helpful.
 */

import { placement, type CropView } from "./imageCrop";

/**
 * The side of the square we send.
 *
 * 1024 because that is what `gpt-image-2` returns and therefore what every
 * other portrait in the app already is, and because a reference image larger
 * than the output buys nothing. A detailed photograph at this size is a couple
 * of megabytes as png, comfortably inside MAX_AVATAR_UPLOAD_BYTES.
 */
export const MAX_AVATAR_EDGE = 1024;

/** What a person is allowed to pick. `image/*` so iOS offers the photo library. */
export const AVATAR_FILE_ACCEPT = "image/*";

/** A decoded picture, whichever way the browser managed it. */
export type DecodedImage = ImageBitmap | HTMLImageElement;

/** Its size in pixels, since the two kinds spell it differently. */
export function imageSize(image: DecodedImage): { width: number; height: number } {
  return "naturalWidth" in image
    ? { width: image.naturalWidth, height: image.naturalHeight }
    : { width: image.width, height: image.height };
}

/**
 * Decode a picked file, honouring how the camera was held.
 *
 * `imageOrientation: "from-image"` is the half that is easy to miss: a phone
 * writes the photo in sensor order and records the rotation in EXIF, so a
 * canvas drawn from an unrotated bitmap produces a portrait lying on its side.
 * An `<img>` element applies EXIF on its own (`image-orientation: from-image`
 * is the CSS default), which is what makes it a correct fallback rather than
 * merely an older one.
 *
 * Throws with a sentence worth showing a person. Every failure here is one of
 * two things -- a file that is not really an image, or a format this browser
 * cannot open -- and neither is something a retry fixes.
 */
export async function decodeImage(file: File): Promise<DecodedImage> {
  const unreadable = new Error("That file could not be opened as a picture. Try a JPEG or PNG.");

  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      if (bitmap.width && bitmap.height) return bitmap;
      bitmap.close();
    } catch {
      // Fall through: some browsers reject the options bag rather than the
      // image, and the <img> path can still decode the file.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(unreadable);
      el.src = url;
    });
    // decode() so the pixels are ready before the url is revoked below -- a
    // loaded <img> keeps its decoded image, and this makes that explicit
    // rather than a property of the browser's cache.
    await img.decode().catch(() => undefined);
    if (!img.naturalWidth || !img.naturalHeight) throw unreadable;
    return img;
  } catch {
    throw unreadable;
  } finally {
    // Revoked on every path: an object url holds the whole file in memory
    // until it is released, and a person who picks four wrong files before
    // the right one should not be carrying all five.
    URL.revokeObjectURL(url);
  }
}

/**
 * The colour to fill the square with around a photo that has been zoomed out.
 *
 * THE AVERAGE OF THE EDGES THAT TOUCH THE GAP, not of the whole photo. The fill
 * sits against the photo's sides (a tall photo) or its top and bottom (a wide
 * one), so matching those is what makes it read as the photo continuing rather
 * than as a band of paint. A whole-photo average of a teddy on a kitchen table
 * is the teddy's brown, and brown bars beside a cream kitchen look wrong.
 *
 * NOT by shrinking the image to one pixel. That was the first version, and the
 * browser does not average a one-step downscale that large -- it samples a few
 * pixels near the middle. The teddy came back framed in dark maroon, off its
 * ribbon. So: shrink to a small square with high-quality smoothing, then
 * average the border pixels in JavaScript, where it is an actual average.
 */
export function edgeColour(image: DecodedImage): string {
  const fallback = "rgb(245, 240, 232)";
  try {
    const N = 32;
    const c = document.createElement("canvas");
    c.width = N;
    c.height = N;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return fallback;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0, N, N);
    const data = ctx.getImageData(0, 0, N, N).data;

    const { width, height } = imageSize(image);
    const tall = height > width;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < N; i++) {
      // A tall photo's gap is at its left and right; a wide one's above and
      // below. A square photo has no gap, so either pair is fine.
      const pair: Array<[number, number]> = tall ? [[0, i], [N - 1, i]] : [[i, 0], [i, N - 1]];
      for (const [x, y] of pair) {
        const k = (y * N + x) * 4;
        r += data[k];
        g += data[k + 1];
        b += data[k + 2];
        n++;
      }
    }
    return `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`;
  } catch {
    return fallback;
  }
}

/**
 * Draw the photo into a square `size` pixels across, framed by `view`.
 *
 * The ONE renderer: the cropper's preview calls it at screen size and
 * `croppedPng` calls it at 1024, so the saved file is the preview, larger.
 */
export function renderCrop(
  ctx: CanvasRenderingContext2D,
  image: DecodedImage,
  size: number,
  view: CropView,
  fill: string,
): void {
  const { width, height } = imageSize(image);
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const p = placement(width, height, size, view);
  ctx.drawImage(image, p.x, p.y, p.w, p.h);
}

/** The framed square as the png the upload route accepts. */
export async function croppedPng(image: DecodedImage, view: CropView, fill: string): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = MAX_AVATAR_EDGE;
  canvas.height = MAX_AVATAR_EDGE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser could not prepare the picture.");
  renderCrop(ctx, image, MAX_AVATAR_EDGE, view, fill);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("This browser could not prepare the picture.")),
      "image/png",
    );
  });
}

/**
 * Let go of a decoded picture.
 *
 * An ImageBitmap holds decoded pixels -- several times the file's size for a
 * camera photo -- until it is closed. An <img> is collected like anything else.
 */
export function releaseImage(image: DecodedImage | null | undefined): void {
  if (image && "close" in image) image.close();
}
