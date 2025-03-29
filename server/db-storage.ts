
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
    try {
      // We'll use a raw query for now to store/retrieve JSON
      // Later we'll create proper relational tables
      const { rows } = await pool.query(
        `SELECT * FROM user_stories WHERE user_id = $1 AND 
         (is_favorite = true OR expires_at IS NULL OR expires_at > NOW())
         ORDER BY created_at DESC`,
        [userId]
      );
      
      if (!rows.length) return [];
      
      return rows.map(row => {
        try {
          // Handle the case where data might already be an object
          if (typeof row.story_data === 'object' && row.story_data !== null) {
            return row.story_data;
          }
          // Handle the string format with proper error handling
          return JSON.parse(row.story_data);
        } catch (parseError) {
          console.error("Error parsing story data:", parseError);
          // Return a default story object to prevent app crashes
          return {
            id: row.story_id || "unknown",
            story: {
              title: "Story Data Error",
              content: "There was a problem loading this story. The data may be corrupted.",
              bibleVerse: {
                text: "The Lord is my helper; I will not fear.",
                reference: "Hebrews 13:6"
              }
            },
            request: {
              theme: "",
              animal: "",
              gender: "",
              childName: "",
              storyType: "regular",
              heroOfFaith: "",
              customPrompt: "",
              biblicalEvent: "",
              useTimeTravel: false
            },
            createdAt: new Date(row.created_at) || new Date(),
            expiresAt: new Date(row.expires_at) || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            isFavorite: !!row.is_favorite
          };
        }
      });
    } catch (error) {
      console.error("Error fetching user stories:", error);
      return [];
    }
  }

  // Character related methods - implementing temporary JSON storage
  async getAllCharacters(userId?: number): Promise<Character[]> {
    try {
      let rows: any[];
      if (userId) {
        const result = await pool.query(
          `SELECT * FROM user_characters WHERE user_id = $1 ORDER BY created_at DESC`,
          [userId]
        );
        rows = result.rows;
      } else {
        // Admin function to get all characters
        const result = await pool.query(
          `SELECT * FROM user_characters ORDER BY created_at DESC`
        );
        rows = result.rows;
      }
      
      if (!rows.length) return [];
      
      return rows.map(row => {
        try {
          // Handle the case where data might already be an object
          if (typeof row.character_data === 'object' && row.character_data !== null) {
            return row.character_data;
          }
          // Handle the string format with proper error handling
          return JSON.parse(row.character_data);
        } catch (parseError) {
          console.error("Error parsing character data:", parseError);
          // Return a default object to prevent app crashes
          return {
            id: row.character_id || "unknown",
            name: "Unknown Character",
            gender: "unknown",
            age: 0,
            hairColor: "",
            eyeColor: "",
            outfit: "",
            favoriteActivity: "",
            specialAbility: "",
            personality: "",
            backstory: "",
            createdAt: new Date(row.created_at) || new Date()
          };
        }
      });
    } catch (error) {
      console.error("Error fetching characters:", error);
      return [];
    }
  }

  async getCharacterById(id: string): Promise<Character | undefined> {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM user_characters WHERE character_id = $1`,
        [id]
      );
      
      if (!rows.length) return undefined;
      
      try {
        // Handle the case where data might already be an object
        if (typeof rows[0].character_data === 'object' && rows[0].character_data !== null) {
          return rows[0].character_data;
        }
        // Handle the string format with proper error handling
        return JSON.parse(rows[0].character_data);
      } catch (parseError) {
        console.error("Error parsing character data:", parseError);
        // Return a default object to prevent app crashes
        return {
          id: id,
          name: "Unknown Character",
          gender: "unknown",
          age: 0,
          hairColor: "",
          eyeColor: "",
          outfit: "",
          favoriteActivity: "",
          specialAbility: "",
          personality: "",
          backstory: "",
          createdAt: new Date(rows[0].created_at) || new Date()
        };
      }
    } catch (error) {
      console.error(`Error fetching character by ID ${id}:`, error);
      return undefined;
    }
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
    try {
      const { rows } = await pool.query(
        `SELECT * FROM songs ORDER BY title ASC`
      );
      
      if (!rows.length) return [];
      
      return rows.map(row => {
        try {
          // Handle the case where data might already be an object
          if (typeof row.song_data === 'object' && row.song_data !== null) {
            return row.song_data;
          }
          // Handle the string format with proper error handling
          return JSON.parse(row.song_data);
        } catch (parseError) {
          console.error("Error parsing song data:", parseError);
          // Return a default song object to prevent app crashes
          return {
            id: row.song_id || "unknown",
            title: "Song Data Error",
            artist: "Unknown",
            verses: [{ lyrics: ["Data could not be parsed"], chords: [""] }],
            chorus: null,
            bridge: null,
            chords: [],
            backgroundColor: "#f8f9fa"
          };
        }
      });
    } catch (error) {
      console.error("Error fetching songs:", error);
      return [];
    }
  }

  async getSongById(id: string): Promise<Song | undefined> {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM songs WHERE song_id = $1`,
        [id]
      );
      
      if (!rows.length) return undefined;
      
      try {
        // Handle the case where data might already be an object
        if (typeof rows[0].song_data === 'object' && rows[0].song_data !== null) {
          return rows[0].song_data;
        }
        // Handle the string format with proper error handling
        return JSON.parse(rows[0].song_data);
      } catch (parseError) {
        console.error("Error parsing song data:", parseError);
        // Return a default song object to prevent app crashes
        return {
          id: id,
          title: "Song Data Error",
          artist: "Unknown",
          verses: [{ lyrics: ["Data could not be parsed"], chords: [""] }],
          chorus: null,
          bridge: null,
          chords: [],
          backgroundColor: "#f8f9fa"
        };
      }
    } catch (error) {
      console.error(`Error fetching song by ID ${id}:`, error);
      return undefined;
    }
  }
  
  async createSong(song: Song): Promise<Song> {
    try {
      const songWithId = song.id ? song : { ...song, id: uuidv4() };
      
      await pool.query(
        `INSERT INTO songs (song_id, song_data) VALUES ($1, $2)`,
        [songWithId.id, JSON.stringify(songWithId)]
      );
      
      return songWithId;
    } catch (error) {
      console.error("Error creating song:", error);
      throw error; // Rethrow to allow caller to handle appropriately
    }
  }
  
  // Story methods
  async getAllStories(userId?: number): Promise<SavedStory[]> {
    if (userId) {
      return this.getUserStories(userId);
    }
    
    try {
      // Admin function - get all stories
      const { rows } = await pool.query(
        `SELECT * FROM user_stories WHERE 
         is_favorite = true OR expires_at IS NULL OR expires_at > NOW()
         ORDER BY created_at DESC`
      );
      
      if (!rows.length) return [];
      
      return rows.map(row => {
        try {
          // Handle the case where data might already be an object
          if (typeof row.story_data === 'object' && row.story_data !== null) {
            return row.story_data;
          }
          // Handle the string format with proper error handling
          return JSON.parse(row.story_data);
        } catch (parseError) {
          console.error("Error parsing story data:", parseError);
          // Return a default story object to prevent app crashes
          return {
            id: row.story_id || "unknown",
            story: {
              title: "Story Data Error",
              content: "There was a problem loading this story. The data may be corrupted.",
              bibleVerse: {
                text: "The Lord is my helper; I will not fear.",
                reference: "Hebrews 13:6"
              }
            },
            request: {
              theme: "",
              animal: "",
              gender: "",
              childName: "",
              storyType: "regular",
              heroOfFaith: "",
              customPrompt: "",
              biblicalEvent: "",
              useTimeTravel: false
            },
            createdAt: new Date(row.created_at) || new Date(),
            expiresAt: new Date(row.expires_at) || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            isFavorite: !!row.is_favorite
          };
        }
      });
    } catch (error) {
      console.error("Error fetching all stories:", error);
      return [];
    }
  }
  
  async getStoryById(id: string, userId?: number): Promise<SavedStory | undefined> {
    try {
      let query = `SELECT * FROM user_stories WHERE story_id = $1`;
      const params: any[] = [id];
      
      if (userId) {
        query += ` AND user_id = $2`;
        params.push(userId);
      }
      
      const { rows } = await pool.query(query, params);
      
      if (!rows.length) return undefined;
      
      try {
        // Handle the case where data might already be an object
        if (typeof rows[0].story_data === 'object' && rows[0].story_data !== null) {
          return rows[0].story_data;
        }
        // Handle the string format with proper error handling
        return JSON.parse(rows[0].story_data);
      } catch (parseError) {
        console.error("Error parsing story data:", parseError);
        // Return a default story object to prevent app crashes
        return {
          id: id,
          story: {
            title: "Story Data Error",
            content: "There was a problem loading this story. The data may be corrupted.",
            bibleVerse: {
              text: "The Lord is my helper; I will not fear.",
              reference: "Hebrews 13:6"
            }
          },
          request: {
            theme: "",
            animal: "",
            gender: "",
            childName: "",
            storyType: "regular",
            heroOfFaith: "",
            customPrompt: "",
            biblicalEvent: "",
            useTimeTravel: false
          },
          createdAt: new Date(rows[0].created_at).toISOString() || new Date().toISOString(),
          expiresAt: rows[0].expires_at ? new Date(rows[0].expires_at).toISOString() : undefined,
          isFavorite: !!rows[0].is_favorite
        };
      }
    } catch (error) {
      console.error(`Error fetching story by ID ${id}:`, error);
      return undefined;
    }
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
      
      if (!rows.length) return [];
      
      return rows.map(row => {
        try {
          // Handle the case where data might already be an object
          if (typeof row.hero_data === 'object' && row.hero_data !== null) {
            return row.hero_data;
          }
          // Handle the string format with proper error handling
          return JSON.parse(row.hero_data);
        } catch (parseError) {
          console.error("Error parsing hero data:", parseError);
          // Return a default object to prevent app crashes
          return {
            id: row.hero_id || "unknown",
            name: "Unknown Hero",
            description: "Data could not be parsed",
            timePeriod: "",
            contribution: "",
            birthYear: "",
            deathYear: "",
            famousQuote: "",
            bibleVerse: {
              text: "The Lord is my helper; I will not fear.",
              reference: "Hebrews 13:6"
            },
            imageUrl: "",
            createdAt: new Date()
          };
        }
      });
    } catch (error) {
      console.error("Error fetching heroes of faith:", error);
      // Return empty array instead of throwing to prevent app crashes
      return [];
    }
  }

  async getHeroOfFaithById(id: string): Promise<HeroOfFaith | undefined> {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM heroes_of_faith WHERE hero_id = $1`,
        [id]
      );
      
      if (!rows.length) return undefined;
      
      try {
        // Handle the case where data might already be an object
        if (typeof rows[0].hero_data === 'object' && rows[0].hero_data !== null) {
          return rows[0].hero_data;
        }
        // Handle the string format with proper error handling
        return JSON.parse(rows[0].hero_data);
      } catch (parseError) {
        console.error("Error parsing hero data:", parseError);
        // Return a default object to prevent app crashes
        return {
          id: id,
          name: "Unknown Hero",
          description: "Data could not be parsed",
          timePeriod: "",
          contribution: "",
          birthYear: "",
          deathYear: "",
          famousQuote: "",
          bibleVerse: {
            text: "The Lord is my helper; I will not fear.",
            reference: "Hebrews 13:6"
          },
          imageUrl: "",
          createdAt: new Date()
        };
      }
    } catch (error) {
      console.error(`Error fetching hero of faith by ID ${id}:`, error);
      return undefined;
    }
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
