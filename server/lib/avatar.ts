/**
 * A character's portrait: the prompt that makes it, and the file it becomes.
 *
 * WHY THE PROMPT IS STORED AND NOT JUST THE PICTURE. Image models will not
 * reproduce a character from scratch. Ask twice and you get two different
 * children. So an illustration generated from a fresh description will not
 * match the portrait sitting next to it, and that mismatch is the whole
 * feature failing quietly -- nothing errors, the pictures simply are not the
 * same person.
 *
 * The fix is to keep the EXACT string an avatar was generated from and reuse it
 * verbatim wherever that character has to be drawn again. Not a summary of it,
 * not a regenerated version of it: the same bytes. That is why
 * `avatarPrompt` is stored beside `avatarUrl` and why both are server-owned.
 *
 * WHERE THE FILES GO. `public/images/stories/avatars`, inside the directory the
 * story illustrations already use. That looks like the wrong name, and it is
 * the right path: that exact directory is the mount point of the `story_images`
 * named volume (docker-compose.yml), so anything written there survives a
 * redeploy and anything written beside it does not. A sibling directory would
 * need a second volume added by hand to the authoritative compose file on the
 * host, and a container recreate, to buy a tidier name. Not worth it.
 */

import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { coveringNoun } from "@shared/characterVocab";
import { characterKind, type Character } from "@shared/schema";
import { toFile } from "openai";
import { resolveModel, createClient, inputFidelityFor } from "./modelPolicy";

/** Where portraits live. See the note above about why it is under `stories`. */
export const AVATAR_DIR = path.join(process.cwd(), "public", "images", "stories", "avatars");
/**
 * The path prefix these are served at.
 *
 * It sits under `/public` and it is NOT served by `express.static` -- routes.ts
 * registers an authenticated GET for this exact prefix, ahead of the static
 * mount, so a portrait needs a session. That matters because a person may now
 * upload a photograph of a real child here, and "unguessable url" is not the
 * same promise as "signed in". Everything else under `/public` is still static.
 */
const AVATAR_URL_PREFIX = "/public/images/stories/avatars";

/**
 * Load a stored avatar back off disk, by the public URL we handed out.
 *
 * The url is ours -- it was built here from a uuid -- but it arrives via the
 * database, so the basename is taken and the directory is not: joining a stored
 * string onto a path is how "../../etc" gets read. Anything that is not a plain
 * file in AVATAR_DIR returns undefined and the caller generates fresh.
 *
 * Exported for the story illustration, which loads the same files for the same
 * reason. There is one traversal guard in this app and this is it.
 */
export async function readAvatarFile(url: string): Promise<Buffer | undefined> {
  try {
    const name = path.basename(url);
    if (!/^avatar_[0-9a-f-]+\.png$/i.test(name)) return undefined;
    return await fs.promises.readFile(path.join(AVATAR_DIR, name));
  } catch {
    return undefined;
  }
}

/**
 * The most we will accept as an uploaded photograph.
 *
 * Generous, because the client has already shrunk it: the cropper frames it as
 * a 1024x1024 square and `croppedPng` re-encodes it, which is what a phone
 * camera's 12-megapixel JPEG becomes before it is ever sent. A detailed photograph at that size is
 * 2-3MB as PNG, so this is headroom rather than a target, and it exists to
 * bound what a client that ISN'T ours can post.
 */
export const MAX_AVATAR_UPLOAD_BYTES = 8 * 1024 * 1024;

/**
 * Is this actually a PNG?
 *
 * By the magic bytes, never by the Content-Type header, which is a claim made
 * by the caller. The point is not to catch an attacker -- the bytes are written
 * to a file and handed back as an image, and a mislabelled JPEG would be a
 * nuisance rather than an exploit -- it is to keep ONE invariant true:
 * everything in AVATAR_DIR is a png. `readAvatarFile`'s regex says so, and
 * `illustration.ts` sends these files to the images API declaring
 * `type: "image/png"`. A jpeg stored under a .png name is a 400 from OpenAI at
 * the far end of a story generation, which is the worst place to find out.
 */
