/**
 * Reading prices out of the places that publish them. Pure.
 *
 * THERE IS NO PRICE API. OpenAI's /v1/models carries no prices, so the app
 * watches two public sources and never trusts either on its own:
 *
 *  - LiteLLM's model_prices_and_context_window.json, maintained in the open and
 *    matched OpenAI's page exactly on every model checked (2026-09-14),
 *    including cache-write and image-token prices.
 *  - OpenAI's own pricing page, served as Markdown at pricing.md. Official, but
 *    a page and not a contract: if its tables change shape, the parser says so
 *    rather than returning nothing and letting "no change" through.
 *
 * And a third, which is not a feed but the truth: the Costs API, which says
 * what was actually charged (impliedPrices). Needs an Admin key.
 *
 * Nothing here decides anything. It produces sheets, differences and problems,
 * and a person approves a price.
 */
import { PRICE_UNITS, type ModelPriceSheet, type PriceUnit } from "./costMath";

export type FeedResult = {
  sheets: Record<string, ModelPriceSheet>;
  /** Watched models the feed did not have. */
  missing: string[];
  /** Anything that means the feed may have changed shape. Never silent. */
  problems: string[];
};

/**
 * Our catalogue id -> the id each source uses, where they differ.
 *
 * Empty today: every OpenAI model in MODEL_CATALOG goes by the same name in
 * both feeds. An entry goes here, not into modelPolicy.ts, the day one does not.
 */
export const FEED_ALIASES: Record<string, { litellm?: string; page?: string }> = {};

const perMillion = (perToken: unknown): number | undefined =>
  typeof perToken === "number" && Number.isFinite(perToken) && perToken >= 0
    ? Math.round(perToken * 1_000_000 * 1_000_000) / 1_000_000
    : undefined;

/**
 * LiteLLM prices are dollars PER TOKEN; ours are per million.
 *
 * Only the standard short-context rates: the app sends nothing near 272K
 * tokens and uses no batch, flex or priority tier, so those columns would be
 * prices for calls it never makes.
 */
export function parseLiteLLM(json: unknown, models: string[], kinds: Record<string, "text" | "image">): FeedResult {
  const out: FeedResult = { sheets: {}, missing: [], problems: [] };
  if (!json || typeof json !== "object") {
    out.problems.push("LiteLLM's price file was not a JSON object.");
    out.missing = [...models];
    return out;
  }
  const table = json as Record<string, Record<string, unknown>>;
  for (const model of models) {
    const entry = table[FEED_ALIASES[model]?.litellm ?? model];
    if (!entry || typeof entry !== "object") {
      out.missing.push(model);
      continue;
    }
    const sheet: ModelPriceSheet = {};
    const set = (unit: PriceUnit, v: unknown) => {
      const p = perMillion(v);
      if (p !== undefined) sheet[unit] = p;
    };
    set("input_text", entry.input_cost_per_token);
    set("input_cached", entry.cache_read_input_token_cost);
    set("input_cache_write", entry.cache_creation_input_token_cost);
    set("output_text", entry.output_cost_per_token);
    if (kinds[model] === "image") {
      set("input_image", entry.input_cost_per_image_token);
      set("input_image_cached", entry.cache_read_input_image_token_cost);
      set("output_image", entry.output_cost_per_image_token);
    } else if (sheet.input_text !== undefined) {
      // A chat model bills an attached image as ordinary input tokens.
      sheet.input_image = sheet.input_text;
    }
    if (sheet.input_text === undefined && sheet.output_image === undefined) {
      out.problems.push(`LiteLLM has an entry for ${model} but no price fields this parser recognises.`);
      out.missing.push(model);
      continue;
    }
    out.sheets[model] = sheet;
  }
  return out;
}

const dollars = (cell: string | undefined): number | undefined => {
  const m = /^\s*\$\s*([0-9]+(?:\.[0-9]+)?)\s*$/.exec(cell ?? "");
  return m ? Number(m[1]) : undefined;
};

type MdTable = { label: string; header: string[]; rows: string[][] };

/** Every Markdown table, with the nearest pricing mode named above it. */
function tablesOf(md: string): MdTable[] {
  const lines = md.split(/\r?\n/);
  const tables: MdTable[] = [];
  let label = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const mode = /^(?:#+\s*)?(Standard|Batch|Flex|Fast|Priority)\b/.exec(line);
    if (mode) label = mode[1];
    if (line.startsWith("|") && lines[i + 1]?.trim().startsWith("| ---")) {
      const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const header = cells(line);
      const rows: string[][] = [];
      let j = i + 2;
      for (; j < lines.length && lines[j].trim().startsWith("|"); j++) rows.push(cells(lines[j]));
      tables.push({ label, header, rows });
      i = j - 1;
    }
  }
  return tables;
}

