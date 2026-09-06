import OpenAI from "openai";
import { StoryRequest, StoryResponse } from "@shared/schema";
import {
  buildStoryBrief,
  buildSystemPrompt,
  buildUserInstruction,
  resolveStoryCharacter,
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
  /** Resolved once per request; every chat call in this file uses it. */
  resolved: ResolvedModel;
};
import { getBibleVerseByTheme } from "../data/bibleVerses";
import { storage } from "../storage";
import {
  StoryGenerationError,
  modelOutputAdvice,
  modelTruncatedAdvice,
  storyTooShortAdvice,
} from "./storyErrors";
import { resolveModel, createClient, type ResolvedModel } from "./modelPolicy";
import { newGenerationId, recordGeneration } from "./generationRecords";
import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import { v4 as uuidv4 } from "uuid";

// Credentials, provider and model are decided exclusively by
// resolveModel() in ./modelPolicy. Nothing here should read
// process.env.OPENAI_API_KEY or hardcode a model name -- five hardcoded
// "gpt-4o" sites were five places for the policy to drift.

// Helper function to get word count from length setting
/**
 * How many chapters a story of this length is planned as.
 *
 * Single source: the outline prompt, the outline's length validation and the
 * per-chapter word target all derive from this. They previously did not --
 * generateStoryOutline asked for ceil(words/500) parts while
 * generateStoryChapter sized each chapter as words/max(3, ceil(words/500)).
 * For a 1000-word story that meant asking for 2 chapters of 333 words: a
 * structural 33% undershoot before the model was even involved.
 */
function getChapterCount(targetWordCount: number): number {
  return Math.max(3, Math.ceil(targetWordCount / 500));
}