export function isPngImage(buffer: Buffer): boolean {
  // \x89 P N G \r \n \x1a \n -- the 8-byte signature, and the \r\n pair is
  // there precisely so that a transfer which mangles line endings corrupts the
  // signature rather than the image.
  const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return buffer.length > PNG_MAGIC.length && buffer.subarray(0, 8).equals(PNG_MAGIC);
}

/**
 * Write one portrait to disk and return the url it is served at.
 *
 * The ONE definition of where a portrait lives and what it is called. Both
 * callers go through it -- the model's output in `generateAvatar`, and an
 * uploaded photograph in the route -- because the filename is not cosmetic:
 * `readAvatarFile` only reads `avatar_<uuid>.png`, so a file named any other
 * way is written successfully, served successfully, and then silently skipped
 * the first time a story tries to draw that character.
 */
export async function storeAvatarFile(png: Buffer): Promise<string> {
  await fs.promises.mkdir(AVATAR_DIR, { recursive: true });
  const filename = `avatar_${uuidv4()}.png`;
  await fs.promises.writeFile(path.join(AVATAR_DIR, filename), png);
  return `${AVATAR_URL_PREFIX}/${filename}`;
}

const isSet = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

/**
 * The description an image model is given for one character.
 *
 * Pure, and exported, because this string is the durable artefact -- it gets
 * stored, and later reused to keep a story illustration consistent with the
 * portrait. Being able to read it in a test without spending a cent on an
 * image is the point.
 *
 * `canonicalLook` leads when it exists. It is the field a person wrote
 * specifically to say how this character looks, it is capped at 300 characters,
 * and it reaches NO story prompt -- which is exactly what lets it be as
 * detailed as someone likes. Everything else here is a fallback assembled from
 * the sheet, for a character nobody has described.
 *
 * Deliberately absent: personality, hobby, notes, mustBeTrue and every stat. A
 * portrait is what they look like. "Patient" is not a colour, and feeding the
 * sheet to an image model is how you get a picture of a character holding a
 * book because their hobby is reading.
 */
