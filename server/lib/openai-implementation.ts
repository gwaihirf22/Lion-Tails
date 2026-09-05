import OpenAI from "openai";
import { StoryRequest, StoryResponse } from "@shared/schema";
import {
  buildStoryBrief,
  buildSystemPrompt,
  resolveStoryCharacter,
  type CustomPrompts,
} from "./storyBrief";

/**
 * Everything the prompts need about what the user asked for, resolved once per
 * request and threaded through every prompt site.
 *
 * Built once rather than per-helper: resolving the character does a database
 * read, and duplicating the field list across helpers is what let them drift
 * apart until only four of the twenty-two request fields reached a prompt.
 */
type StoryContext = {
  brief: string;
  systemPrompt: string;
  custom?: CustomPrompts;
  /** Resolved once per request; every chat call in this file uses it. */
  resolved: ResolvedModel;
};
import { getBibleVerseByTheme } from "../data/bibleVerses";
import { storage } from "../storage";
import { StoryGenerationError, modelOutputAdvice, modelTruncatedAdvice } from "./storyErrors";
import { resolveModel, createClient, type ResolvedModel } from "./modelPolicy";
import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import { v4 as uuidv4 } from "uuid";

// Credentials, provider and model are decided exclusively by
// resolveModel() in ./modelPolicy. Nothing here should read
// process.env.OPENAI_API_KEY or hardcode a model name -- five hardcoded
// "gpt-4o" sites were five places for the policy to drift.

// Helper function to get word count from length setting
function getWordCountFromLength(length: string): number {
  // Reading time is ~140 words per minute for children.
  switch (length) {
    case "very-short":
      return 500; // ~3 minutes
    case "short":
      return 1000; // ~6 minutes
    case "medium":
      return 1500; // ~11 minutes
    case "long":
      return 2500; // ~18 minutes
    case "extended":
      return 3500; // ~25 minutes
    default:
      return 1500;
  }
}

// Helper function to count words in text
function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => word.length > 0).length;
}

// =========================================================================
// HELPER FUNCTIONS (DEFINED BEFORE THEY ARE USED)
// =========================================================================

/**
 * Token budgets.
 *
 * Sized for reasoning PLUS output, not output alone. gpt-oss:20b is a thinking
 * model: its internal reasoning is billed to completion_tokens and counts
 * against max_tokens. At 2048 it reasoned for the entire budget and emitted
 * zero visible content -- finish_reason "length", 2048 completion tokens, an
 * empty string -- so JSON.parse("") threw "Unexpected end of JSON input". The
 * model was not bad at JSON; it never reached the JSON.
 *
 * That single cause explained the whole failure pattern: every call site at
 * 2048 failed and the only site at 4096 worked, across two different models.
 * Named constants rather than five scattered literals, because scattered
 * duplicates of the same number are how this codebase has produced most of its
 * bugs.
 */
const TOKEN_BUDGET = {
  /** One-shot story, outline, or finalisation. Generous headroom for reasoning. */
  json: 8192,
  /** A single chapter of prose. */
  chapter: 4096,
} as const;

/**
 * Total context window, shared between prompt AND output.
 *
 * This is the ceiling the retry escalation has to respect. Doubling the output
 * budget past it does nothing: the local Ollama deployment runs a 16384-token
 * context, so a request with a 4000-token prompt can never produce more than
 * ~12000 tokens of output no matter what max_tokens says. Ollama also disables
 * KV cache shifting for this context, so there is no graceful overflow.
 *
 * Sizing a budget without counting everything that shares it is the same
 * mistake as the original 2048 bug, one level up. Configurable because raising
 * Ollama's context (OLLAMA_CONTEXT_LENGTH) is cheap on a sliding-window model
 * and is under consideration.
 */
const MODEL_CONTEXT_LIMIT = Number(process.env.MODEL_CONTEXT_LIMIT) || 16384;

type ModelUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

type ModelReply = {
  content: string;
  finishReason: string | null | undefined;
  usage?: ModelUsage | null;
};

/**
 * Budget for the next attempt after a truncation, or null when retrying is
 * pointless.
 *
 * Doubles, but clamps to what actually remains in the context window after the
 * prompt. If that leaves no more room than the attempt that just failed, there
 * is nothing to gain from an identical call -- fail immediately rather than
 * spending it.
 */
