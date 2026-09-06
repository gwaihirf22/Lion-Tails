/**
 * Aggregates over generation_records, for the admin stats page.
 *
 * Read-only and admin-only. Every query here is a GROUP BY over a table that
 * grows by one row per generation attempt, on indexes that already exist
 * (model, outcome, created_at).
 *
 * Two things this deliberately does NOT do:
 *
 *  - It does not read `steps` on the list endpoints. That column holds the raw
 *    model replies and is the largest thing in the row; the summary views want
 *    counts, not payloads.
 *  - It does not expose user identities beyond the id. This is operational
 *    telemetry about models, not a view of what individual children asked for.
 */
import { pool } from "../db";

/**
 * Records written before a given moment are missing fields added later, and a
 * chart that silently mixes them misreports rather than under-reports. The
 * stats page states the window it is describing instead.
 */
export type StatsWindow = { days: number };

export type ModelStats = {
  model: string;
  provider: string;
  tier: string;
  attempts: number;
  succeeded: number;
  failed: number;
  successRate: number;
  medianDurationMs: number | null;
  avgTotalTokens: number | null;
  avgWordRatio: number | null;
  retriedCalls: number;
  truncatedCalls: number;
};

export type FailureStats = { failureCode: string; n: number; models: string[] };

export type StepCost = {
  step: string;
  model: string;
  calls: number;
  medianCompletionTokens: number | null;
  truncated: number;
};

export async function getModelStats(window: StatsWindow): Promise<ModelStats[]> {
  if (!pool) return [];
  const { rows } = await pool.query(
    `
    SELECT
      model, provider, tier,
      count(*)::int                                             AS attempts,
      count(*) FILTER (WHERE outcome = 'succeeded')::int         AS succeeded,
      count(*) FILTER (WHERE outcome = 'failed')::int            AS failed,
      -- Median, not mean: one 500-second gpt-oss outlier drags an average
      -- somewhere no actual generation has ever been.
      percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms)   AS median_duration_ms,
      avg(total_tokens) FILTER (WHERE total_tokens > 0)          AS avg_total_tokens,
      -- Delivered vs requested. The number that mattered most in the
      -- benchmarks, and the one a success/failure count cannot show.
      avg(actual_word_count::numeric / NULLIF(target_word_count, 0))
        FILTER (WHERE actual_word_count IS NOT NULL)             AS avg_word_ratio,
      coalesce(sum(retried_calls), 0)::int                       AS retried_calls,
      coalesce(sum(truncated_calls), 0)::int                     AS truncated_calls
    FROM generation_records
    WHERE created_at > now() - ($1 || ' days')::interval
    GROUP BY model, provider, tier
    ORDER BY attempts DESC
    `,
    [String(window.days)],
  );
  return rows.map((r) => ({
    model: r.model,
    provider: r.provider,
    tier: r.tier,
    attempts: r.attempts,
    succeeded: r.succeeded,
    failed: r.failed,
    successRate: r.attempts ? r.succeeded / r.attempts : 0,
    medianDurationMs: r.median_duration_ms === null ? null : Number(r.median_duration_ms),
    avgTotalTokens: r.avg_total_tokens === null ? null : Number(r.avg_total_tokens),
    avgWordRatio: r.avg_word_ratio === null ? null : Number(r.avg_word_ratio),
    retriedCalls: r.retried_calls,
    truncatedCalls: r.truncated_calls,
  }));
}

export async function getFailureStats(window: StatsWindow): Promise<FailureStats[]> {
  if (!pool) return [];
  const { rows } = await pool.query(
    `
    SELECT failure_code, count(*)::int AS n, array_agg(DISTINCT model) AS models
    FROM generation_records
    WHERE outcome = 'failed'
      AND failure_code IS NOT NULL
      AND created_at > now() - ($1 || ' days')::interval
    GROUP BY failure_code
    ORDER BY n DESC
    `,
    [String(window.days)],
  );
  return rows.map((r) => ({ failureCode: r.failure_code, n: r.n, models: r.models }));
}

/**
 * Cost per step, which is the question the benchmarks raised and could not
 * answer from one generation: on gpt-oss the outline took 140 seconds and
 * thousands of reasoning tokens to produce seven short strings, while the same
 * model writes a 400-word chapter faster.
 *
 * If that holds across many generations, planning and prose are different jobs
 * and want different models. This turns that from an anecdote into a query.
 */
