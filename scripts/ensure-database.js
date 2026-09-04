// Creates and repairs the database schema. Run from entrypoint.sh before the
// server starts, and available as `npm run db:init`.
//
// IMPORTANT: this file is the bootstrap for tables that have no Drizzle
// definition, and it must stay consistent with shared/schema.ts for the two
// that do (users, verification_tokens). Those two are read through the ORM, so
// a mismatch there fails at runtime with a confusing 500 rather than at
// startup -- which is exactly what happened when this script created `users`
// with 6 of its 13 columns.
//
// Every CREATE is IF NOT EXISTS, which means a table that already exists in the
// wrong shape is silently skipped forever. That is why the ALTER section below
// exists: creation alone cannot repair drift, so each column is added
// idempotently and the result is verified before the script reports success.
import pg from 'pg';
const { Pool } = pg;

// Tables keyed by name. Column definitions are repeated in ADDITIVE_COLUMNS so
// an existing table can be brought up to date; keep the two in step.
const TABLES = [
  {
    name: 'users',
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        first_name TEXT,
        last_name TEXT,
        is_verified BOOLEAN NOT NULL DEFAULT FALSE,
        is_admin BOOLEAN NOT NULL DEFAULT FALSE,
        verification_token TEXT,
        reset_password_token TEXT,
        reset_password_expires TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `,
  },
  {
    name: 'verification_tokens',
    sql: `
      CREATE TABLE IF NOT EXISTS verification_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        token TEXT NOT NULL,
        type TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `,
  },
  {
    // Queried as user_characters throughout db-storage.ts. An earlier version
    // of this script created a table called `characters`, which nothing ever
    // read, so the characters feature had no table at all.
    name: 'user_characters',
    sql: `
      CREATE TABLE IF NOT EXISTS user_characters (
        character_id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        character_data JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `,
  },
  {
    // Likewise: previously created as `stories` and never read. db-storage.ts
    // also creates this lazily; having it here makes that a no-op.
    name: 'user_stories',
    sql: `
      CREATE TABLE IF NOT EXISTS user_stories (
        story_id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        story_data JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        is_favorite BOOLEAN DEFAULT FALSE,
        expires_at TIMESTAMP WITH TIME ZONE,
        hero_id TEXT
      )
    `,
  },
  {
    name: 'songs',
    sql: `
      CREATE TABLE IF NOT EXISTS songs (
        song_id TEXT PRIMARY KEY,
        song_data JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `,
  },
  {
    name: 'heroes_of_faith',
    sql: `
      CREATE TABLE IF NOT EXISTS heroes_of_faith (
        hero_id TEXT PRIMARY KEY,
        hero_data JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `,
  },
  {
    name: 'hero_stories',
    sql: `
      CREATE TABLE IF NOT EXISTS hero_stories (
        story_id TEXT PRIMARY KEY,
        hero_id TEXT NOT NULL,
        user_id INTEGER,
        story_data JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        is_featured BOOLEAN DEFAULT FALSE
      )
    `,
  },
  {
    name: 'user_usage',
    sql: `
      CREATE TABLE IF NOT EXISTS user_usage (
        user_id INTEGER PRIMARY KEY,
        count INTEGER DEFAULT 0,
        last_reset_date TIMESTAMP WITH TIME ZONE
      )
    `,
  },
  {
    name: 'user_settings',
    sql: `
      CREATE TABLE IF NOT EXISTS user_settings (
        user_id INTEGER PRIMARY KEY,
        openai_key TEXT,
        openai_model TEXT
      )
    `,
  },
];

// Repairs for tables that already exist in an older shape. ADD COLUMN IF NOT
// EXISTS is a no-op on a correct database, so this is safe to run every boot.
const ADDITIVE_COLUMNS = [
  ['users', 'first_name', 'TEXT'],
  ['users', 'last_name', 'TEXT'],
  ['users', 'is_verified', 'BOOLEAN DEFAULT FALSE'],
  ['users', 'is_admin', 'BOOLEAN DEFAULT FALSE'],
  ['users', 'verification_token', 'TEXT'],
  ['users', 'reset_password_token', 'TEXT'],
  ['users', 'reset_password_expires', 'TIMESTAMP'],
  ['users', 'created_at', 'TIMESTAMP DEFAULT NOW()'],
  ['users', 'updated_at', 'TIMESTAMP DEFAULT NOW()'],
  ['user_stories', 'hero_id', 'TEXT'],
  ['user_stories', 'is_favorite', 'BOOLEAN DEFAULT FALSE'],
  ['user_stories', 'expires_at', 'TIMESTAMP WITH TIME ZONE'],
];

// Columns the ORM and the raw queries rely on. Verified after the repairs so a
// database that is still wrong is reported loudly instead of discovered by the
// first user to hit a 500.
const REQUIRED_COLUMNS = {
  users: [
    'id', 'username', 'email', 'password', 'first_name', 'last_name',
    'is_verified', 'is_admin', 'verification_token', 'reset_password_token',
    'reset_password_expires', 'created_at', 'updated_at',
  ],
  verification_tokens: ['id', 'user_id', 'token', 'type', 'expires_at', 'created_at'],
  user_characters: ['character_id', 'user_id', 'character_data', 'created_at'],
  user_stories: ['story_id', 'user_id', 'story_data', 'created_at', 'is_favorite', 'expires_at', 'hero_id'],
};

async function columnsOf(client, table) {
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );
  return rows.map((r) => r.column_name);
}

/**
 * verification_tokens shipped in an incompatible shape: `token TEXT PRIMARY KEY`
 * with a `token_type` column, where shared/schema.ts declares a serial `id` and
 * a `type` column. No ALTER can reconcile a different primary key, so the
 * legacy table is dropped and recreated.
 *
 * This is safe because the table only ever holds short-lived verification and
 * password-reset tokens: worst case an unverified user re-requests a link. The
 * drop is skipped if the table is non-empty AND already has the correct shape.
 */
async function repairVerificationTokens(client) {
  const cols = await columnsOf(client, 'verification_tokens');
  if (cols.length === 0) return false;
  const isLegacy = cols.includes('token_type') || !cols.includes('id');
  if (!isLegacy) return false;

  console.warn(
    "Table 'verification_tokens' has the legacy shape (token_type / no id). " +
      'Recreating it to match shared/schema.ts; pending verification links will be invalidated.',
  );
  await client.query('DROP TABLE verification_tokens');
  return true;
}

export async function ensureDatabase() {
  console.log('Checking database connection and structure...');

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL environment variable is not set!');
    console.error('Your application will run with in-memory storage, but data will be lost on restart.');
    return false;
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const client = await pool.connect();
    console.log('Successfully connected to the database.');

    try {
      await repairVerificationTokens(client);

      for (const table of TABLES) {
        await client.query(table.sql);
        console.log(`Table '${table.name}' verified.`);
      }

      for (const [table, column, definition] of ADDITIVE_COLUMNS) {
        await client.query(
          `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${definition}`,
        );
      }

      // is_verified is .notNull() in shared/schema.ts but was created nullable.
      await client.query(`UPDATE users SET is_verified = FALSE WHERE is_verified IS NULL`);
      await client.query(`ALTER TABLE users ALTER COLUMN is_verified SET NOT NULL`);

      const problems = [];
      for (const [table, required] of Object.entries(REQUIRED_COLUMNS)) {
        const actual = await columnsOf(client, table);
        if (actual.length === 0) {
          problems.push(`table '${table}' does not exist`);
          continue;
        }
        const missing = required.filter((c) => !actual.includes(c));
        if (missing.length) {
          problems.push(`table '${table}' is missing: ${missing.join(', ')}`);
        }
      }

      if (problems.length) {
        console.error('SCHEMA VERIFICATION FAILED:');
        for (const p of problems) console.error(`  - ${p}`);
        return false;
      }

      console.log('Schema verified: all required columns present.');
      return true;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error preparing database:', error.message);
    return false;
  } finally {
    // Always drain the pool, otherwise the process never exits and the
    // container entrypoint hangs before it can start the server.
    await pool.end().catch(() => {});
  }
}

if (import.meta.url.endsWith(process.argv[1])) {
  ensureDatabase()
    .then((success) => {
      console.log('Database check completed.');
      if (!success) {
        console.error('Warning: the schema is not correct. The app will start, but');
        console.error('database-backed features may fail. /api/health will report this.');
      }
      // Exit 0 either way: the app has an in-memory fallback and a failing
      // healthcheck is the mechanism that fails the deploy, not this script.
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error during database setup:', error);
      process.exit(0);
    });
}