function nextTokenBudget(current: number, usage?: ModelUsage | null): number | null {
  const doubled = current * 2;
  const promptTokens = usage?.prompt_tokens;

  if (typeof promptTokens !== "number") {
    // No measurement available; double, but never past the whole window.
    const capped = Math.min(doubled, MODEL_CONTEXT_LIMIT);
    return capped > current ? capped : null;
  }

  const headroom = MODEL_CONTEXT_LIMIT - promptTokens;
  const capped = Math.min(doubled, headroom);
  return capped > current ? capped : null;
}

/**
 * Runs a model call, retrying once, and records the evidence either way.
 *
 * Three things this fixes.
 *
 * The raw reply is recorded BEFORE parsing, so a bad reply is still in
 * debugData when it throws. JSON.parse used to be called inside the
 * debugData.push() argument, so it threw before the push completed and the
 * evidence was destroyed at exactly the moment it was needed.
 *
 * finish_reason is read. It is present on every response and was checked
 * nowhere, yet it says unambiguously "I was truncated" -- turning a cryptic
 * SyntaxError into an accurate message. Truncation is retried with a DOUBLED
 * budget, because unlike malformed output it is a resource problem rather than
 * a capability one.
 *
 * usage is recorded. Also previously unread at every call site.
 */
async function requestModelJson<T>(opts: {
  step: string;
  model: string;
  storyLength?: string;
  debugData: any[];
  maxTokens: number;
  prompt?: string;
  call: (maxTokens: number) => Promise<ModelReply>;
  /**
   * Narrows a parsed reply, or returns undefined if it is the wrong shape.
   *
   * Well-formed JSON with the wrong keys is a realistic failure for a weaker
   * model -- arguably likelier than syntactically broken JSON -- and it used to
   * bypass all of this: the outline's missing-field check threw a plain Error
   * downstream, so it surfaced as a bare 500 with no advice and no retry. A
   * wrong shape is a model-output problem like any other, and the model may
   * well get it right on a second attempt.
   */
  validate?: (parsed: any) => T | undefined;
}): Promise<T> {
  const { step, model, storyLength, debugData, prompt } = opts;
  const maxAttempts = 2;
  let budget = opts.maxTokens;
  let lastError: unknown;
  let truncated = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const reply = await opts.call(budget);

    debugData.push({
      step,
      attempt,
      maxAttempts,
      maxTokens: budget,
      prompt,
      response: reply.content,
      finishReason: reply.finishReason,
      usage: reply.usage,
    });

    if (reply.finishReason === "length") {
      truncated = true;
      if (attempt < maxAttempts) {
        const next = nextTokenBudget(budget, reply.usage);
        if (next === null) {
          console.warn(
            `${step}: truncated at max_tokens=${budget} with no context headroom left ` +
              `(prompt ${reply.usage?.prompt_tokens ?? "?"} of ${MODEL_CONTEXT_LIMIT}); not retrying.`,
          );
          break;
        }
        budget = next;
        console.warn(
          `${step}: model output was truncated (finish_reason=length); retrying with max_tokens=${budget}`,
        );
        continue;
      }
      break;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(reply.content);
    } catch (error) {
      truncated = false;
      lastError = error;
      debugData[debugData.length - 1].parseError =
        error instanceof Error ? error.message : String(error);
      if (attempt < maxAttempts) {
        console.warn(`${step}: reply was not valid JSON, retrying (${attempt}/${maxAttempts})`);
      }
      continue;
    }

    const validated = opts.validate ? opts.validate(parsed) : (parsed as T);
    if (validated !== undefined) {
      return validated;
    }

    truncated = false;
    lastError = new Error("model reply did not match the expected shape");
    debugData[debugData.length - 1].shapeError =
      `expected keys were missing; got: ${Object.keys(parsed ?? {}).join(", ") || "(not an object)"}`;
    if (attempt < maxAttempts) {
      console.warn(`${step}: reply was valid JSON but the wrong shape, retrying (${attempt}/${maxAttempts})`);
    }
  }

  if (truncated) {
    throw new StoryGenerationError("model_output_truncated", modelTruncatedAdvice(model, storyLength), {
      debugData,
    });
  }
  throw new StoryGenerationError("model_output_invalid", modelOutputAdvice(model, storyLength), {
    cause: lastError,
    debugData,
  });
}