/**
 * OpenAI's pricing page, Standard tier only.
 *
 * Two table shapes carry what we need: the text-model table
 * (Model | Short context input | Short context cached input | Short context
 * cache writes | Short context output | ...) and the image table (Model |
 * Modality | Input | Cached input | Output), one row per modality.
 */
export function parsePricingMd(md: string, models: string[], kinds: Record<string, "text" | "image">): FeedResult {
  const out: FeedResult = { sheets: {}, missing: [], problems: [] };
  const tables = tablesOf(md).filter((t) => t.label === "Standard");
  const textTable = tables.find((t) => t.header[0] === "Model" && t.header.includes("Short context input"));
  const imageTable = tables.find((t) => t.header[0] === "Model" && t.header[1] === "Modality");
  if (!textTable) out.problems.push("OpenAI's pricing page has no Standard text-model table in the shape this parser knows.");
  if (!imageTable) out.problems.push("OpenAI's pricing page has no Standard image-model table in the shape this parser knows.");

  for (const model of models) {
    const name = FEED_ALIASES[model]?.page ?? model;
    const sheet: ModelPriceSheet = {};
    if (kinds[model] === "image" && imageTable) {
      const col = (h: string) => imageTable.header.indexOf(h);
      for (const row of imageTable.rows.filter((r) => r[0] === name)) {
        const input = dollars(row[col("Input")]);
        const cached = dollars(row[col("Cached input")]);
        const output = dollars(row[col("Output")]);
        if (row[1] === "Image") {
          if (input !== undefined) sheet.input_image = input;
          if (cached !== undefined) sheet.input_image_cached = cached;
          if (output !== undefined) sheet.output_image = output;
        } else if (row[1] === "Text") {
          if (input !== undefined) sheet.input_text = input;
          if (cached !== undefined) sheet.input_cached = cached;
          if (output !== undefined) sheet.output_text = output;
        }
      }
    } else if (kinds[model] !== "image" && textTable) {
      // A model listed with a qualifier -- "gpt-5.5 (<272K context length)" -- is the same model.
      const row = textTable.rows.find((r) => r[0] === name || r[0].startsWith(`${name} (`));
      if (row) {
        const col = (h: string) => textTable.header.indexOf(h);
        const input = dollars(row[col("Short context input")]);
        const cached = dollars(row[col("Short context cached input")]);
        const write = dollars(row[col("Short context cache writes")]);
        const output = dollars(row[col("Short context output")]);
        if (input !== undefined) {
          sheet.input_text = input;
          sheet.input_image = input;
        }
        if (cached !== undefined) sheet.input_cached = cached;
        if (write !== undefined) sheet.input_cache_write = write;
        if (output !== undefined) sheet.output_text = output;
      }
    }
    if (Object.keys(sheet).length) out.sheets[model] = sheet;
    else out.missing.push(model);
  }
  return out;
}

export type PriceChange = { model: string; unit: PriceUnit; from?: number; to?: number };
export type PriceConflict = { model: string; unit: PriceUnit; litellm: number; page: number };

/** Two prices are the same price within half a percent (feeds round differently). */
const same = (a: number, b: number) => Math.abs(a - b) <= Math.max(a, b) * 0.005 + 1e-9;

/**
 * One sheet per model from both feeds.
 *
 * OpenAI's own page wins where both have a price, because it is the source;
 * LiteLLM fills the units the page does not list. Every disagreement is kept
 * as a conflict and shown -- a feed that is wrong is something to know about,
 * not something to average away.
 */
export function combineFeeds(
  litellm: FeedResult,
  page: FeedResult,
  models: string[],
): { sheets: Record<string, ModelPriceSheet>; conflicts: PriceConflict[] } {
  const sheets: Record<string, ModelPriceSheet> = {};
  const conflicts: PriceConflict[] = [];
  for (const model of models) {
    const a = litellm.sheets[model] ?? {};
    const b = page.sheets[model] ?? {};
    const sheet: ModelPriceSheet = {};
    for (const unit of PRICE_UNITS) {
      const x = a[unit];
      const y = b[unit];
      if (x !== undefined && y !== undefined && !same(x, y)) conflicts.push({ model, unit, litellm: x, page: y });
      const v = y ?? x;
      if (v !== undefined) sheet[unit] = v;
    }
    if (Object.keys(sheet).length) sheets[model] = sheet;
  }
  return { sheets, conflicts };
}

/**
 * What would change if the incoming sheets were approved.
 *
 * A unit the feeds no longer list is NOT a removal: a feed dropping a column is
 * likelier than OpenAI making something free. It is reported (to: undefined)
 * and the proposal carries the current price forward -- see proposedSheets.
 */
