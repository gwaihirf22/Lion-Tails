/**
 * Watching what OpenAI charges, so a price change is a warning and not a loss.
 *
 * Once a day (and whenever the admin panel says "Check now"):
 *  1. Fetch LiteLLM's price file and OpenAI's pricing page, parse both
 *     (priceFeeds.ts), and compare with the approved prices. A difference files
 *     ONE proposal -- the whole row set, with every change and every
 *     disagreement between the feeds as evidence. Never applied on its own.
 *  2. With OPENAI_ADMIN_KEY set, ask the Costs API what was actually charged:
 *     per-unit rates against the approved prices, and the billed total against
 *     the ledger, which is how a call path the ledger misses gets noticed.
 *
 * Nothing here throws out of the scheduler. A feed that fails is recorded as
 * failing -- "OpenAI's page could not be read" is itself a warning -- and the
 * next check runs anyway.
 *
 * OPENAI_ADMIN_KEY (or OPENAI_ADMIN_KEY_FILE) is read here and nowhere else. It is an organisation admin
 * credential, not a model key: modelPolicy.ts never sees it, and it is never
 * returned by a route (the panel is told only whether it is set).
 */
import fs from "fs";
import { pool, databaseReady } from "../db";
import { MODEL_CATALOG } from "./modelPolicy";
import { forgetPrices, loadApprovedPrices } from "./modelCalls";
import type { ModelPriceSheet } from "./costMath";
import { PRICE_UNITS } from "./costMath";
import {
  combineFeeds,
  diffPrices,
  drift,
  readBill,
  parseLiteLLM,
  parsePricingMd,
  proposedSheets,
  sheetsFingerprint,
  type CostRow,
  type FeedResult,
} from "./priceFeeds";

export const LITELLM_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
export const OPENAI_PRICING_URL = "https://developers.openai.com/api/docs/pricing.md";
const COSTS_URL = "https://api.openai.com/v1/organization/costs";

/** A rate the Costs API shows more than this far from the approved price. */
export const RATE_TOLERANCE = 0.02;
/** Billed total against the ledger, over a week. Wider: timing and rounding. */
export const TOTAL_TOLERANCE = 0.05;

const DAY_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 30_000;

/**
 * The Admin key, from the environment or from a file.
 *
 * OPENAI_ADMIN_KEY_FILE is the preferred form in production: the key sits in a
 * root-only file mounted read-only into the container, so it never has to be
 * written into docker-compose.yml, which is copied into backups and diffs.
 * OPENAI_ADMIN_KEY still works for a dev shell. Read on every use rather than
 * cached, so replacing the file (rotating the key) needs no restart.
 */
export function adminKey(): string | undefined {
  const direct = process.env.OPENAI_ADMIN_KEY?.trim();
  if (direct) return direct;
  const file = process.env.OPENAI_ADMIN_KEY_FILE;
  if (!file) return undefined;
  try {
    return fs.readFileSync(file, "utf8").split(/\r?\n/)[0].trim() || undefined;
  } catch {
    return undefined;
  }
}

/** The OpenAI models the app can call, and whether each is a picture model. */
export function watchedModels(): { models: string[]; kinds: Record<string, "text" | "image"> } {
  const models: string[] = [];
  const kinds: Record<string, "text" | "image"> = {};
  for (const [id, spec] of Object.entries(MODEL_CATALOG)) {
    if (spec.provider !== "openai") continue;
    models.push(id);
    kinds[id] = spec.kinds.includes("image") ? "image" : "text";
  }
  return { models, kinds };
}

type SourceStatus = { ok: boolean; at: string; error?: string; missing?: string[]; problems?: string[] };
export type WatchStatus = {
  lastRunAt?: string;
  litellm?: SourceStatus;
  page?: SourceStatus;
  lastProposalId?: number;
  conflicts?: Array<{ model: string; unit: string; litellm: number; page: number }>;
};
export type BillCheck = {
  at: string;
  ok: boolean;
  error?: string;
  projectId?: string;
  /** Per model and unit: what was charged against what is approved. */
  rates: Array<{ model: string; unit: string; charged: number; approved?: number; off: boolean }>;
  unmapped: string[];
  /** Usage with no approved price, so it counts toward neither side of the comparison. */
  unpriced?: string[];
  /**
   * The week, three ways. billedUsd is what OpenAI charged. listValueUsd is
   * every token on the bill at the approved price, free ones included, and it
   * is what the ledger is compared with: the ledger prices at list too, so a
   * gap between those two means a call the ledger missed -- not free tokens.
   */
  window?: { from: string; to: string; billedUsd: number; listValueUsd: number; freeValueUsd: number; ledgerUsd: number; drift: number; off: boolean };
};

async function getSetting<T>(key: string): Promise<T | undefined> {
  const { rows } = await pool!.query("SELECT value FROM app_settings WHERE key = $1", [key]);
  return rows[0]?.value as T | undefined;
}
async function putSetting(key: string, value: unknown): Promise<void> {
  await pool!.query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}