/**
 * The prose counterpart of requestModelJson.
 *
 * Chapters are not JSON, so truncation cannot surface as a parse error -- it
 * would silently yield a story that stops mid-sentence. It still gets the same
 * remedy as the JSON sites: finish_reason "length" is a resource problem, so
 * retry once at double the budget before treating it as fatal.
 *
 * Symmetry matters here beyond tidiness. This path has usually already spent
 * several paid calls by the time it fails, so throwing on the first truncation
 * discards every completed chapter.
 */
async function requestModelText(opts: {
  step: string;
  model: string;
  storyLength?: string;
  debugData: any[];
  maxTokens: number;
  prompt?: string;
  call: (maxTokens: number) => Promise<ModelReply>;
}): Promise<string> {
  const { step, model, storyLength, debugData, prompt } = opts;
  const maxAttempts = 2;
  let budget = opts.maxTokens;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const reply = await opts.call(budget);

    debugData.push({
      step,
      attempt,
      maxAttempts,
      maxTokens: budget,
      prompt,
      finishReason: reply.finishReason,
      usage: reply.usage,
      wordCount: countWords(reply.content),
    });

    if (reply.finishReason !== "length") {
      return reply.content;
    }

    if (attempt < maxAttempts) {
      const next = nextTokenBudget(budget, reply.usage);
      if (next === null) {
        console.warn(
          `${step}: truncated at max_tokens=${budget} with no context headroom left ` +
            `(prompt ${reply.usage?.prompt_tokens ?? "?"} of ${MODEL_CONTEXT_LIMIT}); not retrying.`,
        );
        break;
      }
      budget = next;
      console.warn(
        `${step}: chapter was truncated (finish_reason=length); retrying with max_tokens=${budget}`,
      );
    }
  }

  throw new StoryGenerationError("model_output_truncated", modelTruncatedAdvice(model, storyLength), {
    debugData,
  });
}

// <<< NEW HELPER for Short Stories (Single API Call) >>>
async function generateShortStorySingleCall(
  client: OpenAI,
  request: StoryRequest,
  wordCount: number,
  debugData: any[],
  ctx: StoryContext,
): Promise<{
  title: string;
  content: string;
  applicationQuestions: string[];
  imagePrompt: string;
}> {
  const systemPrompt = ctx.systemPrompt;
  const userPrompt = `
    ${ctx.custom?.userPrompt || "Please create a complete, faith-based children's story."}

    Details:
    ${ctx.brief}

    CRITICAL INSTRUCTION: The entire story's content MUST be approximately ${wordCount} words long.

    Respond with a single, valid JSON object with the following structure:
    {
      "title": "A creative story title",
      "content": "The full story text, approximately ${wordCount} words.",
      "applicationQuestions": ["Question 1", "Question 2", "Question 3", "Question 4", "Question 5"],
      "imagePrompt": "A short description for an illustrator for a key scene."
    }
  `;

  const parsed = await requestModelJson<{
    title: string;
    content: string;
    applicationQuestions: string[];
    imagePrompt: string;
  }>({
    step: "generateShortStorySingleCall",
    model: ctx.resolved.model,
    storyLength: request.storyLength,
    debugData,
    maxTokens: TOKEN_BUDGET.json,
    prompt: userPrompt,
    call: async (maxTokens) => {
      const response = await client.chat.completions.create({
        model: ctx.resolved.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: maxTokens,
      });
      return {
        content: response.choices[0].message.content || "",
        finishReason: response.choices[0].finish_reason,
        usage: response.usage,
      };
    },
    validate: (value) =>
      typeof value?.title === "string" && typeof value?.content === "string" ? value : undefined,
  });

  debugData[debugData.length - 1].wordCount = countWords(parsed.content || "");
  return parsed;
}

