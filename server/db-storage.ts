
import type { EditLogEntry } from "@shared/editLog";
import { db, pool } from './db';
import {
  FREE_STORIES_PER_MONTH, users, verificationTokens, readingPrefsSchema, storyRequestSchema, type ReadingPrefs, type User, type InsertUser, type SavedStory, type GeneratedPicture, type StoryResponse, type StoryRequest, type Character, type HeroOfFaith, type HeroStory, type Song } from "@shared/schema";
import { v4 as uuidv4 } from 'uuid';
import session from 'express-session';
import { eq, and, desc, isNull, sql, or, like, ilike } from 'drizzle-orm';
import connectPg from 'connect-pg-simple';
// Static import: `require` is not defined in the ESM production bundle, so the
// previous inline require() threw a ReferenceError on the fallback path.
import createMemoryStore from 'memorystore';
import { IStorage, type StoryToSave } from './storage';
import { newShareToken } from './lib/sharing';

const PostgresStore = connectPg(session);

// Helper function to check if DB is available
function isDatabaseAvailable(): boolean {
  return !!process.env.DATABASE_URL && !!pool && !!db;
}

// Define tables for DbStorage if they don't exist in schema.ts
// For now, we'll store JSON data for some of the more complex types
// We'll create proper relational schemas later

/**
 * user_settings row -> ReadingPrefs, dropping anything that no longer validates.
 *
 * Columns are nullable and hold free text, so a value written by an older
 * build (or by hand) can be a palette this version does not have. Parsing per
 * field rather than casting means an unknown value falls back to the app
 * default instead of reaching the DOM as a data-attribute nothing styles.
 */
function rowToPrefs(row: Record<string, unknown>): Partial<ReadingPrefs> {
  const out: Partial<ReadingPrefs> = {};
  const shape = readingPrefsSchema.shape;
  const p = shape.palette.safeParse(row.reader_palette);
  if (p.success) out.palette = p.data;
  const f = shape.font.safeParse(row.reader_font);
  if (f.success) out.font = f.data;
  const t = shape.typeset.safeParse(row.reader_typeset);
  if (t.success) out.typeset = t.data;
  const n = shape.fontStep.safeParse(row.reader_font_step);
  if (n.success) out.fontStep = n.data;
  return out;
}

/**
 * What a row whose story_data cannot be read becomes, so one bad row does
 * not blank the library. ONE definition -- there were ten hand-written
 * placeholders, no two alike, and once rowToSavedStory was typed, eight of
 * them turned out not to be SavedStorys at all. This one is: the request is
 * parsed by the schema (the refine wants a name and a gender), and the story
 * carries the five questions the response schema requires.
 */
function corruptStoryPlaceholder(row: {
  story_id?: string;
  created_at?: string | Date | null;
  expires_at?: string | Date | null;
  is_favorite?: boolean | null;
}): SavedStory {
  return {
    id: row.story_id || "unknown",
    story: {
      title: "Story Data Error",
      content: "There was a problem loading this story. The data may be corrupted.",
      moralOutcome: "learning",
      applicationQuestions: ["", "", "", "", ""],
    },
    request: storyRequestSchema.parse({ childName: "Unknown", gender: "boy" }),
    createdAt: new Date(row.created_at ?? Date.now()).toISOString(),
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : undefined,
    isFavorite: Boolean(row.is_favorite),
    searchMetadata: { keywords: [], tags: [], characters: [], biblicalReferences: [], themes: [] },
  };
}

/** A hero_stories row: the blob is the whole record; nothing is grafted on. */
function heroStoryRow(row: { story_data: unknown }): HeroStory {
  return (typeof row.story_data === "string" ? JSON.parse(row.story_data) : row.story_data) as HeroStory;
}

/**
 * A user_stories row as the client sees it.
 *
 * THE COLUMNS WIN OVER THE BLOB, in one place. These mappers used to spread
 * story_data verbatim plus universe_id -- twenty-one copies of the same line
 * -- which is exactly how hero_id ended up written on every hero story and
 * visible to nobody: the code that set the column looked correct, and the
 * reader was looking in the blob. Deliberately NOT jsonb_set into the blob as
 * well: two sources of truth for one fact is the bug this replaces.
 */
function rowToSavedStory(row: {
  story_data: unknown;
  universe_id?: string | null;
  hero_id?: string | null;
}): SavedStory {
  const data =
    typeof row.story_data === "string" ? JSON.parse(row.story_data) : row.story_data;
  return {
    ...(data as SavedStory),
    universeId: row.universe_id ?? undefined,
    heroId: row.hero_id ?? undefined,
  };
}


