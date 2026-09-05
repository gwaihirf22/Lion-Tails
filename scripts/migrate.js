// Applies pending Drizzle migrations, then exits.
//
// Run from entrypoint.sh before the server starts. This replaces
// scripts/ensure-database.js, which hand-wrote CREATE TABLE IF NOT EXISTS
// statements that drifted from shared/schema.ts and, because IF NOT EXISTS
// silently skips an existing table, could never repair the drift it caused.
//
// drizzle-kit is a devDependency and is NOT present in the runtime image
// (built with npm ci --omit=dev). drizzle-orm IS a production dependency and
// ships the migrator, which is all that is needed to APPLY migrations --
// generating them is a development-time task.
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

const { Pool } = pg;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set; skipping migrations.');
    return false;
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const db = drizzle(pool);
    console.log('Applying database migrations...');
    await migrate(db, { migrationsFolder: './migrations' });
    console.log('Migrations applied successfully.');
    return true;
  } catch (error) {
    console.error('MIGRATION FAILED:', error instanceof Error ? error.message : error);
    return false;
  } finally {
    // Drain the pool or the process never exits and the entrypoint hangs.
    await pool.end().catch(() => {});
  }
}

main()
  .then((ok) => {
    if (!ok) {
      console.error('The database may be missing tables. /api/health will report');
      console.error('a schema mismatch and the container will fail its healthcheck.');
    }
    // Exit 0 regardless: the app has an in-memory fallback, and enforcement is
    // the /api/health 503, not this script refusing to let the app start.
    process.exit(0);
  })
  .catch((error) => {
    console.error('Unexpected error running migrations:', error);
    process.exit(0);
  });
