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
 * `images.edit` takes up to sixteen reference images. avatar.ts has drawn a
 * second portrait this way all along; this is the same mechanism pointed at
 * the story.
 *
 * `input_fidelity: "high"` is the parameter that asks a model to match "the
 * style and features, especially facial features, of input images", and
 * `gpt-image-2` REFUSES IT -- a 400, whatever the SDK's doc comment says. So
 * it goes through the catalogue (`inputFidelityFor`), like every other
 * per-model parameter here, and the prompt is what has to carry "these are the
 * people, match their faces". Sending it literally cost this feature its first
 * real test: the 400 fell through to a plain generate, which threw away every
 * reference image and drew a different child, and the only sign was one line
 * in the log.
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
  chosenAvatarIsPhoto,
  type Character,
  type StoryRequest,
} from "@shared/schema";
import { KEEPER, KEEPER_FACE_FILE } from "../data/lionTails";
import { platesForScene } from "../data/referencePlates";
import { storage } from "../storage";
import { describeCharacter, looksLikeRefusal, readAvatarFile } from "./avatar";
import { resolveModel, createClient, inputFidelityFor } from "./modelPolicy";

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
/**
 * A file on its way to the images API, carrying what the API needs to know
 * about it.
 *
 * The type travels WITH the bytes rather than being assumed at the call site:
 * a character's portrait is always a png (readAvatarFile's guard says so) and
 * the Timekeeper's face is a webp, and a reference sent under the wrong type
 * is a 400 that costs the picture its likeness and says nothing useful.
 */
export type PictureFile = { data: Buffer; filename: string; type: string };