export class DbStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    if (!process.env.DATABASE_URL || !pool) {
      console.warn("DATABASE_URL not set or database connection failed. Using fallback session store.");
      // Create memory store for sessions as fallback
      const MemoryStore = createMemoryStore(session);
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
        // The session table is declared in shared/schema.ts and created by
        // migrations, so connect-pg-simple must not create its own.
        createTableIfMissing: false
      });
    } catch (error) {
      console.error("Failed to initialize PostgreSQL session store:", error);
      // Fallback to memory store if PostgreSQL session store initialization fails
      const MemoryStore = createMemoryStore(session);
      this.sessionStore = new MemoryStore({
        checkPeriod: 86400000 // prune expired entries every 24h
      });
    }
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    if (!isDatabaseAvailable()) {
      console.warn(`Database unavailable in getUser(${id}). Using fallback empty result.`);
      return undefined;
    }
    try {
      const result = await db!.select().from(users).where(eq(users.id, id));
      return result[0];
    } catch (error) {
      console.error(`Error in getUser(${id}):`, error);
      return undefined;
    }
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    if (!isDatabaseAvailable()) {
      console.warn(`Database unavailable in getUserByUsername(${username}). Using fallback empty result.`);
      return undefined;
    }
    try {
      const result = await db!.select().from(users).where(eq(users.username, username));
      return result[0];
    } catch (error) {
      console.error(`Error in getUserByUsername(${username}):`, error);
      return undefined;
    }
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    if (!isDatabaseAvailable()) {
      console.warn(`Database unavailable in getUserByEmail(${email}). Using fallback empty result.`);
      return undefined;
    }
    try {
      const result = await db!.select().from(users).where(eq(users.email, email));
      return result[0];
    } catch (error) {
      console.error(`Error in getUserByEmail(${email}):`, error);
      return undefined;
    }
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    if (!isDatabaseAvailable()) {
      console.error("Database unavailable in createUser. Cannot create user:", insertUser.username);
      throw new Error("Database connection is required to create users");
    }
    try {
      const result = await db!.insert(users).values(insertUser).returning();
      return result[0];
    } catch (error) {
      console.error(`Error in createUser(${insertUser.username}):`, error);
      throw error;
    }
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User | undefined> {
    const result = await db!
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
    const result = await db!
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
    await db!.insert(verificationTokens).values({
      userId,
      token,
      type: tokenType,
      expiresAt
    });
    
    return token;
  }

  async getVerificationToken(token: string): Promise<{ userId: number, type: string, expiresAt: Date } | undefined> {
    const now = new Date();
    const result = await db!
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
    const result = await db!
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
      const { rows } = await pool!.query(
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
            return rowToSavedStory(row);
          }
          // Handle the string format with proper error handling
          return rowToSavedStory(row);
        } catch (parseError) {
          console.error("Error parsing story data:", parseError);
          // Return a default story object to prevent app crashes
          return corruptStoryPlaceholder(row);
        }
      });
    } catch (error) {
      console.error("Error fetching user stories:", error);
      return [];
    }
  }

  // Character related methods - implementing temporary JSON storage
  async getAllCharacters(userId: number): Promise<Character[]> {
    try {
      // One statement, always scoped. There used to be a second branch here
      // that selected every character in the database when userId was falsy,
      // described as an admin function and called by nobody. It was reachable
      // only if a caller passed 0 or undefined -- and 0 IS falsy, so the only
      // thing standing between it and every user's characters was that
      // Postgres serial ids happen to start at 1. That is not a guard, it is a
      // coincidence, and it is the kind that survives review forever.
      const { rows } = await pool!.query(
        `SELECT * FROM user_characters WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId]
      );

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
          // A placeholder so one corrupt row does not empty the whole page.
          //
          // It asserts NOTHING it does not know. The version before this one
          // filled in gender "boy", age 0 and six fields from a schema that had
          // not existed for months (hairColor, outfit, specialAbility,
          // backstory) -- invented facts about a character whose real data
          // could not be read. Only the three fields the row itself supplies.
          return {
            id: row.character_id || "unknown",
            name: "Unknown Character",
            createdAt: new Date(row.created_at ?? Date.now()).toISOString(),
          };
        }
      });
    } catch (error) {
      console.error("Error fetching characters:", error);
      return [];
    }
  }

  async getCharacterById(id: string, userId: number): Promise<Character | undefined> {
    try {
      // Scoped in the statement, not by the caller. A character that is not
      // this user's is indistinguishable from one that does not exist, which is
      // what lets the route answer 404 rather than 403 -- a 403 would confirm
      // the id is real to anyone guessing.
      const { rows } = await pool!.query(
        `SELECT * FROM user_characters WHERE character_id = $1 AND user_id = $2`,
        [id, userId]
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
        // A placeholder so one corrupt row does not crash the page.
        //
        // It asserts NOTHING it does not know. This drifted once already --
        // it carried hairColor/outfit/specialAbility/backstory from a schema
        // long gone -- because nothing exercises a branch that only runs on
        // unparseable JSON. Naming fewer fields is what stops it drifting
        // again: there is nothing here left to go stale.
        return {
          id,
          name: "Unknown Character",
          createdAt: new Date(rows[0].created_at ?? Date.now()).toISOString(),
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
    
    await pool!.query(
      `INSERT INTO user_characters (character_id, user_id, character_data, created_at) 
       VALUES ($1, $2, $3, $4)`,
      [id, userId, JSON.stringify(character), now]
    );
    
    return character;
  }

  async updateCharacter(
    id: string,
    userId: number,
    updates: Partial<Character>,
  ): Promise<Character | undefined> {
    const character = await this.getCharacterById(id, userId);
    if (!character) return undefined;

    const updatedCharacter: Character = {
      ...character,
      ...updates
    };

    // user_id repeated on the write even though the read above already checked
    // it. The read and the write are two statements, and between them the row
    // can change owner or be deleted; a WHERE that only trusts the earlier
    // check is trusting a fact that has since expired.
    const result = await pool!.query(
      `UPDATE user_characters SET character_data = $1
        WHERE character_id = $2 AND user_id = $3`,
      [JSON.stringify(updatedCharacter), id, userId]
    );
    if (!result.rowCount) return undefined;

    return updatedCharacter;
  }

  async deleteCharacter(id: string, userId: number): Promise<boolean> {
    const result = await pool!.query(
      `DELETE FROM user_characters
        WHERE character_id = $1 AND user_id = $2 RETURNING character_id`,
      [id, userId]
    );

    return (result.rowCount || 0) > 0;
  }

  // Song methods - implementing temporary JSON storage
  async getAllSongs(): Promise<Song[]> {
    if (!isDatabaseAvailable()) {
      console.warn("Database unavailable in getAllSongs. Using fallback empty result.");
      return [];
    }

    try {
      // Changed query to not order by title since that column doesn't exist in the raw table
      // The title is inside the song_data JSON
      const { rows } = await pool!.query(
        `SELECT * FROM songs ORDER BY song_id ASC`
      );
      
      if (!rows || !rows.length) return [];
      
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
    if (!isDatabaseAvailable()) {
      console.warn(`Database unavailable in getSongById(${id}). Using fallback empty result.`);
      return undefined;
    }
    
    try {
      const { rows } = await pool!.query(
        `SELECT * FROM songs WHERE song_id = $1`,
        [id]
      );
      
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
        // Return a default song object to prevent app crashes.
        // `backgroundColor` is not on Song and was silently ignored; the
        // required fields below were missing instead.
        return {
          id: id,
          title: "Song Data Error",
          artist: "Unknown",
          verses: [{ lyrics: ["Data could not be parsed"], chords: [""] }],
          chorus: null,
          bridge: null,
          chords: [],
          key: "C",
          difficulty: "beginner",
          timeSignature: "4/4",
          tempo: 120,
          tags: [],
          hasGeneratedAudio: false,
          createdAt: new Date(),
          updatedAt: new Date()
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
      
      await pool!.query(
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
      const { rows } = await pool!.query(
        `SELECT * FROM user_stories WHERE 
         is_favorite = true OR expires_at IS NULL OR expires_at > NOW()
         ORDER BY created_at DESC`
      );
      
      if (!rows.length) return [];
      
      return rows.map(row => {
        try {
          // Handle the case where data might already be an object
          if (typeof row.story_data === 'object' && row.story_data !== null) {
            return rowToSavedStory(row);
          }
          // Handle the string format with proper error handling
          return rowToSavedStory(row);
        } catch (parseError) {
          console.error("Error parsing story data:", parseError);
          // Return a default story object to prevent app crashes
          return corruptStoryPlaceholder(row);
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
      
      const { rows } = await pool!.query(query, params);
      
      if (!rows.length) return undefined;
      
      try {
        // Handle the case where data might already be an object
        if (typeof rows[0].story_data === 'object' && rows[0].story_data !== null) {
          return rowToSavedStory(rows[0]);
        }
        // Handle the string format with proper error handling
        return rowToSavedStory(rows[0]);
      } catch (parseError) {
        console.error("Error parsing story data:", parseError);
        // Return a default story object to prevent app crashes
        return {
          id: id,
          story: {
            title: "Story Data Error",
            content: "There was a problem loading this story. The data may be corrupted.",
            moralOutcome: "learning" as const,
            applicationQuestions: [],
            bibleVerse: {
              text: "The Lord is my helper; I will not fear.",
              reference: "Hebrews 13:6"
            }
          },
          // Parsed from the schema rather than written out, so every field with
          // a default fills itself. As a literal this had to be extended by
          // hand for each new request field -- it broke the build twice on
          // fields that have nothing to do with a corrupt-row placeholder --
          // and the values here mean nothing anyway. childName and gender are
          // supplied because the schema's refine requires a protagonist or a
          // cast, and this stands in for a story whose real request is lost.
          request: storyRequestSchema.parse({
            childName: "Unknown",
            gender: "boy",
          }),
          searchMetadata: {
            keywords: [],
            tags: [],
            characters: [],
            biblicalReferences: [],
            themes: []
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
  
  async saveStory(story: StoryToSave, request: StoryRequest, userId: number): Promise<SavedStory> {
    if (!isDatabaseAvailable()) {
      console.error("Database unavailable in saveStory. Cannot save story for user:", userId);
      throw new Error("Database connection is required to save stories");
    }
    
    try {
      // Which generation produced this story. Carried on the response object
      // rather than passed separately so the existing client, which posts the
      // story back verbatim, needs no change. Null for stories saved before
      // generation_records existed, and for any path that does not set it.
      const generationId = story.generationId ?? null;
      // Read off the REQUEST, not an optional fourth parameter. The optional
      // heroId parameter is exactly why hero_id is NULL on nearly every row:
      // DbStorage.saveStory silently omits it and the caller cannot tell.
      const universeId = (request as { universeId?: string }).universeId ?? null;
      // Same reasoning, same source. Resolved at enqueue (or at save on the
      // synchronous path) and carried on the request, so this method cannot
      // silently lose it the way the optional fourth parameter did.
      const heroId = (request as { heroId?: string }).heroId ?? null;
      // Same pattern again: carried on the story object like generationId, not
      // as another optional parameter that this method could silently drop.
      // Absent for a single-call generation -- very-short prose and every poem
      // -- which is why it is optional rather than defaulted to [].
      const outline = story.outline;
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
        ...(outline ? { outline } : {}),
        // NULL, and written explicitly: the presence of this key is what says
        // the row is one the unseen bubble knows about. A story from before
        // this existed has no key and is treated as seen, which is what makes
        // the feature need no migration and no backfill. See seenAt on
        // savedStorySchema.
        seenAt: null,
        // savedStorySchema declares searchMetadata with .default(), so the
        // parsed type requires it even though the input does not. Writing it
        // explicitly also means updateStoryHeroId's jsonb_set has a parent key
        // to write into on every row this method creates.
        searchMetadata: {
          keywords: [],
          tags: [],
          characters: [],
          biblicalReferences: [],
          themes: []
        }
      };
      
      // The CREATE TABLE IF NOT EXISTS that used to sit here has been removed.
      // It was a fifth definition of user_stories, and an out-of-date one: it
      // declared six columns while the real table has eight, omitting hero_id
      // and generation_id and every index. It could only ever fire on a
      // database where migrations had not run, and would then produce a table
      // that verifyOrmSchema correctly rejects -- so its best case was a no-op
      // and its worst case was a subtly wrong schema. migrations/ owns this.
      await pool!.query(
        `INSERT INTO user_stories (story_id, user_id, story_data, created_at, is_favorite, expires_at, generation_id, universe_id, hero_id) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, userId, JSON.stringify(savedStory), now, false, expiryDate, generationId, universeId, heroId]
      );
      
      return savedStory;
    } catch (error) {
      console.error("Error saving story:", error);
      throw new Error("Failed to save story. Please try again later.");
    }
  }
  
  async toggleFavorite(id: string, isFavorite: boolean, userId: number): Promise<SavedStory | undefined> {
    if (!isDatabaseAvailable()) {
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
      await pool!.query(`
        CREATE TABLE IF NOT EXISTS user_stories (
          story_id TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL,
          story_data JSONB NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          is_favorite BOOLEAN DEFAULT FALSE,
          expires_at TIMESTAMP WITH TIME ZONE
        )
      `);
      
      await pool!.query(
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
    if (!isDatabaseAvailable()) {
      console.warn(`Database unavailable in deleteStory(${id}). Cannot delete story.`);
      return false;
    }
    
    try {
      const result = await pool!.query(
        `DELETE FROM user_stories WHERE story_id = $1 AND user_id = $2 RETURNING story_id`,
        [id, userId]
      );
      
      return (result.rowCount || 0) > 0;
    } catch (error) {
      console.error(`Error deleting story ${id}:`, error);
      return false;
    }
  }

  /**
   * Share links. See IStorage for the contract; the SQL is where it is kept.
   *
   * No share row survives its story: story_shares cascades from user_stories,
   * so deleteStory above needs no change.
   */
  async getShareToken(storyId: string, userId: number): Promise<string | undefined> {
    if (!isDatabaseAvailable()) return undefined;
    const { rows } = await pool!.query(
      `SELECT token FROM story_shares WHERE story_id = $1 AND user_id = $2`,
      [storyId, userId],
    );
    return rows[0]?.token;
  }

  /**
   * Ownership, creation and "you already have one" in ONE statement.
   *
   * The INSERT selects FROM the owner's own story row, so a story that is not
   * theirs yields nothing to insert and nothing comes back -- there is no
   * check-then-write gap to race. Two taps at once both land on the unique
   * index; `DO UPDATE SET story_id = EXCLUDED.story_id` is a no-op update that
   * exists only so RETURNING hands back the token already there, which is
   * what makes this idempotent rather than a unique-violation error.
   */
  async createShare(storyId: string, userId: number): Promise<string | undefined> {
    if (!isDatabaseAvailable()) return undefined;
    const { rows } = await pool!.query(
      `INSERT INTO story_shares (token, story_id, user_id)
         SELECT $1, story_id, user_id FROM user_stories
          WHERE story_id = $2 AND user_id = $3
       ON CONFLICT (story_id) DO UPDATE SET story_id = EXCLUDED.story_id
       RETURNING token`,
      [newShareToken(), storyId, userId],
    );
    return rows[0]?.token;
  }

  async deleteShare(storyId: string, userId: number): Promise<boolean> {
    if (!isDatabaseAvailable()) return false;
    const result = await pool!.query(
      `DELETE FROM story_shares WHERE story_id = $1 AND user_id = $2`,
      [storyId, userId],
    );
    return (result.rowCount || 0) > 0;
  }

  /**
   * The one read with no session behind it.
   *
   * The visibility clause is the library's own (getAllStories and the story
   * lists), not getStoryById's, which has none: an owner may still open a
   * lapsed story by id, but a stranger must not be able to read one the owner's
   * own library has stopped showing.
   */
  async getSharedStory(token: string): Promise<SavedStory | undefined> {
    if (!isDatabaseAvailable()) return undefined;
    const { rows } = await pool!.query(
      `SELECT s.* FROM story_shares sh
         JOIN user_stories s ON s.story_id = sh.story_id
        WHERE sh.token = $1
          AND (s.is_favorite = true OR s.expires_at IS NULL OR s.expires_at > NOW())`,
      [token],
    );
    return rows.length ? rowToSavedStory(rows[0]) : undefined;
  }

  /**
   * Stamp a story as looked at.
   *
   * ONLY WHERE IT IS EXPLICITLY NULL. A row from before this existed has no
   * seenAt key and must not grow one -- it is already treated as seen, and
   * writing a date would be inventing a moment that never happened. The
   * WHERE clause is the guard, so a second open is a no-op rather than a
   * rewrite of when they first read it.
   */
  async markStorySeen(storyId: string, userId: number): Promise<void> {
    if (!isDatabaseAvailable()) return;
    try {
      await pool!.query(
        `UPDATE user_stories
            SET story_data = story_data || jsonb_build_object('seenAt', $1::text)
          WHERE story_id = $2 AND user_id = $3
            AND story_data ? 'seenAt' AND story_data->>'seenAt' IS NULL`,
        [new Date().toISOString(), storyId, userId],
      );
    } catch (error) {
      // A bubble that does not clear is a smaller problem than a failed read.
      console.error(`Error marking story ${storyId} seen:`, error);
    }
  }

  /**
   * How many are written and not yet opened.
   *
   * COUNTED IN SQL, unlike the quest counter next door, because this one has
   * no legacy field to read through -- seenAt is one key with one meaning --
   * and it runs on every page load for the nav bubble. Reading every story
   * body to count a handful would be the getUserStories mistake again.
   */
  async countUnseenStories(userId: number): Promise<number> {
    if (!isDatabaseAvailable()) return 0;
    try {
      const { rows } = await pool!.query(
        `SELECT COUNT(*)::int AS n
           FROM user_stories
          WHERE user_id = $1
            AND (is_favorite = true OR expires_at IS NULL OR expires_at > NOW())
            AND story_data ? 'seenAt' AND story_data->>'seenAt' IS NULL`,
        [userId],
      );
      return rows[0]?.n ?? 0;
    } catch (error) {
      console.error(`Error counting unseen stories for user ${userId}:`, error);
      return 0;
    }
  }

  async getStoryRequests(userId: number): Promise<StoryRequest[]> {
    if (!isDatabaseAvailable()) {
      console.warn(`Database unavailable in getStoryRequests(${userId}).`);
      return [];
    }
    try {
      // The request only. Selecting * here would pull every story's full text
      // to count a handful of rows, on every enqueue.
      const { rows } = await pool!.query(
        `SELECT story_data->'request' AS request
           FROM user_stories
          WHERE user_id = $1
            AND (is_favorite = true OR expires_at IS NULL OR expires_at > NOW())
          ORDER BY created_at DESC`,
        [userId],
      );
      return rows.map((r) => r.request).filter(Boolean) as StoryRequest[];
    } catch (error) {
      // A count that cannot be read is a story that treats everyone as new,
      // which is a duller opening and not a broken one.
      console.error(`Error reading story requests for user ${userId}:`, error);
      return [];
    }
  }

  async setStoryImages(
    storyId: string,
    userId: number,
    next: { imageUrl: string | null; images: GeneratedPicture[] },
  ): Promise<SavedStory | undefined> {
    if (!isDatabaseAvailable()) {
      console.warn(`Database unavailable in setStoryImages(${storyId}).`);
      return undefined;
    }
    try {
      // ONE statement, no read, and a shallow merge rather than jsonb_set --
      // editStory's reasoning, and the same trap: jsonb_set into a missing key
      // returns NULL and erases the row. Every other key of `story` (title,
      // content, bibleVerse, the five questions) is left exactly as it was.
      //
      // Scoped to the user in the STATEMENT, not by a prior SELECT: storyId is
      // client-supplied, and without this a user could illustrate -- and so
      // modify -- somebody else's story.
      //
      // The null branch REMOVES the key instead of writing JSON null: the
      // schema says imageUrl is a string when it is there at all, and a row
      // carrying null is a row that fails to parse rather than a story with no
      // picture.
      const { rowCount } = await pool!.query(
        `UPDATE user_stories
            SET story_data = CASE WHEN $1::text IS NULL
              THEN (story_data || jsonb_build_object('images', $2::jsonb)) #- '{story,imageUrl}'
              ELSE story_data || jsonb_build_object(
                'story',  COALESCE(story_data->'story', '{}'::jsonb)
                          || jsonb_build_object('imageUrl', $1::text),
                'images', $2::jsonb)
              END
          WHERE story_id = $3 AND user_id = $4`,
        [next.imageUrl, JSON.stringify(next.images), storyId, userId],
      );
      if (!rowCount) {
        console.warn(`Story not found for illustration: ${storyId} (user ${userId})`);
        return undefined;
      }
      return await this.getStoryById(storyId, userId);
    } catch (error) {
      console.error(`Error saving illustration for story ${storyId}:`, error);
      return undefined;
    }
  }

  async editStory(
    storyId: string,
    patch: { title?: string; content?: string },
    userId: number,
  ): Promise<SavedStory | undefined> {
    if (!isDatabaseAvailable()) {
      console.warn(`Database unavailable in editStory(${storyId}).`);
      return undefined;
    }
    const entry: EditLogEntry = {
      at: new Date().toISOString(),
      by: "parent",
      // Derived from the patch's keys on the server, never taken from the body.
      changed: Object.keys(patch),
    };
    try {
      // ONE statement, no read, no jsonb_set. A shallow merge (||) has no NULL
      // path -- jsonb_set into a missing key returns NULL and erases the row
      // (see updateStoryHeroId) -- and it leaves every other key of `story`
      // (imageUrl, bibleVerse, the five questions) exactly as it was. Both
      // COALESCEs are load-bearing: || is strict too. `story` is never
      // missing (saveStory writes it), so that one is a belt.
      const { rowCount } = await pool!.query(
        `UPDATE user_stories
            SET story_data = story_data || jsonb_build_object(
              'story',   COALESCE(story_data->'story',   '{}'::jsonb) || $1::jsonb,
              'editLog', COALESCE(story_data->'editLog', '[]'::jsonb) || $2::jsonb)
          WHERE story_id = $3 AND user_id = $4`,
        [JSON.stringify(patch), JSON.stringify([entry]), storyId, userId],
      );
      if (!rowCount) return undefined;
      return await this.getStoryById(storyId, userId);
    } catch (error) {
      console.error(`Error editing story ${storyId}:`, error);
      return undefined;
    }
  }

  async updateStoryHeroId(storyId: string, heroId: string, userId: number): Promise<SavedStory | undefined> {
    if (!isDatabaseAvailable()) {
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
      await pool!.query(`
        UPDATE user_stories
        SET hero_id = $1
        WHERE story_id = $2 AND user_id = $3
      `, [heroId, storyId, userId]);
      
      // Also update the heroId in the JSON data
      await pool!.query(`
        UPDATE user_stories
        SET story_data = jsonb_set(
          story_data, 
          '{heroId}', 
          $1::jsonb
        )
        WHERE story_id = $2 AND user_id = $3
      `, [JSON.stringify(heroId), storyId, userId]);
      
      // Add the "hero of faith" tag if it isn't already present.
      //
      // This statement was broken three ways before: jsonb_append is not a
      // PostgreSQL function (array append is the || operator); it referenced
      // $2/$3 while binding three parameters, so $1's type could not be
      // inferred; and if a story had no searchMetadata key, jsonb_set received
      // NULL and returns NULL for the whole document -- which would have
      // erased story_data rather than tagging it.
      //
      // The inner jsonb_set guarantees searchMetadata exists before the outer
      // one writes into it.
      await pool!.query(`
        UPDATE user_stories
        SET story_data = jsonb_set(
          jsonb_set(
            story_data,
            '{searchMetadata}',
            COALESCE(story_data->'searchMetadata', '{}'::jsonb),
            true
          ),
          '{searchMetadata,tags}',
          CASE
            WHEN COALESCE(story_data->'searchMetadata'->'tags', '[]'::jsonb) ? 'hero of faith'
            THEN COALESCE(story_data->'searchMetadata'->'tags', '[]'::jsonb)
            ELSE COALESCE(story_data->'searchMetadata'->'tags', '[]'::jsonb) || '["hero of faith"]'::jsonb
          END,
          true
        )
        WHERE story_id = $1 AND user_id = $2
      `, [storyId, userId]);
      
      console.log(`Associated story ${storyId} with hero ${heroId}`);
      
      // Get the updated story
      return await this.getStoryById(storyId, userId);
    } catch (error) {
      console.error("Error updating story hero ID:", error);
      return undefined;
    }
  }
  
  // Story search methods
  async searchStories(query: string, userId?: number): Promise<SavedStory[]> {
    try {
      let sqlQuery: string;
      let params: any[] = [];
      
      if (userId) {
        // Search only user's stories
        sqlQuery = `
          SELECT * FROM user_stories 
          WHERE user_id = $1 
          AND (
            story_data->'story'->>'title' ILIKE $2 
            OR story_data->'story'->>'content' ILIKE $2 
            OR story_data->'story'->'bibleVerse'->>'text' ILIKE $2 
            OR story_data->'story'->'bibleVerse'->>'reference' ILIKE $2
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
            story_data->'story'->>'title' ILIKE $1 
            OR story_data->'story'->>'content' ILIKE $1 
            OR story_data->'story'->'bibleVerse'->>'text' ILIKE $1 
            OR story_data->'story'->'bibleVerse'->>'reference' ILIKE $1
            OR story_data->'request'->>'theme' ILIKE $1
            OR story_data->'request'->>'childName' ILIKE $1
            OR story_data->'request'->>'animal' ILIKE $1
            OR story_data->'request'->>'customPrompt' ILIKE $1
          ORDER BY created_at DESC
        `;
        params = [`%${query}%`];
      }
      
      const { rows } = await pool!.query(sqlQuery, params);
      
      if (!rows.length) return [];
      
      return rows.map(row => {
        try {
          if (typeof row.story_data === 'object' && row.story_data !== null) {
            return rowToSavedStory(row);
          }
          return rowToSavedStory(row);
        } catch (error) {
          console.error("Error parsing story data:", error);
          return corruptStoryPlaceholder(row);
        }
      });
    } catch (error) {
      console.error("Error searching stories:", error);
      return [];
    }
  }
  
  async searchStoriesByName(name: string, userId?: number): Promise<SavedStory[]> {
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
      
      const { rows } = await pool!.query(sqlQuery, params);
      
      if (!rows.length) return [];
      
      return rows.map(row => {
        try {
          if (typeof row.story_data === 'object' && row.story_data !== null) {
            return rowToSavedStory(row);
          }
          return rowToSavedStory(row);
        } catch (error) {
          console.error("Error parsing story data:", error);
          return corruptStoryPlaceholder(row);
        }
      });
    } catch (error) {
      console.error("Error searching stories by name:", error);
      return [];
    }
  }
  
  async searchStoriesByBiblePassage(passage: string, userId?: number): Promise<SavedStory[]> {
    try {
      let sqlQuery: string;
      let params: any[] = [];
      
      if (userId) {
        // Search only user's stories
        sqlQuery = `
          SELECT * FROM user_stories 
          WHERE user_id = $1 
          AND story_data->'story'->'bibleVerse'->>'reference' ILIKE $2
          AND (is_favorite = true OR expires_at IS NULL OR expires_at > NOW())
          ORDER BY created_at DESC
        `;
        params = [userId, `%${passage}%`];
      } else {
        // Admin search all stories
        sqlQuery = `
          SELECT * FROM user_stories 
          WHERE story_data->'story'->'bibleVerse'->>'reference' ILIKE $1
          ORDER BY created_at DESC
        `;
        params = [`%${passage}%`];
      }
      
      const { rows } = await pool!.query(sqlQuery, params);
      
      if (!rows.length) return [];
      
      return rows.map(row => {
        try {
          if (typeof row.story_data === 'object' && row.story_data !== null) {
            return rowToSavedStory(row);
          }
          return rowToSavedStory(row);
        } catch (error) {
          console.error("Error parsing story data:", error);
          return corruptStoryPlaceholder(row);
        }
      });
    } catch (error) {
      console.error("Error searching stories by Bible passage:", error);
      return [];
    }
  }
  
  async searchStoriesByTopic(topic: string, userId?: number): Promise<SavedStory[]> {
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
      
      const { rows } = await pool!.query(sqlQuery, params);
      
      if (!rows.length) return [];
      
      return rows.map(row => {
        try {
          if (typeof row.story_data === 'object' && row.story_data !== null) {
            return rowToSavedStory(row);
          }
          return rowToSavedStory(row);
        } catch (error) {
          console.error("Error parsing story data:", error);
          return corruptStoryPlaceholder(row);
        }
      });
    } catch (error) {
      console.error("Error searching stories by topic:", error);
      return [];
    }
  }
  
  async searchStoriesByTags(tags: string[], userId?: number): Promise<SavedStory[]> {
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
      
      const { rows } = await pool!.query(sqlQuery, params);
      
      if (!rows.length) return [];
      
      return rows.map(row => {
        try {
          if (typeof row.story_data === 'object' && row.story_data !== null) {
            return rowToSavedStory(row);
          }
          return rowToSavedStory(row);
        } catch (error) {
          console.error("Error parsing story data:", error);
          return corruptStoryPlaceholder(row);
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
          AND hero_id = $2
          AND (is_favorite = true OR expires_at IS NULL OR expires_at > NOW())
          ORDER BY created_at DESC
        `;
        params = [userId, heroId];
      } else {
        // Admin function - get all stories for this hero
        sqlQuery = `
          SELECT * FROM user_stories 
          WHERE hero_id = $1
          ORDER BY created_at DESC
        `;
        params = [heroId];
      }
      
      const { rows } = await pool!.query(sqlQuery, params);
      
      if (!rows.length) return [];
      
      return rows.map(row => {
        try {
          if (typeof row.story_data === 'object' && row.story_data !== null) {
            return rowToSavedStory(row);
          }
          return rowToSavedStory(row);
        } catch (error) {
          console.error("Error parsing story data:", error);
          return corruptStoryPlaceholder(row);
        }
      });
    } catch (error) {
      console.error(`Error getting stories for hero ${heroId}:`, error);
      return [];
    }
  }
  
  // Usage tracking methods
  
  
  
  async getAvatarCount(userId: number): Promise<number> {
    if (!isDatabaseAvailable()) {
      console.warn(`Database unavailable in getAvatarCount(${userId}). Reporting 0.`);
      return 0;
    }
    try {
      const { rows } = await pool!.query(
        `SELECT avatar_count FROM user_usage WHERE user_id = $1`,
        [userId],
      );
      return rows.length ? Number(rows[0].avatar_count) : 0;
    } catch (error) {
      console.error(`Error getting avatar count for user ${userId}:`, error);
      return 0;
    }
  }

  /**
   * Spend one avatar generation if the account has one left.
   *
   * ONE statement, deliberately. The obvious shape -- read the count, compare
   * it to the cap, then increment -- has a window between the read and the
   * write in which a second request reads the same number, and a cap that can
   * be exceeded by pressing a button twice is not a cap. The WHERE clause is
   * the check, so the row is only ever incremented from a value that was still
   * under the limit when the write happened.
   *
   * Returns false rather than throwing: the caller is deciding whether to spend
   * the owner's money, and "no" is an ordinary answer to that question.
   *
   * On a database failure it returns FALSE, not true. Every other read in this
   * file degrades towards letting the user carry on, because the alternative
   * was refusing to show them a story they already own. This one degrades the
   * other way: the failure mode of guessing wrong here is an uncapped bill.
   */
  async chargeAvatarGeneration(userId: number, limit: number): Promise<boolean> {
    if (!isDatabaseAvailable()) {
      console.warn(`Database unavailable in chargeAvatarGeneration(${userId}). Refusing.`);
      return false;
    }
    // Infinity has no integer to compare against in SQL; an unlimited user is
    // still counted, so the number stays true, but never blocked.
    const capped = Number.isFinite(limit);
    try {
      const { rows } = await pool!.query(
        `INSERT INTO user_usage (user_id, avatar_count) VALUES ($1, 1)
         ON CONFLICT (user_id) DO UPDATE SET avatar_count = user_usage.avatar_count + 1
         WHERE $2::boolean IS FALSE OR user_usage.avatar_count < $3::integer
         RETURNING avatar_count`,
        [userId, capped, capped ? limit : 0],
      );
      return rows.length > 0;
    } catch (error) {
      console.error(`Error charging avatar generation for user ${userId}:`, error);
      return false;
    }
  }

  async refundAvatarGeneration(userId: number): Promise<void> {
    if (!isDatabaseAvailable()) return;
    try {
      // GREATEST(...,0) rather than a plain subtraction: a refund that could
      // drive the count negative would hand out free generations, which is the
      // exact thing the counter exists to prevent.
      await pool!.query(
        `UPDATE user_usage SET avatar_count = GREATEST(avatar_count - 1, 0) WHERE user_id = $1`,
        [userId],
      );
    } catch (error) {
      console.error(`Error refunding avatar generation for user ${userId}:`, error);
    }
  }

  /**
   * Forgive the months this account is owed, once.
   *
   * ONE STATEMENT, and the WHERE clause is the guard. The reset this replaces
   * was a blind "count = 0, last_reset_date = now" with nothing stopping two
   * concurrent calls from both firing -- and each one pushed the date forward
   * again, granting a month that had not passed.
   *
   * Here the row is only touched when it is genuinely behind, and the date
   * advances by exactly the number of months applied, computed in SQL from the
   * stored value rather than from anything the caller passes. Run it twice for
   * the same instant and the second finds nothing to do.
   *
   * date_trunc to the month on the way in, so the anniversary is the 1st and
   * not whatever day of the month somebody first generated a story.
   */
  async applyStoryTopUp(userId: number, now: Date = new Date()) {
    if (!isDatabaseAvailable()) {
      console.warn(`Database unavailable in applyStoryTopUp(${userId}). Nothing forgiven.`);
      return { count: 0, lastResetDate: null };
    }
    try {
      const { rows } = await pool!.query(
        `WITH owed AS (
           SELECT user_id,
                  GREATEST(
                    0,
                    (date_part('year',  $2::timestamptz) - date_part('year',  last_reset_date)) * 12
                  + (date_part('month', $2::timestamptz) - date_part('month', last_reset_date))
                  )::int AS months
             FROM user_usage
            WHERE user_id = $1 AND last_reset_date IS NOT NULL
         )
         UPDATE user_usage u
            SET count = GREATEST(0, u.count - owed.months * $3::int),
                last_reset_date = date_trunc('month', u.last_reset_date)
                                  + make_interval(months => owed.months)
           FROM owed
          WHERE u.user_id = owed.user_id AND owed.months > 0
        RETURNING u.count, u.last_reset_date`,
        [userId, now, FREE_STORIES_PER_MONTH],
      );
      if (rows.length) {
        return { count: Number(rows[0].count), lastResetDate: rows[0].last_reset_date as Date };
      }
      // Nothing owed. Report what is there.
      const { rows: cur } = await pool!.query(
        `SELECT count, last_reset_date FROM user_usage WHERE user_id = $1`,
        [userId],
      );
      return cur.length
        ? { count: Number(cur[0].count), lastResetDate: cur[0].last_reset_date as Date | null }
        : { count: 0, lastResetDate: null };
    } catch (error) {
      console.error(`Error applying story top-up for user ${userId}:`, error);
      // Report nothing forgiven rather than guessing generously: the caller
      // uses this to decide whether to spend the owner's credits.
      return { count: 0, lastResetDate: null };
    }
  }

  
  
  // User settings methods
  async getUserOpenAIKey(userId: number): Promise<string | null> {
    if (!isDatabaseAvailable()) {
      console.warn(`Database unavailable in getUserOpenAIKey(${userId}). Returning null.`);
      return null;
    }
    
    try {
      const { rows } = await pool!.query(
        `SELECT openai_key FROM user_settings WHERE user_id = $1`,
        [userId]
      );
      
      return rows.length && rows[0].openai_key ? rows[0].openai_key : null;
    } catch (error) {
      console.error(`Error getting OpenAI key for user ${userId}:`, error);
      return null;
    }
  }
  
  async setUserOpenAIKey(userId: number, key: string): Promise<void> {
    if (!isDatabaseAvailable()) {
      console.warn(`Database unavailable in setUserOpenAIKey(${userId}). Cannot save key.`);
      return;
    }
    
    try {
      // The CREATE TABLE IF NOT EXISTS that used to sit here has been removed,
      // for the same reason the one in saveStory was: it is a second, stale
      // definition of a table migrations already own. It declared THREE columns
      // while user_settings now has seven, so on a database where it fired
      // ahead of the migration it would create a table verifyOrmSchema()
      // correctly rejects -- turning /api/health into a 503. Latent while the
      // columns matched; live the moment the reading preferences landed.
      await pool!.query(
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
    if (!isDatabaseAvailable()) {
      console.warn(`Database unavailable in getUserOpenAIModel(${userId}). Using default model.`);
      // null means "never chosen"; modelPolicy owns the default.
      return null;
    }
    
    try {
      const { rows } = await pool!.query(
        `SELECT openai_model FROM user_settings WHERE user_id = $1`,
        [userId]
      );
      
      return rows.length && rows[0].openai_model ? rows[0].openai_model : null;
    } catch (error) {
      console.error(`Error getting OpenAI model for user ${userId}:`, error);
      return null; // Never chosen, as far as we can tell; the policy decides.
    }
  }
  
  async getUserReadingPrefs(userId: number): Promise<Partial<ReadingPrefs>> {
    if (!isDatabaseAvailable()) return {};
    try {
      const { rows } = await pool!.query(
        `SELECT reader_palette, reader_font, reader_typeset, reader_font_step
         FROM user_settings WHERE user_id = $1`,
        [userId],
      );
      return rows.length ? rowToPrefs(rows[0]) : {};
    } catch (error) {
      console.error(`Error getting reading preferences for user ${userId}:`, error);
      return {};
    }
  }

  async setUserReadingPrefs(
    userId: number,
    prefs: Partial<ReadingPrefs>,
  ): Promise<Partial<ReadingPrefs>> {
    if (!isDatabaseAvailable()) {
      console.warn(`Database unavailable in setUserReadingPrefs(${userId}). Not saved.`);
      return {};
    }
    try {
      // COALESCE on every column so a partial update never nulls a sibling:
      // the bar sends one axis at a time, and without this, changing the
      // palette would silently clear the font.
      //
      // RETURNING, and the caller hands that back to the client, because a
      // 200 from this app does not prove a write landed -- storage falls back
      // to memory when the database is away.
      const { rows } = await pool!.query(
        `INSERT INTO user_settings (user_id, reader_palette, reader_font, reader_typeset, reader_font_step)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id) DO UPDATE SET
           reader_palette   = COALESCE($2, user_settings.reader_palette),
           reader_font      = COALESCE($3, user_settings.reader_font),
           reader_typeset   = COALESCE($4, user_settings.reader_typeset),
           reader_font_step = COALESCE($5, user_settings.reader_font_step)
         RETURNING reader_palette, reader_font, reader_typeset, reader_font_step`,
        [
          userId,
          prefs.palette ?? null,
          prefs.font ?? null,
          prefs.typeset ?? null,
          prefs.fontStep ?? null,
        ],
      );
      return rows.length ? rowToPrefs(rows[0]) : {};
    } catch (error) {
      console.error(`Error setting reading preferences for user ${userId}:`, error);
      return {};
    }
  }

  async setUserOpenAIModel(userId: number, model: string): Promise<void> {
    if (!isDatabaseAvailable()) {
      console.warn(`Database unavailable in setUserOpenAIModel(${userId}). Cannot save model.`);
      return;
    }
    
    try {
      // See the note in setUserOpenAIKey: migrations own this table.
      await pool!.query(
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
    if (!isDatabaseAvailable()) {
      console.warn("Database unavailable in getAllHeroesOfFaith. Using fallback empty result.");
      return [];
    }
    
    try {
      const { rows } = await pool!.query(
        `SELECT * FROM heroes_of_faith ORDER BY hero_id ASC`
      );
      
      if (!rows || !rows.length) return [];
      
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
      const { rows } = await pool!.query(
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
          sources: [],
          keyEvents: [],
          tags: [],
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

  async upsertHeroOfFaith(hero: HeroOfFaith): Promise<HeroOfFaith> {
    if (!isDatabaseAvailable()) return hero;
    await pool!.query(
      `INSERT INTO heroes_of_faith (hero_id, hero_data, created_at)
       VALUES ($1, $2, now())
       ON CONFLICT (hero_id) DO UPDATE SET hero_data = $2`,
      [hero.id, JSON.stringify(hero)],
    );
    return hero;
  }

  /**
   * Rows for people we now own under a different id.
   *
   * Matched by NAME, not by "anything not in the list": an admin can create a
   * hero through the API, and a blanket delete would take theirs too. This
   * only finds the old uuid-keyed rows for people the seed data now defines.
   */
  async findSupersededHeroes(keepIds: string[], names: string[]): Promise<string[]> {
    if (!isDatabaseAvailable() || names.length === 0) return [];
    const { rows } = await pool!.query(
      `SELECT hero_id FROM heroes_of_faith
       WHERE lower(hero_data->>'name') = ANY($1::text[])
         AND NOT (hero_id = ANY($2::text[]))`,
      [names.map((n) => n.toLowerCase()), keepIds],
    );
    return rows.map((r: { hero_id: string }) => r.hero_id);
  }

  async createHeroOfFaith(heroData: Omit<HeroOfFaith, "id" | "createdAt">): Promise<HeroOfFaith> {
    if (!isDatabaseAvailable()) {
      console.warn("Database unavailable in createHeroOfFaith. Cannot create hero, but returning memory instance.");
      // Create in-memory instance to allow app to continue working
      const id = uuidv4();
      const now = new Date();
      return {
        ...heroData,
        id,
        createdAt: now
      };
    }
    
    try {
      const id = uuidv4();
      const now = new Date();
      
      const hero: HeroOfFaith = {
        ...heroData,
        id,
        createdAt: now
      };
      
      // Create the table if it doesn't exist (helpful for deployment)
      await pool!.query(`
        CREATE TABLE IF NOT EXISTS heroes_of_faith (
          hero_id TEXT PRIMARY KEY,
          hero_data JSONB NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);
      
      await pool!.query(
        `INSERT INTO heroes_of_faith (hero_id, hero_data, created_at) 
         VALUES ($1, $2, $3)`,
        [id, JSON.stringify(hero), now]
      );
      
      return hero;
    } catch (error) {
      console.error("Error creating hero of faith:", error);
      throw new Error("Failed to create hero of faith. Please try again later.");
    }
  }

  async updateHeroOfFaith(id: string, updates: Partial<HeroOfFaith>): Promise<HeroOfFaith | undefined> {
    if (!isDatabaseAvailable()) {
      console.warn(`Database unavailable in updateHeroOfFaith(${id}). Cannot update hero.`);
      return undefined;
    }
    
    try {
      // Get current hero
      const hero = await this.getHeroOfFaithById(id);
      if (!hero) {
        console.warn(`Hero of faith not found: ${id}`);
        return undefined;
      }
      
      const updatedHero: HeroOfFaith = {
        ...hero,
        ...updates
      };
      
      await pool!.query(
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
    if (!isDatabaseAvailable()) {
      console.warn(`Database unavailable in deleteHeroOfFaith(${id}). Cannot delete hero.`);
      return false;
    }
    
    try {
      const result = await pool!.query(
        `DELETE FROM heroes_of_faith WHERE hero_id = $1 RETURNING hero_id`,
        [id]
      );
      
      return (result.rowCount || 0) > 0;
    } catch (error) {
      console.error(`Error deleting hero of faith with ID ${id}:`, error);
      return false;
    }
  }
  
  // Hero Stories Library methods
  async getAllHeroStories(heroId?: string): Promise<HeroStory[]> {
    try {
      let query = `SELECT * FROM hero_stories`;
      const params: any[] = [];
      
      if (heroId) {
        query += ` WHERE hero_id = $1`;
        params.push(heroId);
      }
      
      query += ` ORDER BY created_at DESC`;
      
      const { rows } = await pool!.query(query, params);
      
      if (!rows.length) return [];
      
      return rows.map(row => {
        try {
          // Handle the case where data might already be an object
          if (typeof row.story_data === 'object' && row.story_data !== null) {
            return heroStoryRow(row);
          }
          // Handle the string format with proper error handling
          return heroStoryRow(row);
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
    try {
      const { rows } = await pool!.query(
        `SELECT * FROM hero_stories WHERE story_id = $1`,
        [id]
      );
      
      if (!rows.length) return undefined;
      
      try {
        // Handle the case where data might already be an object
        if (typeof rows[0].story_data === 'object' && rows[0].story_data !== null) {
          return heroStoryRow(rows[0]);
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
      await pool!.query(`
        CREATE TABLE IF NOT EXISTS hero_stories (
          story_id TEXT PRIMARY KEY,
          hero_id TEXT NOT NULL,
          user_id INTEGER,
          story_data JSONB NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          is_featured BOOLEAN DEFAULT FALSE
        )
      `);
      
      await pool!.query(
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
    try {
      // First get the current story
      const story = await this.getHeroStoryById(id);
      if (!story) return undefined;
      
      const updatedStory: HeroStory = {
        ...story,
        ...updates
      };
      
      await pool!.query(
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
    try {
      const result = await pool!.query(
        `DELETE FROM hero_stories WHERE story_id = $1 RETURNING story_id`,
        [id]
      );
      
      return (result.rowCount || 0) > 0;
    } catch (error) {
      console.error(`Error deleting hero story with ID ${id}:`, error);
      return false;
    }
  }
  
  async toggleHeroStoryFeatured(id: string, isFeatured: boolean): Promise<HeroStory | undefined> {
    try {
      // First get the current story
      const story = await this.getHeroStoryById(id);
      if (!story) return undefined;
      
      const updatedStory: HeroStory = {
        ...story,
        isFeatured
      };
      
      await pool!.query(
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
