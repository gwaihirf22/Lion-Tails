/**
 * One row per generation attempt, including attempts that never became a story.
 *
 * Two rules govern everything here.
 *
 * 1. Recording must never break generating. A telemetry write that throws would
 *    turn a working story into a failed request, which is a strictly worse
 *    outcome than losing a row of statistics. Every path is wrapped and the
 *    failure is logged, not propagated.
 *
 * 2. Nothing derived from ResolvedModel except the five descriptive fields.
 *    That object also carries `apiKey` and `baseURL`; a single `...resolved`
 *    spread would write a live credential into the database and into every
 *    backup of it. The fields are therefore listed one at a time, by hand,
 *    rather than picked programmatically.
 */
import { randomUUID } from "crypto";
import { db, databaseReady } from "../db";
import { generationRecords } from "@shared/schema";
import type { ResolvedModel } from "./modelPolicy";

/**
 * Backstop cap on the serialised `steps` payload.
 *
 * Measured rather than guessed. debugData for the worst realistic story --
 * "extended", seven chapters, two retries -- is 244.6 KB, because every chapter
 * prompt embeds the story so far and the finalize prompt embeds all 3500 words.
 * Prompts are 95-98% of that: the same payload with prompts removed is 8.1 KB,
 * and even a pathological seven-retry case is 9.0 KB.
 *
 * So prompts are dropped from the stored record entirely rather than capped
 * around (see projectSteps). A cap sized just above the normal worst case is
 * the wrong shape: it would engage on some extended stories and not others,
 * making the stored evidence differ unpredictably between two runs of the same
 * request. This value is now a true backstop against a pathological response,
 * not something normal operation approaches.
 */
const MAX_STEPS_BYTES = 256 * 1024;

type StepLike = {
  step?: string;
  attempt?: number;
  finishReason?: string | null;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
  wordCount?: number;
  parseError?: string;
};

export type GenerationRecordInput = {
  generationId: string;
  /** Set when this attempt came from a story_jobs row. */
  jobId?: string;
  userId: number;
  resolved: ResolvedModel;
  request: {
    storyLength?: string;
    storyType?: string;
    readingLevel?: string;
  };
  targetWordCount: number;
  startedAt: number;
  debugData: StepLike[];
  outcome: "succeeded" | "failed";
  actualWordCount?: number;
  failureCode?: string;
  failureMessage?: string;
};

/** A fresh id, created before generation so a failure still has one to record under. */
export function newGenerationId(): string {
  return randomUUID();
}

/**
 * Aggregates worth querying, derived from the steps rather than counted by the
 * generator. Keeping the arithmetic here means the generation path stays free
 * of bookkeeping, and a new call site is measured automatically as long as it
 * pushes to debugData like the others.
 */
function summarise(debugData: StepLike[]) {
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let modelCalls = 0;
  let retriedCalls = 0;
  let truncatedCalls = 0;
  const chapterWordCounts: number[] = [];

  for (const s of debugData ?? []) {
    // `usage` is present only on real model calls, which is what distinguishes
    // them from bookkeeping entries such as the lengthCheck step.
    if (s?.usage) {
      modelCalls++;
      promptTokens += s.usage.prompt_tokens ?? 0;
      completionTokens += s.usage.completion_tokens ?? 0;
      totalTokens += s.usage.total_tokens ?? 0;
    }
    if (typeof s?.attempt === "number" && s.attempt > 1) retriedCalls++;
    if (s?.finishReason === "length") truncatedCalls++;
    // Per-chapter counts, not just the story total: the total says "81% of
    // target" and nothing more, while the per-chapter numbers distinguish a
    // weak model from a short outline from a model anchoring to the floor.
    if (typeof s?.step === "string" && s.step.startsWith("generateChapter") && typeof s.wordCount === "number") {
      chapterWordCounts.push(s.wordCount);
    }
  }

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    modelCalls,
    retriedCalls,
    truncatedCalls,
    chapterWordCounts,
  };
}

/**
 * What of each step is worth storing.
 *
 * Prompts are dropped unconditionally. They are templated from the request,
 * the brief and the outline -- all of which are either stored here or derivable
 * -- and they are 95-98% of the payload. The raw *reply* is the irreproducible
 * half and the one that answers "what did the model actually send", so it is
 * kept in full.
 *
 * Dropping them always, rather than only when over a cap, is the point: two
 * runs of the same request then produce records of the same shape. A
 * size-triggered drop would mean the evidence available for a failure depended
 * on how long the story happened to be.
 *
 * The prompts still reach the debug panel -- routes.ts returns debugData in the
 * response body untouched. This projection is only what goes to the database.
 */
function projectSteps(debugData: StepLike[]): unknown {
  const projected = (debugData ?? []).map((s) => {
    const { prompt, ...rest } = s as Record<string, unknown>;
    // Recorded as a length rather than silently absent, so a reader can tell
    // "there was no prompt" from "the prompt is not stored here".
    if (typeof prompt === "string") {
      (rest as Record<string, unknown>).promptChars = prompt.length;
    }
    return rest;
  });

  // Backstop only. With prompts gone the worst measured case is ~9 KB, so
  // reaching this means a model returned something pathological.
  if (Buffer.byteLength(JSON.stringify(projected), "utf8") <= MAX_STEPS_BYTES) {
    return projected;
  }
  return projected.map((s) => {
    const rest = { ...s } as Record<string, unknown>;
    if (typeof rest.response === "string" && rest.response.length > 2000) {
      rest.response = `${(rest.response as string).slice(0, 2000)}[truncated from ${(rest.response as string).length} chars]`;
    }
    return rest;
  });
}

/**
 * Write the record. Best-effort by design: returns false rather than throwing.
 */
export async function recordGeneration(input: GenerationRecordInput): Promise<boolean> {
  try {
    // Telemetry is not worth blocking on, and MemStorage has nowhere to put it.
    const ready = await databaseReady;
    if (!ready || !db) return false;

    const agg = summarise(input.debugData);

    await db.insert(generationRecords).values({
      generationId: input.generationId,
      jobId: input.jobId ?? null,
      userId: input.userId,
      storyLength: input.request.storyLength ?? null,
      storyType: input.request.storyType ?? null,
      readingLevel: input.request.readingLevel ?? null,
      targetWordCount: input.targetWordCount,

      // Listed by hand. See the module comment: never spread `resolved`.
      model: input.resolved.model,
      provider: input.resolved.provider,
      tier: input.resolved.tier,
      usingOwnKey: input.resolved.usingOwnKey,
      downgradedFrom: input.resolved.downgradedFrom ?? null,

      outcome: input.outcome,
      failureCode: input.failureCode ?? null,
      failureMessage: input.failureMessage ?? null,

      // Set by the Dockerfile ARG the deploy workflow fills with github.sha.
      // "unknown" for local builds, which is honest rather than misleading.
      appVersion: process.env.APP_VERSION ?? null,

      durationMs: Date.now() - input.startedAt,
      actualWordCount: input.actualWordCount ?? null,
      promptTokens: agg.promptTokens,
      completionTokens: agg.completionTokens,
      totalTokens: agg.totalTokens,
      modelCalls: agg.modelCalls,
      retriedCalls: agg.retriedCalls,
      truncatedCalls: agg.truncatedCalls,
      chapterWordCounts: agg.chapterWordCounts,
      steps: projectSteps(input.debugData),
    });

    return true;
  } catch (error) {
    // Deliberately swallowed. Losing a statistics row is not a reason to fail a
    // story the user is waiting for.
    console.error("Failed to record generation (story unaffected):", error);
    return false;
  }
}
