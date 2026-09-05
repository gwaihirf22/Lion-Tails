// pg is a CommonJS module; the production bundle is ESM built with
// --packages=external, so Node loads pg as CJS at runtime and cannot
// destructure named exports from it:
//   SyntaxError: Named export 'Pool' not found.
// Import the default and destructure at runtime; the type import erases at
// compile time and is safe. See docs/decisions.md §1.
import pg from "pg";
import type { Pool as PgPool } from "pg";
const { Pool } = pg;
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable, type AnyPgTable } from "drizzle-orm/pg-core";
import * as schema from "@shared/schema";

let pool: PgPool | undefined;
let db: NodePgDatabase<typeof schema> | undefined;
let dbConnectionStatus = "not_initialized";

// Tracked separately from dbConnectionStatus: a reachable database is not the
// same as a correct one. scripts/ensure-database.js creates the tables the ORM
// reads, and when the two drifted apart the only symptom was a 500 on the first
// signup ("column first_name of relation users does not exist"). This surfaces
// that at startup instead.
let schemaStatus: "unknown" | "ok" | "mismatch" = "unknown";
let schemaProblems: string[] = [];

/**
 * Compares the live columns against what Drizzle itself declares (§5 of
 * docs/decisions.md), so there is
 * no hand-maintained list here to drift in turn -- the expectation comes
 * straight from shared/schema.ts.
 *
 * Every pgTable exported from the schema module is checked, so a table added
 * there is covered automatically rather than needing to be remembered here.
 */
async function verifyOrmSchema(activePool: PgPool): Promise<void> {
  const tables = Object.values(schema).filter((value) =>
    is(value, PgTable),
  ) as AnyPgTable[];

  const problems: string[] = [];
  try {
    const { rows } = await activePool.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public'`,
    );

    const live = new Map<string, Set<string>>();
    for (const row of rows) {
      if (!live.has(row.table_name)) live.set(row.table_name, new Set());
      live.get(row.table_name)!.add(row.column_name);
    }

    for (const table of tables) {
      const name = getTableName(table);
      const actual = live.get(name);
      if (!actual) {
        problems.push(`table '${name}' does not exist`);
        continue;
      }
      const missing = Object.values(getTableColumns(table))
        .map((c) => c.name)
        .filter((c) => !actual.has(c));
      if (missing.length) {
        problems.push(`table '${name}' is missing column(s): ${missing.join(", ")}`);
      }
    }
  } catch (error) {
    problems.push(
      `could not inspect the schema: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  schemaProblems = problems;
  schemaStatus = problems.length === 0 ? "ok" : "mismatch";

  if (problems.length) {
    console.error("DATABASE SCHEMA MISMATCH -- the ORM expects columns that do not exist:");
    for (const p of problems) console.error(`  - ${p}`);
    console.error("The migrations in ./migrations have not been applied to this database.");
  } else {
    console.log(`Database schema verified against shared/schema.ts (${tables.length} tables)`);
  }
}


async function initializeDatabase() {
  try {
    if (!process.env.DATABASE_URL) {
      console.warn("DATABASE_URL not set. Using memory storage instead.");
      dbConnectionStatus = "not_configured";
      return false;
    }

    pool = new Pool({ connectionString: process.env.DATABASE_URL });

    // node-postgres emits "error" on the pool when an IDLE client's backend
    // fails. Load-bearing: see docs/decisions.md §7.
    // fails -- e.g. the Postgres container restarting underneath us. With no
    // listener, Node treats it as an uncaught exception and kills the process,
    // which under restart:unless-stopped turns a brief blip into a restart
    // loop. Log it and let the pool recover on the next acquisition instead.
    pool.on("error", (err) => {
      console.error("Unexpected error on idle Postgres client:", err);
      dbConnectionStatus = "error";
    });

    // Test the connection
    const client = await pool.connect();
    try {
      await client.query("SELECT NOW()");
      console.log("Database connection test successful");
      dbConnectionStatus = "connected";
    } catch (testError) {
      console.error("Database connection test failed:", testError);
      dbConnectionStatus = "error";
      throw testError;
    } finally {
      client.release();
    }

    db = drizzle(pool, { schema });

    await verifyOrmSchema(pool);

    return true;
  } catch (error) {
    console.error("Failed to initialize database connection:", error);
    dbConnectionStatus = "error";

    // Handle connection errors gracefully
    pool = undefined;
    db = undefined;
    return false;
  }
}

// Kicked off immediately. The pool itself is assigned synchronously above, so
// consumers importing `pool` see it right away; `db` becomes available only
// once the connection test resolves.
//
// databaseReady is exported so that work which genuinely requires a live
// database -- seeding reference data, for example -- can await it instead of
// racing it. It resolves false rather than rejecting when the database is
// unreachable, so awaiting it can never hang startup.
const databaseReady: Promise<boolean> = initializeDatabase()
  .then((success) => {
    if (success) {
      console.log("Database and ORM initialized successfully");
    } else {
      console.warn("Database initialization failed, falling back to memory storage");
    }
    return success;
  })
  .catch((err) => {
    console.error("Error during database initialization:", err);
    return false;
  });

export { pool, db, dbConnectionStatus, schemaStatus, schemaProblems, databaseReady };
