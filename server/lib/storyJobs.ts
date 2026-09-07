/**
 * Enqueue, read and cancel story jobs.
 *
 * The enqueue path is where entitlement is decided, because it is the only
 * point at which refusing is cheap. Once a job is claimed the money is being
 * spent.
 */
import { randomUUID } from "crypto";
import { pool } from "../db";
import { resolveModel, concurrencyLimitFor } from "./modelPolicy";
import { StoryGenerationError } from "./storyErrors";
import type { StoryRequest } from "@shared/schema";

export type EnqueueResult =
  | { ok: true; jobId: string }
  | { ok: false; status: number; code: string; message: string; inFlight?: unknown };

/**
 * How long a finished job stays visible to `?filter=active`.
 *
 * This is how a reloaded page rediscovers a job it did not start watching, with
 * no localStorage: in-flight jobs plus anything that finished recently.
 */
const RECENTLY_FINISHED_MS = 60 * 60 * 1000;

/**
 * Which kind is blocking which. The generic "a story is already being written"
 * is wrong and confusing when the blocker is a summary -- the user did not
 * start a story, and telling them they did sends them looking for one.
 */
function conflictCode(wanted: "story" | "summary", active: Array<{ kind: string }>): string {
  const blocker = active[0]?.kind ?? "story";
  if (blocker === "summary" && wanted === "story") return "summary_in_progress";
  if (blocker === "story" && wanted === "summary") return "story_in_progress";
  return "already_generating";
}

function conflictMessage(
  wanted: "story" | "summary",
  active: Array<{ kind: string }>,
  limit: number,
): string {
  const blocker = active[0]?.kind ?? "story";
  if (blocker === "summary" && wanted === "story") {
    return "A universe summary is being written. Stories and summaries share the same model, so this will start as soon as it finishes.";
  }
  if (blocker === "story" && wanted === "summary") {
    return "A story is being written. You can make the summary once it finishes.";
  }
  if (wanted === "summary") {
    return "A summary is already being written for this universe.";
  }
  return limit === 1
    ? "You already have a story being written. It will appear in your library when it is done."
    : `You already have ${active.length} stories being written.`;
}

