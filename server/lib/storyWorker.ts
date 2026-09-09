/**
 * In-process worker for story_jobs.
 *
 * Why in-process rather than a second container: the work is ~100% awaited
 * network I/O, and a separate compose service would be a second thing to keep
 * in sync with the hand-maintained server copy of docker-compose.yml. It starts
 * from createApp() behind the same `await databaseReady` gate seedReferenceData
 * already uses, which does three jobs at once -- it satisfies "no database means
 * refuse", it keeps the CI smoke test green (that boots with no DATABASE_URL),
 * and it needs no new infrastructure.
 *
 * RESUME IS A LEASE, NOT A STATE. An orphaned job is exactly
 * `status='running' AND lease_expires_at < now()`, and the claim query treats
 * that as claimable. Making "interrupted" a stored state would require the
 * write to come from the process that just died -- the one process you cannot
 * rely on.
 *
 * EVERY WRITE AFTER THE CLAIM CARRIES `AND worker_id = $me`. Zero rows affected
 * means this worker was evicted (its lease expired and another worker took the
 * job), so it abandons without writing. That is the whole race defence.
 */
import { randomUUID } from "crypto";
import { pool, databaseReady } from "../db";
import { resolveModel, createClient, tokenLimitFor, temperatureFor,
  hasUnlimitedUse,
} from "./modelPolicy";
import { StoryGenerationError } from "./storyErrors";
import {
  generateStoryFromJob,
  requestModelJson,
  MODEL_CONTEXT_LIMIT,
  TOKEN_BUDGET,
} from "./openai-implementation";
import {
  loadUniverseStories,
  selectWindow,
  summarySystemPrompt,
  summaryUserPrompt,
} from "./universeSummary";
import { newGenerationId, recordGeneration } from "./generationRecords";
import { characterIdsOf } from "@shared/schema";
import type { ResolvedModel } from "./modelPolicy";
import { storage } from "../storage";
import { enqueueStoryJob } from "./storyJobs";
import { createUniverse, setStoryUniverse } from "./storyUniverses";
import {
  extractionSystemPrompt,
  extractionUserPrompt,
  mergeWorldState,
  parseWorldPatch,
  type WorldEntry,
  type WorldPatch,
} from "./worldState";

/**
 * Lease 90s, heartbeat 20s, reaper 60s.
 *
 * The heartbeat runs on its own timer rather than at step boundaries, because a
 * single chapter can take 90+ seconds on a local model -- a heartbeat that only
 * fired between steps would let a healthy worker's lease lapse mid-chapter and
 * hand its job to someone else.
 */
const LEASE_MS = 90_000;
const HEARTBEAT_MS = 20_000;
const POLL_MS = 3_000;

/** Rises on every claim. A runaway guard, not a retry budget. */
const MAX_ATTEMPTS = 10;
/** Rises only on application errors. An interruption is not a failure. */
const MAX_ERRORS = 2;

const WORKER_ID = `${process.pid}-${randomUUID().slice(0, 8)}`;

let running = false;
let stopped = false;
let timer: NodeJS.Timeout | undefined;

export type JobRow = {
  job_id: string;
  user_id: number;
  /** "story" | "summary" -- the only thing runJob dispatches on. */
  kind: string;
  universe_id: string | null;
  status: string;
  request: any;
  brief: string;
  system_prompt: string;
  target_word_count: number;
  model: string;
  attempt_count: number;
  error_count: number;
  outline: string[] | null;
  chapters: string[] | null;
  /** Set on an extraction job: the story it reads. Set on a story job when it succeeds. */
  story_id: string | null;
  cancel_requested: boolean;
};

/**
 * Claim one job atomically.
 *
 * A single UPDATE whose subquery takes `FOR UPDATE SKIP LOCKED`, so a slow
 * container shutdown overlapping a new one is resolved by Postgres rather than
 * by hoping. Queued jobs and expired-lease jobs are claimable by the same
 * query, which is what makes resume fall out of the lease rather than needing
 * its own code path.
 */
