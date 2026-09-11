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
import { resolveModel, createClient } from "./modelPolicy";

/** Where portraits live. See the note above about why it is under `stories`. */
export const AVATAR_DIR = path.join(process.cwd(), "public", "images", "stories", "avatars");
/** The public path prefix, matching `app.use("/public", express.static(...))`. */
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

export type AvatarResult = { url: string; prompt: string };


/**
 * Generate and store one portrait.
 *
 * `grantedByAllowance` says this generation has ALREADY been counted against a
 * capped allowance. The caller must have charged first: this function spends
 * the owner's key when it is true, so passing it without charging is how the
 * cap stops being a cap. It is not a convenience flag.
 *
 * Returns undefined rather than throwing on every failure, and the caller
 * refunds. A character without a picture is the state it was already in.
 */
export async function generateAvatar(
  character: Character,
  userId: number,
  opts: { grantedByAllowance: boolean; likeUrl?: string; note?: string },
): Promise<AvatarResult | undefined> {
  /**
   * The note is appended HERE, not inside buildAvatarPrompt.
   *
   * That function is pure and its tests assert exactly what it must and must
   * not contain; threading a per-request string through it would make those
   * tests describe something that no longer happens on every call. The stored
   * prompt is this whole string, so a picture always records what actually
   * made it.
   */
  const base = buildAvatarPrompt(character);
  const prompt = opts.note ? `${base} ${opts.note.trim()}` : base;
  try {
    const resolved = await resolveModel(userId, "image", {
      grantedByAllowance: opts.grantedByAllowance,
    });
    if (!resolved) {
      console.warn(
        `[avatar] no image model available for user ${userId}; not generating.`,
      );
      return undefined;
    }

    await fs.promises.mkdir(AVATAR_DIR, { recursive: true });
    const filename = `avatar_${uuidv4()}.png`;
    const filepath = path.join(AVATAR_DIR, filename);

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
     */
    const reference = opts.likeUrl ? await readAvatarFile(opts.likeUrl) : undefined;

    const response = reference
      ? await client.images.edit({
          model: resolved.model,
          image: await toFile(reference, "reference.png", { type: "image/png" }),
          prompt: `${prompt} Keep the same character: the same face, colouring and markings as the picture provided.`,
          // The whole point of passing a reference, and it defaults to "low".
          // See the note in illustration.ts: this is the only parameter that
          // asks the model to match FACES rather than style and mood.
          input_fidelity: "high",
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
      return undefined;
    }

    await fs.promises.writeFile(filepath, Buffer.from(b64, "base64"));
    return { url: `${AVATAR_URL_PREFIX}/${filename}`, prompt };
  } catch (error) {
    console.error(`[avatar] generation failed for character ${character.id}:`, error);
    return undefined;
  }
}