export function getWordCountFromLength(length: string): number {
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
 * See docs/decisions.md §13.
 *
 * Sizing a budget without counting everything that shares it is the same
 * mistake as the original 2048 bug, one level up.
 *
 * 16384 is not a placeholder. It was briefly raised to 32768 after measuring
 * that the extra KV cache was genuinely free, and the host produced six
 * "CUDA error: an illegal memory access was encountered" faults in 31 minutes
 * -- on prompts as small as 306 tokens, so the 32k slot allocation itself was
 * the trigger rather than large inputs. VRAM was not the binding constraint;
 * driver and llama.cpp stability at that context on this card was. Do not raise
 * this without re-testing the host under load. See docs/decisions.md §14.
 *
 * It was also never needed: across three benchmark runs the only call ever to
 * reach the ceiling was one outline retry at exactly 16384, and it succeeded.
 */
const MODEL_CONTEXT_LIMIT = Number(process.env.MODEL_CONTEXT_LIMIT) || 16384;

// Logged once at startup so a mismatch with Ollama's OLLAMA_CONTEXT_LENGTH is
// visible in the container log rather than only as truncations under load.
// These two must agree; nothing enforces it, and they were briefly out of step
// for real during the 32768 revert.
console.log(
  `[model] context limit ${MODEL_CONTEXT_LIMIT} tokens ` +
    `(${process.env.MODEL_CONTEXT_LIMIT ? "from MODEL_CONTEXT_LIMIT" : "default"}) ` +
    `-- must match Ollama's OLLAMA_CONTEXT_LENGTH`,
);

/**
 * Below this fraction of the requested word count, a story is treated as a
 * failed request rather than a short one.
 *
 * EMPIRICAL, not arbitrary: chosen so that sixteen recorded generations across
 * two models and two full benchmark runs, which landed between 79% and 172% of
 * target, all pass -- while the two known-broken results fail: a 243-word
 * "very-short" (49%) and a 794-word "long" (32%) caused by a one-element
 * outline. The provenance matters because a bare 0.6 invites being tightened
 * into false failures or loosened into uselessness. If you change it, re-derive
 * it from measurements rather than from intuition.
 *
 * Only the undershoot fails; see the length check at the assembly point for why
 * the two directions are treated differently.
 */
const MINIMUM_LENGTH_RATIO = 0.6;

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
function nextTokenBudget(current: number, promptTokens?: number): number | null {
  const doubled = current * 2;

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
  /**
   * Smallest prompt_tokens observed for this call.
   *
   * The prompt string is identical on every attempt, so its true token count
   * cannot grow. Ollama has been seen reporting 253 on one attempt and 5037 on
   * the next for the same prompt -- apparently slot state on a reused slot
   * rather than the prompt itself. Taking the minimum keeps an inflated reading
   * from understating the headroom and suppressing a retry that had room.
   */
  let promptTokens: number | undefined;


  /** Raises the budget for the next attempt, or false if there is no room. */
  const raiseBudget = (): boolean => {
    const next = nextTokenBudget(budget, promptTokens);
    if (next === null) {
      console.warn(
        `${step}: no context headroom left at max_tokens=${budget} ` +
          `(prompt ${promptTokens ?? "?"} of ${MODEL_CONTEXT_LIMIT}); not retrying.`,
      );
      return false;
    }
    budget = next;
    return true;
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const reply = await opts.call(budget);

    const reported = reply.usage?.prompt_tokens;
    if (typeof reported === "number" && reported > 0) {
      promptTokens = promptTokens === undefined ? reported : Math.min(promptTokens, reported);
    }

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

    const isLastAttempt = attempt === maxAttempts;

    // "stop" is the ONLY value that confirms the model finished. finish_reason
    // has been observed as null on a reply that was demonstrably cut off
    // mid-array, and a null was previously treated as "not truncated" -- so a
    // resource problem got the capability remedy and was retried at the same
    // budget. Require positive evidence of completion rather than positive
    // evidence of truncation.
    const mayBeTruncated = reply.finishReason !== "stop";

    if (reply.finishReason === "length") {
      truncated = true;
      if (isLastAttempt || !raiseBudget()) break;
      console.warn(
        `${step}: output was truncated (finish_reason=length); retrying with max_tokens=${budget}`,
      );
      continue;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(reply.content);
    } catch (error) {
      lastError = error;
      truncated = mayBeTruncated;
      debugData[debugData.length - 1].parseError =
        error instanceof Error ? error.message : String(error);
      if (isLastAttempt) break;
      // Retrying a genuinely malformed reply at a larger budget costs only
      // time; retrying a truncated one at the same budget cannot work.
      if (mayBeTruncated && !raiseBudget()) break;
      console.warn(
        `${step}: reply was not valid JSON (finish_reason=${reply.finishReason}); ` +
          `retrying with max_tokens=${budget}`,
      );
      continue;
    }

    const validated = opts.validate ? opts.validate(parsed) : (parsed as T);
    if (validated !== undefined) {
      return validated;
    }

    lastError = new Error("model reply did not match the expected shape");
    truncated = mayBeTruncated;
    debugData[debugData.length - 1].shapeError =
      `expected keys were missing; got: ${Object.keys(parsed ?? {}).join(", ") || "(not an object)"}`;
    if (isLastAttempt) break;
    if (mayBeTruncated && !raiseBudget()) break;
    console.warn(
      `${step}: reply was valid JSON but the wrong shape; retrying with max_tokens=${budget}`,
    );
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
  /**
   * Smallest prompt_tokens observed for this call.
   *
   * The prompt string is identical on every attempt, so its true token count
   * cannot grow. Ollama has been seen reporting 253 on one attempt and 5037 on
   * the next for the same prompt -- apparently slot state on a reused slot
   * rather than the prompt itself. Taking the minimum keeps an inflated reading
   * from understating the headroom and suppressing a retry that had room.
   */
  let promptTokens: number | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const reply = await opts.call(budget);

    const reported = reply.usage?.prompt_tokens;
    if (typeof reported === "number" && reported > 0) {
      promptTokens = promptTokens === undefined ? reported : Math.min(promptTokens, reported);
    }

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
      // Prose has no parse step, so unlike the JSON path there is no second
      // signal that a reply was cut off. finish_reason has been seen as null on
      // a demonstrably truncated reply, so an unexpected value here means the
      // chapter MIGHT be incomplete and we cannot tell. Retrying every null
      // would double the cost of every chapter, so record it loudly instead --
      // if stories start ending mid-sentence, this line is where to look.
      if (reply.finishReason !== "stop") {
        console.warn(
          `${step}: finish_reason was ${String(reply.finishReason)} rather than "stop"; ` +
            `cannot confirm the chapter is complete.`,
        );
      }
      return reply.content;
    }

    if (attempt < maxAttempts) {
      const next = nextTokenBudget(budget, promptTokens);
      if (next === null) {
        console.warn(
          `${step}: truncated at max_tokens=${budget} with no context headroom left ` +
            `(prompt ${promptTokens ?? "?"} of ${MODEL_CONTEXT_LIMIT}); not retrying.`,
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
    ${buildUserInstruction(request)}

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
  numberOfChapters: number,
): Promise<string[]> {

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
    // Structurally valid but semantically wrong is still wrong. A model has
    // returned ONE array element containing all the chapters joined by "\n\n":
    // valid JSON, an array of strings, and it made the chapter loop run once,
    // producing a story at a third of the requested length with HTTP 200.
    // The count is what matters here, not just the shape.
    validate: (value) =>
      Array.isArray(value?.outline) && value.outline.length === numberOfChapters
        ? value
        : undefined,
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
  wordCountPerChapter: number,
  totalChapters: number,
): Promise<string> {


  const systemPrompt = `${ctx.systemPrompt} Continue writing a story based on the context provided. Focus ONLY on writing the current part of the story. Do NOT summarize or add titles/questions.`;
  const userPrompt = `
      The story's agreed details, which must stay consistent across chapters:
      ${ctx.brief}

      Here is the story so far:
      ---
      ${storySoFar || "This is the very first chapter."}
      ---

      Now, write the next part of the story based on this instruction: "${chapterOutline}"

      CRITICAL INSTRUCTION: This chapter must be close to ${Math.round(wordCountPerChapter)} words --
      no fewer than ${Math.round(wordCountPerChapter * 0.85)} and no more than ${Math.round(wordCountPerChapter * 1.15)}.
      The story has ${totalChapters} chapters of similar length, so do not try to finish
      the whole story in this one.
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
/**
 * Hooks that make a generation resumable. Absent for the synchronous path,
 * supplied by the worker for a job.
 */
export type GenerationHooks = {
  jobId?: string;
  resumeOutline?: string[];
  resumeChapters?: string[];
  /** Returns false when this worker has been evicted; the run then stops. */
  checkpoint?: (patch: { step?: string; outline?: string[]; chapters?: string[] }) => Promise<boolean>;
  isCancelled?: () => Promise<boolean>;
};

/** Terminal outcomes that are not a story. */
export type GenerationOutcome = "cancelled" | "evicted";

/**
 * The generation itself, shared by the synchronous route and the job worker.
 *
 * One body rather than two: a second copy would drift, and this codebase has
 * produced most of its bugs from parallel definitions of the same thing.
 */
async function runGeneration(
  request: StoryRequest,
  userId: number,
  ctx: StoryContext,
  openaiClient: OpenAI,
  targetWordCount: number,
  generationId: string,
  startedAt: number,
  debugHeader: Record<string, unknown>,
  hooks?: GenerationHooks,
): Promise<(StoryResponse & { debugData?: any[]; generationId?: string }) | GenerationOutcome> {
  const { theme } = request;
  const resolved = ctx.resolved;
  const debugData: any[] = [debugHeader];
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
      // The single-call path has no intermediate steps to checkpoint, so
      // without this the job sits at step="queued" for the whole generation and
      // the UI reports "Waiting to start" while the model is actually writing.
      if (hooks?.checkpoint && !(await hooks.checkpoint({ step: "writing" }))) {
        return "evicted";
      }
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

      // Step 1: Outline. Reused from the checkpoint on a resumed job -- an
      // outline is a paid call, and regenerating it would also produce a
      // DIFFERENT outline, so chapters already written would no longer match
      // the plan they were written against.
      const expectedChapters = getChapterCount(targetWordCount);
      const outline =
        hooks?.resumeOutline && hooks.resumeOutline.length > 0
          ? hooks.resumeOutline
          : await generateStoryOutline(
              openaiClient,
              request,
              targetWordCount,
              debugData,
              ctx,
              expectedChapters,
            );
      if (hooks?.checkpoint && !(await hooks.checkpoint({ step: "outline", outline }))) {
        return "evicted";
      }

      // Sized from the outline we actually got, not from a second derivation of
      // the count. If those two ever disagree the story silently comes out at
      // the wrong length, which is exactly what used to happen.
      const wordsPerChapter = targetWordCount / outline.length;
      // Backstop only: requestModelJson now validates the shape and retries, so
      // an empty outline reaching here means something upstream changed.
      if (!outline || outline.length === 0) {
        throw new StoryGenerationError(
          "model_output_invalid",
          modelOutputAdvice(ctx.resolved.model, request.storyLength),
          { debugData },
        );
      }

      // Step 2: Chapters. Checkpointed after each one, because each is a paid
      // 20-90s call and losing six of seven to a container restart is the
      // "partial work is discarded" problem this stage exists to fix.
      const chapters: string[] = [...(hooks?.resumeChapters ?? [])];
      if (chapters.length > 0) {
        console.log(` - Resuming with ${chapters.length}/${outline.length} chapters already written.`);
      }
      let fullStoryContent = chapters.join("\n\n");
      for (let i = chapters.length; i < outline.length; i++) {
        if (hooks?.isCancelled && (await hooks.isCancelled())) return "cancelled";
        console.log(` - Generating part ${i + 1}/${outline.length}...`);
        const chapterContent = await generateStoryChapter(
          openaiClient,
          request,
          outline[i],
          fullStoryContent,
          debugData,
          ctx,
          wordsPerChapter,
          outline.length,
        );
        chapters.push(chapterContent);
        fullStoryContent += (fullStoryContent ? "\n\n" : "") + chapterContent;
        console.log(
          ` - Part ${i + 1} added. Word count: ${countWords(fullStoryContent)}`,
        );
        if (
          hooks?.checkpoint &&
          !(await hooks.checkpoint({ step: `chapter ${i + 1}/${outline.length}`, chapters }))
        ) {
          return "evicted";
        }
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

    // Length is part of what was requested, so a story far below it is a failed
    // request rather than a successful one. Checked here so it covers the
    // single-call and multi-step paths alike.
    //
    // Asymmetric on purpose: an overlong story still contains what was asked
    // for and is usable, so it is recorded but not rejected. A short one is
    // missing content the user asked for.
    const actualWordCount = countWords(finalDetails.content || "");
    const lengthRatio = actualWordCount / targetWordCount;
    debugData.push({
      step: "lengthCheck",
      actualWordCount,
      targetWordCount,
      ratio: Number(lengthRatio.toFixed(2)),
    });

    if (lengthRatio < MINIMUM_LENGTH_RATIO) {
      throw new StoryGenerationError(
        "story_too_short",
        storyTooShortAdvice(actualWordCount, targetWordCount, ctx.resolved.model, request.storyLength),
        { debugData },
      );
    }
    if (lengthRatio > 1.5) {
      console.warn(
        `Story ran long: ${actualWordCount} words against a ${targetWordCount} target ` +
          `(${Math.round(lengthRatio * 100)}%). Returned anyway -- it contains what was asked for.`,
      );
    }

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

    // Awaited rather than fired and forgotten: an unawaited rejection here
    // would be an unhandled promise rejection, and the write is a single
    // indexed insert against a local database. recordGeneration never throws.
    await recordGeneration({
      generationId,
      userId,
      resolved,
      request: {
        storyLength: request.storyLength,
        storyType: request.storyType,
        readingLevel: request.readingLevel,
      },
      targetWordCount,
      startedAt,
      debugData,
      jobId: hooks?.jobId,
      outcome: "succeeded",
      actualWordCount: countWords(finalDetails.content || ""),
    });

    return {
      title: finalDetails.title,
      content: finalDetails.content,
      moralOutcome: moralOutcome,
      bibleVerse: moralOutcome === "consequences" ? undefined : bibleVerse,
      applicationQuestions: finalDetails.applicationQuestions,
      imagePrompt: finalDetails.imagePrompt,
      imageUrl: imageUrl,
      debugData: debugData,
      // Returned so /api/story/save can point the saved story at the record
      // that produced it -- "which AI wrote this story", asked of a row rather
      // than inferred from a timestamp.
      generationId,
    };
  } catch (error) {
    console.error("Error in orchestrated story generation process:", error);
    if (error instanceof Error) {
      (error as any).debugData = debugData;
    }
    // A failed attempt is recorded too. The failures are the interesting rows:
    // which model, which length, which failure code, and how many tokens were
    // spent before it gave up.
    await recordGeneration({
      generationId,
      userId,
      resolved,
      request: {
        storyLength: request.storyLength,
        storyType: request.storyType,
        readingLevel: request.readingLevel,
      },
      targetWordCount,
      startedAt,
      debugData,
      jobId: hooks?.jobId,
      outcome: "failed",
      failureCode:
        error instanceof StoryGenerationError ? error.code : "generation_failed",
      failureMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// generateStoryWithOpenAI() was removed here. Every generation now goes
// through generateStoryFromJob(), driven by the worker. A synchronous entry
// point that no route called would have been a second generation path that
// nothing exercises -- untested, and free to drift from the one that runs.
// runGeneration() below is the single shared body; if a synchronous caller is
// ever needed again (a CLI, a test harness), wrap that rather than copying it.

/**
 * The worker's entry point. Differs from the synchronous path in exactly three
 * ways: the brief is FROZEN (taken from the job rather than rebuilt from the
 * database, so a character deleted mid-story cannot change it), credentials are
 * re-resolved by the caller at claim time, and the hooks make it resumable.
 */
export async function generateStoryFromJob(opts: {
  jobId: string;
  userId: number;
  request: StoryRequest;
  brief: string;
  systemPrompt: string;
  targetWordCount: number;
  resolved: ResolvedModel;
  client: OpenAI;
  resumeOutline?: string[];
  resumeChapters?: string[];
  checkpoint: GenerationHooks["checkpoint"];
  isCancelled: GenerationHooks["isCancelled"];
}): Promise<(StoryResponse & { debugData?: any[]; generationId?: string }) | GenerationOutcome> {
  const generationId = newGenerationId();
  const ctx: StoryContext = {
    brief: opts.brief,
    systemPrompt: opts.systemPrompt,
    resolved: opts.resolved,
  };
  return runGeneration(
    opts.request, opts.userId, ctx, opts.client, opts.targetWordCount, generationId, Date.now(),
    buildDebugHeader(generationId, opts.targetWordCount, opts.resolved, opts.request),
    {
      jobId: opts.jobId,
      resumeOutline: opts.resumeOutline,
      resumeChapters: opts.resumeChapters,
      checkpoint: opts.checkpoint,
      isCancelled: opts.isCancelled,
    },
  );
}

/**
 * DebugPanel reads targetWordCount and model off debugData[0] and showed "N/A"
 * for both until this existed. Never resolved.apiKey or resolved.baseURL:
 * debugData is returned to the client in the response body.
 */
function buildDebugHeader(
  generationId: string,
  targetWordCount: number,
  resolved: ResolvedModel,
  request: StoryRequest,
): Record<string, unknown> {
  return {
    step: "request",
    generationId,
    targetWordCount,
    model: resolved.model,
    provider: resolved.provider,
    tier: resolved.tier,
    usingOwnKey: resolved.usingOwnKey,
    downgradedFrom: resolved.downgradedFrom,
    storyLength: request.storyLength,
  };
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
    // openai 7.x made ImagesResponse.data optional (`data?: Array<Image>`), so
    // indexing it directly throws at runtime on a response that carries none --
    // this is a real guard, not a cast to satisfy the compiler.
    const imageUrl = response.data?.[0]?.url;
    if (imageUrl) {
      await downloadImage(imageUrl, filepath);
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
