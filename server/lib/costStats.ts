/**
 * The admin Costs page, read from the ledger. The judgements are costReport.ts.
 *
 * MEASURED, NEVER ESTIMATED. A story's cost is the sum of what its own calls
 * cost -- the retried chapter and the digging-deeper call included -- plus the
 * world extraction it caused. A price-sheet estimate (tokens a story "should"
 * take times the rate) would miss exactly the things that make real stories
 * more expensive than planned.
 */
import { pool, databaseReady } from "../db";
import { characterRoleOf, type StoryRequest } from "@shared/schema";
import { MODEL_CATALOG } from "./modelPolicy";
import { loadApprovedPrices } from "./modelCalls";
import { adminKey, readBillCheck, readWatchStatus, watchedModels } from "./priceWatch";
import {
  buildWarnings,
  suggestPrices,
  summarisePictures,
  summariseStories,
  type PictureSample,
  type StorySample,
} from "./costReport";

export const DEFAULT_MARGIN_PCT = 20;
const WINDOW_DAYS = 90;

export async function readMarginPct(): Promise<number> {
  const { rows } = await pool!.query("SELECT value FROM app_settings WHERE key = 'pricing_margin_pct'");
  const v = Number(rows[0]?.value);
  return Number.isFinite(v) ? v : DEFAULT_MARGIN_PCT;
}

export async function writeMarginPct(pct: number): Promise<void> {
  await pool!.query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ('pricing_margin_pct', $1::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify(pct)],
  );
}

async function storySamples(): Promise<{ samples: StorySample[]; incomplete: number }> {
  const { rows } = await pool!.query(
    `SELECT j.job_id, j.request,
            MIN(mc.model) FILTER (WHERE mc.purpose IN ('story-single','outline','chapter','finalize')) AS model,
            COALESCE(SUM(mc.cost_micros) FILTER (WHERE mc.purpose <> 'cover'), 0)::bigint AS own_micros,
            COUNT(*) FILTER (WHERE mc.purpose <> 'cover' AND mc.cost_micros IS NULL) AS unpriced,
            BOOL_OR(mc.purpose = 'digging') AS digging,
            COALESCE((SELECT SUM(x.cost_micros) FROM model_calls x
                       WHERE x.story_id = j.story_id AND x.purpose = 'extract'), 0)::bigint AS extract_micros,
            (SELECT COUNT(*) FROM model_calls x
              WHERE x.story_id = j.story_id AND x.purpose = 'extract' AND x.cost_micros IS NULL) AS extract_unpriced
       FROM story_jobs j
       JOIN model_calls mc ON mc.job_id = j.job_id
      WHERE j.kind = 'story' AND j.status = 'succeeded'
        AND j.created_at > now() - make_interval(days => $1)
      GROUP BY j.job_id`,
    [WINDOW_DAYS],
  );
  const samples: StorySample[] = [];
  let incomplete = 0;
  for (const r of rows) {
    // A story with any unpriced call has an unknown cost, and is left out
    // rather than counted cheap.
    if (Number(r.unpriced) > 0 || Number(r.extract_unpriced) > 0 || !r.model) {
      incomplete++;
      continue;
    }
    const request = r.request as StoryRequest;
    samples.push({
      length: request.storyLength ?? "unknown",
      model: r.model,
      quest: characterRoleOf(request) === "travels",
      digging: Boolean(r.digging),
      micros: Number(r.own_micros) + Number(r.extract_micros),
    });
  }
  return { samples, incomplete };
}

async function pictureSamples(): Promise<PictureSample[]> {
  const { rows } = await pool!.query(
    `SELECT purpose, model, COALESCE(image_size, '') AS size,
            COALESCE(image_quality, 'auto') AS quality, cost_micros
       FROM model_calls
      WHERE purpose IN ('cover', 'passage-picture', 'redraw', 'avatar', 'passage-scene')
        AND outcome = 'succeeded' AND cost_micros IS NOT NULL
        AND created_at > now() - make_interval(days => $1)`,
    [WINDOW_DAYS],
  );
  return rows.map((r) => ({
    purpose: r.purpose,
    model: r.model,
    size: r.size,
    quality: r.quality,
    micros: Number(r.cost_micros),
  }));
}

export async function publishedPriceList(): Promise<
  { versionId: number; createdAt: string; marginPct: number; items: Array<{ item: string; priceCents: number; basisMicros: number; samples: number }> } | undefined
