
// Support both Neon (serverless) and local Postgres (TCP)
import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import { drizzle as drizzleNeon, type NeonDatabase } from 'drizzle-orm/neon-serverless';

import { Pool as PgPool, type QueryResult } from 'pg';
import { drizzle as drizzlePg, type NodePgDatabase } from 'drizzle-orm/node-postgres';

import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

// Variable declarations outside the conditional blocks
type AnyPool = {
  query: (sql: string, params?: any[]) => Promise<QueryResult>;
  connect: () => Promise<any>;
};
// Allow db to be either Neon or NodePg
type AnyDb = NeonDatabase<typeof schema> | NodePgDatabase<typeof schema>;

let pool: AnyPool | undefined;
let db: AnyDb | undefined;
let dbConnectionStatus = 'not_initialized';

async function initializeDatabase() {
  try {
    if (!process.env.DATABASE_URL) {
      console.warn("DATABASE_URL not set. Using memory storage instead.");
      dbConnectionStatus = 'not_configured';
      return false;
    }
    
        // Decide whether to use Neon (websocket) or standard pg based on URL
    const isNeon = process.env.DATABASE_URL?.includes("neon.tech") || process.env.DATABASE_URL?.includes("neondatabase") || process.env.DATABASE_URL?.startsWith("postgresql+neon");

    if (isNeon) {
      // Use Neon serverless Pool
      pool = new NeonPool({ connectionString: process.env.DATABASE_URL! });
    } else {
      // Use standard pg Pool for local Docker Postgres
      pool = new PgPool({ connectionString: process.env.DATABASE_URL! });
    }

    // Test the connection
    const client = await pool.connect();
    try {
      await client.query('SELECT NOW()');
      console.log("Database connection test successful");
      dbConnectionStatus = 'connected';
    } catch (testError) {
      console.error("Database connection test failed:", testError);
      dbConnectionStatus = 'error';
      throw testError;
    } finally {
      client.release();
    }
    
    // Initialize Drizzle ORM with the correct adapter
    if (isNeon) {
      db = drizzleNeon(pool as NeonPool, { schema });
    } else {
      db = drizzlePg(pool as PgPool, { schema });
    }
    
    return true;
  } catch (error) {
    console.error("Failed to initialize database connection:", error);
    dbConnectionStatus = 'error';
    
    // Handle connection errors gracefully
    pool = undefined;
    db = undefined;
    return false;
  }
}

// Initialize immediately but don't wait for it
initializeDatabase().then(success => {
  if (success) {
    console.log("Database and ORM initialized successfully");
  } else {
    console.warn("Database initialization failed, falling back to memory storage");
  }
}).catch(err => {
  console.error("Error during database initialization:", err);
});

// Export the connection objects and status
export { pool, db, dbConnectionStatus };
