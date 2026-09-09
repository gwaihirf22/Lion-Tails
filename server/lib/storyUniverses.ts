/**
 * Universes: creation, membership, canon, and the staleness rule.
 *
 * Every write to `user_stories.universe_id` goes through setStoryUniverse().
 * That is deliberate: `saveStory`'s optional fourth `heroId` parameter is
 * silently dropped by the DbStorage implementation, which is why `hero_id` is
 * NULL on essentially every production row. One writer, no optional parameter
 * for a caller to forget.
 */
import { randomUUID } from "crypto";
import { pool } from "../db";
import type { WorldEntry } from "./worldState";

/** An uncapped canon list is a second summary that nothing compresses. */
export const MAX_CANON_ITEMS = 20;
export const MAX_CANON_LENGTH = 200;

export type CanonItem = {
  id: string;
  text: string;
  sourceStoryId?: string;
  createdAt: string;
  /** "proposed" items come from a summary and never reach a prompt until approved. */
  status: "active" | "proposed";
};

export type Universe = {
  universeId: string;
  name: string;
  createdAt: string;
  storyCount: number;
  summary: string | null;
  summaryUpdatedAt: string | null;
  summaryEditedAt: string | null;
  summaryModel: string | null;
  summaryCoveredCount: number | null;
  summaryDroppedCount: number | null;
  pinnedCanon: CanonItem[];
  /** Extracted after each story in a series. See lib/worldState.ts. */
  worldState: WorldEntry[];
  isStale: boolean;
  canMakeSummary: boolean;
  activeSummaryJobId: string | null;
};

/**
 * What the summary covers, as a fingerprint derived at read time.
 *
 * Nothing to bump and nothing to forget: it is computed from the truth rather
 * than maintained alongside it. Canon is included on purpose -- pinning a fact
 * invalidates the summary, because the summary was compressed under the
 * assumption that fact was not separately guaranteed.
 */
const CURRENT_HASH_SQL = `
  md5(
    coalesce((
      SELECT string_agg(s.story_id, ',' ORDER BY s.story_id)
        FROM user_stories s WHERE s.universe_id = u.universe_id
    ), '') || '|' || u.pinned_canon::text
  )`;

const UNIVERSE_SELECT = `
  SELECT
    u.universe_id, u.name, u.created_at, u.summary, u.summary_updated_at, u.world_state,
    u.summary_edited_at, u.summary_model, u.summary_covered_count,
    u.summary_dropped_count, u.pinned_canon,
    (SELECT count(*)::int FROM user_stories s WHERE s.universe_id = u.universe_id) AS story_count,
    ${CURRENT_HASH_SQL} AS current_hash,
    u.summary_inputs_hash,
    (SELECT j.job_id FROM story_jobs j
      WHERE j.universe_id = u.universe_id AND j.kind = 'summary'
        AND j.status IN ('queued','running') LIMIT 1) AS active_summary_job_id
  FROM story_universes u
  WHERE u.user_id = $1`;

function toUniverse(r: any): Universe {
  const storyCount: number = r.story_count;
  const isStale = Boolean(r.summary) && r.summary_inputs_hash !== r.current_hash;
  return {
    universeId: r.universe_id,
    name: r.name,
    createdAt: r.created_at,
    storyCount,
    summary: r.summary,
    summaryUpdatedAt: r.summary_updated_at,
    summaryEditedAt: r.summary_edited_at,
    summaryModel: r.summary_model,
    summaryCoveredCount: r.summary_covered_count,
    summaryDroppedCount: r.summary_dropped_count,
    pinnedCanon: Array.isArray(r.pinned_canon) ? r.pinned_canon : [],
    worldState: Array.isArray(r.world_state) ? r.world_state : [],
    isStale,
    // Blake's rule: stale is the only unlock. A summary that is already current
    // cannot be rebuilt, which is both the "no redo" cap on cost and the same
    // fact the UI shows as the stale badge -- one mechanism, not two.
    canMakeSummary:
      storyCount >= 2 && !r.active_summary_job_id && (!r.summary || isStale),
    activeSummaryJobId: r.active_summary_job_id ?? null,
  };
}

