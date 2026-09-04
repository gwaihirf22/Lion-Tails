// This script ensures database tables exist and verifies connection
// It should be run during deployment or first-run
import pg from 'pg';
const { Pool } = pg;
import fs from 'fs';
import path from 'path';

export async function ensureDatabase() {
  console.log('Checking database connection and structure...');
  
  // Check if DATABASE_URL is available
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL environment variable is not set!');
    console.error('Your application will run with in-memory storage, but data will be lost on restart.');
    console.error('Please set the DATABASE_URL environment variable for data persistence.');
    return false;
  }
  
  // Create a new connection pool
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // Test connection
    const client = await pool.connect();
    console.log('Successfully connected to the database.');

    try {
      // Check and create necessary tables
      await ensureTables(client);
    } finally {
      // Release client back to pool
      client.release();
    }

    console.log('Database setup completed successfully.');
    return true;
  } catch (error) {
    console.error('Error connecting to database:', error.message);
    console.error('Your application will fall back to in-memory storage.');
    return false;
  } finally {
    // Always drain the pool, otherwise the process never exits and the
    // container entrypoint hangs before it can start the server.
    await pool.end().catch(() => {});
  }
}

async function ensureTables(client) {
  // List of tables and their creation SQL
  const tables = [
    {
      name: 'users',
      sql: `
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          is_verified BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `
    },
    {
      name: 'verification_tokens',
      sql: `
        CREATE TABLE IF NOT EXISTS verification_tokens (
          token TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_type TEXT NOT NULL,
          expires_at TIMESTAMP WITH TIME ZONE NOT NULL
        )
      `
    },
    {
      name: 'stories',
      sql: `
        CREATE TABLE IF NOT EXISTS stories (
          story_id TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          story_data JSONB NOT NULL,
          is_favorite BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `
    },
    {
      name: 'characters',
      sql: `
        CREATE TABLE IF NOT EXISTS characters (
          character_id TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          character_data JSONB NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `
    },
    {
      name: 'songs',
      sql: `
        CREATE TABLE IF NOT EXISTS songs (
          song_id TEXT PRIMARY KEY,
          song_data JSONB NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `
    },
    {
      name: 'heroes_of_faith',
      sql: `
        CREATE TABLE IF NOT EXISTS heroes_of_faith (
          hero_id TEXT PRIMARY KEY,
          hero_data JSONB NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `
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
      `
    },
    {
      name: 'user_usage',
      sql: `
        CREATE TABLE IF NOT EXISTS user_usage (
          user_id INTEGER PRIMARY KEY,
          count INTEGER DEFAULT 0,
          last_reset_date TIMESTAMP WITH TIME ZONE
        )
      `
    },
    {
      name: 'user_settings',
      sql: `
        CREATE TABLE IF NOT EXISTS user_settings (
          user_id INTEGER PRIMARY KEY,
          openai_key TEXT,
          openai_model TEXT
        )
      `
    }
  ];
  
  console.log('Ensuring all tables exist...');
  
  // Create all tables if they don't exist
  for (const table of tables) {
    try {
      await client.query(table.sql);
      console.log(`Table '${table.name}' verified.`);
    } catch (error) {
      console.error(`Error creating table '${table.name}':`, error.message);
    }
  }
}

// No CommonJS export needed for ES modules

// Execute directly if called as a script
// Check if this is the main module being run
if (import.meta.url.endsWith(process.argv[1])) {
  ensureDatabase()
    .then(success => {
      console.log('Database check completed.');
      if (!success) {
        console.log('Warning: Data may not persist between deployments.');
      }
      // Exit 0 either way: the app has an in-memory fallback, so a database
      // problem should not block the container from starting.
      process.exit(0);
    })
    .catch(error => {
      console.error('Error during database setup:', error);
      process.exit(0);
    });
}