// HELPER for Long Stories (Outline Generation)
async function generateStoryOutline(
  client: OpenAI,
  request: StoryRequest,
  wordCount: number,
  debugData: any[],
  ctx: StoryContext,
): Promise<string[]> {
  const numberOfChapters = Math.ceil(wordCount / 500);

  const systemPrompt = `${ctx.systemPrompt} Your task is to create a detailed plan for a story.`;
  const userPrompt = `
    Please create a chapter-by-chapter outline for a Christian children's story.
    The final story should be approximately ${wordCount} words long.

    The story must be built around these details:
    ${ctx.brief}

    Instructions:
    Create a detailed outline with EXACTLY ${numberOfChapters} parts. Each part must be a distinct scene or chapter that builds the story.

    Respond with ONLY a valid JSON object in the format: { "outline": ["Chapter 1...", "Chapter 2...", ...] }
  `;

  const parsed = await requestModelJson<{ outline: string[] }>({
    step: "generateOutline",
    model: ctx.resolved.model,
    storyLength: request.storyLength,
    debugData,
    maxTokens: TOKEN_BUDGET.json,
    prompt: userPrompt,
    call: async (maxTokens) => {
      const response = await client.chat.completions.create({
        model: ctx.resolved.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: maxTokens,
      });
      return {
        content: response.choices[0].message.content || "",
        finishReason: response.choices[0].finish_reason,
        usage: response.usage,
      };
    },
    validate: (value) =>
      Array.isArray(value?.outline) && value.outline.length > 0 ? value : undefined,
  });
  return parsed.outline;
}

// HELPER for Long Stories (Chapter Generation)
async function generateStoryChapter(
  client: OpenAI,
  request: StoryRequest,
  chapterOutline: string,
  storySoFar: string,
  debugData: any[],
  ctx: StoryContext,
): Promise<string> {
  const { storyLength } = request;
  const totalWordCount = getWordCountFromLength(storyLength || "medium");
  const numberOfChapters = Math.max(3, Math.ceil(totalWordCount / 500));
  const wordCountPerChapter = totalWordCount / numberOfChapters;

  const systemPrompt = `${ctx.systemPrompt} Continue writing a story based on the context provided. Focus ONLY on writing the current part of the story. Do NOT summarize or add titles/questions.`;
  const userPrompt = `
      The story's agreed details, which must stay consistent across chapters:
      ${ctx.brief}

      Here is the story so far:
      ---
      ${storySoFar || "This is the very first chapter."}
      ---

      Now, write the next part of the story based on this instruction: "${chapterOutline}"

      CRITICAL INSTRUCTION: Write a detailed chapter of AT LEAST ${Math.round(wordCountPerChapter)} words.
    `;

  return await requestModelText({
    step: `generateChapter: ${chapterOutline.substring(0, 30)}...`,
    model: ctx.resolved.model,
    storyLength: request.storyLength,
    debugData,
    maxTokens: TOKEN_BUDGET.chapter,
    prompt: userPrompt,
    call: async (maxTokens) => {
      const response = await client.chat.completions.create({
        model: ctx.resolved.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: maxTokens,
      });
      return {
        content: response.choices[0].message.content || "",
        finishReason: response.choices[0].finish_reason,
        usage: response.usage,
      };
    },
  });
}

// HELPER for Long Stories (Final Details)
async function finalizeStoryDetails(
  client: OpenAI,
  fullStory: string,
  debugData: any[],
  ctx: StoryContext,
): Promise<{
  title: string;
  applicationQuestions: string[];
  imagePrompt: string;
}> {
  const systemPrompt = `You are a helpful assistant. Based on the provided story, generate a title, 5 application questions, and an image prompt.`;
  const userPrompt = `
    Here is the complete children's story:
    ---
    ${fullStory}
    ---

    The illustration must match the character as described here, so carry the
    appearance details into the image prompt:
    ${ctx.brief}

    Respond with ONLY a valid JSON object: { "title": "...", "applicationQuestions": ["...", "...", "..."], "imagePrompt": "..." }
  `;

  // This prompt embeds the entire assembled story, so it has the least headroom
  // of any call site -- which is why it was the one that broke "long".
  return await requestModelJson<{
    title: string;
    applicationQuestions: string[];
    imagePrompt: string;
  }>({
    step: "finalizeStoryDetails",
    model: ctx.resolved.model,
    debugData,
    maxTokens: TOKEN_BUDGET.json,
    prompt: userPrompt,
    call: async (maxTokens) => {
      const response = await client.chat.completions.create({
        model: ctx.resolved.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.6,
        max_tokens: maxTokens,
      });
      return {
        content: response.choices[0].message.content || "",
        finishReason: response.choices[0].finish_reason,
        usage: response.usage,
      };
    },
    validate: (value) =>
      typeof value?.title === "string" && Array.isArray(value?.applicationQuestions)
        ? value
        : undefined,
  });

}

