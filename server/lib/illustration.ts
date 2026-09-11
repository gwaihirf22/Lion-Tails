/**
 * THE PICTURE AT THE END OF A STORY -- and the one thing that makes it the
 * same child twice.
 *
 * An image model will not reproduce a person from a description. Ask twice for
 * "an 8-year-old girl with brown hair" and you get two different girls, which
 * is the whole feature failing without an error anywhere: the story's picture
 * simply is not the child on the character sheet.
 *
 * So the picture is drawn FROM the portrait, not from a description of it.
 * `images.edit` takes up to sixteen reference images, and `input_fidelity:
 * "high"` is the parameter that asks the model to match "the style and
 * features, especially facial features, of input images". It defaults to
 * "low", which is a style hint and not what is wanted here. avatar.ts has
 * drawn a second portrait this way all along; this is the same mechanism
 * pointed at the story.
 *
 * Text is the FALLBACK, not the mechanism: a character with no portrait gets
 * whatever their sheet says about how they look (describeCharacter, the same
 * sentence the portrait prompt is built from), and that is the best that can
 * be done for them.
 *
 * generateStoryImage lived in openai-implementation.ts, which is thirteen
 * hundred lines of chat calls with this one image call at the bottom. Moved
 * whole, with downloadImage, which had no other caller.
 */

import fs from "fs";
import path from "path";
import https from "https";
import { v4 as uuidv4 } from "uuid";
import { toFile } from "openai";
import {
  characterIdsOf,
  characterRoleOf,
  type Character,
  type StoryRequest,
} from "@shared/schema";
import { KEEPER, KEEPER_FACE_FILE } from "../data/lionTails";
import { storage } from "../storage";
import { describeCharacter, readAvatarFile } from "./avatar";
import { resolveModel, createClient } from "./modelPolicy";

/** Where story pictures are written. The `story_images` volume mounts here. */
const STORY_IMAGE_DIR = path.join(process.cwd(), "public", "images", "stories");
/** Shipped artwork, and deliberately NOT inside the directory above. */
const SHIPPED_IMAGE_DIR = path.join(process.cwd(), "public", "images");

/**
 * Somebody who has to look like themselves.
 *
 * `look` is filled for everyone, `reference` only for those with a picture on
 * disk -- so if the reference call fails the same cast still describes itself
 * to the plain generate call.
 */
export type IllustrationMember = {
  /** How the prompt names them. */
  name: string;
  /** What they look like, in words. Always present. */
  look: string;
  /** Their picture, when there is one. This is what actually works. */
  reference?: Buffer;
  /** They may be in the picture and may not. Barnabas, and nobody else. */
  optional?: boolean;
};

/**
 * At most three faces.
 *
 * Not a new rule: the brief has told the illustrator for as long as there have
 * been multiple characters to "draw the lead and at most two of the others --
 * a picture with everyone in it is a crowd, not a scene"
 * (storyBrief.ts, the "image" projection). Eight reference images would be a
 * class photo, and every one of them costs.
 */
export const MAX_DRAWN_CHARACTERS = 3;

/**
 * Is the user's character IN this story, or only reading it?
 *
 * A straight retelling invents nobody -- "the default, because being wrong
 * this way gives a plainer story, and being wrong the other way puts a child
 * into Scripture" -- and a picture is the same question. Drawing the child's
 * face into the parting of the Red Sea is the image-side version of the Esther
 * bug: nothing errors, and the app looks like it has confused two people.
 *
 * NOT the same line as storyBrief's `anonymous`, on purpose, and this is the
 * only place in the app where that is true. `anonymous` keys on a source that
 * RESOLVES, because an unrecognised slug carries no account and should not cost
 * a character their place in their own story. This keys on a source field being
 * filled at all, because the two mistakes do not cost the same: a missing face
 * is a generic picture, and a wrong face in a biblical scene is the thing we
 * are trying not to ship. When in doubt, no face.
 */
export function charactersAreInTheStory(request: StoryRequest): boolean {
  if (characterRoleOf(request) !== "absent") return true;
  const source = [request.biblicalEvent, request.heroOfFaith, request.biblePassage];
  return !source.some((s) => typeof s === "string" && s.trim().length > 0);
}

/** Read the Timekeeper's one canon face. */
async function readKeeperFace(): Promise<Buffer | undefined> {
  try {
    return await fs.promises.readFile(path.join(SHIPPED_IMAGE_DIR, KEEPER_FACE_FILE));
  } catch {
    return undefined;
  }
}

