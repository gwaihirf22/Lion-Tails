
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

// Variable declarations outside the conditional blocks
let pool;
let db;
let dbConnectionStatus = 'not_initialized';

async function initializeDatabase() {
  try {
    if (!process.env.DATABASE_URL) {
      console.warn("DATABASE_URL not set. Using memory storage instead.");
      dbConnectionStatus = 'not_configured';
      return false;
    }
    
    // Create a connection pool
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    
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
    
    // Initialize Drizzle if connection is good
    db = drizzle({ client: pool, schema });
    
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