// =========================================================================
// MAIN ORCHESTRATOR FUNCTION (NOW WITH HYBRID LOGIC)
// =========================================================================
export async function generateStoryWithOpenAI(
  request: StoryRequest,
  userId: number = 1,
  // Parent Mode prompts. openai.ts has always constructed and passed these,
  // but the parameter did not exist, so they were silently discarded and the
  // call was a type error.
  customPrompts?: CustomPrompts,
): Promise<StoryResponse & { debugData?: any[] }> {
  const { storyLength, theme } = request;

  // Model, provider and credentials are decided once, here, and used by every
  // call below. The stored preference is a request, not a permission: a user
  // who picked a premium model and then removed their own API key is
  // downgraded rather than billed to the server owner.
  const resolved = await resolveModel(userId, "chat");
  if (!resolved) {
    throw new StoryGenerationError(
      "no_model_available",
      "No story model is available for your account. Add your own OpenAI API key in Settings, or choose a local model if one is configured.",
    );
  }
  const openaiClient = createClient(resolved);
  const targetWordCount = getWordCountFromLength(storyLength || "medium");

  // Resolved once and shared by every prompt: one database read, one field
  // list, no opportunity for the prompt sites to drift apart again.
  const character = await resolveStoryCharacter(request, userId);
  const ctx: StoryContext = {
    brief: buildStoryBrief(request, character),
    systemPrompt: buildSystemPrompt(request, customPrompts),
    custom: customPrompts,
    resolved,
  };
  const debugData: any[] = [];
  const moralOutcomes: Array<
    "positive" | "learning" | "consequences" | "creative"
  > = ["positive", "learning", "consequences", "creative"];
  const moralOutcome = moralOutcomes[Math.floor(Math.random() * 4)];

  console.log(`Starting story generation. Target: ${targetWordCount} words.`);

  try {
    let finalDetails: {
      title: string;
      content: string;
      applicationQuestions: string[];
      imagePrompt: string;
    };

    // <<< HYBRID LOGIC >>>
    // Use the right tool for the job based on length
    if (targetWordCount < 1000) {
      // --- SINGLE-CALL METHOD FOR SHORT STORIES ---
      console.log("Using single-call method for short story.");
      const shortStoryResult = await generateShortStorySingleCall(
        openaiClient,
        request,
        targetWordCount,
        debugData,
        ctx,
      );
      finalDetails = {
        title: shortStoryResult.title,
        content: shortStoryResult.content,
        applicationQuestions: shortStoryResult.applicationQuestions,
        imagePrompt: shortStoryResult.imagePrompt,
      };
    } else {
      // --- MULTI-STEP METHOD FOR LONG STORIES ---
      console.log("Using multi-step method for long story.");

      // Step 1: Outline
      const outline = await generateStoryOutline(
        openaiClient,
        request,
        targetWordCount,
        debugData,
        ctx,
      );
      // Backstop only: requestModelJson now validates the shape and retries, so
      // an empty outline reaching here means something upstream changed.
      if (!outline || outline.length === 0) {
        throw new StoryGenerationError(
          "model_output_invalid",
          modelOutputAdvice(ctx.resolved.model, request.storyLength),
          { debugData },
        );
      }

      // Step 2: Chapters
      let fullStoryContent = "";
      for (let i = 0; i < outline.length; i++) {
        console.log(` - Generating part ${i + 1}/${outline.length}...`);
        const chapterContent = await generateStoryChapter(
          openaiClient,
          request,
          outline[i],
          fullStoryContent,
          debugData,
          ctx,
        );
        fullStoryContent += (fullStoryContent ? "\n\n" : "") + chapterContent;
        console.log(
          ` - Part ${i + 1} added. Word count: ${countWords(fullStoryContent)}`,
        );
      }

      // Step 3: Final Details
      const finalizedParts = await finalizeStoryDetails(
        openaiClient,
        fullStoryContent,
        debugData,
        ctx,
      );
      finalDetails = {
        title: finalizedParts.title,
        content: fullStoryContent,
        applicationQuestions: finalizedParts.applicationQuestions,
        imagePrompt: finalizedParts.imagePrompt,
      };
    }

    // --- COMMON FINAL STEPS FOR ALL STORIES ---
    console.log("Assembling final response and generating image...");
    let imageUrl: string | undefined = undefined;
    // No entitlement check here: generateStoryImage resolves the image tier
    // through the policy itself and returns undefined with a logged reason when
    // the user is not entitled. The guard that used to live here read a
    // `userApiKey` local that the policy refactor removed, so it threw a
    // ReferenceError on every generation -- after all the paid calls had
    // already been made.
    try {
      imageUrl = await generateStoryImage(finalDetails.imagePrompt, userId);
    } catch (imageError) {
      console.error("Error generating story image:", imageError);
    }

    if (!finalDetails.content.includes("For Further Learning")) {
      finalDetails.content +=
        "\n\n**For Further Learning:**\n\n- **BibleGateway.com** - Read Bible stories.\n- **GotQuestions.org** - Find answers about faith.";
    }

    const bibleVerse = getBibleVerseByTheme(
      theme && theme !== "none" ? theme : "faith",
    );

    return {
      title: finalDetails.title,
      content: finalDetails.content,
      moralOutcome: moralOutcome,
      bibleVerse: moralOutcome === "consequences" ? undefined : bibleVerse,
      applicationQuestions: finalDetails.applicationQuestions,
      imagePrompt: finalDetails.imagePrompt,
      imageUrl: imageUrl,
      debugData: debugData,
    };
  } catch (error) {
    console.error("Error in orchestrated story generation process:", error);
    if (error instanceof Error) {
      (error as any).debugData = debugData;
    }
    throw error;
  }
}