/**
 * Who has to be recognisable in this story's picture.
 *
 * The characters are read LIVE rather than off the frozen brief: the brief is
 * what the story was written from, and this is what the people in it look like
 * now. A portrait drawn after the story was written should still be the face
 * the picture uses.
 */
export async function illustrationCast(
  request: StoryRequest,
  userId: number,
): Promise<IllustrationMember[]> {
  const cast: IllustrationMember[] = [];

  if (charactersAreInTheStory(request)) {
    // In order: index 0 is the protagonist, and that is who gets drawn first
    // and therefore who gets reference image 1.
    const ids = characterIdsOf(request).slice(0, MAX_DRAWN_CHARACTERS);
    for (const id of ids) {
      let character: Character | undefined;
      try {
        character = await storage.getCharacterById(id, userId);
      } catch (error) {
        console.error(`[illustration] could not load character ${id}:`, error);
      }
      if (!character) continue;
      cast.push({
        name: character.name,
        look: describeCharacter(character),
        // The CHOSEN avatar, not the newest: avatarUrl is the one the sheet
        // shows and the one a parent picked.
        reference: character.avatarUrl ? await readAvatarFile(character.avatarUrl) : undefined,
      });
    }
  }

  /**
   * The Timekeeper, on every quest, whether or not the scene mentions him.
   *
   * Blake's call, and the reasoning is the model writes the scene description:
   * attaching him only when it happens to say "Barnabas" means the one that
   * says "the old shopkeeper" is a different man in every story. He is marked
   * optional instead, so the picture is never forced to contain him.
   *
   * `travels` is the same fact isTimekeeperStory() reads.
   */
  if (characterRoleOf(request) === "travels") {
    cast.push({
      name: `${KEEPER.name}, ${KEEPER.title}`,
      look: KEEPER.look,
      reference: await readKeeperFace(),
      optional: true,
    });
  }

  return cast;
}

/**
 * A STYLE, not an audience. "Child-friendly" was doing both jobs and the
 * second one is what flattened these illustrations; "storybook" keeps the
 * warmth and the soft palette without telling the model who is looking.
 */
const STYLE = "Render in a beautiful biblical storybook illustration style with soft colors.";

/** "a, b and c" */
const list = (names: string[]): string =>
  names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/**
 * The whole prompt: the scene, the style, and who the people are.
 *
 * Pure, and the reason this module is testable at all -- there is no way to
 * assert that a picture looks like somebody, but there is every way to assert
 * what we asked for.
 *
 * AN EMPTY CAST RENDERS EXACTLY WHAT IT ALWAYS DID. A retelling with no
 * character in it, a story whose cast has no portraits and no description, an
 * older row -- all of those must produce the string this function produced
 * before any of this existed, or an unrelated picture changes.
 */
