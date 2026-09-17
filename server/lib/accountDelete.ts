/**
 * Deleting an account, in the one order that does not lose something.
 *
 * A ban is the reversible answer and should be the usual one; this is for when
 * somebody asks to be gone, or should be. It is NOT a second kind of ban: the
 * row goes, and with it everything the foreign keys carry away.
 *
 * THE ORDER IS THE WHOLE DESIGN:
 *
 *  1. Ban and stop their work first, so nothing starts writing rows into the
 *     account while it is being taken apart.
 *  2. COLLECT FILE PATHS BEFORE DELETING ANY ROW. The paths live inside the
 *     jsonb of the rows about to be cascaded away; delete first and the files
 *     are orphaned on the volume for ever with nothing left pointing at them.
 *  3. Delete in one transaction: the two tables the cascades do not reach,
 *     then the user, whose foreign keys take the rest.
 *  4. Unlink the files AFTER the transaction commits. A rolled-back delete
 *     must not have destroyed pictures for an account that still exists.
 *
 * WHAT SURVIVES, DELIBERATELY: model_calls and generation_records keep their
 * rows with user_id set to NULL. That is the ledger -- what the models were
 * asked to do and what it cost -- and it is the owner's record of his own
 * spending, not the account's property. It means per-account spend history for
 * a deleted account is gone; look at it before deleting, not after.
 */
import { pool } from "../db";
import { avatarsOf, storyImagesOf } from "@shared/schema";
import { deleteAvatarFile } from "./avatar";
import { deleteStoryImage } from "./illustration";
import { cancelAllStoryJobsFor } from "./storyJobs";
import { storage } from "../storage";

export type DeleteOutcome = {
  ok: boolean;
  /** Rows removed from each table the cascades do not cover. */
  removed: { stories: number; characters: number; tokens: number; heroStories: number; sessions: number };
  /**
   * Pictures actually unlinked. Not the number tried: deleteStoryImage
   * refuses a name that is not one of its own generated files, so counting
   * attempts would report files that are still sitting on the volume.
   */
  files: number;
};

/**
 * Every picture this account owns, as URLs, read before anything is deleted.
 *
 * Through avatarsOf() and storyImagesOf() rather than a fresh reach into the
 * jsonb: those two already know every shape a row has had, including the old
 * single-avatar and single-image forms, and a second reader here would miss
 * exactly the oldest rows.
 */
async function picturesOf(userId: number): Promise<{ avatars: string[]; stories: string[] }> {
  const avatars: string[] = [];
  const stories: string[] = [];
  if (!pool) return { avatars, stories };

  const characters = await pool.query(
    "SELECT character_data FROM user_characters WHERE user_id = $1",
    [userId],
  );
  for (const row of characters.rows) {
    for (const a of avatarsOf(row.character_data)) {
      if (a?.url) avatars.push(a.url);
    }
    if (row.character_data?.avatarUrl) avatars.push(row.character_data.avatarUrl);
  }

  const rows = await pool.query("SELECT story_data FROM user_stories WHERE user_id = $1", [userId]);
  for (const row of rows.rows) {
    for (const picture of storyImagesOf(row.story_data)) {
      if (picture?.url) stories.push(picture.url);
    }
    if (row.story_data?.story?.imageUrl) stories.push(row.story_data.story.imageUrl);
  }

  return { avatars: [...new Set(avatars)], stories: [...new Set(stories)] };
}

export async function deleteAccount(userId: number): Promise<DeleteOutcome> {
  const empty: DeleteOutcome = {
    ok: false,
    removed: { stories: 0, characters: 0, tokens: 0, heroStories: 0, sessions: 0 },
    files: 0,
  };
  if (!pool) return empty;

  // 1. Shut the door first. If anything below fails, the account is left
  // banned rather than half-deleted, which is a state a person can be told
  // about honestly.
  await storage.setBanned(userId, true, "being deleted");
  await cancelAllStoryJobsFor(userId);

  // 2. The paths, while the rows still exist.
  const pictures = await picturesOf(userId);

  const client = await pool.connect();
  const removed = { ...empty.removed };
  try {
    await client.query("BEGIN");

    const counts = await client.query(
      `SELECT (SELECT count(*) FROM user_stories WHERE user_id = $1)::int AS stories,
              (SELECT count(*) FROM user_characters WHERE user_id = $1)::int AS characters`,
      [userId],
    );
    removed.stories = Number(counts.rows[0]?.stories ?? 0);
    removed.characters = Number(counts.rows[0]?.characters ?? 0);

    // No foreign key at all on this one, so a cascade never reaches it and
    // the rows would outlive the account for ever.
    const tokens = await client.query("DELETE FROM verification_tokens WHERE user_id = $1", [userId]);
    removed.tokens = tokens.rowCount ?? 0;

    /**
     * hero_stories is ON DELETE SET NULL, and GET /api/hero-stories is PUBLIC.
     * Left alone, a deleted family's story -- with a child's name in it --
     * stays readable by everybody, owned by nobody, and unreachable by the
     * people it is about. The row is a copy for the hero's page; the family's
     * own is in user_stories and goes with the cascade.
     */
    const heroStories = await client.query("DELETE FROM hero_stories WHERE user_id = $1", [userId]);
    removed.heroStories = heroStories.rowCount ?? 0;

    // The row itself. Characters, stories, settings, usage, jobs, universes
    // and shares all go with it; the ledger keeps its rows with a null user.
    const user = await client.query("DELETE FROM users WHERE id = $1", [userId]);
    if (!user.rowCount) {
      await client.query("ROLLBACK");
      return empty;
    }

    /**
     * Their sessions. Hygiene rather than enforcement -- a deleted user's
     * session already resolves to nothing and signs itself out -- and a
     * sequential scan, because the session table has no user id to index.
     * Fine at this size; do not add an index for a delete that happens
     * a few times a year.
     */
    const sessions = await client.query(
      "DELETE FROM session WHERE sess->'passport'->>'user' = $1::text",
      [String(userId)],
    );
    removed.sessions = sessions.rowCount ?? 0;

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error(`[account-delete] rolled back deleting user ${userId}:`, error);
    return empty;
  } finally {
    client.release();
  }

  // 4. Only now the files. Each logs rather than throws: an orphaned picture
  // is untidy, a failed delete after the row has gone is a lie to the person
  // who asked to be removed.
  let files = 0;
  for (const url of pictures.stories) {
    if (await deleteStoryImage(url)) files++;
  }
  for (const url of pictures.avatars) {
    if (await deleteAvatarFile(url)) files++;
  }

  return { ok: true, removed, files };
}

/** Used by the route's confirmation, and by nothing else. */
export function typedNameMatches(typed: unknown, username: string): boolean {
  return typeof typed === "string" && typed.trim() === username;
}