async function claimJob(): Promise<JobRow | null> {
  const { rows } = await pool!.query(
    `
    UPDATE story_jobs SET
      status = 'running',
      worker_id = $1,
      lease_expires_at = now() + ($2 || ' milliseconds')::interval,
      attempt_count = attempt_count + 1,
      started_at = COALESCE(started_at, now()),
      updated_at = now()
    WHERE job_id = (
      SELECT job_id FROM story_jobs
      WHERE (status = 'queued')
         OR (status = 'running' AND lease_expires_at < now())
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *
    `,
    [WORKER_ID, String(LEASE_MS)],
  );
  return rows[0] ?? null;
}

/** Renew the lease. Returns false if this worker no longer owns the job. */
async function heartbeat(jobId: string): Promise<boolean> {
  const { rowCount } = await pool!.query(
    `UPDATE story_jobs
        SET lease_expires_at = now() + ($1 || ' milliseconds')::interval,
            updated_at = now()
      WHERE job_id = $2 AND worker_id = $3 AND status = 'running'`,
    [String(LEASE_MS), jobId, WORKER_ID],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Checkpoint. Returns false when this worker has been evicted, which the caller
 * treats as "stop immediately and write nothing else".
 */
async function checkpoint(
  jobId: string,
  patch: { step?: string; outline?: string[]; chapters?: string[] },
): Promise<boolean> {
  const { rowCount } = await pool!.query(
    `UPDATE story_jobs
        SET step = COALESCE($1, step),
            outline = COALESCE($2::jsonb, outline),
            chapters = COALESCE($3::jsonb, chapters),
            updated_at = now()
      WHERE job_id = $4 AND worker_id = $5 AND status = 'running'`,
    [
      patch.step ?? null,
      patch.outline ? JSON.stringify(patch.outline) : null,
      patch.chapters ? JSON.stringify(patch.chapters) : null,
      jobId,
      WORKER_ID,
    ],
  );
  return (rowCount ?? 0) > 0;
}

/** Has the user asked to cancel? Checked at step boundaries only. */
async function isCancelled(jobId: string): Promise<boolean> {
  const { rows } = await pool!.query(
    `SELECT cancel_requested FROM story_jobs WHERE job_id = $1`,
    [jobId],
  );
  return Boolean(rows[0]?.cancel_requested);
}

/**
 * Finish a job and consume quota in the SAME transaction.
 *
 * Quota moves here from the enqueue path, guarded by `status = 'running'` so it
 * fires at most once per job however many times the job was claimed. A restart
 * then costs the user nothing. The check still happens at enqueue and counts
 * used + in-flight, and since a free-tier user's concurrency limit is 1 the
 * maximum unconsumed exposure is exactly one generation.
 */
async function finishSucceeded(job: JobRow, storyId: string): Promise<void> {
  const client = await pool!.connect();
  try {
    await client.query("BEGIN");
    const { rowCount } = await client.query(
      `UPDATE story_jobs
          SET status = 'succeeded', story_id = $1, finished_at = now(),
              updated_at = now(), worker_id = NULL, lease_expires_at = NULL,
              step = 'done'
        WHERE job_id = $2 AND worker_id = $3 AND status = 'running'`,
      [storyId, job.job_id, WORKER_ID],
    );
    if ((rowCount ?? 0) === 0) {
      // Evicted between the last checkpoint and here. Another worker owns this
      // job; do not consume quota for a result it will not use.
      await client.query("ROLLBACK");
      return;
    }
    // Local generation costs electricity, not credits. The quota exists to
    // protect the owner's OpenAI spend, so it is charged only when OpenAI was
    // actually used and the user was not paying with their own key.
    const usesOwnerCredits = await shouldChargeQuota(job.user_id);
    if (usesOwnerCredits) {
      await client.query(
        `INSERT INTO user_usage (user_id, count, last_reset_date)
         VALUES ($1, 1, now())
         ON CONFLICT (user_id) DO UPDATE SET count = user_usage.count + 1`,
        [job.user_id],
      );
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }

  await recordAdventure(job, storyId);
}

/**
 * Everyone in the cast went on the adventure, so everyone gets the point.
 *
 * AFTER the commit, and in its own try/catch, deliberately. Inside the finishing
 * transaction it would be atomic with the job -- which sounds better until you
 * notice the cost: any error in this statement rolls back a story that
 * generated perfectly well, and the user is told their story failed because a
 * stat point could not be written. "Nothing after a story is saved may fail it"
 * is already a rule in this repo, and this is squarely after.
 *
 * Losing atomicity costs little because the write is IDEMPOTENT: the NOT ... @>
 * guard means recording the same storyId twice changes nothing, so a crash
 * between the commit and this line loses one point and can be replayed safely
 * by anything that notices later. An extra point, by contrast, is the sort of
 * wrong nobody would ever spot.
 *
 * A failed story is not an adventure -- this is only reached from the succeeded
 * path.
 */
async function recordAdventure(job: JobRow, storyId: string): Promise<void> {
  const cast = characterIdsOf(job.request);
  if (cast.length === 0) return;

  try {
    const theme = typeof job.request?.theme === "string" ? job.request.theme : undefined;
    const entry = JSON.stringify([{ storyId, theme, at: new Date().toISOString() }]);
    const seen = JSON.stringify([{ storyId }]);
    await pool!.query(
      `UPDATE user_characters
          SET character_data = jsonb_set(
                character_data, '{adventures}',
                COALESCE(character_data->'adventures', '[]'::jsonb) || $1::jsonb)
        WHERE character_id = ANY($2) AND user_id = $3
          AND NOT (COALESCE(character_data->'adventures', '[]'::jsonb) @> $4::jsonb)`,
      [entry, cast, job.user_id, seen],
    );
  } catch (e) {
    console.error(`[stats] could not record adventure ${storyId} for job ${job.job_id}:`, e);
  }
}

async function shouldChargeQuota(userId: number): Promise<boolean> {
  const resolved = await resolveModel(userId, "chat").catch(() => null);
  if (!resolved) return false;
  if (resolved.provider !== "openai") return false;
  // The third restatement of "own key or admin", now the same function as the
  // other two. Negated here because this asks the opposite question: the people
  // who are NOT charged are exactly the people who pay for their own use.
  return !hasUnlimitedUse({ isAdmin: resolved.isAdmin, hasOwnKey: resolved.usingOwnKey });
}

/**
 * Whether a retry of this failure must start from scratch rather than resume.
 *
 * story_too_short is the only failure where every step SUCCEEDED and the
 * assembled result was judged unacceptable. There is no incomplete step for
 * resume to redo -- so resuming would reassemble the identical chapters, fail
 * the identical length check, and burn the error budget with no possibility of
 * a different outcome. For the retry to mean anything it has to be a fresh
 * draw, which means discarding the checkpoint that the resume machinery exists
 * to preserve.
 *
 * The other retryables are the opposite: a malformed or truncated reply means
 * that step produced nothing, so resuming restarts from a genuinely incomplete
 * story and re-runs only the call that failed.
 *
 * This makes a too-short retry the most expensive retry in the system -- it
 * throws away complete work and regenerates from zero. error_count bounds it to
 * one, and that is deliberate.
 */
function retryNeedsFreshDraw(code: string): boolean {
  return code === "story_too_short";
}

async function finishFailed(
  job: JobRow,
  code: string,
  message: string,
  retryable: boolean,
): Promise<void> {
  const nextErrors = job.error_count + 1;
  const giveUp = !retryable || nextErrors >= MAX_ERRORS || job.attempt_count >= MAX_ATTEMPTS;
  const fresh = !giveUp && retryNeedsFreshDraw(code);
  await pool!.query(
    `UPDATE story_jobs
        SET status = $1,
            error_count = $2,
            failure_code = $3,
            failure_message = $4,
            finished_at = CASE WHEN $1 = 'failed' THEN now() ELSE NULL END,
            worker_id = NULL,
            lease_expires_at = NULL,
            outline = CASE WHEN $7 THEN NULL ELSE outline END,
            chapters = CASE WHEN $7 THEN NULL ELSE chapters END,
            step = CASE WHEN $7 THEN 'queued' ELSE step END,
            updated_at = now()
      WHERE job_id = $5 AND worker_id = $6`,
    [giveUp ? "failed" : "queued", nextErrors, code, message, job.job_id, WORKER_ID, fresh],
  );
  if (fresh) {
    console.warn(
      `[worker] job ${job.job_id} failed as ${code}; discarding the checkpoint so the retry is a fresh draw.`,
    );
  }
}

async function markCancelled(job: JobRow): Promise<void> {
  await pool!.query(
    `UPDATE story_jobs
        SET status = 'cancelled', finished_at = now(), updated_at = now(),
            worker_id = NULL, lease_expires_at = NULL
      WHERE job_id = $1 AND worker_id = $2`,
    [job.job_id, WORKER_ID],
  );
}


/**
 * Produce a universe summary.
 *
 * Shares the claim, lease, heartbeat, eviction defence, cancel and retry
 * machinery with story generation, and differs in three ways: the window is
 * assembled at enqueue rather than a brief, the result goes to
 * story_universes rather than user_stories, and it never touches quota.
 */

/**
 * Rebuild a summary job's window with one fewer story, after a truncation.
 *
 * Returns false when there is nothing left to drop, in which case the caller
 * lets the normal failure path run. This is what turns the character-based
 * token estimate from a correctness requirement into an optimisation: a bad
 * estimate costs one wasted call instead of breaking the feature.
 */
async function shrinkSummaryWindow(job: JobRow): Promise<boolean> {
  const ids: string[] = Array.isArray(job.outline) ? job.outline : [];
  if (ids.length <= 1 || !job.universe_id) return false;

  const { rows: uni } = await pool!.query(
    "SELECT summary, pinned_canon FROM story_universes WHERE universe_id = $1",
    [job.universe_id],
  );
  if (!uni[0]) return false;

  // Drop the OLDEST: the newest stories are the ones the next story most needs
  // to stay consistent with, and the dropped one is still represented by the
  // previous summary.
  const keep = ids.slice(1);
  const all = await loadUniverseStories(job.universe_id);
  const byId = new Map(all.map((s) => [s.storyId, s]));
  const stories = keep.map((id) => byId.get(id)).filter(Boolean) as typeof all;
  if (stories.length === 0) return false;

  const rebuilt = selectWindow({
    // selectWindow takes newest-first and re-orders internally.
    stories: [...stories].reverse(),
    existingSummary: uni[0].summary,
    canon: Array.isArray(uni[0].pinned_canon) ? uni[0].pinned_canon : [],
    contextLimit: MODEL_CONTEXT_LIMIT,
  });

  const { rowCount } = await pool!.query(
    `UPDATE story_jobs
        SET brief = $1, outline = $2::jsonb, updated_at = now()
      WHERE job_id = $3 AND worker_id = $4`,
    [rebuilt.text, JSON.stringify(rebuilt.storyIds), job.job_id, WORKER_ID],
  );
  if ((rowCount ?? 0) === 0) return false;
  console.warn(
    `[worker] summary ${job.job_id} truncated; window narrowed from ${ids.length} to ${rebuilt.storyIds.length} stories and requeued.`,
  );
  return true;
}

/**
 * Read one finished story and record what a LATER story must not contradict.
 *
 * Runs after a story that is part of a series -- the user ticked "I might write
 * more", or the story continues another. Never after a one-off, which is what
 * keeps this from being a call per story forever.
 *
 * Charges NO quota, for the same structural reason the summary does not: there
 * is simply no user_usage write on this path, rather than a flag someone can
 * forget to set.
 *
 * A failure here is not a failed story. The story is already written and saved;
 * losing its extraction costs continuity in a later story, not this one. So
 * this never retries and never surfaces an error to the user.
 */
async function runExtractJob(job: JobRow, resolved: ResolvedModel): Promise<void> {
  if (!job.universe_id || !job.story_id) {
    await finishFailed(job, "generation_failed", "Extraction job has no universe or story.", false);
    return;
  }
  if (!(await checkpoint(job.job_id, { step: "extracting" }))) return;

  const client = createClient(resolved);
  const debugData: any[] = [];
  const generationId = newGenerationId();
  const startedAt = Date.now();

  try {
    const { rows } = await pool!.query(
      "SELECT world_state FROM story_universes WHERE universe_id = $1",
      [job.universe_id],
    );
    const existing: WorldEntry[] = Array.isArray(rows[0]?.world_state) ? rows[0].world_state : [];
    // job.brief carries the story text, the way it carries the window for a
    // summary. Rebuilt here rather than read from the row so the prompt sees
    // the world as it is NOW -- two stories finishing close together would
    // otherwise both extract against the same stale world.
    const story = JSON.parse(job.brief) as { title: string; content: string };
    const prompt = extractionUserPrompt(story, existing);

    const patch = await requestModelJson<WorldPatch>({
      step: "extractWorld",
      model: resolved.model,
      debugData,
      maxTokens: TOKEN_BUDGET.json,
      prompt,
      validate: (v: unknown) => parseWorldPatch(v),
      call: async (maxTokens: number) => {
        const response = await client.chat.completions.create({
          model: resolved.model,
          messages: [
            { role: "system", content: extractionSystemPrompt() },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
          ...temperatureFor(resolved.model, 0.2),
          ...tokenLimitFor(resolved.model, maxTokens),
        });
        return {
          content: response.choices[0].message.content || "",
          finishReason: response.choices[0].finish_reason,
          usage: response.usage,
        };
      },
    });

    const merged = mergeWorldState(existing, patch, { sourceStoryId: job.story_id });

    await recordGeneration({
      generationId,
      jobId: job.job_id,
      kind: "summary",
      userId: job.user_id,
      resolved,
      request: {},
      targetWordCount: 0,
      startedAt,
      debugData,
      outcome: "succeeded",
    }).catch(() => {});

    // No quota write on this path. See the note above.
    const { rowCount } = await pool!.query(
      `UPDATE story_jobs
          SET status = 'succeeded', finished_at = now(), updated_at = now(),
              worker_id = NULL, lease_expires_at = NULL, step = 'done'
        WHERE job_id = $1 AND worker_id = $2 AND status = 'running'`,
      [job.job_id, WORKER_ID],
    );
    if ((rowCount ?? 0) === 0) return; // evicted; the other worker owns this
    // The summary rides on the SAME call and the same write. It can never be
    // stale, because the only thing that changes a world is a story, and every
    // story in a series rewrites it. That is what retires the separate
    // summarise job, its 8-story window and its staleness fingerprint.
    //
    // summary_inputs_hash is set to the current fingerprint so the OLD
    // staleness rule reports "current" rather than permanently "out of date"
    // for universes maintained this way.
    await pool!.query(
      `UPDATE story_universes u
          SET world_state = $1::jsonb,
              summary = COALESCE($2, u.summary),
              summary_updated_at = CASE WHEN $2 IS NULL THEN u.summary_updated_at ELSE now() END,
              summary_model = CASE WHEN $2 IS NULL THEN u.summary_model ELSE $3 END,
              summary_inputs_hash = md5(
                coalesce((SELECT string_agg(s.story_id, ',' ORDER BY s.story_id)
                            FROM user_stories s WHERE s.universe_id = u.universe_id), '')
                || '|' || u.pinned_canon::text
              ),
              updated_at = now()
        WHERE u.universe_id = $4`,
      [JSON.stringify(merged), patch.summary ?? null, resolved.model, job.universe_id],
    );
    console.log(
      `[worker] extracted ${patch.add?.length ?? 0} new and ${patch.update?.length ?? 0} revised for universe ${job.universe_id}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[worker] extraction ${job.job_id} failed:`, message);
    // Not retryable. The story is safe; a missing extraction costs continuity
    // later, and a retry loop on a background job the user cannot see is worse.
    await finishFailed(job, "generation_failed", message, false).catch(() => {});
  }
}

async function runSummaryJob(job: JobRow, resolved: ResolvedModel): Promise<void> {
  if (!job.universe_id) {
    await finishFailed(job, "generation_failed", "Summary job has no universe.", false);
    return;
  }
  if (!(await checkpoint(job.job_id, { step: "summarising" }))) return;

  const client = createClient(resolved);
  const debugData: any[] = [];
  const generationId = newGenerationId();
  const startedAt = Date.now();

  try {
    const parsed = await requestModelJson<{ summary: string; proposedCanon?: string[] }>({
      step: "summariseUniverse",
      model: resolved.model,
      debugData,
      maxTokens: TOKEN_BUDGET.json,
      prompt: summaryUserPrompt(job.brief, job.target_word_count),
      validate: (v: unknown) => {
        const o = v as { summary?: unknown };
        return typeof o?.summary === "string" && o.summary.trim().length > 0
          ? (v as { summary: string; proposedCanon?: string[] })
          : undefined;
      },
      call: async (maxTokens: number) => {
        const response = await client.chat.completions.create({
          model: resolved.model,
          messages: [
            { role: "system", content: summarySystemPrompt() },
            { role: "user", content: summaryUserPrompt(job.brief, job.target_word_count) },
          ],
          response_format: { type: "json_object" },
          ...temperatureFor(resolved.model, 0.3),
          ...tokenLimitFor(resolved.model, maxTokens),
        });
        return {
          content: response.choices[0].message.content || "",
          finishReason: response.choices[0].finish_reason,
          usage: response.usage,
        };
      },
    });

    await recordGeneration({
      generationId,
      jobId: job.job_id,
      kind: "summary",
      userId: job.user_id,
      resolved,
      request: {},
      targetWordCount: job.target_word_count,
      startedAt,
      debugData,
      outcome: "succeeded",
      actualWordCount: parsed.summary.split(/\s+/).filter(Boolean).length,
    });

    await finishSummarySucceeded(job, resolved, parsed.summary, parsed.proposedCanon ?? []);
  } catch (error) {
    const code = error instanceof StoryGenerationError ? error.code : "generation_failed";
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[worker] summary ${job.job_id} failed (${code}):`, message);
    await recordGeneration({
      generationId,
      jobId: job.job_id,
      kind: "summary",
      userId: job.user_id,
      resolved,
      request: {},
      targetWordCount: job.target_word_count,
      startedAt,
      debugData,
      outcome: "failed",
      failureCode: code,
      failureMessage: message,
    });
    if (code === "model_output_truncated") {
      // Requeueing the same window would truncate identically. Narrow it first,
      // and only fall through to the normal failure if there is nothing to drop.
      const narrowed = await shrinkSummaryWindow(job).catch((e) => {
        console.error("[worker] could not narrow the summary window:", e);
        return false;
      });
      if (narrowed) {
        await finishFailed(job, code, message, true);
        return;
      }
    }
    const retryable = code === "model_output_invalid";
    await finishFailed(job, code, message, retryable);
  }
}

/**
 * Finish a summary and write it to the universe, in one transaction.
 *
 * NO QUOTA. Not a flag someone can forget to set -- there is simply no
 * user_usage write on this path, which is what makes "summaries never cost
 * credits" structural rather than conventional.
 */
async function finishSummarySucceeded(
  job: JobRow,
  resolved: ResolvedModel,
  summary: string,
  proposedCanon: string[],
): Promise<void> {
  const client = await pool!.connect();
  try {
    await client.query("BEGIN");
    const { rowCount } = await client.query(
      `UPDATE story_jobs
          SET status = 'succeeded', finished_at = now(), updated_at = now(),
              worker_id = NULL, lease_expires_at = NULL, step = 'done'
        WHERE job_id = $1 AND worker_id = $2 AND status = 'running'`,
      [job.job_id, WORKER_ID],
    );
    if ((rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return;
    }
    // Proposals are stored inert. A 20B model does not get to write permanent
    // world-facts; a human approves them in Parent Mode first.
    const proposals = proposedCanon
      .filter((t) => typeof t === "string" && t.trim())
      .slice(0, 3)
      .map((t) => ({
        id: randomUUID(),
        text: t.trim().slice(0, 200),
        createdAt: new Date().toISOString(),
        status: "proposed" as const,
      }));

    await client.query(
      `UPDATE story_universes u
          SET summary = $1,
              summary_updated_at = now(),
              summary_model = $2,
              summary_covered_count = $3,
              summary_dropped_count = $4,
              pinned_canon = pinned_canon || $5::jsonb,
              summary_inputs_hash = md5(
                coalesce((SELECT string_agg(s.story_id, ',' ORDER BY s.story_id)
                            FROM user_stories s WHERE s.universe_id = u.universe_id), '')
                || '|' || (u.pinned_canon || $5::jsonb)::text
              ),
              updated_at = now()
        WHERE u.universe_id = $6`,
      [
        summary,
        resolved.model,
        (job.outline ?? []).length,
        0,
        JSON.stringify(proposals),
        job.universe_id,
      ],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function runJob(job: JobRow): Promise<void> {
  const hb = setInterval(() => {
    heartbeat(job.job_id).catch((e) =>
      console.error(`[worker] heartbeat failed for ${job.job_id}:`, e),
    );
  }, HEARTBEAT_MS);
  // Do not hold the event loop open for a heartbeat.
  hb.unref?.();

  try {
    if (await isCancelled(job.job_id)) {
      await markCancelled(job);
      return;
    }

    // The whole model decision is re-made HERE, not taken from the job.
    // resolveModel re-runs the entitlement gate, so a user who selected a
    // premium model with their own key and then deleted that key is downgraded
    // or refused rather than running gpt-4o on the owner's account. job.model
    // records what they picked at enqueue; it is deliberately never read back.
    const resolved = await resolveModel(job.user_id, "chat");
    if (!resolved) {
      await finishFailed(
        job,
        "no_model_available",
        "No story model is available for your account any more. Add your own OpenAI API key in Settings.",
        false,
      );
      return;
    }

    if (job.kind === "summary") {
      await runSummaryJob(job, resolved);
      return;
    }

    if (job.kind === "extract") {
      await runExtractJob(job, resolved);
      return;
    }

    /**
     * The outline as GENERATION produced it -- not as the job row had it.
     *
     * `job` is the row as it was CLAIMED, and on a fresh job its outline is
     * null: the outline is written to the database by the checkpoint below and
     * this in-memory object is never re-read. Saving `job.outline` therefore
     * stored nothing for every new story while looking entirely correct, and
     * the symptom -- a continuation with no recap -- appears somewhere else
     * entirely, days later.
     *
     * Seeded from the row so a RESUMED job keeps the outline it already paid
     * for, then overwritten the moment a fresh one is checkpointed.
     */
    let producedOutline: string[] | undefined = job.outline ?? undefined;

    const story = await generateStoryFromJob({
      jobId: job.job_id,
      userId: job.user_id,
      request: job.request,
      brief: job.brief,
      systemPrompt: job.system_prompt,
      targetWordCount: job.target_word_count,
      resolved,
      client: createClient(resolved),
      resumeOutline: job.outline ?? undefined,
      resumeChapters: job.chapters ?? undefined,
      checkpoint: (patch) => {
        if (patch.outline) producedOutline = patch.outline;
        return checkpoint(job.job_id, patch);
      },
      isCancelled: () => isCancelled(job.job_id),
    });

    if (story === "cancelled") {
      await markCancelled(job);
      return;
    }
    if (story === "evicted") {
      // A checkpoint reported zero rows: this worker lost its lease and another
      // has the job. Write nothing -- the other worker owns every field now.
      console.warn(`[worker] evicted from job ${job.job_id}; abandoning without writing.`);
      return;
    }

    // The worker saves, so "Story generated but not saved" ceases to exist as
    // a state -- and the canned error stories the client used to auto-save
    // cannot be written at all.
    //
    // The outline rides on the story object, the way generationId already does,
    // rather than becoming another parameter. db-storage.ts records why: the
    // optional heroId parameter "is exactly why hero_id is NULL on nearly every
    // row: DbStorage.saveStory silently omits it and the caller cannot tell."
    // A second optional parameter would fail the same way, and this one has no
    // loud symptom -- a missing outline just renders as a story with no recap.
    //
    // Reached only on the kind === "story" path. `outline` on a SUMMARY job is
    // the list of story ids the window covers (see shrinkSummaryWindow), which
    // is a different fact wearing the same column.
    const saved = await storage.saveStory(
      { ...story, outline: producedOutline },
      job.request,
      job.user_id,
    );
    await finishSucceeded(job, saved.id);

    // EVERYTHING BELOW IS PAST THE POINT OF NO RETURN. The story is written,
    // saved, and marked succeeded; the user is finished. Its own try/catch
    // because a throw here would fall into the handler below and call
    // finishFailed on a job that already succeeded -- harmless, since that
    // UPDATE is guarded on status='running', but it would log a failure for a
    // story that worked and re-queue nothing. Remembering a story is strictly
    // less important than having written it.
    try {
      // Remember this story, if there is likely to be a next one.
      //
      // Two triggers, both meaning a sequel is plausible: the user ticked "I
      // might write more stories in this world", or this story continues another
      // (a story continued once is very likely to be continued again). A one-off
      // extracts nothing and costs nothing, which is what keeps this from being
      // an extra call on every story forever.
      //
      // Deliberately after finishSucceeded and deliberately not awaited for its
      // result: the story is saved and the user is done. A failure to enqueue the
      // extraction must not fail a story that already exists.
      const wantsMemory =
        Boolean(job.request?.mayContinue) || Boolean(job.request?.continuesStoryId);

      // A FIRST story that opts into a series has no universe yet.
      // resolveUniverseForRequest only creates one when continuing -- it needs a
      // parent to name the universe after -- so without this the flag silently
      // did nothing at all: no universe, therefore no extraction, therefore no
      // memory, and no error anywhere to say so.
      //
      // Done here rather than at enqueue because the name comes from the story's
      // title, and at enqueue the story has not been written yet.
      let universeId: string | undefined = job.request?.universeId;
      if (wantsMemory && !universeId) {
        const created = await createUniverse(job.user_id, story.title.slice(0, 100));
        if ("error" in created) {
          // Almost always a name collision with an existing universe of the same
          // title. Not worth failing a saved story over; the next story in this
          // world can be attached by hand.
          console.warn(`[worker] could not open a universe for ${saved.id}: ${created.error}`);
        } else {
          universeId = created.universeId;
          await setStoryUniverse(job.user_id, saved.id, universeId).catch((e) =>
            console.error(`[worker] could not place ${saved.id} in its universe:`, e),
          );
        }
      }

      if (wantsMemory && universeId) {
        await enqueueStoryJob({
          userId: job.user_id,
          kind: "extract",
          universeId,
          storyId: saved.id,
          request: job.request,
          // The story text, the way a summary job carries its window.
          brief: JSON.stringify({ title: story.title, content: story.content }),
          systemPrompt: extractionSystemPrompt(),
          targetWordCount: 0,
        }).catch((e) =>
          console.error(`[worker] could not queue extraction for ${saved.id}:`, e),
        );
      }
    } catch (memoryError) {
      console.error(
        `[worker] story ${job.job_id} is saved; remembering it failed:`,
        memoryError instanceof Error ? memoryError.message : memoryError,
      );
    }
  } catch (error) {
    const code = error instanceof StoryGenerationError ? error.code : "generation_failed";
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[worker] job ${job.job_id} failed (${code}):`, message);
    // Retry the failures that a different draw could fix, and only those.
    //
    // story_too_short belongs here: these models vary enormously run to run --
    // nemotron short measured 81%, 82% and 57% of target across three runs of
    // the identical request -- and the failure message literally advises "try
    // generating it again". A worker that tells the user to retry while
    // refusing to retry itself is giving advice it will not take. error_count
    // caps it at MAX_ERRORS, so this is one more attempt, not a loop.
    //
    // A missing model or an exhausted quota is not retryable: the second
    // attempt fails identically and costs the user another wait.
    const retryable =
      code === "model_output_invalid" ||
      code === "model_output_truncated" ||
      code === "story_too_short";
    await finishFailed(job, code, message, retryable).catch((e) =>
      console.error(`[worker] could not record failure for ${job.job_id}:`, e),
    );
  } finally {
    clearInterval(hb);
  }
}

/**
 * Self-scheduling, NOT setInterval. An interval stacks ticks while a 200s job
 * runs; this schedules the next poll only after the current one finishes.
 */
function scheduleNext(delay: number) {
  if (stopped) return;
  timer = setTimeout(tick, delay);
  // Never hold the process open. A pending poll must not delay shutdown.
  timer.unref?.();
}

async function tick(): Promise<void> {
  if (stopped) return;
  try {
    const job = await claimJob();
    if (!job) {
      scheduleNext(POLL_MS);
      return;
    }
    if (job.attempt_count > MAX_ATTEMPTS) {
      await finishFailed(
        job,
        "generation_failed",
        `Gave up after ${job.attempt_count} attempts.`,
        false,
      );
      scheduleNext(0);
      return;
    }
    await runJob(job);
    // Another job may be waiting; do not sit out a poll interval.
    scheduleNext(0);
  } catch (error) {
    console.error("[worker] tick failed:", error);
    scheduleNext(POLL_MS);
  }
}

export function startStoryWorker(): void {
  if (running) return;
  running = true;
  stopped = false;
  // Gated on the database, which is what makes "no database means refuse"
  // true for the async path as well as the synchronous one.
  databaseReady
    .then((ready) => {
      if (!ready || !pool) {
        console.log("[worker] not starting: no database.");
        running = false;
        return;
      }
      console.log(`[worker] started as ${WORKER_ID}`);
      scheduleNext(0);
    })
    .catch((e) => {
      console.error("[worker] failed to start:", e);
      running = false;
    });
}

export function stopStoryWorker(): void {
  stopped = true;
  running = false;
  if (timer) clearTimeout(timer);
}

export { WORKER_ID, LEASE_MS };
