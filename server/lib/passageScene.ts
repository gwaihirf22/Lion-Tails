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
 * WHAT THIS DOES NOT DO: the faces. Those are reference images on the image
 * call itself (`illustrationCast`), exactly as they are for the end-of-story
 * picture, and nothing about that changes because the scene came from a
 * highlight rather than from the whole story.
 *
 * A second call in its own module, like diggingDeeper -- the pattern this
 * follows, down to taking a resolved client and model rather than resolving
 * its own.
 */

import type OpenAI from "openai";
import { requestModelJson, TOKEN_BUDGET } from "./openai-implementation";
import { temperatureFor, tokenLimitFor } from "./modelPolicy";
// The cap the route already refuses on. One number: a second copy here would
// be a slice that silently disagrees with a 400.
import { MAX_PASSAGE_CHARS } from "@shared/schema";

const SYSTEM =
  "You are a helpful assistant. Given one moment from a story, you write a single short description for an illustrator.";

/**
 * The prompt, pure and exported so a test can read it without spending a cent.
 *
 * `brief` is `renderBrief(brief, "image")` -- passed in already rendered, so
 * this module never learns what a brief is.
 */
export function buildPassageScenePrompt(opts: {
  title: string;
  passage: string;
  brief?: string;
}): string {
  const brief = opts.brief?.trim();
  return [
    `This is one moment from a story called "${opts.title}".`,
    "---",
    opts.passage.trim().slice(0, MAX_PASSAGE_CHARS),
    "---",
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
        "happening, come from the passage above and from nothing else."
      : "",
    'Respond with ONLY a valid JSON object: { "imagePrompt": "..." }',
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Ask for it. Returns undefined rather than throwing, on everything.
 *
 * The caller falls back to the passage itself, which draws a worse picture but
 * draws one -- generateStoryImage's reasoning, and for the same reason: this
 * runs inside a request a person is waiting on, and a failed sentence is not
 * worth failing the picture over.
 */
export async function sceneFromPassage(
  client: OpenAI,
  model: string,
  opts: { title: string; passage: string; brief?: string },
): Promise<string | undefined> {
  const user = buildPassageScenePrompt(opts);
  const debugData: unknown[] = [];
  try {
    const reply = await requestModelJson<{ imagePrompt: string }>({
      step: "passageScene",
      model,
      debugData: debugData as any[],
      maxTokens: TOKEN_BUDGET.json,
      prompt: user,
      call: async (maxTokens) => {
        const response = await client.chat.completions.create({
          model,
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
          // Warm enough to compose a picture, cool enough not to invent a
          // scene the passage does not contain.
          ...temperatureFor(model, 0.4),
          ...tokenLimitFor(model, maxTokens),
        });
        return {
          content: response.choices[0]?.message?.content ?? "",
          finishReason: response.choices[0]?.finish_reason,
        };
      },
      validate: (parsed) =>
        typeof parsed?.imagePrompt === "string" && parsed.imagePrompt.trim()
          ? { imagePrompt: parsed.imagePrompt.trim() }
          : undefined,
    });
    return reply.imagePrompt;
  } catch (error) {
    console.error("[passageScene] could not describe the passage:", error);
    return undefined;
  }
}
