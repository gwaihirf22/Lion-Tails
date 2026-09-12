/**
 * Every table shared/schema.ts declares, by name.
 *
 * ONE definition with THREE readers: the startup schema check (server/db.ts),
 * ci.yml's smoke test — which asserts that a freshly migrated database holds
 * exactly these tables — and anyone debugging drift between the two.
 *
 * Its own module, not part of server/db.ts, because importing that connects to
 * a database and logs while doing it: the CI step reads this list off stdout,
 * and a "falling back to memory storage" line in the middle of it would be
 * read as a table name.
 *
 * WHY IT IS DERIVED. The gate was `EXPECTED_TABLES=13`, correct the day it was
 * written and wrong the moment a migration added `story_shares` — it failed a
 * deploy for a reason that had nothing to do with the change, which is exactly
 * what the hero-count gate beside it was already fixed for. Assert the
 * invariant ("the database holds what the schema declares"), never the number.
 */

import { getTableName, is } from "drizzle-orm";
import { PgTable, type AnyPgTable } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export function declaredTables(): AnyPgTable[] {
  return Object.values(schema).filter((value) => is(value, PgTable)) as AnyPgTable[];
}

/** Sorted, for comparing against `select tablename from pg_tables`. */
export function declaredTableNames(): string[] {
  return declaredTables().map(getTableName).sort();
}
