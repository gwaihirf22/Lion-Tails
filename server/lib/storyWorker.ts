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
import { resolveModel, createClient } from "./modelPolicy";
import { StoryGenerationError } from "./storyErrors";
import { generateStoryFromJob } from "./openai-implementation";
import { storage } from "../storage";

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
}

async function shouldChargeQuota(userId: number): Promise<boolean> {
  const resolved = await resolveModel(userId, "chat").catch(() => null);
  if (!resolved) return false;
  if (resolved.provider !== "openai") return false;
  return !resolved.usingOwnKey && !resolved.isAdmin;
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
      checkpoint: (patch) => checkpoint(job.job_id, patch),
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
    const saved = await storage.saveStory(story, job.request, job.user_id);
    await finishSucceeded(job, saved.id);
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