export function buildAvatarPrompt(character: Character): string {
  return [
    `A friendly head-and-shoulders portrait of ${describeCharacter(character)}`,
    "Warm, gentle storybook illustration. Soft colours, plain background,",
    "facing the viewer, kind expression. No text, no words, no letters in the image.",
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Who they are and what they look like, in one or two sentences.
 *
 * Lifted out of buildAvatarPrompt because a story illustration needs exactly
 * this and nothing else of the portrait: the head-and-shoulders framing, the
 * plain background and the kind expression are a PORTRAIT's instructions, and
 * pasting them into a scene asks for a mugshot in the middle of the Red Sea.
 * One definition of how a character looks, two prompts that use it.
 *
 * `canonicalLook` leads when it exists. It is the field a person wrote
 * specifically to say how this character looks, it is capped at 300 characters,
 * and it reaches NO story prompt -- which is exactly what lets it be as
 * detailed as someone likes. Everything else here is a fallback assembled from
 * the sheet, for a character nobody has described.
 *
 * Ends with a full stop and no trailing space, so a caller can concatenate.
 */
export function describeCharacter(character: Character): string {
  const kind = characterKind(character) ?? "child";
  const covering = coveringNoun(character.category, kind);

  const looks: string[] = [];
  if (isSet(character.hair)) looks.push(`${character.hair} ${covering}`);
  if (isSet(character.eyes)) looks.push(`${character.eyes} eyes`);

  const who: string[] = [];
  if (typeof character.age === "number" && character.age > 0 && character.age < 120) {
    // Skipped for a three-hundred-year-old dragon: "aged 300" tells an image
    // model nothing useful and reads as an instruction to draw a ruin.
    who.push(`${character.age}-year-old`);
  }
  who.push(kind);

  const described = isSet(character.canonicalLook)
    ? character.canonicalLook.trim()
    : looks.length > 0
      ? `They have ${looks.join(" and ")}.`
      : "";

  return `${character.name}, a ${who.join(" ")}.${described ? ` ${described}` : ""}`;
}

/**
 * The description an image model is given when it is drawing FROM a photograph.
 *
 * Deliberately carries the name and the kind and NOTHING ELSE off the sheet --
 * no `hair`, no `eyes`, no `canonicalLook`, no age. That looks like an
 * oversight and it is the entire point: the photograph is the description. A
 * sheet saying "brown hair" against a photograph of a blond child gives the
 * model two answers to one question, and whichever it picks, somebody's
 * intention loses. The person uploading a picture has said what this character
 * looks like more precisely than any field can.
 *
 * The kind still goes in, because it is not a look -- it is what the story
 * calls them, and a photograph of a rabbit toy should not come back a child.
 *
 * "a drawing, not a photograph" is load-bearing and stated twice, here and in
 * MATCH_PHOTO. With a photographic reference and `images.edit`, the default
 * outcome is a lightly retouched photograph.
 */
export function buildPhotoAvatarPrompt(character: Character): string {
  const kind = characterKind(character) ?? "child";
  return [
    `A friendly head-and-shoulders portrait of ${character.name}, a ${kind},`,
    "drawn from the photograph provided.",
    "Warm, gentle storybook illustration -- a drawing, not a photograph.",
    "Soft colours, plain background, facing the viewer, kind expression.",
    "No text, no words, no letters in the image.",
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Did the image model REFUSE, as opposed to failing?
 *
 * Blake: "sometimes the image generator fails because of copyright things, and
 * it just will send back a fail. because I tried to generate Yoshi, and it
 * wouldn't work." Those are two different things to tell a parent -- "try
 * again" against "it will not draw that, describe them in your own words" --
 * and guessing produces the wrong advice half the time.
 *
 * TIGHT ON PURPOSE, in both directions. Anything that is not a 400 is not a
 * refusal, so an outage never gets reported to a parent as "we won't draw
 * that". And the message test is three specific phrases rather than something
 * like /not allowed|rejected/, because this codebase already has a
 * well-known 400 on this exact call -- `gpt-image-2` refusing `input_fidelity`
 * -- and blaming a parent for our own request shape is precisely the failure
 * this function exists to prevent.
 */
export function looksLikeRefusal(error: unknown): boolean {
  const e = error as
    | { status?: number; code?: string; message?: string; error?: { code?: string } }
    | undefined;
  const code = e?.code ?? e?.error?.code ?? "";
  if (code === "moderation_blocked" || code === "content_policy_violation") return true;
  if (e?.status !== 400) return false;
  return /safety system|content policy|moderation/i.test(e?.message ?? "");
}

export type AvatarResult = { url: string; prompt: string };

/**
 * What happened, rather than a picture or nothing.
 *
 * `generateAvatar` used to return `AvatarResult | undefined`, which collapses
 * "the model would not draw that" and "the call failed" into one value, and the
 * caller can only apologise vaguely for both. The refund rule is unchanged --
 * anything that is not `ok` refunds -- so this splits the MESSAGE, not the
 * accounting.
 */
export type AvatarOutcome =
  | ({ ok: true } & AvatarResult)
  | { ok: false; refused: boolean };


/**
 * Generate and store one portrait.
 *
 * `grantedByAllowance` says this generation has ALREADY been counted against a
 * capped allowance. The caller must have charged first: this function spends
 * the owner's key when it is true, so passing it without charging is how the
 * cap stops being a cap. It is not a convenience flag.
 *
 * Never throws: every failure comes back as `ok: false` and the caller refunds.
 * A character without a picture is the state it was already in.
 *
 * THE REFERENCE COMES FROM ONE OF TWO PLACES and the rest of this function does
 * not care which. `photo` is an uploaded photograph, held in memory and never
 * written to disk -- Blake asked for the source image to be discarded, and the
 * way to make that true is for there to be no code here that could write it.
 * `likeUrl` is a portrait this character already has. Either way it is one
 * `images.edit` call, not a second copy of one.
 */
export async function generateAvatar(
  character: Character,
  userId: number,
  opts: {
    grantedByAllowance: boolean;
    likeUrl?: string;
    note?: string;
    /** An uploaded photograph. Used as the reference, then dropped. */
    photo?: Buffer;
  },
): Promise<AvatarOutcome> {
  /**
   * The note is appended HERE, not inside buildAvatarPrompt.
   *
   * That function is pure and its tests assert exactly what it must and must
   * not contain; threading a per-request string through it would make those
   * tests describe something that no longer happens on every call. The stored
   * prompt is this whole string, so a picture always records what actually
   * made it.
   *
   * A photograph gets its own prompt builder rather than this one plus a
   * suffix -- see buildPhotoAvatarPrompt on why the sheet's looks are left out
   * when there is a photograph to look at. The stored prompt then mentions a
   * photograph that no longer exists, which is correct: it records what made
   * this picture. It is not replayable, and nothing replays it -- a later
   * "draw another" rebuilds from the sheet and references the drawing.
   */
  const base = opts.photo
    ? buildPhotoAvatarPrompt(character)
    : buildAvatarPrompt(character);
  const prompt = opts.note ? `${base} ${opts.note.trim()}` : base;
  try {
    const resolved = await resolveModel(userId, "image", {
      grantedByAllowance: opts.grantedByAllowance,
    });
    if (!resolved) {
      console.warn(
        `[avatar] no image model available for user ${userId}; not generating.`,
      );
      return { ok: false, refused: false };
    }

    const client = createClient(resolved);

    /**
     * A second picture of the same character has to LOOK like the first.
     *
     * Text alone will not do it. The stored prompt keeps the description
     * stable, and two runs of the same description still produce two different
     * dragons -- that is the property this whole feature works around. So when
     * the character already has a picture, the existing image goes in with the
     * prompt and the model edits rather than invents.
     *
     * With no pictures there is nothing to resemble, and a fresh generation is
     * the right thing: that is the first one, and it defines the look the rest
     * will follow.
     *
     * A missing or unreadable file falls back to a fresh generation rather than
     * failing. The user asked for a picture; a slightly-off picture beats an
     * error, and the file being gone is not something they can act on.
     *
     * An uploaded photograph takes precedence over any existing portrait: the
     * person just chose this picture, in preference to what the character
     * already had.
     */
    const reference =
      opts.photo ?? (opts.likeUrl ? await readAvatarFile(opts.likeUrl) : undefined);

    /**
     * What to do with the reference, which is not the same instruction for a
     * drawing and for a photograph.
     *
     * For an existing portrait: keep being that character. For a photograph:
     * keep being that PERSON, but stop being a photograph. Said again here
     * because the prompt above says it once and this is the sentence attached
     * directly to the image -- with a photographic reference, `images.edit`
     * left to itself returns a retouched photograph.
     */
    const matchInstruction = opts.photo
      ? "Draw the person or animal in the photograph provided as this character:" +
        " keep their face, hair and colouring clearly recognisable, but render" +
        " them as a storybook drawing, never as a photograph."
      : "Keep the same character: the same face, colouring and markings as the picture provided.";

    const response = reference
      ? await client.images.edit({
          model: resolved.model,
          image: await toFile(reference, "reference.png", { type: "image/png" }),
          prompt: `${prompt} ${matchInstruction}`,
          // Asks the model to match FACES rather than style and mood, on the
          // models that take it. Through the catalogue, never literally:
          // gpt-image-2 refuses the parameter with a 400, and there is no
          // fallback on this path -- the portrait would simply fail.
          ...inputFidelityFor(resolved.model),
          n: 1,
          size: "1024x1024",
        })
      : await client.images.generate({
          model: resolved.model,
          prompt,
          n: 1,
          size: "1024x1024",
        });

    // The GPT image models always return base64 and never a URL. `data` is
    // optional in the openai 7.x types and genuinely absent on some responses,
    // so this is a real guard rather than a cast to satisfy the compiler --
    // the same one generateStoryImage needs, for the same reason.
    const b64 = response.data?.[0]?.b64_json;
    if (!b64) {
      console.error(
        `[avatar] ${resolved.model} returned no image data for character ${character.id}.`,
      );
      return { ok: false, refused: false };
    }

    return { ok: true, url: await storeAvatarFile(Buffer.from(b64, "base64")), prompt };
  } catch (error) {
    const refused = looksLikeRefusal(error);
    console.error(
      `[avatar] ${refused ? "model refused" : "generation failed"} for character ${character.id}:`,
      error,
    );
    return { ok: false, refused };
  }
}