export async function getStepCosts(window: StatsWindow): Promise<StepCost[]> {
  if (!pool) return [];
  const { rows } = await pool.query(
    `
    SELECT
      -- Chapter steps carry the outline text in their name, so they would
      -- otherwise be one group each. Collapse them to "generateChapter".
      CASE WHEN s->>'step' LIKE 'generateChapter%' THEN 'generateChapter'
           ELSE s->>'step' END                                   AS step,
      g.model,
      count(*)::int                                              AS calls,
      percentile_cont(0.5) WITHIN GROUP (
        ORDER BY (s->'usage'->>'completion_tokens')::numeric
      )                                                          AS median_completion_tokens,
      count(*) FILTER (WHERE s->>'finishReason' = 'length')::int  AS truncated
    FROM generation_records g
    CROSS JOIN LATERAL jsonb_array_elements(g.steps) AS s
    WHERE g.created_at > now() - ($1 || ' days')::interval
      AND g.steps IS NOT NULL
      -- Only real model calls. Bookkeeping entries (the request header, the
      -- length check) have no usage.
      AND s ? 'usage'
      AND (s->'usage'->>'completion_tokens') IS NOT NULL
    GROUP BY 1, 2
    ORDER BY median_completion_tokens DESC NULLS LAST
    `,
    [String(window.days)],
  );
  return rows.map((r) => ({
    step: r.step ?? "unknown",
    model: r.model,
    calls: r.calls,
    medianCompletionTokens:
      r.median_completion_tokens === null ? null : Number(r.median_completion_tokens),
    truncated: r.truncated,
  }));
}

export type RecentGeneration = {
  generationId: string;
  createdAt: string;
  model: string;
  storyLength: string | null;
  outcome: string;
  failureCode: string | null;
  durationMs: number | null;
  totalTokens: number | null;
  actualWordCount: number | null;
  targetWordCount: number | null;
  chapterWordCounts: number[] | null;
  appVersion: string | null;
};

export async function getRecentGenerations(limit = 50): Promise<RecentGeneration[]> {
  if (!pool) return [];
  const capped = Math.min(Math.max(limit, 1), 200);
  const { rows } = await pool.query(
    `
    SELECT generation_id, created_at, model, story_length, outcome, failure_code,
           duration_ms, total_tokens, actual_word_count, target_word_count,
           chapter_word_counts, app_version
    FROM generation_records
    ORDER BY created_at DESC
    LIMIT $1
    `,
    [capped],
  );
  return rows.map((r) => ({
    generationId: r.generation_id,
    createdAt: r.created_at,
    model: r.model,
    storyLength: r.story_length,
    outcome: r.outcome,
    failureCode: r.failure_code,
    durationMs: r.duration_ms,
    totalTokens: r.total_tokens,
    actualWordCount: r.actual_word_count,
    targetWordCount: r.target_word_count,
    chapterWordCounts: r.chapter_word_counts,
    appVersion: r.app_version,
  }));
}

export type JobHealth = {
  status: string;
  n: number;
  /** Claimed more than once: a restart or an eviction, not a model failure. */
  resumed: number;
};

/**
 * Job outcomes, which answer a different question from generation records:
 * how often work is interrupted rather than how often models fail.
 *
 * `resumed` counts jobs claimed more than once. Those are the runs whose
 * earlier attempts wrote NO generation_record -- the process died before the
 * write -- so token totals understate them. The undercount is biased toward
 * interrupted runs specifically, which is why this is shown next to the model
 * stats rather than buried.
 */
export async function getJobHealth(window: StatsWindow): Promise<JobHealth[]> {
  if (!pool) return [];
  const { rows } = await pool.query(
    `
    SELECT status,
           count(*)::int                                    AS n,
           count(*) FILTER (WHERE attempt_count > 1)::int   AS resumed
    FROM story_jobs
    WHERE created_at > now() - ($1 || ' days')::interval
    GROUP BY status
    ORDER BY n DESC
    `,
    [String(window.days)],
  );
  return rows.map((r) => ({ status: r.status, n: r.n, resumed: r.resumed }));
}
