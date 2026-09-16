/**
 * Turning a highlighted passage into something an illustrator can draw.
 *
 * WHY THE PASSAGE IS NOT THE PROMPT. Hand an image model two hundred words of
 * story and it draws every noun in them at once: the lantern, the rain, the
 * shelves, the man, the boy, the book, all fighting for one frame. Blake, on
 * being asked: "we can't just send the text. that will not work. we need to
 * take the context of what was highlighted."
 *
 * WHY THIS IS THE SAME CALL THE END-OF-STORY PICTURE ALREADY MAKES.
 * `finalizeStoryDetails` asks a model for an `imagePrompt` given the story and
 * the brief's "image" projection, and the pictures that come out of it are
 * good. This is that call pointed at one moment instead of a whole story --
 * "it is just a bit in the AI face HEY, WE WANT A PICTURE OF THIS SPECIFIC
 * MOMENT. with all the same parameters as before." So the brief goes in
 * verbatim through renderBrief, not paraphrased here: a second description of
 * who the cast are is how this codebase grew six model lists.
 *
 * WHY IT READS THE WHOLE STORY. It used to see the highlighted words and the
 * brief and nothing else, so it had to guess who "she" was, where everyone was
 * standing and what they wore. "They crossed to the shop together" came back
 * as Mr Barnabas's shop "in ancient Susa", both girls in Persian dress -- the
 * shop is in the present day, and the cover montage had drawn it right
 * (2026-09-15). Blake: accuracy is what the app is for, "yet, lets try to be
 * clever where we can". So the story goes FIRST and everything that changes
 * between pictures goes last: OpenAI caches a repeated start of a prompt, and
 * the second picture of a story then pays a fraction for the story it re-reads.
 *
 * WHAT THIS DOES NOT DO: the faces. Those are reference images on the image
 * call itself (`illustrationCast`), exactly as they are for the end-of-story
 * picture, and nothing about that changes because the scene came from a
 * highlight rather than from the whole story. It does keep the LOOK BOOK
 * (shared/lookBook.ts) for everyone who has no face to attach.
 *
 * A second call in its own module, like diggingDeeper -- the pattern this
 * follows, down to taking a resolved client and model rather than resolving
 * its own.
 */

import type OpenAI from "openai";
import { requestModelJson, TOKEN_BUDGET } from "./openai-implementation";
import type { ModelCallContext } from "./modelCalls";
import { temperatureFor, tokenLimitFor } from "./modelPolicy";
// The cap the route already refuses on. One number: a second copy here would
// be a slice that silently disagrees with a 400.
import { MAX_PASSAGE_CHARS } from "@shared/schema";
import { PICTURE_ID_REMINDER } from "@shared/family";
import { renderLookBook, type LookBook } from "@shared/lookBook";
import { renderPictureNoteSection } from "@shared/pictureNote";

const SYSTEM =
  "You are a helpful assistant. Given one moment from a story, you write a single short description for an illustrator.";

/**
 * How much story the scene writer reads, about 15k tokens. A long quest is
 * ~25k characters, so this is "the whole story" for everything written today;
 * past it, the part around the passage is sent instead of a cut-off one.
 */
export const MAX_SCENE_STORY_CHARS = 60_000;
/** The lead-in quoted before the passage, so a repeated line is findable. */
export const BEFORE_CHARS = 300;

const PICTURE_ID = /\[[0-9a-f]{6,32}\]/;

/**
 * Where the passage sits in the story, or -1.
 *
 * A story for children repeats itself, so a quote can occur more than once;
 * the occurrence in the paragraph nearest the reader's block index wins. The
 * index counts the reader's blocks, which are close to blank-line paragraphs
 * and not identical -- close is all this needs.
 *
 * Matched on the passage's first line only: a selection across paragraphs
 * comes back with whatever whitespace the browser chose between them.
 */
