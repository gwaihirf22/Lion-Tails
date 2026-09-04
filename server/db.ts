import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

let pool: Pool | undefined;
let db: NodePgDatabase<typeof schema> | undefined;
let dbConnectionStatus = "not_initialized";

async function initializeDatabase() {
  try {
    if (!process.env.DATABASE_URL) {
      console.warn("DATABASE_URL not set. Using memory storage instead.");
      dbConnectionStatus = "not_configured";
      return false;
    }

    pool = new Pool({ connectionString: process.env.DATABASE_URL });

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

// Initialize immediately but don't wait for it. The pool itself is assigned
// synchronously above, so consumers importing `pool` see it right away; `db`
// becomes available once the connection test resolves.
initializeDatabase()
  .then((success) => {
    if (success) {
      console.log("Database and ORM initialized successfully");
    } else {
      console.warn("Database initialization failed, falling back to memory storage");
    }
  })
  .catch((err) => {
    console.error("Error during database initialization:", err);
  });

export { pool, db, dbConnectionStatus };