export async function enqueueStoryJob(opts: {
  userId: number;
  request: StoryRequest;
  brief: string;
  systemPrompt: string;
  targetWordCount: number;
  kind?: "story" | "summary";
  universeId?: string;
  /** For a summary: the ordered story ids the window contains. */
  outline?: string[];
}): Promise<EnqueueResult> {
  if (!pool) {
    // Per Blake: no database means refuse. Degrading to in-memory would accept
    // the request and lose it on the next restart, which is worse than a clear
    // failure.
    return {
      ok: false,
      status: 503,
      code: "no_database",
      message: "Story generation is unavailable right now. Please try again shortly.",
    };
  }

  const resolved = await resolveModel(opts.userId, "chat");
  if (!resolved) {
    return {
      ok: false,
      status: 503,
      code: "no_model_available",
      message:
        "No story model is available for your account. Add your own OpenAI API key in Settings, or choose a local model if one is configured.",
    };
  }

  const limit = concurrencyLimitFor(resolved);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialise this user's enqueues against each other so a double-clicked
    // button cannot race the count. Transaction-scoped, so it releases on
    // COMMIT or ROLLBACK with nothing to leak.
    await client.query("SELECT pg_advisory_xact_lock($1)", [opts.userId]);

    const { rows: activeRows } = await client.query(
      `SELECT job_id, kind, universe_id, status, step, created_at
         FROM story_jobs
        WHERE user_id = $1 AND status IN ('queued','running')
        ORDER BY created_at`,
      [opts.userId],
    );
    if (activeRows.length >= limit) {
      await client.query("ROLLBACK");
      return {
        ok: false,
        // 409, not 429: this is a state conflict, not rate limiting. The body
        // carries the in-flight job so the UI can say "you already have one
        // going, watch it" rather than presenting a dead end.
        status: 409,
        code: conflictCode(opts.kind ?? "story", activeRows),
        message: conflictMessage(opts.kind ?? "story", activeRows, limit),
        inFlight: activeRows,
      };
    }

    const jobId = randomUUID();
    await client.query(
      `INSERT INTO story_jobs
         (job_id, user_id, kind, universe_id, status, request, brief, system_prompt,
          target_word_count, model, step, outline)
       VALUES ($1, $2, $8, $9, 'queued', $3, $4, $5, $6, $7, 'queued', $10::jsonb)`,
      [
        jobId,
        opts.userId,
        JSON.stringify(opts.request),
        opts.brief,
        opts.systemPrompt,
        opts.targetWordCount,
        // What was selected now, for display -- NOT what the worker will run.
        // The worker re-resolves at claim time so entitlement is rechecked
        // together with the credentials. See the column comment in schema.ts.
        // Never store resolved.apiKey or resolved.baseURL.
        resolved.model,
        opts.kind ?? "story",
        opts.universeId ?? null,
        opts.outline ? JSON.stringify(opts.outline) : null,
      ],
    );
    await client.query("COMMIT");
    return { ok: true, jobId };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

const PUBLIC_FIELDS = `job_id, kind, universe_id, status, step, created_at, started_at, finished_at,
  story_id, failure_code, failure_message, attempt_count, error_count,
  target_word_count, model,
  COALESCE(jsonb_array_length(chapters), 0) AS chapters_done,
  COALESCE(jsonb_array_length(outline), 0) AS chapters_total`;

/**
 * One job, for the poller.
 *
 * Returns undefined for a job belonging to someone else, so the route can
 * answer 404 rather than 403 and job ids are not enumerable.
 */
export async function getStoryJob(jobId: string, userId: number) {
  if (!pool) return undefined;
  const { rows } = await pool.query(
    `SELECT ${PUBLIC_FIELDS} FROM story_jobs WHERE job_id = $1 AND user_id = $2`,
    [jobId, userId],
  );
  return rows[0];
}

/**
 * In-flight jobs plus anything that finished in the last hour.
 *
 * The recent-terminal window is what lets a page reloaded after a generation
 * finished still discover and report it.
 */
export async function listActiveStoryJobs(userId: number) {
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT ${PUBLIC_FIELDS} FROM story_jobs
      WHERE user_id = $1
        AND (status IN ('queued','running')
             OR finished_at > now() - ($2 || ' milliseconds')::interval)
      ORDER BY created_at DESC`,
    [userId, String(RECENTLY_FINISHED_MS)],
  );
  return rows;
}

/**
 * Cooperative cancel. The worker checks the flag at step boundaries, so
 * cancelling during chapter 4 still pays for chapter 4 -- a completion in
 * flight cannot be recalled.
 */
export async function cancelStoryJob(jobId: string, userId: number): Promise<boolean> {
  if (!pool) return false;
  const { rowCount } = await pool.query(
    `UPDATE story_jobs
        SET cancel_requested = true, updated_at = now(),
            status = CASE WHEN status = 'queued' THEN 'cancelled' ELSE status END,
            finished_at = CASE WHEN status = 'queued' THEN now() ELSE finished_at END
      WHERE job_id = $1 AND user_id = $2 AND status IN ('queued','running')`,
    [jobId, userId],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * How many generations this user has already used against the free quota.
 *
 * Counts in-flight jobs as well as consumed quota. Quota is charged at success
 * rather than at enqueue, so without counting in-flight work a user could
 * enqueue repeatedly before any of them completed. Since a free-tier user's
 * concurrency limit is 1, the maximum unconsumed exposure is one generation.
 */
export async function countInFlight(userId: number): Promise<number> {
  if (!pool) return 0;
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM story_jobs
      WHERE user_id = $1 AND kind = 'story' AND status IN ('queued','running')`,
    [userId],
  );
  return rows[0]?.n ?? 0;
}

export { StoryGenerationError };
