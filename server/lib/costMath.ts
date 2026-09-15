/**
 * What one model call cost, from what the API said it used. Pure.
 *
 * Kept apart from modelCalls.ts, which writes to the database, so every rule
 * here is tested without one -- and because the rules are exactly the kind
 * that are wrong silently: count reasoning twice, or price cached input at the
 * full rate, and the ledger reads as a slightly expensive app rather than as a
 * bug.
 *
 * Billing rules this encodes, from OpenAI's own docs (2026-09):
 *  - Reasoning tokens are billed AS output and are already inside the output
 *    count. They are recorded, never added.
 *  - Input is three prices, not one: the uncached part at the input rate, cache
 *    hits at the cached rate, cache writes at the cache-write rate. Full-price
 *    input = input - cached - cache_write.
 *  - Image calls are priced per TOKEN too, with separate rates for text and
 *    image input and for image output.
 */

export const PRICE_UNITS = [
  "input_text",
  "input_cached",
  "input_cache_write",
  "input_image",
  "input_image_cached",
  "output_text",
  "output_image",
] as const;
export type PriceUnit = (typeof PRICE_UNITS)[number];

/** Why the call was made. Stored, so the cost of a story can be told from the cost of its picture. */
export const CALL_PURPOSES = [
  "story-single",
  "outline",
  "chapter",
  "finalize",
  "digging",
  "extract",
  "summary",
  "passage-scene",
  "cover",
  "passage-picture",
  "redraw",
  "avatar",
  "song",
  "vision",
  "other",
] as const;
export type CallPurpose = (typeof CALL_PURPOSES)[number];

/** Tokens a call used, one bucket per price. `reasoning` is informational. */
export type UsageBreakdown = Record<PriceUnit, number> & { reasoning: number };

export const emptyBreakdown = (): UsageBreakdown => ({
  input_text: 0,
  input_cached: 0,
  input_cache_write: 0,
  input_image: 0,
  input_image_cached: 0,
  output_text: 0,
  output_image: 0,
  reasoning: 0,
});

const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
type Obj = Record<string, unknown> | undefined | null;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Record<string, unknown>) : undefined);

/**
 * One shape out of the three the API returns.
 *
 * - Chat Completions: prompt_tokens / completion_tokens, with *_details.
 * - Responses API: input_tokens / output_tokens, with *_details.
 * - Images API: input_tokens / output_tokens, whose details split text from image.
 *
 * `kind` says which call it was, because Responses and Images share field
 * names and differ in what an undetailed output is: for a picture it is image
 * tokens, for text it is text. Anything unrecognised yields zeros, never a
 * throw -- this reads model output, and a ledger must not cost a story.
 */
export function usageBreakdown(usage: unknown, kind: "text" | "image"): UsageBreakdown {
  const out = emptyBreakdown();
  const u = obj(usage);
  if (!u) return out;

  const promptDetails = obj(u.prompt_tokens_details) ?? obj(u.input_tokens_details);
  const completionDetails = obj(u.completion_tokens_details) ?? obj(u.output_tokens_details);
  const input = n(u.prompt_tokens ?? u.input_tokens);
  const output = n(u.completion_tokens ?? u.output_tokens);
  const cached = n(promptDetails?.cached_tokens);
  const cacheWrite = n(promptDetails?.cache_write_tokens);
  const inputImage = n(promptDetails?.image_tokens);

  // Cache hits on an image call are image input first (that is what an edit
  // resends), and anything left over is text.
  const cachedImage = Math.min(cached, inputImage);
  out.input_image_cached = cachedImage;
  out.input_image = inputImage - cachedImage;
  out.input_cached = cached - cachedImage;
  out.input_cache_write = cacheWrite;
  out.input_text = Math.max(0, input - cached - cacheWrite - (inputImage - cachedImage));

  out.reasoning = n(completionDetails?.reasoning_tokens);
  if (kind === "image") {
    const outImage = completionDetails?.image_tokens;
    const outText = n(completionDetails?.text_tokens);
    out.output_image = typeof outImage === "number" ? n(outImage) : Math.max(0, output - outText);
    out.output_text = outText;
  } else {
    // Reasoning is inside `output` already. Not added.
    out.output_text = output;
  }
  return out;
}

/** Prices for one model: dollars per million tokens, by unit. */
export type ModelPriceSheet = Partial<Record<PriceUnit, number>>;

/**
 * Millionths of a dollar. `tokens × $/1M` is micros exactly, which is why the
 * ledger stores micros: no float division anywhere on the way in.
 *
 * NULL, NOT ZERO, when a bucket that was used has no price. A call on a model
 * nobody has priced yet is an unknown cost, and summing it as free is how an
 * app looks cheap while it is not. Rounded to the nearest micro (a millionth
 * of a cent is not a meaningful loss).
 */
export function costMicros(usage: UsageBreakdown, prices: ModelPriceSheet | undefined): number | null {
  if (!prices) return null;
  let total = 0;
  for (const unit of PRICE_UNITS) {
    const tokens = usage[unit];
    if (!tokens) continue;
    const price = prices[unit];
    if (typeof price !== "number" || !Number.isFinite(price)) return null;
    total += tokens * price;
  }
  return Math.round(total);
}

/** "0.000150" (numeric from node-postgres) -> 0.00015. The one reader of a stored price. */
export function parsePrice(value: unknown): number | undefined {
  const v = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(v) && v >= 0 ? v : undefined;
}

/** Dollars, for display: micros / 1e6. */
export const microsToUsd = (micros: number): number => micros / 1_000_000;

/**
 * A percentile of already-measured costs, nearest-rank. Pure, for costStats.
 * p=0.75 of [1,2,3,4] is 3: the price must cover three stories in four.
 */
export function percentile(values: number[], p: number): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(p * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

/**
 * What an item should sell for: measured cost plus margin, rounded UP to a
 * whole cent so rounding never sells below cost. Never less than one cent.
 */
export function suggestedPriceCents(basisMicros: number, marginPct: number): number {
  const withMargin = basisMicros * (1 + Math.max(0, marginPct) / 100);
  // micros -> cents is / 10_000.
  return Math.max(1, Math.ceil(withMargin / 10_000 - 1e-9));
}

/** A published price that no longer covers what the item costs to make. */
export const sellingAtALoss = (priceCents: number, basisMicros: number): boolean =>
  priceCents * 10_000 < basisMicros;
