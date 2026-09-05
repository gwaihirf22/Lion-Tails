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
  | "generation_failed";

const STATUS: Record<StoryFailureCode, number> = {
  quota_exceeded: 429,
  no_model_available: 503,
  // 502: the request was fine; the upstream model returned something unusable.
  model_output_invalid: 502,
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
export function modelOutputAdvice(model: string, storyLength?: string): string {
  const length = storyLength ? ` at "${storyLength}" length` : "";
  return (
    `The model (${model}) returned a reply that could not be read as a story${length}. ` +
    `This usually means the reply was cut off or malformed. ` +
    `Try a shorter story length, or switch to a stronger model in Settings.`
  );
}