export function findPassage(story: string, passage: string, blockIndex?: number): number {
  const probe = passage.trim().split(/\n/)[0]?.trim().slice(0, 120) ?? "";
  if (!probe) return -1;
  const hits: number[] = [];
  for (let at = story.indexOf(probe); at !== -1; at = story.indexOf(probe, at + 1)) hits.push(at);
  if (hits.length <= 1 || blockIndex === undefined) return hits[0] ?? -1;
  const paragraphOf = (at: number) => story.slice(0, at).split(/\n\s*\n/).length - 1;
  return hits.reduce((best, at) =>
    Math.abs(paragraphOf(at) - blockIndex) < Math.abs(paragraphOf(best) - blockIndex) ? at : best,
  );
}

/**
 * The story, or the part of it around the passage when it is too long.
 * Three quarters before, a quarter after: what a moment needs is mostly what
 * led to it.
 */
export function storyForScene(story: string, at: number, max = MAX_SCENE_STORY_CHARS): string {
  const text = story.trim();
  if (text.length <= max) return text;
  const centre = at < 0 ? text.length : at;
  const start = Math.max(0, Math.min(centre - Math.floor(max * 0.75), text.length - max));
  return `${start > 0 ? "[…]\n" : ""}${text.slice(start, start + max)}${start + max < text.length ? "\n[…]" : ""}`;
}

export type PassageSceneOptions = {
  title: string;
  passage: string;
  brief?: string;
  /** The story's body, appendices already removed. */
  story?: string;
  /** Where in the reader the passage was chosen, to tell repeated lines apart. */
  blockIndex?: number;
  outline?: string[];
  /** The prompt the story's cover was drawn from. */
  coverPrompt?: string;
  lookBook?: LookBook;
  /**
   * What the reader asked for in this picture. NEVER in `prefix`: it is the one
   * thing that changes from picture to picture within a story, and the prefix
   * is the cached part every picture of it shares.
   */
  note?: string;
};

/**
 * The prompt, pure and exported so a test can read it without spending a cent.
 *
 * `brief` is `renderBrief(brief, "image")` -- passed in already rendered, so
 * this module never learns what a brief is.
 *
 * With no `story` it renders the passage-only prompt it always did, byte for
 * byte: that is what a local model gets, whose context cannot hold a story.
 */
export function buildPassageScenePrompt(opts: PassageSceneOptions): string {
  const { prefix, rest } = passageScenePromptParts(opts);
  return prefix ? `${prefix}\n\n${rest}` : rest;
}

/**
 * The prompt in two pieces: what is the same for every picture of this story,
 * and what is not. The request marks the end of `prefix` as a cache
 * breakpoint -- on gpt-5.6 the automatic breakpoint lands wherever OpenAI
 * chooses, and measured on the first real test it covered the whole prompt,
 * passage included, so the second picture of the same story re-read the story
 * at full price (input_cached 0, cache_write 6,707 twice). `prefix` is "" for
 * the passage-only prompt, which is short and never cached.
 */
