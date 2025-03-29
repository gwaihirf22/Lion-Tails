
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

// Variable declarations outside the conditional blocks
let pool;
let db;

if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL not set. Using memory storage instead.");
  // The pool and db will remain undefined, and the app will use MemStorage as fallback
} else {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzle({ client: pool, schema });
}

export { pool, db };
