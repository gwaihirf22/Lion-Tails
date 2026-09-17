/**
 * Noting that a model refused somebody, without ever failing because of it.
 *
 * This is called from catch blocks. Every one of them is already on its way to
 * telling a parent "it will not draw that, describe them in your own words" --
 * so a database hiccup here must not become a second, worse failure on top of
 * the first. It swallows, it logs, and it returns.
 *
 * Reads `pool` directly rather than IStorage, for accountStats.ts's reason:
 * MemStorage would need a parallel implementation of a counter, and a second
 * implementation of a number is how two screens come to disagree about it. With
 * no database there is no admin page either, so there is nothing to lose.
 */
import { pool } from "../db";
import type { RefusalSource } from "@shared/accountEvents";

async function record(userId: number, kind: string, detail: string | null): Promise<void> {
  if (!pool) return;
  try {
    await pool.query(
      "INSERT INTO account_events (user_id, kind, detail) VALUES ($1, $2, $3)",
      [userId, kind, detail],
    );
  } catch (error) {
    console.error("[account-events] could not record:", error);
  }
}

/**
 * The model declined what this account asked for.
 *
 * `source` says which thing refused -- never what was asked for. One refusal is
 * somebody asking for Yoshi (Blake's own, and the reason the friendly message
 * exists); a dozen in an afternoon is a person finding out what the app will
 * draw, which is the thing worth a look.
 */
export function recordRefusal(userId: number | undefined | null, source: RefusalSource): void {
  if (!userId) return;
  // Deliberately not awaited: the caller is answering a request, and the note
  // is not worth a millisecond of somebody's wait. `record` cannot reject.
  void record(userId, "refusal", source);
}