/** The three the images API takes. Anything else is not a reference image. */
const MIME: Record<string, string> = {
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

const mimeFor = (filename: string): string | undefined =>
  MIME[path.extname(filename).toLowerCase()];

export type IllustrationMember = {
  /** How the prompt names them. */
  name: string;
  /** What they look like, in words. Always present. */
  look: string;
  /** Their picture, when there is one. This is what actually works. */
  reference?: PictureFile;
  /**
   * True when that picture is a PHOTOGRAPH somebody uploaded, rather than a
   * drawing this app made. It changes what the prompt asks for -- take the
   * face, do not take the medium -- and nothing else.
   */
  fromPhoto?: boolean;
};

/**
 * What an attached picture IS, so the prompt can say so.
 *
 * OpenAI's image-prompting guide: "Identify each input by number and purpose:
 * subject, style, clothing, or background." Until now every reference was
 * implicitly a person, which is why the one non-person reference -- the
 * story's earlier picture -- needed a sentence insisting it was "not a
 * person". With a role on each one, that sentence is the general case rather
 * than a special case, and a shop front stops being read as somebody's face.
 *
 * The API cannot label an input image. The prompt is the only thing that can
 * say which is which, which is why every reference is numbered and why the
 * order they are handed to `images.edit` has to match the order they are
 * described here.
 */
export type ReferenceRole = "subject" | "style" | "background" | "object" | "clothing";

/**
 * A reference that is not one of the cast.
 *
 * `look` does double duty, as it does for a person: it is the text fallback
 * when the file cannot be read, AND -- for a sheet holding several things at
 * once -- it is where the layout is spelled out, because a montage the model
 * cannot navigate is a collage it has to guess at.
 */
export type IllustrationReference = {
  role: Exclude<ReferenceRole, "subject">;
  /** How the prompt names it. */
  name: string;
  /** What it shows, and for a multi-panel sheet, where each thing sits in it. */
  look: string;
  file?: PictureFile;
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
 * What `images.edit` takes, and what we are willing to spend.
 *
 * SIXTEEN is the API's limit. Twelve is ours, and the four spare are not
 * timidity: a request that lands exactly on a hard limit fails completely the
 * first time anything is added, and the thing most likely to be added here is
 * one more face.
 *
 * Every reference is also billed -- a 1024x1024 input is ~1,024 image tokens --
 * so this is a cost ceiling as much as a correctness one.
 */
export const MAX_REFERENCE_IMAGES = 16;
export const REFERENCE_BUDGET = 12;

/**
 * Which references survive when a scene asks for more than the budget.
 *
 * Order matters and is the whole point. The style reference goes first because
 * it is the cheapest way to keep a book looking like itself, and dropping it
 * changes every pixel; faces go next, protagonist first, because a wrong face
 * is the failure people actually notice; the world's furniture goes last,
 * because a shop drawn slightly differently is a blemish and a child drawn as
 * somebody else is a bug.
 */
export function withinBudget(
  cast: IllustrationMember[],
  extras: IllustrationReference[],
  budget = REFERENCE_BUDGET,
): { cast: IllustrationMember[]; extras: IllustrationReference[] } {
  const style = extras.filter((e) => e.role === "style");
  const rest = extras.filter((e) => e.role !== "style");

  const keptStyle = style.slice(0, budget);
  const forCast = Math.max(0, budget - keptStyle.length);
  const keptCast = cast.slice(0, forCast);
  const forRest = Math.max(0, budget - keptStyle.length - keptCast.length);
  return { cast: keptCast, extras: [...keptStyle, ...rest.slice(0, forRest)] };
}

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

/**
 * Does this scene have Barnabas in it?
 *
 * Built from the canon, never a typed-again string. Safe to compile: these are
 * our own constants, not user text -- the rule against building a regex from a
 * name is about the skill list, which anyone can write into.
 */
const KEEPER_PATTERN = new RegExp(
  `\\b(${KEEPER.shortName}|${KEEPER.title.replace(/^the /i, "")})\\b`,
  "i",
);
const mentionsKeeper = (scenePrompt: string): boolean => KEEPER_PATTERN.test(scenePrompt);

/** Read the Timekeeper's one canon face, whatever format it is shipped in. */
async function readKeeperFace(): Promise<PictureFile | undefined> {
  const type = mimeFor(KEEPER_FACE_FILE);
  // A face in a format the API will not take is worse than no face: the whole
  // call fails and the story loses its picture rather than one likeness.
  if (!type) {
    console.error(`[illustration] ${KEEPER_FACE_FILE} is not a format the images API takes.`);
    return undefined;
  }
  try {
    const data = await fs.promises.readFile(path.join(SHIPPED_IMAGE_DIR, KEEPER_FACE_FILE));
    return { data, filename: KEEPER_FACE_FILE, type };
  } catch {
    return undefined;
  }
}

/** A character's chosen portrait as a file the images API will accept. */
async function portraitFile(avatarUrl?: string): Promise<PictureFile | undefined> {
  if (!avatarUrl) return undefined;
  const data = await readAvatarFile(avatarUrl);
  return data ? { data, filename: "portrait.png", type: "image/png" } : undefined;
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
  /** The scene the model wrote. Read only to decide whether Barnabas is in it. */
  scenePrompt: string = "",
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
        // shows and the one a parent picked. Always a png -- readAvatarFile
        // will not return anything else.
        reference: await portraitFile(character.avatarUrl),
        // Read from the SAME field the reference came from, so the two cannot
        // drift: a character holding both a photograph and a drawing is only
        // "from a photo" while the photograph is the one chosen.
        fromPhoto: chosenAvatarIsPhoto(character),
      });
    }
  }

  /**
   * The Timekeeper, when the scene he is in is the one being drawn.
   *
   * ATTACHED ONLY WHEN THE SCENE NAMES HIM, and that is not the first answer.
   * The first answer was to attach him to every quest and mark him optional --
   * "he need not appear" -- so that a scene calling him "the old shopkeeper"
   * could not slip past. The first real generation showed what that costs: a
   * quest about William Tyndale came back with TYNDALE wearing Barnabas's face
   * and coat. The scene wanted an older man at a desk, an older man's face was
   * attached, and the model used it. Adding "everyone else is a different
   * person" to the prompt did not stop it happening again.
   *
   * The two failures are not equal. Not attaching him to a scene he is quietly
   * in means one generic old man. Attaching him to a scene he is not in means
   * a real historical figure drawn as a fictional character, in an app whose
   * whole point is that the history is true. So: named, or absent.
   *
   * `travels` is the same fact isTimekeeperStory() reads. The pattern is built
   * from the canon rather than typed again, so renaming him cannot leave this
   * looking for a man who no longer exists.
   */
  if (characterRoleOf(request) === "travels" && mentionsKeeper(scenePrompt)) {
    cast.push({
      name: `${KEEPER.name}, ${KEEPER.title}`,
      look: KEEPER.look,
      reference: await readKeeperFace(),
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

/**
 * Read one shipped plate off disk, if the scene has a use for it.
 *
 * Same shape and the same failure rule as readKeeperFace: a plate that cannot
 * be read, or is in a format the images API will not take, comes back without a
 * file and the prompt falls through to describing it in words. A reference the
 * API refuses is worse than no reference -- it is a 400 that costs the whole
 * picture its likeness.
 */
export async function illustrationPlates(scenePrompt: string): Promise<IllustrationReference[]> {
  const out: IllustrationReference[] = [];
  for (const plate of platesForScene({ scene: scenePrompt })) {
    const type = mimeFor(plate.file);
    if (!type) {
      console.error(`[illustration] ${plate.file} is not a format the images API takes.`);
      continue;
    }
    let data: Buffer | undefined;
    try {
      data = await fs.promises.readFile(path.join(SHIPPED_IMAGE_DIR, plate.file));
    } catch {
      // Not yet drawn, or not shipped. The words still go in.
      data = undefined;
    }
    out.push({
      role: plate.role,
      name: plate.name,
      look: plate.look,
      ...(data ? { file: { data, filename: plate.file, type } } : {}),
    });
  }
  return out;
}

/**
 * Why the reference-matched call failed, in the three flavours that need
 * different answers.
 *
 * `parameter` is OUR bug -- a model sent something it does not take, which is
 * how `input_fidelity` cost this feature its first real test. It will fail
 * identically on every retry until someone changes the code, so it has to be
 * findable rather than absorbed.
 * `refused` is the model declining the prompt; retrying draws the same refusal.
 * `transient` is weather -- a timeout, a 500 -- and is worth another go.
 */
export type EditFailure = "parameter" | "refused" | "transient";

/**
 * A picture, and whether it is actually matched to the references we sent.
 *
 * The second field is the point. A picture drawn after the references were
 * dropped looks exactly like one drawn with them -- same size, same style,
 * same everything except that it is a different child -- so the only way for
 * anything upstream to know is to be told.
 */
export type StoryImageResult = { url: string; droppedReferences?: EditFailure };

/**
 * The two frames this app draws in.
 *
 * A page is square. The cover is wide because it is a montage, and because
 * 1536x1024 is 48x32 patches -- exactly the budget an input image gets, so
 * nothing is thrown away when it is attached to the next picture.
 */
export type StoryImageSize = "1024x1024" | "1536x1024";
export const COVER_SIZE: StoryImageSize = "1536x1024";
export const PAGE_SIZE: StoryImageSize = "1024x1024";

export function classifyEditFailure(error: unknown): EditFailure {
  // Checked before the status, because a refusal is ALSO a 400 and the two
  // want opposite responses -- retrying a refusal earns the same refusal,
  // while a parameter 400 is a bug somebody has to go and fix.
  if (looksLikeRefusal(error)) return "refused";
  const status = (error as { status?: number } | undefined)?.status;
  if (status === 400 || status === 422) return "parameter";
  return "transient";
}

/**
 * What to say about one attached picture that is not a person.
 *
 * Every line does the same two jobs: name what the picture IS, and fence off
 * what must not be taken from it. The fence is the load-bearing half -- the
 * first version of the story-look reference had to be told "not a person" or
 * the model placed it in the scene as one more face, and a shop front is the
 * same mistake waiting to happen.
 */
function referenceLine(n: number, e: IllustrationReference): string {
  const head = `Reference image ${n} is ${e.look}`;
  switch (e.role) {
    case "style":
      return (
        `${head} It is the look of this book, not a scene and not a person. Match its palette, its` +
        " linework and the way it is lit. Anyone in this picture who also appears in it must look the" +
        " same here as they do there. Take nothing else from it — not its scene, its framing or its moment."
      );
    case "background":
      return (
        `${head} Match what it shows where the scene calls for it — the same building, the same` +
        " materials, the same colours. Do not copy its framing or its lighting, and do not place any" +
        " person from it into this picture."
      );
    case "object":
      return (
        `${head} When that object appears in this scene, draw it as it is shown there. Take nothing` +
        " else from the picture — not its background, its framing, or anyone holding it."
      );
    case "clothing":
      return (
        `${head} Dress the people in this scene to match it. Take only the clothing from it — not its` +
        " faces, its background or its framing."
      );
  }
}

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
  /**
   * Everything attached that is not one of the cast: the world sheet, the
   * story's own montage, an era's clothing. Numbered AFTER the cast, so adding
   * one never renumbers a person.
   *
   * Replaces the old `hasStoryLook` boolean, which could say only "there is
   * one more picture and it is not a person" -- true of every one of these,
   * and not enough to tell a shop front from a palette.
   */
  extras: IllustrationReference[] = [],
  opts: {
    /**
     * The cover and the first picture of a new face are ESTABLISHING shots:
     * they become the reference everything later is matched against, so a
     * head turned away costs more than an awkward composition. Every other
     * picture is a scene, and a scene is allowed to hide a face.
     */
    facesMustShow?: boolean;
  } = {},
): string {
  const parts = [`${scenePrompt}. ${STYLE}`];

  const matched = cast.filter((m) => m.reference);
  const described = cast.filter((m) => !m.reference);
  const attached = extras.filter((e) => e.file);

  if (matched.length > 0) {
    parts.push(
      "The people in this picture must match their reference images — the same face, the same hair," +
        " the same colouring.",
    );
    // Numbered in the order they are handed to images.edit. The API has no way
    // to label an input image, so the prompt is what says which is which.
    matched.forEach((m, i) => {
      parts.push(`Reference image ${i + 1} is ${m.look}`);
      /**
       * A photograph is a likeness, not a style to copy.
       *
       * Said per-member and immediately after that member's own line, so the
       * numbering every other instruction depends on is untouched, and so a
       * cast of three with one photograph does not tell the model that all
       * three are photographs.
       *
       * Emitted ONLY when a photograph is actually in the cast. Every story
       * without one must render the string this function has always rendered
       * -- the promise in the note above, and there is a test on it.
       */
      if (m.fromPhoto) {
        parts.push(
          `Reference image ${i + 1} is a photograph, not a drawing.` +
            " Take the face, hair and colouring from it, but draw this person" +
            " in the storybook style — never reproduce the photograph.",
        );
      }
    });
    parts.push(
      "Take each person's face, hair, colouring and clothing from their own reference image and nothing else" +
        " from it — not its background, its framing, its lighting, or anything it happens to be holding.",
    );
    /**
     * A LIKENESS IS NOT A POSE.
     *
     * "Match them, especially their faces" was doing two jobs: it asked for
     * the right face, and it quietly asked for that face to be pointed at the
     * camera. Every passage picture came back arranged so nobody was ever
     * turned away -- a row of people looking out of a scene they were supposed
     * to be inside.
     *
     * Said only where it applies. An establishing picture -- the cover, the
     * first sight of a new face -- becomes the reference everything later is
     * matched against, and COVER_SHOWS_PEOPLE asks it for "recognisable" from
     * the scene prompt's side. Saying both at once would contradict.
     */
    if (!opts.facesMustShow) {
      parts.push(
        "Match them wherever they can be seen, and compose the picture the way the moment wants it. If" +
          " someone is turned away, partly hidden, or seen from behind, that is fine — do not rearrange" +
          " the scene to bring a face into view.",
      );
    }
  }

  // AFTER the cast, so every number above keeps the value it had, and each
  // says what it IS -- the guide's "identify each input by number and
  // purpose". A sheet holding several things carries its own layout in `look`,
  // because a montage the model cannot navigate is a collage it must guess at.
  attached.forEach((e, i) => {
    const n = matched.length + i + 1;
    parts.push(referenceLine(n, e));
  });

  if (matched.length > 0 || attached.length > 0) {
    // WITHOUT THIS, A SPARE FACE GETS USED. First real test: a quest story
    // about William Tyndale came back with Tyndale drawn as Barnabas -- the
    // scene called for an older man at a desk, a face for an older man was
    // attached, and the model reached for it.
    //
    // Phrased against the REFERENCES rather than against a list of names,
    // because the earlier picture carries people nobody named: the rule is
    // "if you have not seen them, they are new", which holds either way.
    parts.push(
      "Anyone in this scene who appears in none of the reference images is a different person, and must" +
        " not be given a face, hair or clothing from any of them — including whoever the story is about.",
    );
  }

  if (described.length > 0) {
    parts.push(`Also in the picture: ${described.map((m) => m.look).join(" ")}`);
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
  /**
   * Everything attached that is not one of the cast: the story's own montage,
   * the world sheet, an era's clothing. The cast covers everybody with a
   * character sheet; these cover everybody and everything else -- on a
   * historical story, the person it is actually about, and the shop they
   * walked out of.
   */
  extras: IllustrationReference[] = [],
  opts: {
    facesMustShow?: boolean;
    /**
     * The frame. A page is square; the cover is the wide one, because it is a
     * montage AND because 1536x1024 is 48x32 patches = exactly the ~1,536-patch
     * budget an input image is allowed. Every later picture attaches the cover,
     * so this is the one place in the app where a wider frame buys real detail
     * instead of spreading the same budget thinner.
     */
    size?: StoryImageSize;
  } = {},
): Promise<StoryImageResult | undefined> {
  /**
   * Set only when the reference-matched call failed and the picture was drawn
   * from words alone. It travels OUT rather than staying in the log, because
   * a picture that is not matched to its references looks exactly like one
   * that is -- until you notice the child is somebody else.
   */
  let droppedReferences: EditFailure | undefined;
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
    const openaiClient = createClient(resolved);

    /**
     * TRIMMED HERE, not at the call sites, so there is one place that can
     * exceed the API's limit and one place that decides what goes. A scene
     * with a full cast, Barnabas, the world sheet and a cover is already at
     * six; it is the story-grown plates that will push this over.
     */
    const budgeted = withinBudget(cast, extras);
    if (budgeted.cast.length < cast.length || budgeted.extras.length < extras.length) {
      console.log(
        `[illustration] ${cast.length + extras.length} references asked for, ` +
          `${REFERENCE_BUDGET} sent.`,
      );
    }

    // Extras go LAST, after every cast member, so the numbering in the prompt
    // matches the order images.edit receives them in. The filter is the same
    // one composeIllustrationPrompt applies, so the two cannot disagree about
    // which extras were actually attached.
    const attachedExtras = budgeted.extras.filter((e) => e.file);
    const references = [
      ...budgeted.cast.map((m) => m.reference).filter((f): f is PictureFile => Boolean(f)),
      ...attachedExtras.map((e) => e.file as PictureFile),
    ];
    const prompt = composeIllustrationPrompt(
      imagePrompt,
      budgeted.cast,
      budgeted.extras,
      opts,
    );
    let response;
    if (references.length > 0) {
      try {
        response = await openaiClient.images.edit({
          model: resolved.model,
          image: await Promise.all(
            references.map((file, i) =>
              // Numbered to match the prompt, which is the only thing that
              // says which reference is whom -- the API cannot name them.
              toFile(file.data, `reference-${i + 1}${path.extname(file.filename)}`, {
                type: file.type,
              }),
            ),
          ),
          prompt,
          // Asks the model to match FACES rather than style, where the model
          // takes it at all -- gpt-image-2 answers 400 to the parameter and
          // the catalogue is what knows that. Sending it blind cost this
          // feature its first real test: the 400 dropped every reference and
          // the fallback quietly drew a different child.
          ...inputFidelityFor(resolved.model),
          n: 1,
          size: opts.size ?? PAGE_SIZE,
        });
      } catch (editError) {
        /**
         * THE MOST EXPENSIVE LINE IN THIS FILE, AND IT USED TO BE ONE LOG.
         *
         * A picture that does not quite match beats no picture, so the
         * fallback stays. What did not stay is it being quiet: every
         * reference is dropped here, and the result is a perfectly good
         * picture of the wrong child. That is exactly what happened the first
         * time this feature was tested -- the sign was one console.error, and
         * nothing downstream knew.
         *
         * So the reason is named and carried out. A parameter 400 is OUR bug
         * and must be findable; a refusal is the model declining and will
         * happen again on retry; anything else is weather.
         */
        droppedReferences = classifyEditFailure(editError);
        console.error(
          `[illustration] reference-matched generation failed (${droppedReferences});` +
            ` ${references.length} reference image(s) were DROPPED and this picture is not` +
            " matched to them:",
          editError,
        );
      }
    }
    if (!response) {
      response = await openaiClient.images.generate({
        model: resolved.model,
        // No references at all on this path, so nothing may claim to have
        // any: the cast still describes itself in words, and the story-look
        // line -- which is about a picture that is not being sent -- goes.
        prompt: composeIllustrationPrompt(
          imagePrompt,
          cast.map(({ reference: _reference, ...rest }) => rest),
          extras.map(({ file: _file, ...rest }) => rest),
          opts,
        ),
        n: 1,
        size: opts.size ?? PAGE_SIZE,
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
      return { url: `/public/images/stories/${filename}`, droppedReferences };
    }
    // Kept for any model that does return a URL. Those links expire in about an
    // hour, which is why the file is downloaded rather than stored as a link.
    if (image?.url) {
      await downloadImage(image.url, filepath);
      return { url: `/public/images/stories/${filename}`, droppedReferences };
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
 * A story picture's path on disk, or undefined if that is not what the url is.
 *
 * THE ONE PLACE that knows a story picture's filename shape, because two
 * copies of a traversal guard is how one of them gets relaxed. Same shape as
 * readAvatarFile's: the url is ours -- it was built here from a uuid -- but it
 * arrives via the database, so the basename is taken and the directory is not.
 */
function storyImagePath(url: string): string | undefined {
  const name = path.basename(url);
  if (!/^story_[0-9a-f-]+\.png$/i.test(name)) return undefined;
  return path.join(STORY_IMAGE_DIR, name);
}

/**
 * A story's own picture, as a reference for the next one.
 *
 * This is what keeps the people a story invented -- a hero of faith, a
 * shopkeeper, anyone with no character sheet and so no portrait -- looking
 * like themselves across a book. They have nothing else: hero.imageUrl is on
 * the schema and empty for all eighty of them, and a fresh description draws
 * a fresh person every time.
 */
export async function readStoryImageFile(url: string): Promise<PictureFile | undefined> {
  try {
    const file = storyImagePath(url);
    if (!file) return undefined;
    return { data: await fs.promises.readFile(file), filename: path.basename(file), type: "image/png" };
  } catch {
    return undefined;
  }
}

/** Remove a picture's file. Used only by the delete route, which asks first. */
export async function deleteStoryImage(url: string): Promise<void> {
  try {
    const file = storyImagePath(url);
    if (!file) return;
    await fs.promises.rm(file, { force: true });
  } catch (error) {
    // An orphaned file is not worth failing a delete over.
    console.error(`[illustration] could not remove the picture ${url}:`, error);
  }
}