export function passageScenePromptParts(opts: PassageSceneOptions): { prefix: string; rest: string } {
  const brief = opts.brief?.trim();
  const passage = opts.passage.trim().slice(0, MAX_PASSAGE_CHARS);
  const story = opts.story?.trim();
  // Empty without one, and every entry here is filtered out when empty, so a
  // picture asked for with no note renders the prompt it always did.
  const asked = renderPictureNoteSection(opts.note);
  if (!story) {
    const rest = [
      `This is one moment from a story called "${opts.title}".`,
      "---",
      passage,
      "---",
      asked,
      // The instruction the whole feature turns on. Without it the model writes
      // a prompt for the story, because that is what it has been asked for
      // everywhere else, and every picture in the book comes out the same.
      "Describe a picture of THIS MOMENT and nothing else: what is happening here,",
      "who is in it, and where. Not a summary of the story, not a later moment,",
      "not a cover. One scene, as an illustrator would need it.",
      // THE BRIEF SAYS WHO, THE PASSAGE SAYS WHERE, and that needs saying out
      // loud. renderBrief's image projection is "<the lead> -- a scene from <the
      // account>", so the setting rides along with the cast -- and the first real
      // generation put a moment set in Barnabas's shop "in the world of William
      // Tyndale", because the brief named Tyndale and the model believed it over
      // the passage in front of it.
      brief
        ? `The illustration must match the character, so carry this into the image prompt:\n${brief}\n\n` +
          "Take only WHO the people are from that. Where this happens, and what is " +
          "happening, come from the passage above and from nothing else." +
          (PICTURE_ID.test(brief) ? ` ${PICTURE_ID_REMINDER}` : "")
        : "",
      'Respond with ONLY a valid JSON object: { "imagePrompt": "..." }',
    ]
      .filter(Boolean)
      .join("\n\n");
    return { prefix: "", rest };
  }

  const at = findPassage(story, passage, opts.blockIndex);
  const before = at > 0 ? story.slice(Math.max(0, at - BEFORE_CHARS), at).trim() : "";
  const outline = (opts.outline ?? []).map((part) => part.trim()).filter(Boolean);
  const cover = opts.coverPrompt?.trim();
  const book = renderLookBook(opts.lookBook ?? {});

  const prefix = [
    // ---- The same for every picture of this story: the cached start. ----
    `This is a story called "${opts.title}". One moment from it is to be drawn.`,
    `=== THE STORY ===\n${storyForScene(story, at)}`,
    outline.length ? `=== ITS CHAPTER PLAN ===\n${outline.map((p, i) => `${i + 1}. ${p}`).join("\n")}` : "",
    brief ? `=== WHO IS IN IT ===\n${brief}` : "",
    // The cover montage is the one picture of this story that shows most of
    // its people, and the words it was drawn from say how they looked. Looks
    // only: a cover shows six moments, and this picture is one other moment.
    cover
      ? "=== HOW THE COVER DREW THEM ===\n" +
        "The story's cover picture was drawn from this. Use it only for how people and places LOOK " +
        `and what they wear -- never for what is happening now.\n${cover}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const rest = [
    // ---- What changes from picture to picture: after the story. ----
    book
      ? "=== THE LOOK BOOK ===\n" +
        "How people this story has already drawn look. These sentences are added to the picture " +
        "WORD FOR WORD for anyone in it, so never describe these people differently -- no other " +
        `hair, age or clothes.\n${book}`
      : "",
    "=== THE MOMENT TO DRAW ===",
    before ? `It comes straight after: "…${before}"` : "",
    `---\n${passage}\n---`,
    asked,
    "Describe a picture of THIS MOMENT and nothing else: what is happening here,\n" +
      "who is in it, and where. Not a summary of the story, not a later moment,\n" +
      "not a cover. One scene, as an illustrator would need it.",
    // An image model cannot see the story. A shop full of old things, with a
    // Persian montage beside it as a style reference, was drawn in Persian dress
    // although the scene never said so -- so the scene must say when it is and
    // what everyone has on, in so many words.
    // "In the present day," is read by the server (isPresentDayScene), which
    // then keeps a traveller in their own clothes -- so it is asked for exactly.
    "Begin the image prompt with when and where this is: a scene set now starts with exactly " +
      "\"In the present day,\" and any other starts \"In <place>, in <era>,\". Say what each person " +
      "in the picture is wearing.",
    // The story is read to UNDERSTAND the moment, not to draw more of it.
    "Read the story up to this moment to understand it: who each he, she and they is; where " +
      "everyone physically is right now (the present day or the far side, and which room, street " +
      "or field); what each person is wearing at this point, colours included, as last described " +
      "or drawn; and who is actually there, as opposed to only seen, remembered or spoken of. " +
      "What is happening comes from the moment itself.",
    brief
      ? "Who the people in WHO IS IN IT are, and what they wear, come from there." +
        (PICTURE_ID.test(brief) ? ` ${PICTURE_ID_REMINDER}` : "")
      : "",
    // The look book is written here, one person at a time, as they are drawn.
    "For each person in this picture who has no picture ID and is not in the look book, write " +
      "one sentence of how they look -- age, build, face, hair, and clothing with its colours -- " +
      "true to the story, and describe them the same way in the image prompt. Name " +
      'each as the story tells them apart from anyone who shares their name ("Queen Esther", not ' +
      '"Esther"). Leave out anyone with a picture ID.',
    'Respond with ONLY a valid JSON object: { "imagePrompt": "...", "looks": { "<name>": "<one sentence>" } }' +
      " -- looks holds only people new to the look book, and is {} when there are none.",
  ]
    .filter(Boolean)
    .join("\n\n");

  return { prefix, rest };
}

export type PassageScene = { imagePrompt: string; looks?: Record<string, unknown> };

/**
 * Ask for it. Returns undefined rather than throwing, on everything.
 *
 * The caller falls back to the passage itself, which draws a worse picture but
 * draws one -- generateStoryImage's reasoning, and for the same reason: this
 * runs inside a request a person is waiting on, and a failed sentence is not
 * worth failing the picture over. A reply without `looks` is a good reply:
 * the look book is never worth a retry.
 */
export async function sceneFromPassage(
  client: OpenAI,
  model: string,
  opts: PassageSceneOptions & { ledger?: ModelCallContext; cacheKey?: string },
): Promise<PassageScene | undefined> {
  const { prefix, rest } = passageScenePromptParts(opts);
  const user = prefix ? `${prefix}\n\n${rest}` : rest;
  const debugData: unknown[] = [];
  try {
    return await requestModelJson<PassageScene>({
      step: "passageScene",
      model,
      ledger: opts.ledger,
      debugData: debugData as any[],
      maxTokens: TOKEN_BUDGET.json,
      prompt: user,
      call: async (maxTokens) => {
        const response = await client.chat.completions.create({
          model,
          messages: [
            { role: "system", content: SYSTEM },
            prefix
              ? {
                  role: "user",
                  content: [
                    // The breakpoint is the END of the story part. "explicit"
                    // turns off the automatic one, which would otherwise be
                    // written (at 1.25x) over a prefix no later picture shares.
                    { type: "text", text: `${prefix}\n\n`, prompt_cache_breakpoint: { mode: "explicit" } },
                    { type: "text", text: rest },
                  ],
                }
              : { role: "user", content: user },
          ],
          ...(prefix
            ? { prompt_cache_options: { mode: "explicit" as const }, ...(opts.cacheKey ? { prompt_cache_key: opts.cacheKey } : {}) }
            : {}),
          response_format: { type: "json_object" },
          // Warm enough to compose a picture, cool enough not to invent a
          // scene the passage does not contain.
          ...temperatureFor(model, 0.4),
          ...tokenLimitFor(model, maxTokens),
        });
        return {
          content: response.choices[0]?.message?.content ?? "",
          finishReason: response.choices[0]?.finish_reason,
          usage: response.usage,
        };
      },
      validate: validateScene,
    });
  } catch (error) {
    console.error("[passageScene] could not describe the passage:", error);
    return undefined;
  }
}

/** Exported for tests: `looks` is optional and never the reason to refuse. */
export function validateScene(parsed: any): PassageScene | undefined {
  if (typeof parsed?.imagePrompt !== "string" || !parsed.imagePrompt.trim()) return undefined;
  const looks = parsed.looks && typeof parsed.looks === "object" && !Array.isArray(parsed.looks)
    ? (parsed.looks as Record<string, unknown>)
    : undefined;
  return { imagePrompt: parsed.imagePrompt.trim(), ...(looks ? { looks } : {}) };
}
