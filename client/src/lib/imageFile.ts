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
 * HEIC. iPhones store photos as HEIC, which Chrome and Firefox cannot decode.
 * In practice iOS transcodes to JPEG when a photo leaves the photo picker for
 * a web upload, so this mostly does not arise -- and when it does, the decode
 * throws here, with a message the form can show, rather than posting bytes the
 * server will reject with something less helpful.
 */

/**
 * The longest edge we send.
 *
 * 1024 because that is what `gpt-image-2` returns and therefore what every
 * other portrait in the app already is, and because a reference image larger
 * than the output buys nothing. A detailed photograph at this size is a couple
 * of megabytes as png, comfortably inside MAX_AVATAR_UPLOAD_BYTES.
 */
export const MAX_AVATAR_EDGE = 1024;

/** What a person is allowed to pick. `image/*` so iOS offers the photo library. */
export const AVATAR_FILE_ACCEPT = "image/*";

/**
 * Decode a picked file, honouring how the camera was held.
 *
 * `imageOrientation: "from-image"` is the half that is easy to miss: a phone
 * writes the photo in sensor order and records the rotation in EXIF, so a
 * canvas drawn from an unrotated bitmap produces a portrait lying on its side.
 * An `<img>` element applies EXIF on its own (`image-orientation: from-image`
 * is the CSS default), which is what makes it a correct fallback rather than
 * merely an older one.
 */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Fall through: some browsers reject the options bag rather than the
      // image, and the <img> path can still decode the file.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("decode failed"));
      img.src = url;
    });
  } finally {
    // Revoked even on the failure path: an object url holds the whole file in
    // memory until it is released, and a person who picks four wrong files
    // before the right one should not be carrying all five.
    URL.revokeObjectURL(url);
  }
}

/**
 * A picked file as a png no larger than MAX_AVATAR_EDGE on its longest side.
 *
 * Never enlarges: `scale` is capped at 1, so a small picture is re-encoded at
 * its own size rather than blown up into a blurry one.
 *
 * Throws with a sentence worth showing a person. Every failure here is one of
 * two things -- a file that is not really an image, or a format this browser
 * cannot open -- and neither is something a retry fixes.
 */
export async function pngFromFile(file: File): Promise<Blob> {
  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await decode(file);
  } catch {
    throw new Error(
      "That file could not be opened as a picture. Try a JPEG or PNG.",
    );
  }

  const width = "naturalWidth" in source ? source.naturalWidth : source.width;
  const height = "naturalHeight" in source ? source.naturalHeight : source.height;
  if (!width || !height) {
    throw new Error("That file could not be opened as a picture. Try a JPEG or PNG.");
  }

  const scale = Math.min(1, MAX_AVATAR_EDGE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser could not prepare the picture.");
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

  // ImageBitmap holds decoded pixels -- several times the file's size for a
  // camera photo -- until it is closed or collected.
  if ("close" in source) source.close();

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("This browser could not prepare the picture.")),
      "image/png",
    );
  });
}