export const readWatchStatus = () => getSetting<WatchStatus>("price_watch");
export const readBillCheck = () => getSetting<BillCheck>("bill_check");

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

/**
 * Compare the feeds with the approved prices, and file a proposal if they differ.
 *
 * Returns the proposal id, or undefined when nothing changed or an identical
 * proposal is already waiting (the same change is not filed every day).
 */
export async function runPriceCheck(): Promise<{ proposalId?: number; changes: number; status: WatchStatus }> {
  const { models, kinds } = watchedModels();
  const now = new Date().toISOString();
  const status: WatchStatus = { lastRunAt: now };

  const source = async (name: "litellm" | "page", url: string, parse: (body: string) => FeedResult): Promise<FeedResult> => {
    try {
      const result = parse(await fetchText(url));
      status[name] = { ok: result.problems.length === 0, at: now, missing: result.missing, problems: result.problems };
      return result;
    } catch (error) {
      status[name] = { ok: false, at: now, error: error instanceof Error ? error.message : String(error) };
      return { sheets: {}, missing: [...models], problems: [] };
    }
  };
  const litellm = await source("litellm", LITELLM_URL, (body) => {
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      json = undefined;
    }
    return parseLiteLLM(json, models, kinds);
  });
  const page = await source("page", OPENAI_PRICING_URL, (body) => parsePricingMd(body, models, kinds));

  const { sheets: incoming, conflicts } = combineFeeds(litellm, page, models);
  status.conflicts = conflicts;

  let proposalId: number | undefined;
  const current = (await loadApprovedPrices()).sheets;
  const currentObj: Record<string, ModelPriceSheet> = Object.fromEntries(current);
  const changes = diffPrices(currentObj, incoming, models);

  if (changes.length > 0) {
    const rows = proposedSheets(currentObj, incoming, models);
    const fingerprint = sheetsFingerprint(rows);
    const { rows: pending } = await pool!.query(
      "SELECT id FROM price_versions WHERE status = 'proposed' AND evidence->>'fingerprint' = $1 LIMIT 1",
      [fingerprint],
    );
    if (pending.length) {
      proposalId = Number(pending[0].id);
    } else {
      proposalId = await fileProposal(rows, {
        // Which feeds this proposal actually stands on, so "from litellm" is
        // never shown for prices OpenAI's own page supplied.
        source: [
          ...(Object.keys(litellm.sheets).length ? ["litellm"] : []),
          ...(Object.keys(page.sheets).length ? ["openai-page"] : []),
        ].join("+") || "none",
        note: `${changes.length} price${changes.length === 1 ? "" : "s"} differ from what is approved.`,
        evidence: { fingerprint, changes, conflicts, missing: { litellm: litellm.missing, page: page.missing } },
      });
    }
  }
  status.lastProposalId = proposalId;
  await putSetting("price_watch", status);
  return { proposalId, changes: changes.length, status };
}

