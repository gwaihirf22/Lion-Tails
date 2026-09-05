/**
 * Failures that reach the user as failures.
 *
 * Story generation used to answer every problem with a valid StoryResponse: a
 * quota rejection, a missing model and a malformed model reply all produced a
 * plausible-looking story with HTTP 200. Because those objects satisfied
 * storyResponseSchema, nothing downstream could tell them apart from real
 * output -- and the client auto-saves whatever it receives, so canned error
 * stories were persisted to the user's library with a success toast.
 *
 * Throwing a typed error instead lets the route return a real status code and
 * a message that says what to do next.
 */
export type StoryFailureCode =
  | "quota_exceeded"
  | "no_model_available"
  | "model_output_invalid"
  | "model_output_truncated"
  | "story_too_short"
  | "generation_failed";

const STATUS: Record<StoryFailureCode, number> = {
  quota_exceeded: 429,
  no_model_available: 503,
  // 502: the request was fine; the upstream model returned something unusable.
  model_output_invalid: 502,
  model_output_truncated: 502,
  story_too_short: 502,
  generation_failed: 500,
};

export class StoryGenerationError extends Error {
  readonly code: StoryFailureCode;
  readonly statusCode: number;
  /** Prompts and raw model replies, for the debug panel. */
  debugData?: unknown[];

  constructor(code: StoryFailureCode, message: string, options?: { cause?: unknown; debugData?: unknown[] }) {
    super(message);
    this.name = "StoryGenerationError";
    this.code = code;
    this.statusCode = STATUS[code];
    this.debugData = options?.debugData;
    if (options?.cause) (this as any).cause = options.cause;
  }
}

/**
 * Advice attached to a model-output failure.
 *
 * Blake's requirement: suggest both a stronger model AND a shorter length,
 * because the local models fail in different ways at different lengths and the
 * right remedy depends on which one you are on.
 */
/**
 * Truncation is a distinct failure from malformed output, and the distinction
 * matters: it means the model hit its token ceiling, which is retryable with a
 * larger budget, whereas genuinely malformed JSON is not.
 *
 * Reasoning ("thinking") models are the common cause. Their internal reasoning
 * is billed to completion_tokens and counts against max_tokens, so a budget
 * sized for the visible answer alone can be consumed entirely by reasoning --
 * producing zero content and a JSON.parse error on an empty string.
 */
export function modelTruncatedAdvice(model: string, storyLength?: string): string {
  const length = storyLength ? ` at "${storyLength}" length` : "";
  return (
    `The model (${model}) ran out of room before it finished the story${length}. ` +
    `Try a shorter story length, or switch to a stronger model in Settings.`
  );
}

/**
 * A story far below the requested length is not a success.
 *
 * The same model, prompt and code produced 4294 words against a 2500 target on
 * one run and 794 on the next, both HTTP 200 -- so "long" meant anything from a
 * third to nearly double what was asked for, and nothing noticed. Returning 200
 * with a quarter-length story is the same standard this app already rejects for
 * canned error stories, one level up.
 *
 * Only the undershoot fails. An overlong story still contains what was asked
 * for and is usable; a short one is missing content the user requested.
 */
export function storyTooShortAdvice(
  actualWords: number,
  targetWords: number,
  model: string,
  storyLength?: string,
): string {
  const pct = Math.round((actualWords / targetWords) * 100);

  // "Choose a shorter length" is impossible advice at the shortest length, and
  // that is the length most likely to trip this check: very-short takes the
  // single-call path, so there are no chapters to make up a shortfall and both
  // local models have undershot there.
  const atShortestLength = storyLength === "very-short";
  const remedies = atShortestLength
    ? "Try generating it again, or switch to a stronger model in Settings."
    : "Try generating it again, choose a shorter length, or switch to a stronger model in Settings.";

  return (
    `The model (${model}) produced only ${actualWords} words against a target of ` +
    `${targetWords} (${pct}%). ${remedies}`
  );
}

export function modelOutputAdvice(model: string, storyLength?: string): string {
  const length = storyLength ? ` at "${storyLength}" length` : "";
  return (
    `The model (${model}) returned a reply that could not be read as a story${length}. ` +
    `This usually means the reply was cut off or malformed. ` +
    `Try a shorter story length, or switch to a stronger model in Settings.`
  );
}