export function composeIllustrationPrompt(
  scenePrompt: string,
  cast: IllustrationMember[] = [],
): string {
  const parts = [`${scenePrompt}. ${STYLE}`];

  const matched = cast.filter((m) => m.reference);
  const described = cast.filter((m) => !m.reference);

  if (matched.length > 0) {
    parts.push(
      "The people in this picture must match the reference images exactly, especially their faces.",
    );
    // Numbered in the order they are handed to images.edit. The API has no way
    // to label an input image, so the prompt is what says which is which.
    matched.forEach((m, i) => {
      parts.push(`Reference image ${i + 1} is ${m.look}`);
    });
    parts.push(
      "Take each person's face, hair and colouring from their own reference image and nothing else from it —" +
        " not its background, its framing, its lighting, or anything it happens to be holding.",
    );
  }

  if (described.length > 0) {
    parts.push(`Also in the picture: ${described.map((m) => m.look).join(" ")}`);
  }

  const optional = cast.filter((m) => m.optional).map((m) => m.name);
  if (optional.length > 0) {
    parts.push(
      `${list(optional)} need not appear in this picture at all — draw them only if the scene calls for it —` +
        " but must look exactly like this if they do.",
    );
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Generate and store one story illustration.
 *
 * Returns undefined on EVERY failure and never throws: a story is not lost
 * over a missing picture, and the reader falls back to the stock lion.
 */
export async function generateStoryImage(
  imagePrompt: string,
  userId: number = 1,
  cast: IllustrationMember[] = [],
): Promise<string | undefined> {
  try {
    // Illustration is premium-only and has no cheap or local tier, so an
    // unentitled user simply gets a story without a picture rather than an
    // error -- and never silently bills the server owner.
    const resolved = await resolveModel(userId, "image");
    if (!resolved) {
      console.log(
        "Skipping illustration: image generation requires an admin account or your own OpenAI API key.",
      );
      return undefined;
    }
    if (!fs.existsSync(STORY_IMAGE_DIR)) {
      fs.mkdirSync(STORY_IMAGE_DIR, { recursive: true });
    }
    const filename = `story_${uuidv4()}.png`;
    const filepath = path.join(STORY_IMAGE_DIR, filename);
    const prompt = composeIllustrationPrompt(imagePrompt, cast);
    const openaiClient = createClient(resolved);

    const references = cast.map((m) => m.reference).filter((b): b is Buffer => Boolean(b));
    let response;
    if (references.length > 0) {
      try {
        response = await openaiClient.images.edit({
          model: resolved.model,
          image: await Promise.all(
            references.map((buf, i) =>
              toFile(buf, `reference-${i + 1}.png`, { type: "image/png" }),
            ),
          ),
          prompt,
          // THE PARAMETER THIS FEATURE IS. Without it the references are a
          // style hint; with it the model is asked to match faces.
          input_fidelity: "high",
          n: 1,
          size: "1024x1024",
        });
      } catch (editError) {
        // A picture that does not quite match beats no picture. The prompt
        // still describes everyone in words, because every member carries
        // `look` whether or not they have a reference.
        console.error(
          "[illustration] reference-matched generation failed; falling back to a plain one:",
          editError,
        );
      }
    }
    if (!response) {
      response = await openaiClient.images.generate({
        model: resolved.model,
        prompt: composeIllustrationPrompt(
          imagePrompt,
          cast.map(({ reference: _reference, ...rest }) => rest),
        ),
        n: 1,
        size: "1024x1024",
      });
    }

    // openai 7.x made ImagesResponse.data optional (`data?: Array<Image>`), so
    // indexing it directly throws at runtime on a response that carries none --
    // this is a real guard, not a cast to satisfy the compiler.
    const image = response.data?.[0];

    // The GPT image models ALWAYS return base64 and never a URL, and they do
    // not accept response_format at all. Swapping dall-e-3 for gpt-image-2
    // without this would have kept the bug alive in a new shape: data[0].url
    // is simply undefined, so the function would return undefined and the
    // reader would go on showing the stock lion with nothing logged.
    if (image?.b64_json) {
      await fs.promises.writeFile(filepath, Buffer.from(image.b64_json, "base64"));
      return `/public/images/stories/${filename}`;
    }
    // Kept for any model that does return a URL. Those links expire in about an
    // hour, which is why the file is downloaded rather than stored as a link.
    if (image?.url) {
      await downloadImage(image.url, filepath);
      return `/public/images/stories/${filename}`;
    }

    console.error(
      `Image generation returned no image data (model ${resolved.model}). ` +
        "Nothing to save; the story keeps the stock picture.",
    );
    return undefined;
  } catch (error) {
    console.error("Error generating story illustration:", error);
    return undefined;
  }
}

function downloadImage(url: string, filepath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          return reject(new Error(`Failed to download image: ${response.statusCode}`));
        }
        const fileStream = fs.createWriteStream(filepath);
        response.pipe(fileStream);
        fileStream.on("finish", () => {
          fileStream.close();
          resolve();
        });
        fileStream.on("error", (err) => {
          fs.unlink(filepath, () => {});
          reject(err);
        });
      })
      .on("error", (err) => {
        reject(err);
      });
  });
}

/**
 * The one place that knows a story picture's filename shape, for deleting a
 * replaced one. Same guard as the avatar delete: the url is ours -- it was
 * built here from a uuid -- but it arrives via the database, so the basename is
 * taken and the directory is not.
 */
export async function deleteStoryImage(url: string): Promise<void> {
  try {
    const name = path.basename(url);
    if (!/^story_[0-9a-f-]+\.png$/i.test(name)) return;
    await fs.promises.rm(path.join(STORY_IMAGE_DIR, name), { force: true });
  } catch (error) {
    // An orphaned file is not worth failing a redraw over.
    console.error(`[illustration] could not remove the replaced picture ${url}:`, error);
  }
}