export async function listUniverses(userId: number): Promise<Universe[]> {
  if (!pool) return [];
  const { rows } = await pool.query(`${UNIVERSE_SELECT} ORDER BY u.updated_at DESC`, [userId]);
  return rows.map(toUniverse);
}

export async function getUniverse(userId: number, universeId: string): Promise<Universe | undefined> {
  if (!pool) return undefined;
  const { rows } = await pool.query(`${UNIVERSE_SELECT} AND u.universe_id = $2`, [userId, universeId]);
  return rows[0] ? toUniverse(rows[0]) : undefined;
}

export async function createUniverse(userId: number, name: string): Promise<Universe | { error: string }> {
  if (!pool) return { error: "unavailable" };
  const trimmed = name.trim().slice(0, 120);
  if (!trimmed) return { error: "A universe needs a name." };
  const id = randomUUID();
  try {
    await pool.query(
      "INSERT INTO story_universes (universe_id, user_id, name) VALUES ($1,$2,$3)",
      [id, userId, trimmed],
    );
  } catch (e: any) {
    // The unique index on (user_id, name) is what stops a double submit
    // producing two universes with the same name and an ambiguous library.
    if (e?.code === "23505") return { error: "You already have a universe with that name." };
    throw e;
  }
  return (await getUniverse(userId, id))!;
}

export async function renameUniverse(userId: number, universeId: string, name: string): Promise<boolean> {
  if (!pool) return false;
  const trimmed = name.trim().slice(0, 120);
  if (!trimmed) return false;
  const { rowCount } = await pool.query(
    "UPDATE story_universes SET name = $1, updated_at = now() WHERE universe_id = $2 AND user_id = $3",
    [trimmed, universeId, userId],
  );
  return (rowCount ?? 0) > 0;
}