/** Insert a proposed version and its rows in one transaction. */
export async function fileProposal(
  sheets: Record<string, ModelPriceSheet>,
  meta: { source: string; note: string; evidence: unknown; status?: "proposed" | "approved"; decidedBy?: number },
): Promise<number> {
  const client = await pool!.connect();
  try {
    await client.query("BEGIN");
    const status = meta.status ?? "proposed";
    const { rows } = await client.query(
      `INSERT INTO price_versions (source, status, note, evidence, decided_at, decided_by)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6) RETURNING id`,
      [meta.source, status, meta.note, JSON.stringify(meta.evidence), status === "approved" ? new Date() : null, meta.decidedBy ?? null],
    );
    const id = Number(rows[0].id);
    for (const [model, sheet] of Object.entries(sheets)) {
      for (const unit of PRICE_UNITS) {
        const price = sheet[unit];
        if (price === undefined) continue;
        await client.query(
          "INSERT INTO model_prices (version_id, model, unit, usd_per_million) VALUES ($1, $2, $3, $4)",
          [id, model, unit, price],
        );
      }
    }
    await client.query("COMMIT");
    if (status === "approved") forgetPrices();
    return id;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Approve or dismiss a proposal. Only a proposal can be decided, and only once. */
export async function decideProposal(id: number, decision: "approved" | "dismissed", userId: number): Promise<boolean> {
  const { rowCount } = await pool!.query(
    `UPDATE price_versions SET status = $1, decided_at = now(), decided_by = $2
      WHERE id = $3 AND status = 'proposed'`,
    [decision, userId, id],
  );
  if (rowCount) forgetPrices();
  return Boolean(rowCount);
}

/**
 * What OpenAI actually charged, against what the ledger and the prices say.
 *
 * Costs are daily buckets, and today's is incomplete, so the window is the
 * seven whole days before today (UTC). Scoped to OPENAI_PROJECT_ID when set;
 * without it the organisation's whole bill is compared, which is only a fair
 * test if this app is the only thing spending in it -- the panel says which.
 */
export async function runBillCheck(): Promise<BillCheck | undefined> {
  const key = adminKey();
  if (!key) return undefined;
  const projectId = process.env.OPENAI_PROJECT_ID || undefined;
  const at = new Date().toISOString();
  const end = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const start = new Date(end.getTime() - 7 * DAY_MS);

  const result: BillCheck = { at, ok: false, projectId, rates: [], unmapped: [] };
  try {
    const rows: CostRow[] = [];
    let page: string | undefined;
    for (let i = 0; i < 20; i++) {
      const url = new URL(COSTS_URL);
      url.searchParams.set("start_time", String(Math.floor(start.getTime() / 1000)));
      url.searchParams.set("end_time", String(Math.floor(end.getTime() / 1000)));
      url.searchParams.set("bucket_width", "1d");
      url.searchParams.append("group_by", "line_item");
      if (projectId) url.searchParams.append("project_ids", projectId);
      url.searchParams.set("limit", "180");
      if (page) url.searchParams.set("page", page);
      const body = JSON.parse(
        await fetchText(url.toString(), { headers: { Authorization: `Bearer ${key}` } }),
      ) as { data?: Array<{ start_time?: number; results?: CostRow[] }>; has_more?: boolean; next_page?: string };
      // Each row keeps its day, so the ledger comparison can start where the ledger does.
      for (const bucket of body.data ?? []) {
        rows.push(...(bucket.results ?? []).map((r) => ({ ...r, day: bucket.start_time })));
      }
      if (!body.has_more || !body.next_page) break;
      page = body.next_page;
    }

    const approved = Object.fromEntries((await loadApprovedPrices()).sheets);
    const bill = readBill(rows, approved);
    result.rates = bill.prices.map((p) => {
      const price = approved[p.model]?.[p.unit];
      return {
        model: p.model,
        unit: p.unit,
        charged: p.usdPerMillion,
        ...(price !== undefined ? { approved: price } : {}),
        off: price === undefined ? false : drift(p.usdPerMillion, price) > RATE_TOLERANCE,
      };
    });
    result.unmapped = bill.unmapped;
    result.unpriced = bill.unpriced;

    /**
     * ONLY THE DAYS THE LEDGER HAS BEEN RUNNING. The week before this shipped has
     * a bill and no ledger, and comparing them reads as "every call is going
     * unrecorded" for the first seven days. So the comparison starts at the
     * first whole day after the ledger's first row, and is not made at all
     * until there is one.
     */
    const { rows: first } = await pool!.query("SELECT MIN(created_at) AS at FROM model_calls");
    const firstAt = first[0]?.at ? new Date(first[0].at) : undefined;
    const firstWholeDay = firstAt ? new Date(firstAt.toISOString().slice(0, 10) + "T00:00:00Z").getTime() + DAY_MS : undefined;
    const compareFrom = new Date(Math.max(start.getTime(), firstWholeDay ?? end.getTime()));
    if (compareFrom.getTime() < end.getTime()) {
      const inWindow = readBill(rows.filter((r) => (r.day ?? 0) * 1000 >= compareFrom.getTime()), approved);
      const { rows: ledger } = await pool!.query(
        `SELECT COALESCE(SUM(cost_micros), 0)::bigint AS micros FROM model_calls
          WHERE owner_paid AND created_at >= $1 AND created_at < $2`,
        [compareFrom, end],
      );
      const ledgerUsd = Number(ledger[0].micros) / 1_000_000;
      const d = drift(inWindow.listValueUsd, ledgerUsd);
      result.window = {
        from: compareFrom.toISOString(),
        to: end.toISOString(),
        billedUsd: inWindow.billedUsd,
        listValueUsd: inWindow.listValueUsd,
        freeValueUsd: inWindow.freeValueUsd,
        ledgerUsd,
        drift: d,
        off: d > TOTAL_TOLERANCE && Math.abs(inWindow.listValueUsd - ledgerUsd) > 0.05,
      };
    }
    result.ok = true;
  } catch (error) {
    // The message only: the key is in the request, never in an error we keep.
    result.error = error instanceof Error ? error.message.replace(/sk-[A-Za-z0-9_-]+/g, "sk-…") : "failed";
  }
  await putSetting("bill_check", result);
  return result;
}

let timer: NodeJS.Timeout | undefined;

/**
 * Daily, self-scheduled after each run finishes -- the worker's shape, for the
 * worker's reason: a slow feed must not stack checks on top of each other.
 * The first check waits a few minutes, so a restart loop is not a fetch loop.
 */
export function startPriceWatch(): void {
  if (timer) return;
  const run = async () => {
    try {
      await runPriceCheck();
      await runBillCheck();
    } catch (error) {
      console.error("[price-watch] check failed:", error);
    } finally {
      timer = setTimeout(run, DAY_MS);
      timer.unref?.();
    }
  };
  databaseReady
    .then((ready) => {
      if (!ready || !pool) return;
      timer = setTimeout(run, 5 * 60 * 1000);
      timer.unref?.();
    })
    .catch(() => undefined);
}