export function diffPrices(
  current: Record<string, ModelPriceSheet>,
  incoming: Record<string, ModelPriceSheet>,
  models: string[],
): PriceChange[] {
  const changes: PriceChange[] = [];
  for (const model of models) {
    const c = current[model] ?? {};
    const n = incoming[model] ?? {};
    for (const unit of PRICE_UNITS) {
      const from = c[unit];
      const to = n[unit];
      if (from === undefined && to === undefined) continue;
      if (from !== undefined && to !== undefined && same(from, to)) continue;
      if (to === undefined && !incoming[model]) continue; // model missing from every feed: reported elsewhere
      changes.push({ model, unit, ...(from !== undefined ? { from } : {}), ...(to !== undefined ? { to } : {}) });
    }
  }
  return changes;
}

/** The full row set a proposal stores: incoming prices, with anything the feeds dropped kept. */
export function proposedSheets(
  current: Record<string, ModelPriceSheet>,
  incoming: Record<string, ModelPriceSheet>,
  models: string[],
): Record<string, ModelPriceSheet> {
  const out: Record<string, ModelPriceSheet> = {};
  for (const model of models) {
    const merged = { ...(current[model] ?? {}), ...(incoming[model] ?? {}) };
    if (Object.keys(merged).length) out[model] = merged;
  }
  return out;
}

/** A stable fingerprint of a row set, so the same proposal is never filed twice. */
export function sheetsFingerprint(sheets: Record<string, ModelPriceSheet>): string {
  return Object.keys(sheets)
    .sort()
    .map((m) => `${m}:${PRICE_UNITS.filter((u) => sheets[m][u] !== undefined).map((u) => `${u}=${sheets[m][u]}`).join(",")}`)
    .join(";");
}

/**
 * Prices as actually CHARGED, from the Costs API grouped by line item.
 *
 * Each result carries amount, quantity and quantity_unit, and a line item that
 * names the model and what was billed ("gpt-6-astra, input_tokens" in OpenAI's
 * example). amount / quantity is the real rate. The docs show one example name;
 * the rest are mapped by the words they contain, and anything unrecognised is
 * returned as `unmapped` so the panel shows it instead of dropping it.
 */
export type CostRow = { line_item?: string; amount?: { value?: number }; quantity?: number; quantity_unit?: string };
export function impliedPrices(rows: CostRow[]): {
  prices: Array<{ model: string; unit: PriceUnit; usdPerMillion: number; amountUsd: number }>;
  unmapped: string[];
} {
  const scale: Record<string, number> = { tokens: 1_000_000, "1k_tokens": 1_000, "1000_tokens": 1_000, "1m_tokens": 1, "1M_tokens": 1 };
  const acc = new Map<string, { model: string; unit: PriceUnit; amount: number; quantity: number }>();
  const unmapped = new Set<string>();
  for (const r of rows) {
    const item = String(r.line_item ?? "");
    const [modelPart, typePart = ""] = item.split(/,\s*/);
    const t = typePart.toLowerCase();
    const unit: PriceUnit | undefined =
      /image/.test(t) && /output/.test(t) ? "output_image"
      : /image/.test(t) && /cache/.test(t) ? "input_image_cached"
      : /image/.test(t) ? "input_image"
      : /cache.*(write|creation)/.test(t) ? "input_cache_write"
      : /cache/.test(t) ? "input_cached"
      : /output/.test(t) ? "output_text"
      : /input/.test(t) ? "input_text"
      : undefined;
    const factor = scale[String(r.quantity_unit ?? "")];
    const amount = Number(r.amount?.value);
    const quantity = Number(r.quantity);
    if (!modelPart || !unit || !factor || !Number.isFinite(amount) || !Number.isFinite(quantity) || quantity <= 0) {
      if (item) unmapped.add(`${item} (${r.quantity_unit ?? "no unit"})`);
      continue;
    }
    const key = `${modelPart}|${unit}`;
    const prev = acc.get(key) ?? { model: modelPart, unit, amount: 0, quantity: 0 };
    prev.amount += amount;
    // In millions of tokens, the unit prices are quoted in.
    prev.quantity += quantity / factor;
    acc.set(key, prev);
  }
  return {
    prices: Array.from(acc.values()).map((v) => ({
      model: v.model,
      unit: v.unit,
      usdPerMillion: v.quantity > 0 ? Math.round((v.amount / v.quantity) * 1e6) / 1e6 : 0,
      amountUsd: v.amount,
    })),
    unmapped: Array.from(unmapped),
  };
}

/** Relative drift between two amounts, as a fraction of the larger. */
export function drift(a: number, b: number): number {
  const top = Math.max(Math.abs(a), Math.abs(b));
  return top === 0 ? 0 : Math.abs(a - b) / top;
}