// =========================================================================
// OTHER EXPORTED FUNCTIONS (Image Generation, etc.)
// =========================================================================

export async function generateStoryImage(
  imagePrompt: string,
  userId: number = 1,
): Promise<string | undefined> {
  // ... this function remains the same ...
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
    const imagesDir = path.join(process.cwd(), "public", "images", "stories");
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }
    const filename = `story_${uuidv4()}.png`;
    const filepath = path.join(imagesDir, filename);
    const enhancedPrompt = `${imagePrompt}. Render in a beautiful, child-friendly biblical illustration style with soft colors.`;
    const openaiClient = createClient(resolved);
    const response = await openaiClient.images.generate({
      model: resolved.model,
      prompt: enhancedPrompt,
      n: 1,
      size: "1024x1024",
    });
    if (response.data[0]?.url) {
      await downloadImage(response.data[0].url, filepath);
      return `/public/images/stories/${filename}`;
    }
    return undefined;
  } catch (error) {
    console.error("Error generating image with DALL-E:", error);
    return undefined;
  }
}

function downloadImage(url: string, filepath: string): Promise<void> {
  // ... this function remains the same ...
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          return reject(
            new Error(`Failed to download image: ${response.statusCode}`),
          );
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

export async function analyzeImageWithOpenAI(
  imageBase64: string,
  userId: number = 1,
): Promise<string> {
  // ... this function remains the same ...
  try {
    // Vision has its own allowlist: a chat-only model (a local Ollama one, say)
    // must never leak into an image-understanding call.
    const resolved = await resolveModel(userId, "vision");
    if (!resolved) {
      throw new Error("No image-analysis model available for this account");
    }
    const openaiClient = createClient(resolved);
    const systemPrompt = `You are a helpful Christian children's content analyzer...`; // Truncated
    const response = await openaiClient.chat.completions.create({
      model: resolved.model,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: "Please analyze this image:" },
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
            },
          ],
        },
      ],
      max_tokens: 1000,
    });
    return (
      response.choices[0].message.content || "Could not analyze the image."
    );
  } catch (error) {
    console.error("Error analyzing image with OpenAI:", error);
    throw error;
  }
}
