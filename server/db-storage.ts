
import { db, pool } from './db';
import { users, verificationTokens, type User, type InsertUser, type SavedStory, type StoryResponse, type StoryRequest, type Character, type HeroOfFaith } from "@shared/schema";
import { v4 as uuidv4 } from 'uuid';
import session from 'express-session';
import { eq, and, desc, isNull, sql } from 'drizzle-orm';
import connectPg from 'connect-pg-simple';
import { IStorage } from './storage';

const PostgresStore = connectPg(session);

// Define tables for DbStorage if they don't exist in schema.ts
// For now, we'll store JSON data for some of the more complex types
// We'll create proper relational schemas later

export class DbStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is required");
    }

    // Set up session store with PostgreSQL
    this.sessionStore = new PostgresStore({
      pool,
      tableName: 'session',
      createTableIfMissing: true
    });
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username));
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.email, email));
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User | undefined> {
    const result = await db
      .update(users)
      .set({
        ...updates,
        updatedAt: new Date()
      })
      .where(eq(users.id, id))
      .returning();
    return result[0];
  }

  // Verification methods
  async verifyUser(userId: number): Promise<boolean> {
    const result = await db
      .update(users)
      .set({
        isVerified: true,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId))
      .returning();
    return !!result[0];
  }

  async createVerificationToken(userId: number, tokenType: 'email' | 'password'): Promise<string> {
    // Generate a random token
    const token = Array.from(Array(32), () => Math.floor(Math.random() * 36).toString(36)).join('');
    
    // Set expiry to 24 hours from now
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);
    
    // Store token
    await db.insert(verificationTokens).values({
      userId,
      token,
      type: tokenType,
      expiresAt
    });
    
    return token;
  }

  async getVerificationToken(token: string): Promise<{ userId: number, type: string, expiresAt: Date } | undefined> {
    const now = new Date();
    const result = await db
      .select()
      .from(verificationTokens)
      .where(
        and(
          eq(verificationTokens.token, token),
          sql`${verificationTokens.expiresAt} > ${now}`
        )
      );
    
    // If no valid token found, return undefined
    if (!result.length) return undefined;
    
    return {
      userId: result[0].userId,
      type: result[0].type,
      expiresAt: result[0].expiresAt
    };
  }

  async deleteVerificationToken(token: string): Promise<boolean> {
    const result = await db
      .delete(verificationTokens)
      .where(eq(verificationTokens.token, token))
      .returning();
    return !!result.length;
  }

  // User stories method - implementing temporary JSON storage until we create proper relations
  async getUserStories(userId: number): Promise<SavedStory[]> {
    // We'll use a raw query for now to store/retrieve JSON
    // Later we'll create proper relational tables
    const { rows } = await pool.query(
      `SELECT * FROM user_stories WHERE user_id = $1 AND 
       (is_favorite = true OR expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at DESC`,
      [userId]
    );
    
    if (!rows.length) return [];
    
    return rows.map(row => JSON.parse(row.story_data));
  }

  // Character related methods - implementing temporary JSON storage
  async getAllCharacters(userId?: number): Promise<Character[]> {
    if (userId) {
      const { rows } = await pool.query(
        `SELECT * FROM user_characters WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId]
      );
      return rows.map(row => JSON.parse(row.character_data));
    } else {
      // Admin function to get all characters
      const { rows } = await pool.query(
        `SELECT * FROM user_characters ORDER BY created_at DESC`
      );
      return rows.map(row => JSON.parse(row.character_data));
    }
  }

  async getCharacterById(id: string): Promise<Character | undefined> {
    const { rows } = await pool.query(
      `SELECT * FROM user_characters WHERE character_id = $1`,
      [id]
    );
    
    if (!rows.length) return undefined;
    return JSON.parse(rows[0].character_data);
  }

  async createCharacter(characterData: Omit<Character, "id" | "createdAt">, userId: number): Promise<Character> {
    const id = uuidv4();
    const now = new Date();
    
    const character: Character = {
      ...characterData,
      id,
      createdAt: now.toISOString()
    };
    
    await pool.query(
      `INSERT INTO user_characters (character_id, user_id, character_data, created_at) 
       VALUES ($1, $2, $3, $4)`,
      [id, userId, JSON.stringify(character), now]
    );
    
    return character;
  }

  async updateCharacter(id: string, updates: Partial<Character>): Promise<Character | undefined> {
    // First get the current character
    const character = await this.getCharacterById(id);
    if (!character) return undefined;
    
    const updatedCharacter: Character = {
      ...character,
      ...updates
    };
    
    await pool.query(
      `UPDATE user_characters SET character_data = $1 WHERE character_id = $2`,
      [JSON.stringify(updatedCharacter), id]
    );
    
    return updatedCharacter;
  }

  async deleteCharacter(id: string): Promise<boolean> {
    const result = await pool.query(
      `DELETE FROM user_characters WHERE character_id = $1 RETURNING character_id`,
      [id]
    );
    
    return result.rowCount > 0;
  }

  // Song methods - implementing temporary JSON storage
  async getAllSongs(): Promise<Song[]> {
    const { rows } = await pool.query(
      `SELECT * FROM songs ORDER BY title ASC`
    );
    
    return rows.map(row => JSON.parse(row.song_data));
  }

  async getSongById(id: string): Promise<Song | undefined> {
    const { rows } = await pool.query(
      `SELECT * FROM songs WHERE song_id = $1`,
      [id]
    );
    
    if (!rows.length) return undefined;
    return JSON.parse(rows[0].song_data);
  }
  
  async createSong(song: Song): Promise<Song> {
    const songWithId = song.id ? song : { ...song, id: uuidv4() };
    
    await pool.query(
      `INSERT INTO songs (song_id, song_data) VALUES ($1, $2)`,
      [songWithId.id, JSON.stringify(songWithId)]
    );
    
    return songWithId;
  }
  
  // Story methods
  async getAllStories(userId?: number): Promise<SavedStory[]> {
    if (userId) {
      return this.getUserStories(userId);
    }
    
    // Admin function - get all stories
    const { rows } = await pool.query(
      `SELECT * FROM user_stories WHERE 
       is_favorite = true OR expires_at IS NULL OR expires_at > NOW()
       ORDER BY created_at DESC`
    );
    
    return rows.map(row => JSON.parse(row.story_data));
  }
  
  async getStoryById(id: string, userId?: number): Promise<SavedStory | undefined> {
    let query = `SELECT * FROM user_stories WHERE story_id = $1`;
    const params: any[] = [id];
    
    if (userId) {
      query += ` AND user_id = $2`;
      params.push(userId);
    }
    
    const { rows } = await pool.query(query, params);
    
    if (!rows.length) return undefined;
    return JSON.parse(rows[0].story_data);
  }
  
  async saveStory(story: StoryResponse, request: StoryRequest, userId: number): Promise<SavedStory> {
    const id = uuidv4();
    const now = new Date();
    
    // Set expiry to 1 year from now
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    
    const savedStory: SavedStory = {
      id,
      story,
      request,
      createdAt: now.toISOString(),
      isFavorite: false,
      expiresAt: expiryDate.toISOString()
    };
    
    await pool.query(
      `INSERT INTO user_stories (story_id, user_id, story_data, created_at, is_favorite, expires_at) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, userId, JSON.stringify(savedStory), now, false, expiryDate]
    );
    
    return savedStory;
  }
  
  async toggleFavorite(id: string, isFavorite: boolean, userId: number): Promise<SavedStory | undefined> {
    // Get the current story
    const story = await this.getStoryById(id, userId);
    if (!story) return undefined;
    
    const updatedStory: SavedStory = {
      ...story,
      isFavorite,
      // Remove expiry date if it's now a favorite
      expiresAt: isFavorite ? undefined : story.expiresAt
    };
    
    // Update expiry in both JSON and the table column
    const expiryDate = isFavorite ? null : story.expiresAt ? new Date(story.expiresAt) : null;
    
    await pool.query(
      `UPDATE user_stories SET 
       story_data = $1, 
       is_favorite = $2, 
       expires_at = $3 
       WHERE story_id = $4 AND user_id = $5`,
      [JSON.stringify(updatedStory), isFavorite, expiryDate, id, userId]
    );
    
    return updatedStory;
  }
  
  async deleteStory(id: string, userId: number): Promise<boolean> {
    const result = await pool.query(
      `DELETE FROM user_stories WHERE story_id = $1 AND user_id = $2 RETURNING story_id`,
      [id, userId]
    );
    
    return result.rowCount > 0;
  }
  
  // Usage tracking methods
  async getStoryGenerationCount(userId: number): Promise<number> {
    const { rows } = await pool.query(
      `SELECT count FROM user_usage WHERE user_id = $1`,
      [userId]
    );
    
    return rows.length ? rows[0].count : 0;
  }
  
  async incrementStoryGenerationCount(userId: number): Promise<number> {
    // Use upsert pattern
    const { rows } = await pool.query(
      `INSERT INTO user_usage (user_id, count) 
       VALUES ($1, 1) 
       ON CONFLICT (user_id) 
       DO UPDATE SET count = user_usage.count + 1 
       RETURNING count`,
      [userId]
    );
    
    return rows[0].count;
  }
  
  async resetStoryGenerationCount(userId: number): Promise<void> {
    const now = new Date();
    
    await pool.query(
      `INSERT INTO user_usage (user_id, count, last_reset_date) 
       VALUES ($1, 0, $2) 
       ON CONFLICT (user_id) 
       DO UPDATE SET count = 0, last_reset_date = $2`,
      [userId, now]
    );
  }
  
  async getLastResetDate(userId: number): Promise<Date | null> {
    const { rows } = await pool.query(
      `SELECT last_reset_date FROM user_usage WHERE user_id = $1`,
      [userId]
    );
    
    return rows.length && rows[0].last_reset_date ? rows[0].last_reset_date : null;
  }
  
  async setLastResetDate(userId: number, date: Date): Promise<void> {
    await pool.query(
      `INSERT INTO user_usage (user_id, last_reset_date) 
       VALUES ($1, $2) 
       ON CONFLICT (user_id) 
       DO UPDATE SET last_reset_date = $2`,
      [userId, date]
    );
  }
  
  // User settings methods
  async getUserOpenAIKey(userId: number): Promise<string | null> {
    const { rows } = await pool.query(
      `SELECT openai_key FROM user_settings WHERE user_id = $1`,
      [userId]
    );
    
    return rows.length && rows[0].openai_key ? rows[0].openai_key : null;
  }
  
  async setUserOpenAIKey(userId: number, key: string): Promise<void> {
    await pool.query(
      `INSERT INTO user_settings (user_id, openai_key) 
       VALUES ($1, $2) 
       ON CONFLICT (user_id) 
       DO UPDATE SET openai_key = $2`,
      [userId, key]
    );
  }
  
  async getUserOpenAIModel(userId: number): Promise<string | null> {
    const { rows } = await pool.query(
      `SELECT openai_model FROM user_settings WHERE user_id = $1`,
      [userId]
    );
    
    return rows.length && rows[0].openai_model ? rows[0].openai_model : 'gpt-4o'; // Default to the newest model
  }
  
  async setUserOpenAIModel(userId: number, model: string): Promise<void> {
    await pool.query(
      `INSERT INTO user_settings (user_id, openai_model) 
       VALUES ($1, $2) 
       ON CONFLICT (user_id) 
       DO UPDATE SET openai_model = $2`,
      [userId, model]
    );
  }

  // Heroes of Faith methods
  async getAllHeroesOfFaith(): Promise<HeroOfFaith[]> {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM heroes_of_faith ORDER BY hero_id ASC`
      );
      
      return rows.length ? rows.map(row => JSON.parse(row.hero_data)) : [];
    } catch (error) {
      console.error("Error fetching heroes of faith:", error);
      // Return empty array instead of throwing to prevent app crashes
      return [];
    }
  }

  async getHeroOfFaithById(id: string): Promise<HeroOfFaith | undefined> {
    const { rows } = await pool.query(
      `SELECT * FROM heroes_of_faith WHERE hero_id = $1`,
      [id]
    );
    
    if (!rows.length) return undefined;
    return JSON.parse(rows[0].hero_data);
  }

  async createHeroOfFaith(heroData: Omit<HeroOfFaith, "id" | "createdAt">): Promise<HeroOfFaith> {
    const id = uuidv4();
    const now = new Date();
    
    const hero: HeroOfFaith = {
      ...heroData,
      id,
      createdAt: now
    };
    
    await pool.query(
      `INSERT INTO heroes_of_faith (hero_id, hero_data, created_at) 
       VALUES ($1, $2, $3)`,
      [id, JSON.stringify(hero), now]
    );
    
    return hero;
  }

  async updateHeroOfFaith(id: string, updates: Partial<HeroOfFaith>): Promise<HeroOfFaith | undefined> {
    // Get current hero
    const hero = await this.getHeroOfFaithById(id);
    if (!hero) return undefined;
    
    const updatedHero: HeroOfFaith = {
      ...hero,
      ...updates
    };
    
    await pool.query(
      `UPDATE heroes_of_faith SET hero_data = $1 WHERE hero_id = $2`,
      [JSON.stringify(updatedHero), id]
    );
    
    return updatedHero;
  }

  async deleteHeroOfFaith(id: string): Promise<boolean> {
    const result = await pool.query(
      `DELETE FROM heroes_of_faith WHERE hero_id = $1 RETURNING hero_id`,
      [id]
    );
    
    return result.rowCount > 0;
  }
}