/** Stories survive: universe_id is ON DELETE SET NULL, so they return to Unassigned. */
export async function deleteUniverse(userId: number, universeId: string): Promise<boolean> {
  if (!pool) return false;
  const { rowCount } = await pool.query(
    "DELETE FROM story_universes WHERE universe_id = $1 AND user_id = $2",
    [universeId, userId],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * The single writer for membership.
 *
 * Both ids are checked against the user in the statement itself rather than in
 * a prior SELECT, so a story cannot be attached to someone else's universe even
 * if the client sends one.
 */
export async function setStoryUniverse(
  userId: number,
  storyId: string,
  universeId: string | null,
): Promise<boolean> {
  if (!pool) return false;
  if (universeId === null) {
    const { rowCount } = await pool.query(
      "UPDATE user_stories SET universe_id = NULL WHERE story_id = $1 AND user_id = $2",
      [storyId, userId],
    );
    return (rowCount ?? 0) > 0;
  }
  const { rowCount } = await pool.query(
    `UPDATE user_stories SET universe_id = $1
      WHERE story_id = $2 AND user_id = $3
        AND EXISTS (SELECT 1 FROM story_universes u WHERE u.universe_id = $1 AND u.user_id = $3)`,
    [universeId, storyId, userId],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Resolve which universe a new story belongs to.
 *
 * Explicit id wins. Otherwise, continuing a story adopts that story's universe,
 * creating one named after the parent if it has none -- so a universe is a
 * consequence of continuing rather than a thing to set up first.
 */
export async function resolveUniverseForRequest(
  userId: number,
  opts: { universeId?: string; continuesStoryId?: string },
): Promise<string | undefined> {
  if (!pool) return undefined;

  if (opts.universeId) {
    const { rows } = await pool.query(
      "SELECT universe_id FROM story_universes WHERE universe_id = $1 AND user_id = $2",
      [opts.universeId, userId],
    );
    return rows[0]?.universe_id;
  }
  if (!opts.continuesStoryId) return undefined;

  const { rows } = await pool.query(
    "SELECT universe_id, story_data FROM user_stories WHERE story_id = $1 AND user_id = $2",
    [opts.continuesStoryId, userId],
  );
  if (!rows[0]) return undefined;
  if (rows[0].universe_id) return rows[0].universe_id;

  // The parent has no universe yet. Create one and adopt the parent into it.
  const parentTitle: string =
    rows[0].story_data?.story?.title || "My stories";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const id = randomUUID();
    // A name collision here means the user already has a universe by that name;
    // fall back to a unique-ish name rather than failing the generation.
    let name = parentTitle.slice(0, 100);
    try {
      await client.query(
        "INSERT INTO story_universes (universe_id, user_id, name) VALUES ($1,$2,$3)",
        [id, userId, name],
      );
    } catch (e: any) {
      if (e?.code !== "23505") throw e;
      await client.query("ROLLBACK");
      await client.query("BEGIN");
      name = `${name} (${new Date().toISOString().slice(0, 10)})`;
      await client.query(
        "INSERT INTO story_universes (universe_id, user_id, name) VALUES ($1,$2,$3)",
        [id, userId, name],
      );
    }
    // Only adopt the parent if it is still unassigned -- if a concurrent
    // request already placed it, that one wins and we use its universe.
    const { rowCount } = await client.query(
      `UPDATE user_stories SET universe_id = $1
        WHERE story_id = $2 AND user_id = $3 AND universe_id IS NULL`,
      [id, opts.continuesStoryId, userId],
    );
    if ((rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      const again = await pool.query(
        "SELECT universe_id FROM user_stories WHERE story_id = $1 AND user_id = $2",
        [opts.continuesStoryId, userId],
      );
      return again.rows[0]?.universe_id ?? undefined;
    }
    await client.query("COMMIT");
    return id;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Pinned canon
// ---------------------------------------------------------------------------

export async function addCanon(
  userId: number,
  universeId: string,
  text: string,
  sourceStoryId?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!pool) return { ok: false, error: "unavailable" };
  const trimmed = text.trim().slice(0, MAX_CANON_LENGTH);
  if (!trimmed) return { ok: false, error: "Canon needs some text." };

  const universe = await getUniverse(userId, universeId);
  if (!universe) return { ok: false, error: "No such universe." };
  if (universe.pinnedCanon.length >= MAX_CANON_ITEMS) {
    return {
      ok: false,
      error: `A universe can hold ${MAX_CANON_ITEMS} pinned facts. Remove one first — the cap is what keeps canon from becoming a second summary.`,
    };
  }

  const item: CanonItem = {
    id: randomUUID(),
    text: trimmed,
    sourceStoryId,
    createdAt: new Date().toISOString(),
    status: "active",
  };
  await pool.query(
    `UPDATE story_universes
        SET pinned_canon = pinned_canon || $1::jsonb, updated_at = now()
      WHERE universe_id = $2 AND user_id = $3`,
    [JSON.stringify([item]), universeId, userId],
  );
  return { ok: true };
}

export async function removeCanon(userId: number, universeId: string, canonId: string): Promise<boolean> {
  if (!pool) return false;
  const { rowCount } = await pool.query(
    `UPDATE story_universes
        SET pinned_canon = (
              SELECT coalesce(jsonb_agg(e), '[]'::jsonb)
                FROM jsonb_array_elements(pinned_canon) e
               WHERE e->>'id' <> $1
            ),
            updated_at = now()
      WHERE universe_id = $2 AND user_id = $3`,
    [canonId, universeId, userId],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * A manual edit accepts the current members as covered, so it clears staleness.
 * Otherwise a user who fixed a summary by hand would still be told it is out of
 * date, and the only way to clear that would be to regenerate over their edit.
 */
export async function editSummary(
  userId: number,
  universeId: string,
  summary: string,
): Promise<boolean> {
  if (!pool) return false;
  const { rowCount } = await pool.query(
    `UPDATE story_universes u
        SET summary = $1,
            summary_edited_at = now(),
            summary_updated_at = now(),
            summary_inputs_hash = ${CURRENT_HASH_SQL},
            updated_at = now()
      WHERE u.universe_id = $2 AND u.user_id = $3`,
    [summary.slice(0, 8000), universeId, userId],
  );
  return (rowCount ?? 0) > 0;
}
