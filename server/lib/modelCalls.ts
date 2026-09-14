/**
 * The ledger: one row per paid model call, with what it cost.
 *
 * The same two rules as generationRecords.ts, for the same reasons:
 *  1. Recording never breaks generating. Every path is wrapped; a failed write
 *     is logged and forgotten. A lost ledger row is a small undercount -- the
 *     bill check (priceWatch.ts) exists to notice exactly that.
 *  2. Nothing is spread from ResolvedModel, which carries the API key. The
 *     descriptive fields are copied by hand.
 *
 * Only OpenAI calls are recorded. A local model costs nobody anything, and a
 * row of zeros would only dilute the averages the price list is built from.
 */
import { randomUUID } from "crypto";
import { pool, databaseReady } from "../db";
import type { ResolvedModel } from "./modelPolicy";
import {
  costMicros,
  parsePrice,
  usageBreakdown,
  type CallPurpose,
  type ModelPriceSheet,
  type PriceUnit,
} from "./costMath";

/** What a call site knows about the call it just made. */
export type ModelCallContext = {
  userId: number | undefined;
  resolved: Pick<ResolvedModel, "model" | "provider" | "tier" | "usingOwnKey">;
  purpose: CallPurpose;
  jobId?: string;
  storyId?: string;
  imageSize?: string;
  imageQuality?: string;
};

type PriceBook = { sheets: Map<string, ModelPriceSheet>; versionOf: Map<string, number>; loadedAt: number };

/**
 * The approved prices, cached briefly.
 *
 * A story makes five to seven calls in a couple of minutes; reading the price
 * table for each is waste. Sixty seconds is short enough that an approval in
 * the admin panel reaches the next story, and forgetPrices() makes it
 * immediate for the process that approved it.
 */
const PRICE_TTL_MS = 60_000;
let cache: PriceBook | undefined;

export function forgetPrices(): void {
  cache = undefined;
}

/**
 * The current approved price sheet of every priced model.
 *
 * A model's price is its NEWEST APPROVED VERSION that has rows for it -- whole,
 * not merged unit by unit across versions, so a proposal that drops a unit
 * cannot leave a stale price from an older version standing in for it.
 */
export async function loadApprovedPrices(): Promise<PriceBook> {
  if (cache && Date.now() - cache.loadedAt < PRICE_TTL_MS) return cache;
  const sheets = new Map<string, ModelPriceSheet>();
  const versionOf = new Map<string, number>();
  const ready = await databaseReady;
  if (ready && pool) {
    const { rows } = await pool.query(
      `SELECT mp.model, mp.unit, mp.usd_per_million, mp.version_id
         FROM model_prices mp
        WHERE mp.version_id = (
          SELECT MAX(mp2.version_id)
            FROM model_prices mp2
            JOIN price_versions pv ON pv.id = mp2.version_id AND pv.status = 'approved'
           WHERE mp2.model = mp.model)`,
    );
    for (const r of rows) {
      const price = parsePrice(r.usd_per_million);
      if (price === undefined) continue;
      const sheet = sheets.get(r.model) ?? {};
      sheet[r.unit as PriceUnit] = price;
      sheets.set(r.model, sheet);
      versionOf.set(r.model, Number(r.version_id));
    }
  }
  cache = { sheets, versionOf, loadedAt: Date.now() };
  return cache;
}

/**
 * Record one call. Best-effort: resolves false rather than throwing.
 *
 * `usage` is the API's own `usage` object, passed through untouched. `outcome`
 * is whether the call produced something usable -- a truncated chapter that is
 * about to be retried still cost its tokens and is recorded as failed.
 */
export async function recordModelCall(
  ctx: ModelCallContext,
  usage: unknown,
  outcome: "succeeded" | "failed",
): Promise<boolean> {
  try {
    if (ctx.resolved.provider !== "openai") return false;
    const ready = await databaseReady;
    if (!ready || !pool) return false;

    const kind = ["cover", "passage-picture", "redraw", "avatar"].includes(ctx.purpose) ? "image" : "text";
    const tokens = usageBreakdown(usage, kind);
    const book = await loadApprovedPrices();
    const cost = costMicros(tokens, book.sheets.get(ctx.resolved.model));

    await pool.query(
      `INSERT INTO model_calls (
         call_id, user_id, job_id, story_id, purpose, model, provider, tier, owner_paid, outcome,
         input_text, input_cached, input_cache_write, input_image, input_image_cached,
         output_text, output_image, reasoning, image_size, image_quality, cost_micros, price_version_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
      [
        randomUUID(),
        ctx.userId ?? null,
        ctx.jobId ?? null,
        ctx.storyId ?? null,
        ctx.purpose,
        // By hand. Never spread `resolved`: it carries the API key.
        ctx.resolved.model,
        ctx.resolved.provider,
        ctx.resolved.tier,
        !ctx.resolved.usingOwnKey,
        outcome,
        tokens.input_text,
        tokens.input_cached,
        tokens.input_cache_write,
        tokens.input_image,
        tokens.input_image_cached,
        tokens.output_text,
        tokens.output_image,
        tokens.reasoning,
        ctx.imageSize ?? null,
        ctx.imageQuality ?? null,
        cost,
        cost === null ? null : (book.versionOf.get(ctx.resolved.model) ?? null),
      ],
    );
    return true;
  } catch (error) {
    // A lost ledger row is not worth a lost story.
    console.error("Failed to record model call (generation unaffected):", error);
    return false;
  }
}