> {
  const { rows } = await pool!.query(
    "SELECT id, created_at, margin_pct FROM price_list_versions WHERE status = 'published' ORDER BY id DESC LIMIT 1",
  );
  if (!rows.length) return undefined;
  const { rows: items } = await pool!.query(
    "SELECT item, price_cents, basis_cost_micros, samples FROM price_list_items WHERE version_id = $1 ORDER BY item",
    [rows[0].id],
  );
  return {
    versionId: Number(rows[0].id),
    createdAt: new Date(rows[0].created_at).toISOString(),
    marginPct: Number(rows[0].margin_pct),
    items: items.map((i) => ({
      item: i.item,
      priceCents: Number(i.price_cents),
      basisMicros: Number(i.basis_cost_micros),
      samples: Number(i.samples),
    })),
  };
}

/** Everything the admin Costs page shows, in one read. */
export async function costsReport() {
  const ready = await databaseReady;
  if (!ready || !pool) throw new Error("The costs report needs the database.");

  const [{ samples: stories, incomplete }, pictures, marginPct, watch, bill, published, book] = await Promise.all([
    storySamples(),
    pictureSamples(),
    readMarginPct(),
    readWatchStatus(),
    readBillCheck(),
    publishedPriceList(),
    loadApprovedPrices(),
  ]);
  const storyGroups = summariseStories(stories);
  const pictureGroups = summarisePictures(pictures);
  const measured = [...storyGroups.items, ...pictureGroups];

  const { rows: proposals } = await pool.query(
    `SELECT pv.id, pv.created_at, pv.source, pv.note, pv.evidence,
            COALESCE(json_agg(json_build_object('model', mp.model, 'unit', mp.unit, 'usdPerMillion', mp.usd_per_million))
              FILTER (WHERE mp.id IS NOT NULL), '[]') AS rows
       FROM price_versions pv LEFT JOIN model_prices mp ON mp.version_id = pv.id
      WHERE pv.status = 'proposed'
      GROUP BY pv.id ORDER BY pv.id DESC`,
  );
  const { rows: unpriced } = await pool.query(
    "SELECT COUNT(*)::int AS n FROM model_calls WHERE cost_micros IS NULL AND created_at > now() - make_interval(days => $1)",
    [WINDOW_DAYS],
  );

  const { models } = watchedModels();
  const unpricedModels = models.filter((m) => !book.sheets.has(m));
  const billCheckEnabled = Boolean(adminKey());

  const warnings = buildWarnings({
    pendingProposals: proposals.map((p) => ({
      id: Number(p.id),
      changes: Array.isArray(p.evidence?.changes) ? p.evidence.changes.length : 0,
      conflicts: Array.isArray(p.evidence?.conflicts) ? p.evidence.conflicts.length : 0,
    })),
    unpricedModels,
    unpricedCalls: unpriced[0].n,
    published: published?.items ?? [],
    measured,
    watch,
    bill,
    billCheckEnabled,
  });

  return {
    warnings,
    proposals: proposals.map((p) => ({
      id: Number(p.id),
      createdAt: new Date(p.created_at).toISOString(),
      source: p.source,
      note: p.note,
      evidence: p.evidence,
      rows: (p.rows as Array<{ model: string; unit: string; usdPerMillion: string }>).map((r) => ({ ...r, usdPerMillion: Number(r.usdPerMillion) })),
    })),
    approved: Object.fromEntries(
      Array.from(book.sheets.entries()).map(([model, sheet]) => [model, { sheet, versionId: book.versionOf.get(model) }]),
    ),
    catalogue: models.map((m) => ({ model: m, label: MODEL_CATALOG[m]?.label ?? m })),
    stories: { ...storyGroups, incomplete },
    pictures: pictureGroups,
    marginPct,
    suggested: suggestPrices(measured, marginPct),
    published: published ?? null,
    watch: watch ?? null,
    bill: bill ?? null,
    billCheckEnabled,
    billProjectScoped: Boolean(process.env.COSTS_PROJECT_ID),
    windowDays: WINDOW_DAYS,
  };
}

/**
 * Publish the suggested list as it stands now, computed here and never taken
 * from the request -- a price list the client could write is a price list
 * anyone with the admin panel's network tab could set to zero.
 */
export async function publishSuggestedPrices(userId: number): Promise<number> {
  const report = await costsReport();
  if (report.suggested.length === 0) throw new Error("Nothing has enough measured stories or pictures to price yet.");
  const client = await pool!.connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE price_list_versions SET status = 'superseded' WHERE status = 'published'");
    const { rows } = await client.query(
      "INSERT INTO price_list_versions (status, published_by, margin_pct) VALUES ('published', $1, $2) RETURNING id",
      [userId, report.marginPct],
    );
    const id = Number(rows[0].id);
    for (const s of report.suggested) {
      await client.query(
        "INSERT INTO price_list_items (version_id, item, price_cents, basis_cost_micros, samples) VALUES ($1, $2, $3, $4, $5)",
        [id, s.item, s.priceCents, s.basisMicros, s.samples],
      );
    }
    await client.query("COMMIT");
    return id;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
