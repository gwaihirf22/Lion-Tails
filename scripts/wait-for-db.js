// Waits for Postgres to accept connections.
//
// Exits 0 as soon as a connection succeeds, or 1 once the retry budget is
// exhausted. The caller decides what to do about a failure -- the app itself
// has an in-memory fallback, so a timeout here is not necessarily fatal.
import pg from 'pg';
const { Client } = pg;

const MAX_RETRIES = Number(process.env.DB_WAIT_RETRIES) || 12;
const RETRY_INTERVAL_MS = (Number(process.env.DB_WAIT_INTERVAL) || 5) * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function tryConnect() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    await client.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
  if (await tryConnect()) {
    console.log('Database connection successful.');
    process.exit(0);
  }
  console.log(`Database not ready yet (${attempt}/${MAX_RETRIES})...`);
  if (attempt < MAX_RETRIES) await sleep(RETRY_INTERVAL_MS);
}

console.error(`Database unreachable after ${MAX_RETRIES} attempts.`);
process.exit(1);
