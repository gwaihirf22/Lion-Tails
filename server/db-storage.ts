
import { db, pool } from './db';
import { users, verificationTokens, type User, type InsertUser, type SavedStory, type StoryResponse, type StoryRequest, type Character, type HeroOfFaith, type HeroStory, type Song } from "@shared/schema";
import { v4 as uuidv4 } from 'uuid';
import session from 'express-session';
import { eq, and, desc, isNull, sql, or, like, ilike } from 'drizzle-orm';
import connectPg from 'connect-pg-simple';
import { IStorage } from './storage';

const PostgresStore = connectPg(session);



// Define tables for DbStorage if they don't exist in schema.ts
// For now, we'll store JSON data for some of the more complex types
// We'll create proper relational schemas later

export class DbStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    if (!process.env.DATABASE_URL || !pool) {
      console.warn("DATABASE_URL not set or database connection failed. Using fallback session store.");
      // Create memory store for sessions as fallback
      const MemoryStore = require('memorystore')(session);
      this.sessionStore = new MemoryStore({
        checkPeriod: 86400000 // prune expired entries every 24h
      });
      return;
    }

    // Set up session store with PostgreSQL
    try {
      this.sessionStore = new PostgresStore({
        pool: pool as any, // type assertion to avoid Pool compatibility issues
        tableName: 'session',
        createTableIfMissing: true
      });
    } catch (error) {
      console.error("Failed to initialize PostgreSQL session store:", error);
      // Fallback to memory store if PostgreSQL session store initialization fails
      const MemoryStore = require('memorystore')(session);
      this.sessionStore = new MemoryStore({
        checkPeriod: 86400000 // prune expired entries every 24h
      });
    }
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    if (!db || !pool) {
      console.warn(`Database unavailable in getUser(${id}). Using fallback empty result.`);
      return undefined;
    }
    try {
      const result = await db.select().from(users).where(eq(users.id, id));
      return result[0];
    } catch (error) {
      console.error(`Error in getUser(${id}):`, error);
      return undefined;
    }
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    if (!db || !pool) {
      console.warn(`Database unavailable in getUserByUsername(${username}). Using fallback empty result.`);
      return undefined;
    }
    try {
      const result = await db.select().from(users).where(eq(users.username, username));
      return result[0];
    } catch (error) {
      console.error(`Error in getUserByUsername(${username}):`, error);
      return undefined;
    }
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    if (!db || !pool) {
      console.warn(`Database unavailable in getUserByEmail(${email}). Using fallback empty result.`);
      return undefined;
    }
    try {
      const result = await db.select().from(users).where(eq(users.email, email));
      return result[0];
    } catch (error) {
      console.error(`Error in getUserByEmail(${email}):`, error);
      return undefined;
    }
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    if (!db || !pool) {
      console.error("Database unavailable in createUser. Cannot create user:", insertUser.username);
      throw new Error("Database connection is required to create users");
    }
    try {
      const result = await db.insert(users).values(insertUser).returning();
      return result[0];
    } catch (error) {
      console.error(`Error in createUser(${insertUser.username}):`, error);
      throw error;
    }
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User | undefined> {
    if (!db || !pool) {
      console.warn(`Database unavailable in updateUser(${id}).`);
      return undefined;
    }
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
    if (!db || !pool) {
      console.warn(`Database unavailable in verifyUser(${userId}).`);
      return false;
    }
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
    if (!db || !pool) {
      console.error("Database unavailable in createVerificationToken.");
      throw new Error("Database connection is required to create verification tokens.");
    }
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
    if (!db || !pool) {
      console.warn("Database unavailable in getVerificationToken.");
      return undefined;
    }
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
    if (!db || !pool) {
      console.warn("Database unavailable in deleteVerificationToken.");
      return false;
    }
    const result = await db
      .delete(verificationTokens)
      .where(eq(verificationTokens.token, token))
      .returning();
    return !!result.length;
  }

  // User stories method - implementing temporary JSON storage until we create proper relations
  async getUserStories(userId: number): Promise<SavedStory[]> {
    if (!pool) {
      console.warn("Database not available, returning empty array for user stories.");
      return [];
    }
    try {
      const result = await pool.query(
        `SELECT * FROM user_stories WHERE user_id = $1 AND 
         (is_favorite = true OR expires_at IS NULL OR expires_at > NOW())
         ORDER BY created_at DESC`,
        [userId]
      );
      const rows = result.rows;
      
      if (!rows.length) return [];
      
      return rows.map((row: any) => {
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
              gender: "boy" as "boy" | "girl" | undefined,
              childName: "",
              storyType: "regular",
              heroOfFaith: "",
              customPrompt: "",
              biblicalEvent: "",
              useTimeTravel: false,
              useAnimal: true
            },
            createdAt: new Date(row.created_at) || new Date(),
            expiresAt: new Date(row.expires_at) || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            isFavorite: !!row.is_favorite,
            searchMetadata: {
              childName: "",
              biblePassage: "",
              topic: "",
              tags: []
            }
          };
        }
      });
    } catch (error) {
      console.error("Error fetching user stories:", error);
      return [];
    }
  }

  async getAllCharacters(userId?: number): Promise<Character[]> {
    if (!pool) {
      console.warn("Database not available, returning empty array for characters.");
      return [];
    }
    try {
      let rows: any[] = [];
if (userId) {
  const result = await pool.query(
    `SELECT * FROM user_characters WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  rows = result.rows;
} else {
  const result = await pool.query(
    `SELECT * FROM user_characters ORDER BY created_at DESC`
  );
  rows = result.rows;
}
      
      if (!rows.length) return [];

      return rows.map((row: any) => {
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
            createdAt: (new Date(row.created_at) || new Date()).toISOString(),
            gender: "boy" as "boy" | "girl",
            age: 0,
            hair: "",
            eyes: "",
            favoriteColor: "",
            timeTravelExperience: 0,
          };
        }
      });
    } catch (error) {
      console.error("Error fetching characters:", error);
      return [];
    }
  }

  async getCharacterById(id: string): Promise<Character | undefined> {
    if (!pool) {
      console.warn(`Database unavailable in getCharacterById(${id}).`);
      return undefined;
    }
    try {
      const result = await pool.query(
        `SELECT * FROM user_characters WHERE character_id = $1`,
        [id]
      );
      const rows = result.rows;
      
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
          createdAt: (new Date(rows[0].created_at) || new Date()).toISOString(),
          gender: "boy" as "boy" | "girl",
          age: 0,
          hair: "",
          eyes: "",
          favoriteColor: "",
          timeTravelExperience: 0,
        };
      }
    } catch (error) {
      console.error(`Error fetching character by ID ${id}:`, error);
      return undefined;
    }
  }

  async createCharacter(characterData: Omit<Character, "id" | "createdAt">, userId: number): Promise<Character> {
    if (!pool) {
      console.error("Database unavailable in createCharacter. Cannot create character.");
      throw new Error("Database connection is required to create characters");
    }
    const id = uuidv4();
    const now = new Date();
    
    const character: Character = {
      ...characterData,
      id,
      createdAt: now.toISOString()
    };
    
    try {
      await pool.query(
        `INSERT INTO user_characters (character_id, user_id, character_data, created_at) 
         VALUES ($1, $2, $3, $4)`,
        [id, userId, JSON.stringify(character), now]
      );
    } catch (error) {
      console.error("Error creating character:", error);
      throw error;
    }
    
    return character;
  }

  async updateCharacter(id: string, updates: Partial<Character>): Promise<Character | undefined> {
    if (!pool) {
      console.warn(`Database unavailable in updateCharacter(${id}).`);
      return undefined;
    }
    // First get the current character
    const character = await this.getCharacterById(id);
    if (!character) return undefined;
    
    const updatedCharacter: Character = {
      ...character,
      ...updates
    };
    
    try {
      await pool.query(
        `UPDATE user_characters SET character_data = $1 WHERE character_id = $2`,
        [JSON.stringify(updatedCharacter), id]
      );
    } catch (error) {
      console.error("Error updating character:", error);
      return undefined;
    }

    return updatedCharacter;
  }

  async deleteCharacter(id: string): Promise<boolean> {
    if (!pool) {
      console.warn(`Database unavailable in deleteCharacter(${id}).`);
      return false;
    }
    try {
      const result = await pool.query(
        `DELETE FROM user_characters WHERE character_id = $1 RETURNING character_id`,
        [id]
      );
      return (result.rowCount || 0) > 0;
    } catch (error) {
      console.error(`Error deleting character by ID ${id}:`, error);
      return false;
    }
  }

  // Song methods - implementing temporary JSON storage
  async getAllSongs(): Promise<Song[]> {
    if (!pool) {
      console.warn("Database not available, returning empty array for songs.");
      return [];
    }
    try {
      // Changed query to not order by title since that column doesn't exist in the raw table
      // The title is inside the song_data JSON
      const result = await pool.query(
        `SELECT * FROM songs ORDER BY song_id ASC`
      );
      const rows = result.rows;
      
      if (!rows || !rows.length) return [];
      
      return rows.map((row: any) => {
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
            backgroundColor: "#f8f9fa",
            createdAt: new Date(),
            updatedAt: new Date(),
            tags: [],
            hasGeneratedAudio: false,
            isFavorite: false,
            audioUrl: null,
            imageUrl: null,
          };
        }
      });
    } catch (error) {
      console.error("Error fetching songs:", error);
      return [];
    }
  }

  async getSongById(id: string): Promise<Song | undefined> {
    if (!pool) {
      console.warn(`Database unavailable in getSongById(${id}).`);
      return undefined;
    }
    try {
      const result = await pool.query(
        `SELECT * FROM songs WHERE song_id = $1`,
        [id]
      );
      const rows = result.rows;
      
      if (!rows || !rows.length) return undefined;
      
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
          title: "Unknown Song",
          artist: "Unknown Artist",
          verses: [],
          chorus: null,
          bridge: null,
          chords: [],
          backgroundColor: "#f8f9fa",
          createdAt: new Date(),
          updatedAt: new Date(),
          tags: [],
          hasGeneratedAudio: false,
          audioUrl: undefined,
          difficulty: "beginner",
          key: "C",
          timeSignature: "4/4",
          tempo: 120,
        };
      }
    } catch (error) {
      console.error(`Error fetching song by ID ${id}:`, error);
      return undefined;
    }
  }
  
  async createSong(song: Song): Promise<Song> {
    if (!pool) {
      console.error("Database unavailable in createSong. Cannot create song.");
      throw new Error("Database not available");
    }
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
      const result = await pool.query(
        `SELECT * FROM user_stories WHERE 
         is_favorite = true OR expires_at IS NULL OR expires_at > NOW()
         ORDER BY created_at DESC`
      );
      const rows = result.rows;
      if (!rows.length) return [];
      
      return rows.map((row: any) => {
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
              title: "Error Loading Story",
              content: "There was a problem loading this story data.",
              bibleVerse: { text: "", reference: "" }
            },
            request: {
              theme: "",
              animal: "",
              gender: "boy" as "boy" | "girl" | undefined,
              childName: "",
              storyType: "regular",
              heroOfFaith: "",
              customPrompt: "",
              biblicalEvent: "",
              useTimeTravel: false,
              useAnimal: true
            },
            createdAt: new Date(row.created_at).toISOString() || new Date().toISOString(),
            isFavorite: !!row.is_favorite,
            searchMetadata: {
              childName: "",
              biblePassage: "",
              topic: "",
              tags: []
            }
          };
        }
      });
    } catch (error) {
      console.error("Error fetching all stories:", error);
      return [];
    }
  }
  
  async getStoryById(id: string, userId?: number): Promise<SavedStory | undefined> {
    if (!pool) {
      console.warn(`Database unavailable in getStoryById(${id}).`);
      return undefined;
    }
    try {
      let query = `SELECT * FROM user_stories WHERE story_id = $1`;
      const params: any[] = [id];
      
      if (userId) {
        query += ` AND user_id = $2`;
        params.push(userId);
      }
      
      const result = await pool.query(query, params);
      const rows = result.rows;
      
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
            moralOutcome: "positive",
            applicationQuestions: [],
            bibleVerse: {
              text: "The Lord is my helper; I will not fear.",
              reference: "Hebrews 13:6"
            }
          },
          request: {
            theme: "",
            animal: "",
            gender: "boy",
            childName: "",
            storyType: "regular",
            heroOfFaith: "",
            customPrompt: "",
            biblicalEvent: "",
            useTimeTravel: false,
            useAnimal: true,
            readingLevel: "early-elementary",
            storyLength: "medium",
            useCustomPrompts: false,
            useCharacter: false,
          },
          createdAt: new Date(rows[0].created_at).toISOString() || new Date().toISOString(),
          expiresAt: rows[0].expires_at ? new Date(rows[0].expires_at).toISOString() : undefined,
          isFavorite: !!rows[0].is_favorite,
          searchMetadata: {
            keywords: [],
            tags: [],
            characters: [],
            biblicalReferences: [],
            themes: []
          }
        };
      }
    } catch (error) {
      console.error(`Error fetching story by ID ${id}:`, error);
      return undefined;
    }
  }
  
  async saveStory(story: StoryResponse, request: StoryRequest, userId: number): Promise<SavedStory> {
    if (!pool) {
      console.error("Database unavailable in saveStory. Cannot save story.");
      throw new Error("Database not available")
    }
    try {
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
        expiresAt: expiryDate.toISOString(),
        searchMetadata: {
          keywords: story.title.split(' '),
          tags: request.theme ? [request.theme] : [],
          characters: request.characterId ? [request.characterId] : [],
          biblicalReferences: story.bibleVerse ? [story.bibleVerse.reference] : [],
          themes: request.theme ? [request.theme] : [],
        }
      };
      
      // Create the table if it doesn't exist (useful in deployment scenarios)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS user_stories (
          story_id TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL,
          story_data JSONB NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          is_favorite BOOLEAN DEFAULT FALSE,
          expires_at TIMESTAMP WITH TIME ZONE
        )
      `);
      
      await pool.query(
        `INSERT INTO user_stories (story_id, user_id, story_data, created_at, is_favorite, expires_at) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, userId, JSON.stringify(savedStory), now, false, expiryDate]
      );
      
      return savedStory;
    } catch (error) {
      console.error("Error saving story:", error);
      throw new Error("Failed to save story. Please try again later.")
    }
  }
  
  async toggleFavorite(id: string, isFavorite: boolean, userId: number): Promise<SavedStory | undefined> {
    if (!pool) {
      console.warn(`Database unavailable in toggleFavorite(${id}). Cannot update favorites.`);
      return undefined;
    }
    
    try {
      // Get the current story
      const story = await this.getStoryById(id, userId);
      if (!story) {
        console.warn(`Story not found: ${id} for user ${userId}`);
        return undefined;
      }
      
      const updatedStory: SavedStory = {
        ...story,
        isFavorite,
        // Remove expiry date if it's now a favorite
        expiresAt: isFavorite ? undefined : story.expiresAt
      };
      
      // Update expiry in both JSON and the table column
      const expiryDate = isFavorite ? null : story.expiresAt ? new Date(story.expiresAt) : null;
      
      // Create table if needed (for deployment scenarios)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS user_stories (
          story_id TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL,
          story_data JSONB NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          is_favorite BOOLEAN DEFAULT FALSE,
          expires_at TIMESTAMP WITH TIME ZONE
        )
      `);
      
      await pool.query(
        `UPDATE user_stories SET 
         story_data = $1, 
         is_favorite = $2, 
         expires_at = $3 
         WHERE story_id = $4 AND user_id = $5`,
        [JSON.stringify(updatedStory), isFavorite, expiryDate, id, userId]
      );
      
      return updatedStory;
    } catch (error) {
      console.error(`Error toggling favorite for story ${id}:`, error);
      return undefined;
    }
  }
  
  async deleteStory(id: string, userId: number): Promise<boolean> {
    if (!pool) {
      console.warn(`Database unavailable in deleteStory(${id}).`);
      return false;
    }
    try {
      const { rowCount } = await pool.query(
        `DELETE FROM user_stories WHERE story_id = $1 AND user_id = $2 RETURNING story_id`,
        [id, userId]
      );
      
      return (rowCount ?? 0) > 0;
    } catch (error) {
      console.error(`Error deleting story ${id}:`, error);
      return false;
    }
  }
  
  async updateStoryHeroId(storyId: string, heroId: string, userId: number): Promise<SavedStory | undefined> {
    if (!pool) {
      console.warn(`Database unavailable in updateStoryHeroId(${storyId}). Cannot associate story with hero.`);
      return undefined;
    }
    
    try {
      // First verify the story exists and belongs to the user
      const story = await this.getStoryById(storyId, userId);
      if (!story) {
        console.warn(`Story not found: ${storyId} for user ${userId}`);
        return undefined;
      }
      
      // Next verify the hero exists
      const hero = await this.getHeroOfFaithById(heroId);
      if (!hero) {
        console.warn(`Hero not found: ${heroId}`);
        return undefined;
      }
      
      // Update the story's heroId in the database
      await pool.query(`
        UPDATE user_stories
        SET hero_id = $1
        WHERE story_id = $2 AND user_id = $3
      `, [heroId, storyId, userId]);
      
      // Also update the heroId in the JSON data
      await pool.query(`
        UPDATE user_stories
        SET story_data = jsonb_set(
          story_data, 
          '{heroId}', 
          $1::jsonb
        )
        WHERE story_id = $2 AND user_id = $3
      `, [JSON.stringify(heroId), storyId, userId]);
      
      // Add "hero of faith" tag if not already there
      await pool.query(`
        UPDATE user_stories
        SET story_data = jsonb_set(
          story_data,
          '{searchMetadata,tags}',
          CASE 
            WHEN NOT story_data->'searchMetadata'->'tags' ? 'hero of faith' 
            THEN jsonb_append(
              story_data->'searchMetadata'->'tags', 
              '$', 
              '"hero of faith"'
            )
            ELSE story_data->'searchMetadata'->'tags'
          END
        )
        WHERE story_id = $2 AND user_id = $3
      `, [heroId, storyId, userId]);
      
      console.log(`Associated story ${storyId} with hero ${heroId}`);
      
      // Get the updated story
      return await this.getStoryById(storyId, userId);
    } catch (error) {
      console.error("Error updating story hero ID:", error);
      return undefined;
    }
  }
  
  async searchStories(query: string, userId?: number): Promise<SavedStory[]> {
    if (!pool) {
      console.warn(`Database unavailable in searchStories.`);
      return [];
    }
    try {
      let sqlQuery: string;
      let params: any[] = [];
      
      if (userId) {
        // Search only user's stories
        sqlQuery = `
          SELECT * FROM user_stories 
          WHERE user_id = $1 
          AND (
            story_data->>'title' ILIKE $2 
            OR story_data->>'content' ILIKE $2 
            OR story_data->'bibleVerse'->>'text' ILIKE $2 
            OR story_data->'bibleVerse'->>'reference' ILIKE $2
            OR story_data->'request'->>'theme' ILIKE $2
            OR story_data->'request'->>'childName' ILIKE $2
            OR story_data->'request'->>'animal' ILIKE $2
            OR story_data->'request'->>'customPrompt' ILIKE $2
          )
          AND (is_favorite = true OR expires_at IS NULL OR expires_at > NOW())
          ORDER BY created_at DESC
        `;
        params = [userId, `%${query}%`];
      } else {
        // Admin search all stories
        sqlQuery = `
          SELECT * FROM user_stories 
          WHERE 
            story_data->>'title' ILIKE $1 
            OR story_data->>'content' ILIKE $1 
            OR story_data->'bibleVerse'->>'text' ILIKE $1 
            OR story_data->'bibleVerse'->>'reference' ILIKE $1
            OR story_data->'request'->>'theme' ILIKE $1
            OR story_data->'request'->>'childName' ILIKE $1
            OR story_data->'request'->>'animal' ILIKE $1
            OR story_data->'request'->>'customPrompt' ILIKE $1
          ORDER BY created_at DESC
        `;
        params = [`%${query}%`];
      }
      
      const result = await pool.query(sqlQuery, params);
      const rows = result.rows;
      
      if (!rows.length) return [];
      
      return rows.map((row: any) => {
        try {
          if (typeof row.story_data === 'object' && row.story_data !== null) {
            return row.story_data;
          }
          return JSON.parse(row.story_data);
        } catch (error) {
          console.error("Error parsing story data:", error);
          return {
            id: row.story_id || "unknown",
            story: {
              title: "Error Loading Story",
              content: "There was a problem loading this story data.",
              bibleVerse: { text: "", reference: "" }
            },
            request: {
              theme: "",
              animal: "",
              gender: "boy" as "boy" | "girl" | undefined,
              childName: "",
              storyType: "regular",
              heroOfFaith: "",
              customPrompt: "",
              biblicalEvent: "",
              useTimeTravel: false,
              useAnimal: true
            },
            createdAt: new Date(row.created_at).toISOString(),
            isFavorite: !!row.is_favorite,
            searchMetadata: {
              childName: "",
              biblePassage: "",
              topic: "",
              tags: []
            }
          };
        }
      });
    } catch (error) {
      console.error("Error searching stories:", error);
      return [];
    }
  }
  
  async searchStoriesByName(name: string, userId?: number): Promise<SavedStory[]> {
    if (!pool) {
      console.warn(`Database unavailable in searchStoriesByName.`);
      return [];
    }
    try {
      let sqlQuery: string;
      let params: any[] = [];
      
      if (userId) {
        // Search only user's stories
        sqlQuery = `
          SELECT * FROM user_stories 
          WHERE user_id = $1 
          AND story_data->'request'->>'childName' ILIKE $2
          AND (is_favorite = true OR expires_at IS NULL OR expires_at > NOW())
          ORDER BY created_at DESC
        `;
        params = [userId, `%${name}%`];
      } else {
        // Admin search all stories
        sqlQuery = `
          SELECT * FROM user_stories 
          WHERE story_data->'request'->>'childName' ILIKE $1
          ORDER BY created_at DESC
        `;
        params = [`%${name}%`];
      }
      
      const result = await pool.query(sqlQuery, params);
      const rows = result.rows;
      
      if (!rows.length) return [];
      
      return rows.map((row: any) => {
        try {
          if (typeof row.story_data === 'object' && row.story_data !== null) {
            return row.story_data;
          }
          return JSON.parse(row.story_data);
        } catch (parseError) {
          console.error("Error parsing story data:", parseError);
          return {
            id: row.story_id || "unknown",
            story: {
              title: "Error Loading Story",
              content: "There was a problem loading this story data.",
              bibleVerse: { text: "", reference: "" }
            },
            request: {
              theme: "",
              animal: "",
              gender: "boy" as "boy" | "girl" | undefined,
              childName: "",
              storyType: "regular",
              heroOfFaith: "",
              customPrompt: "",
              biblicalEvent: "",
              useTimeTravel: false,
              useAnimal: true
            },
            createdAt: new Date(row.created_at).toISOString(),
            isFavorite: !!row.is_favorite,
            searchMetadata: {
              childName: name,
              biblePassage: "",
              topic: "",
              tags: []
            }
          };
        }
      });
    } catch (error) {
      console.error("Error searching stories by name:", error);
      return [];
    }
  }
  
  async searchStoriesByBiblePassage(passage: string, userId?: number): Promise<SavedStory[]> {
    if (!pool) {
      console.warn(`Database unavailable in searchStoriesByBiblePassage.`);
      return [];
    }
    try {
      let sqlQuery: string;
      let params: any[] = [];
      
      if (userId) {
        // Search only user's stories
        sqlQuery = `
          SELECT * FROM user_stories 
          WHERE user_id = $1 
          AND story_data->'bibleVerse'->>'reference' ILIKE $2
          AND (is_favorite = true OR expires_at IS NULL OR expires_at > NOW())
          ORDER BY created_at DESC
        `;
        params = [userId, `%${passage}%`];
      } else {
        // Admin search all stories
        sqlQuery = `
          SELECT * FROM user_stories 
          WHERE story_data->'bibleVerse'->>'reference' ILIKE $1
          ORDER BY created_at DESC
        `;
        params = [`%${passage}%`];
      }
      
      const result = await pool.query(sqlQuery, params);
      const rows = result.rows;
      
      if (!rows.length) return [];
      
      return rows.map((row: any) => {
        try {
          if (typeof row.story_data === 'object' && row.story_data !== null) {
            return row.story_data;
          }
          return JSON.parse(row.story_data);
        } catch (error) {
          console.error("Error parsing story data:", error);
          return {
            id: row.story_id || "unknown",
            story: {
              title: "Error Loading Story",
              content: "There was a problem loading this story data.",
              bibleVerse: { text: "", reference: "" }
            },
            request: {
              theme: "",
              animal: "",
              gender: "boy" as "boy" | "girl" | undefined,
              childName: "",
              storyType: "regular",
              heroOfFaith: "",
              customPrompt: "",
              biblicalEvent: "",
              useTimeTravel: false,
              useAnimal: true
            },
            createdAt: new Date(row.created_at).toISOString(),
            isFavorite: !!row.is_favorite,
            searchMetadata: {
              childName: "",
              biblePassage: passage,
              topic: "",
              tags: []
            }
          };
        }
      });
    } catch (error) {
      console.error("Error searching stories by Bible passage:", error);
      return [];
    }
  }
  
  async searchStoriesByTopic(topic: string, userId?: number): Promise<SavedStory[]> {
    if (!pool) {
      console.warn(`Database unavailable in searchStoriesByTopic.`);
      return [];
    }
    try {
      let sqlQuery: string;
      let params: any[] = [];
      
      if (userId) {
        // Search only user's stories
        sqlQuery = `
          SELECT * FROM user_stories 
          WHERE user_id = $1 
          AND story_data->'request'->>'theme' ILIKE $2
          AND (is_favorite = true OR expires_at IS NULL OR expires_at > NOW())
          ORDER BY created_at DESC
        `;
        params = [userId, `%${topic}%`];
      } else {
        // Admin search all stories
        sqlQuery = `
          SELECT * FROM user_stories 
          WHERE story_data->'request'->>'theme' ILIKE $1
          ORDER BY created_at DESC
        `;
        params = [`%${topic}%`];
      }
      
      const result = await pool.query(sqlQuery, params);
      const rows = result.rows;
      
      if (!rows.length) return [];
      
      return rows.map((row: any) => {
        try {
          if (typeof row.story_data === 'object' && row.story_data !== null) {
            return row.story_data;
          }
          return JSON.parse(row.story_data);
        } catch (error) {
          console.error("Error parsing story data:", error);
          return {
            id: row.story_id || "unknown",
            story: {
              title: "Error Loading Story",
              content: "There was a problem loading this story data.",
              bibleVerse: { text: "", reference: "" }
            },
            request: {
              theme: "",
              animal: "",
              gender: "boy" as "boy" | "girl" | undefined,
              childName: "",
              storyType: "regular",
              heroOfFaith: "",
              customPrompt: "",
              biblicalEvent: "",
              useTimeTravel: false,
              useAnimal: true
            },
            createdAt: new Date(row.created_at).toISOString(),
            isFavorite: !!row.is_favorite,
            searchMetadata: {
              childName: "",
              biblePassage: "",
              topic: topic,
              tags: []
            }
          };
        }
      });
    } catch (error) {
      console.error("Error searching stories by topic:", error);
      return [];
    }
  }
  
  async searchStoriesByTags(tags: string[], userId?: number): Promise<SavedStory[]> {
    if (!pool) {
      console.warn(`Database unavailable in searchStoriesByTags.`);
      return [];
    }
    if (!tags.length) return [];
    
    try {
      // Create a dynamic query with multiple ILIKE conditions for tags
      const tagConditions = tags.map((_, index) => 
        `story_data->'request'->>'theme' ILIKE $${userId ? index + 2 : index + 1}`
      ).join(' OR ');
      
      let sqlQuery: string;
      let params: any[] = [];
      
      if (userId) {
        // Search only user's stories
        sqlQuery = `
          SELECT * FROM user_stories 
          WHERE user_id = $1 
          AND (${tagConditions})
          AND (is_favorite = true OR expires_at IS NULL OR expires_at > NOW())
          ORDER BY created_at DESC
        `;
        params = [userId, ...tags.map(tag => `%${tag}%`)];
      } else {
        // Admin search all stories
        sqlQuery = `
          SELECT * FROM user_stories 
          WHERE (${tagConditions})
          ORDER BY created_at DESC
        `;
        params = tags.map(tag => `%${tag}%`);
      }
      
      const result = await pool.query(sqlQuery, params);
      const rows = result.rows;
      
      if (!rows.length) return [];
      
      return rows.map((row: any) => {
        try {
          if (typeof row.story_data === 'object' && row.story_data !== null) {
            return row.story_data;
          }
          return JSON.parse(row.story_data);
        } catch (error) {
          console.error("Error parsing story data:", error);
          return {
            id: row.story_id || "unknown",
            story: {
              title: "Error Loading Story",
              content: "There was a problem loading this story data.",
              bibleVerse: { text: "", reference: "" }
            },
            request: {
              theme: "",
              animal: "",
              gender: "boy" as "boy" | "girl" | undefined,
              childName: "",
              storyType: "regular",
              heroOfFaith: "",
              customPrompt: "",
              biblicalEvent: "",
              useTimeTravel: false,
              useAnimal: true
            },
            createdAt: new Date(row.created_at).toISOString(),
            isFavorite: !!row.is_favorite,
            searchMetadata: {
              childName: "",
              biblePassage: "",
              topic: "",
              tags: tags
            }
          };
        }
      });
    } catch (error) {
      console.error("Error searching stories by tags:", error);
      return [];
    }
  }
  
  async getStoriesByHeroId(heroId: string, userId?: number): Promise<SavedStory[]> {
    try {
      let sqlQuery: string;
      let params: any[] = [];
      
      if (userId) {
        // Get only stories belonging to this user with this hero
        sqlQuery = `
          SELECT * FROM user_stories 
          WHERE user_id = $1 
          AND story_data->>'heroId' = $2
          AND (is_favorite = true OR expires_at IS NULL OR expires_at > NOW())
          ORDER BY created_at DESC
        `;
        params = [userId, heroId];
      } else {
        // Admin function - get all stories for this hero
        sqlQuery = `
          SELECT * FROM user_stories 
          WHERE story_data->>'heroId' = $1
          ORDER BY created_at DESC
        `;
        params = [heroId];
      }
      
      const result = await pool.query(sqlQuery, params);
      const rows = result.rows;
      
      if (!rows.length) return [];
      
      return rows.map((row: any) => {
        try {
          if (typeof row.story_data === 'object' && row.story_data !== null) {
            return row.story_data;
          }
          return JSON.parse(row.story_data);
        } catch (error) {
          console.error("Error parsing story data:", error);
          return {
            id: row.story_id || "unknown",
            story: {
              title: "Error Loading Story",
              content: "There was a problem loading this story data.",
              bibleVerse: { text: "", reference: "" }
            },
            request: {
              theme: "",
              animal: "",
              gender: "boy" as "boy" | "girl" | undefined,
              childName: "",
              storyType: "regular",
              heroOfFaith: "",
              customPrompt: "",
              biblicalEvent: "",
              useTimeTravel: false,
              useAnimal: true
            },
            createdAt: new Date(row.created_at).toISOString(),
            isFavorite: !!row.is_favorite,
            heroId,
            searchMetadata: {
              childName: "",
              biblePassage: "",
              topic: "",
              tags: []
            }
          };
        }
      });
    } catch (error) {
      console.error(`Error getting stories for hero ${heroId}:`, error);
      return [];
    }
  }
  
  // Usage tracking methods
  async getStoryGenerationCount(userId: number): Promise<number> {
    if (!pool) {
      console.warn(`Database unavailable in getStoryGenerationCount(${userId}). Using default count 0.`);
      return 0;
    }
    
    try {
      // Create the table if it doesn't exist (helpful for deployment)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS user_usage (
          user_id INTEGER PRIMARY KEY,
          count INTEGER DEFAULT 0,
          last_reset_date TIMESTAMP WITH TIME ZONE
        )
      `);
      
      const result = await pool.query(
        `SELECT count FROM user_usage WHERE user_id = $1`,
        [userId]
      );
      const rows = result.rows;
      
      return rows.length ? rows[0].count : 0;
    } catch (error) {
      console.error(`Error getting story generation count for user ${userId}:`, error);
      return 0; // Default to 0 on error
    }
  }
  
  async incrementStoryGenerationCount(userId: number): Promise<number> {
    if (!pool) {
      console.warn(`Database unavailable in incrementStoryGenerationCount(${userId}). Cannot increment count.`);
      return 1; // Return 1 as a reasonable default
    }
    
    try {
      // Create the table if it doesn't exist (helpful for deployment)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS user_usage (
          user_id INTEGER PRIMARY KEY,
          count INTEGER DEFAULT 0,
          last_reset_date TIMESTAMP WITH TIME ZONE
        )
      `);
    
      // Use upsert pattern
      const result = await pool.query(
        `INSERT INTO user_usage (user_id, count) 
         VALUES ($1, 1) 
         ON CONFLICT (user_id) 
         DO UPDATE SET count = user_usage.count + 1 
         RETURNING count`,
        [userId]
      );
      
      return result.rows[0].count;
    } catch (error) {
      console.error(`Error incrementing story generation count for user ${userId}:`, error);
      return 1; // Return 1 as a fallback value
    }
  }
  
  async resetStoryGenerationCount(userId: number): Promise<void> {
    if (!pool) {
      console.warn(`Database unavailable in resetStoryGenerationCount(${userId}). Cannot reset count.`);
      return; // Just return without doing anything
    }
    
    try {
      // Create the table if it doesn't exist (helpful for deployment)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS user_usage (
          user_id INTEGER PRIMARY KEY,
          count INTEGER DEFAULT 0,
          last_reset_date TIMESTAMP WITH TIME ZONE
        )
      `);
    
      const now = new Date();
      
      await pool.query(
        `INSERT INTO user_usage (user_id, count, last_reset_date) 
         VALUES ($1, 0, $2) 
         ON CONFLICT (user_id) 
         DO UPDATE SET count = 0, last_reset_date = $2`,
        [userId, now]
      );
    } catch (error) {
      console.error(`Error resetting story generation count for user ${userId}:`, error);
      // No need to throw since this is a void function
    }
  }
  
  async getLastResetDate(userId: number): Promise<Date | null> {
    if (!pool) {
      console.warn(`Database unavailable in getLastResetDate(${userId}). Using current date as fallback.`);
      return new Date(); // Use current date as fallback to prevent unnecessary resets
    }
    
    try {
      const result = await pool.query(
        `SELECT last_reset_date FROM user_usage WHERE user_id = $1`,
        [userId]
      );
      const rows = result.rows;
      
      return rows.length && rows[0].last_reset_date ? rows[0].last_reset_date : null;
    } catch (error) {
      console.error(`Error getting last reset date for user ${userId}:`, error);
      return new Date(); // Use current date as fallback
    }
  }
  
  async setLastResetDate(userId: number, date: Date): Promise<void> {
    if (!pool) {
      console.warn(`Database unavailable in setLastResetDate(${userId}). Cannot update reset date.`);
      return;
    }
    
    try {
      // Create the table if it doesn't exist (helpful for deployment)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS user_usage (
          user_id INTEGER PRIMARY KEY,
          count INTEGER DEFAULT 0,
          last_reset_date TIMESTAMP WITH TIME ZONE
        )
      `);
    
      await pool.query(
        `INSERT INTO user_usage (user_id, last_reset_date) 
         VALUES ($1, $2) 
         ON CONFLICT (user_id) 
         DO UPDATE SET last_reset_date = $2`,
        [userId, date]
      );
    } catch (error) {
      console.error(`Error setting last reset date for user ${userId}:`, error);
      // No need to throw since this is a void function
    }
  }
  
  // User settings methods
  async getUserOpenAIKey(userId: number): Promise<string | null> {
    if (!pool) {
      console.warn(`Database unavailable in getUserOpenAIKey(${userId}). Returning null.`);
      return null;
    }
    
    try {
      const result = await pool.query(
        `SELECT openai_key FROM user_settings WHERE user_id = $1`,
        [userId]
      );
      const rows = result.rows;
      
      return rows.length && rows[0].openai_key ? rows[0].openai_key : null;
    } catch (error) {
      console.error(`Error getting OpenAI key for user ${userId}:`, error);
      return null;
    }
  }
  
  async setUserOpenAIKey(userId: number, key: string): Promise<void> {
    if (!pool) {
      console.warn(`Database unavailable in setUserOpenAIKey(${userId}). Cannot save key.`);
      return;
    }
    
    try {
      // Create the table if it doesn't exist (helpful for deployment)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS user_settings (
          user_id INTEGER PRIMARY KEY,
          openai_key TEXT,
          openai_model TEXT
        )
      `);
    
      await pool.query(
        `INSERT INTO user_settings (user_id, openai_key) 
         VALUES ($1, $2) 
         ON CONFLICT (user_id) 
         DO UPDATE SET openai_key = $2`,
        [userId, key]
      );
    } catch (error) {
      console.error(`Error setting OpenAI key for user ${userId}:`, error);
    }
  }
  
  async getUserOpenAIModel(userId: number): Promise<string | null> {
    if (!pool) {
      console.warn(`Database unavailable in getUserOpenAIModel(${userId}). Using default model.`);
      return 'gpt-4o'; // Default to the newest model
    }
    
    try {
      const result = await pool.query(
        `SELECT openai_model FROM user_settings WHERE user_id = $1`,
        [userId]
      );
      const rows = result.rows;
      
      return rows.length && rows[0].openai_model ? rows[0].openai_model : 'gpt-4o'; // Default to the newest model
    } catch (error) {
      console.error(`Error getting OpenAI model for user ${userId}:`, error);
      return 'gpt-4o'; // Default to the newest model on error
    }
  }
  
  async setUserOpenAIModel(userId: number, model: string): Promise<void> {
    if (!pool) {
      console.warn(`Database unavailable in setUserOpenAIModel(${userId}). Cannot save model.`);
      return;
    }
    
    try {
      // Create the table if it doesn't exist (helpful for deployment)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS user_settings (
          user_id INTEGER PRIMARY KEY,
          openai_key TEXT,
          openai_model TEXT
        )
      `);
    
      await pool.query(
        `INSERT INTO user_settings (user_id, openai_model) 
         VALUES ($1, $2) 
         ON CONFLICT (user_id) 
         DO UPDATE SET openai_model = $2`,
        [userId, model]
      );
    } catch (error) {
      console.error(`Error setting OpenAI model for user ${userId}:`, error);
    }
  }

  // Heroes of Faith methods
  async getAllHeroesOfFaith(): Promise<HeroOfFaith[]> {
    if (!pool) {
      console.warn("Database not available, returning empty array for heroes of faith.");
      return [];
    }
    
    try {
      const result = await pool.query(
        `SELECT * FROM heroes_of_faith ORDER BY hero_id ASC`
      );
      const rows = result.rows;
      
      if (!rows || !rows.length) return [];
      
      return rows.map((row: any) => {
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
            createdAt: new Date(),
            updatedAt: new Date(),
            sources: [],
            keyEvents: [],
            tags: [],
            isFavorite: false
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
    if (!pool) {
      console.warn(`Database unavailable in getHeroOfFaithById(${id}).`);
      return undefined;
    }
    try {
      const result = await (pool as any).query(
        `SELECT * FROM heroes_of_faith WHERE hero_id = $1`,
        [id]
      );
      const rows = result.rows;
      
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
          description: "Could not retrieve details for this hero.",
          timePeriod: "Unknown",
          contribution: "Unknown",
          birthYear: "N/A",
          deathYear: "N/A",
          famousQuote: "",
          bibleVerse: {
            text: "The Lord is my helper; I will not fear.",
            reference: "Hebrews 13:6"
          },
          imageUrl: "",
          sources: [],
          keyEvents: [],
          createdAt: new Date(),
        };
      }
    } catch (error) {
      console.error(`Error fetching hero of faith by ID ${id}:`, error);
      return undefined;
    }
  }

  async createHeroOfFaith(heroData: Omit<HeroOfFaith, "id" | "createdAt" | "updatedAt">): Promise<HeroOfFaith> {
    if (!pool) {
      console.error("Database unavailable in createHeroOfFaith. Cannot create hero.");
      throw new Error("Database connection is required to create heroes of faith")
    }
    
    try {
      const id = uuidv4();
      const now = new Date();
      
      const hero: HeroOfFaith = {
        ...heroData,
        id,
        createdAt: now,
        sources: heroData.sources || [],
        keyEvents: heroData.keyEvents || [],
      };
      
      // Create the table if it doesn't exist (helpful for deployment)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS heroes_of_faith (
          hero_id TEXT PRIMARY KEY,
          hero_data JSONB NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);
      
      await pool.query(
        `INSERT INTO heroes_of_faith (hero_id, hero_data, created_at, updated_at) 
         VALUES ($1, $2, $3, $4)`,
        [id, JSON.stringify(hero), now, now]
      );
      
      return hero;
    } catch (error) {
      console.error("Error creating hero of faith:", error);
      throw new Error("Failed to create hero of faith. Please try again later.")
    }
  }

  async updateHeroOfFaith(id: string, updates: Partial<HeroOfFaith>): Promise<HeroOfFaith | undefined> {
    if (!pool) {
      console.warn(`Database unavailable in updateHeroOfFaith(${id}).`);
      return undefined;
    }
    
    try {
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
    } catch (error) {
      console.error(`Error updating hero of faith with ID ${id}:`, error);
      return undefined;
    }
  }

  async deleteHeroOfFaith(id: string): Promise<boolean> {
    if (!pool) {
      console.warn(`Database unavailable in deleteHeroOfFaith(${id}). Cannot delete hero.`);
      return false;
    }
    
    try {
      const { rowCount } = await pool.query(
        `DELETE FROM heroes_of_faith WHERE hero_id = $1 RETURNING hero_id`,
        [id]
      );
      return (rowCount ?? 0) > 0;
    } catch (error) {
      console.error(`Error deleting hero of faith with ID ${id}:`, error);
      return false;
    }
  }
  
  // Hero Stories Library methods
  async getAllHeroStories(heroId?: string): Promise<HeroStory[]> {
    if (!pool) {
      console.warn("Database unavailable in getAllHeroStories.");
      return [];
    }
    try {
      let query = `SELECT * FROM hero_stories`;
      const params: any[] = [];
      
      if (heroId) {
        query += ` WHERE hero_id = $1`;
        params.push(heroId);
      }
      
      query += ` ORDER BY created_at DESC`;
      
      const result = await pool.query(query, params);
      const rows = result.rows;
      
      if (!rows.length) return [];
      
      return rows.map((row: any) => {
        try {
          // Handle the case where data might already be an object
          if (typeof row.story_data === 'object' && row.story_data !== null) {
            return row.story_data;
          }
          // Handle the string format with proper error handling
          return JSON.parse(row.story_data);
        } catch (parseError) {
          console.error("Error parsing hero story data:", parseError);
          // Return a default hero story object to prevent app crashes
          return {
            id: row.story_id || uuidv4(),
            heroId: row.hero_id || "",
            title: "Story Data Error",
            content: "There was a problem loading this hero story. The data may be corrupted.",
            isHistoricallyAccurate: true,
            sources: [],
            bibleVerse: {
              text: "The Lord is my helper; I will not fear.",
              reference: "Hebrews 13:6"
            },
            createdAt: new Date(row.created_at).toISOString() || new Date().toISOString(),
            createdBy: row.user_id || undefined,
            isFeatured: false
          };
        }
      });
    } catch (error) {
      console.error("Error fetching hero stories:", error);
      return [];
    }
  }
  
  async getHeroStoryById(id: string): Promise<HeroStory | undefined> {
    if (!pool) {
      console.warn(`Database unavailable in getHeroStoryById(${id}).`);
      return undefined;
    }
    try {
      const result = await pool.query(
        `SELECT * FROM hero_stories WHERE story_id = $1`,
        [id]
      );
      const rows = result.rows;
      
      if (!rows.length) return undefined;
      
      try {
        // Handle the case where data might already be an object
        if (typeof rows[0].story_data === 'object' && rows[0].story_data !== null) {
          return rows[0].story_data;
        }
        // Handle the string format with proper error handling
        return JSON.parse(rows[0].story_data);
      } catch (parseError) {
        console.error("Error parsing hero story data:", parseError);
        // Return a default hero story object to prevent app crashes
        return {
          id: id,
          heroId: rows[0].hero_id || "",
          title: "Story Data Error",
          content: "There was a problem loading this hero story. The data may be corrupted.",
          isHistoricallyAccurate: true,
          sources: [],
          bibleVerse: {
            text: "The Lord is my helper; I will not fear.",
            reference: "Hebrews 13:6"
          },
          createdAt: new Date(rows[0].created_at).toISOString() || new Date().toISOString(),
          createdBy: rows[0].user_id || undefined,
          isFeatured: false
        };
      }
    } catch (error) {
      console.error(`Error fetching hero story by ID ${id}:`, error);
      return undefined;
    }
  }
  
  async getHeroStoriesByHeroId(heroId: string): Promise<HeroStory[]> {
    return this.getAllHeroStories(heroId);
  }
  
  async createHeroStory(storyData: Omit<HeroStory, "id" | "createdAt">, userId?: number): Promise<HeroStory> {
    if (!pool) {
      console.error("Database unavailable in createHeroStory. Cannot create hero story.");
      throw new Error("Database not available");
    }
    try {
      const id = uuidv4();
      const now = new Date();
      
      const story: HeroStory = {
        ...storyData,
        id,
        createdAt: now.toISOString()
      };
      
      if (userId) {
        story.createdBy = userId;
      }
      
      // Create SQL table if it doesn't exist
      await pool.query(`
        CREATE TABLE IF NOT EXISTS hero_stories (
          story_id TEXT PRIMARY KEY,
          hero_id TEXT NOT NULL,
          user_id INTEGER,
          story_data JSONB NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          is_featured BOOLEAN DEFAULT FALSE
        )
      `);
      
      await pool.query(
        `INSERT INTO hero_stories (story_id, hero_id, user_id, story_data, created_at, is_featured) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, story.heroId, userId || null, JSON.stringify(story), now, story.isFeatured || false]
      );
      
      return story;
    } catch (error) {
      console.error("Error creating hero story:", error);
      throw error; // Rethrow to allow caller to handle appropriately
    }
  }
  
  async updateHeroStory(id: string, updates: Partial<HeroStory>): Promise<HeroStory | undefined> {
    if (!pool) {
      console.error(`Database unavailable in updateHeroStory(${id}).`);
      return undefined;
    }
    try {
      // First get the current story
      const story = await this.getHeroStoryById(id);
      if (!story) return undefined;
      
      const updatedStory: HeroStory = {
        ...story,
        ...updates
      };
      
      await pool.query(
        `UPDATE hero_stories SET story_data = $1, is_featured = $2 WHERE story_id = $3`,
        [JSON.stringify(updatedStory), updatedStory.isFeatured || false, id]
      );
      
      return updatedStory;
    } catch (error) {
      console.error(`Error updating hero story with ID ${id}:`, error);
      return undefined;
    }
  }
  
  async deleteHeroStory(id: string): Promise<boolean> {
    if (!pool) {
      console.error(`Database unavailable in deleteHeroStory(${id}).`);
      return false;
    }
    try {
      const { rowCount } = await pool.query(
        `DELETE FROM hero_stories WHERE story_id = $1 RETURNING story_id`,
        [id]
      );
      return (rowCount ?? 0) > 0;
    } catch (error) {
      console.error(`Error deleting hero story with ID ${id}:`, error);
      return false;
    }
  }
  
  async toggleHeroStoryFeatured(id: string, isFeatured: boolean): Promise<HeroStory | undefined> {
    if (!pool) {
      console.error(`Database unavailable in toggleHeroStoryFeatured(${id}).`);
      return undefined;
    }
    try {
      // First get the current story
      const story = await this.getHeroStoryById(id);
      if (!story) return undefined;
      
      const updatedStory: HeroStory = {
        ...story,
        isFeatured
      };
      
      await pool.query(
        `UPDATE hero_stories SET story_data = $1, is_featured = $2 WHERE story_id = $3`,
        [JSON.stringify(updatedStory), isFeatured, id]
      );
      
      return updatedStory;
    } catch (error) {
      console.error(`Error toggling featured status for hero story with ID ${id}:`, error);
      return undefined;
    }
  }
}
