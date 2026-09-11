import type { EditLogEntry } from "@shared/editLog";
import {
  storyAllowance, users, type User, type InsertUser, type Song, type SavedStory, type GeneratedPicture, type StoryResponse, type StoryRequest, type Character, type HeroOfFaith, type HeroStory ,
  type ReadingPrefs,
} from "@shared/schema";
import { v4 as uuidv4 } from 'uuid';
import session from 'express-session';
import createMemoryStore from 'memorystore';

const MemoryStore = createMemoryStore(session);

/**
 * A story as handed to saveStory.
 *
 * Two facts ride on the story object rather than becoming extra parameters:
 * `generationId`, and the chapter `outline`. That is deliberate and the
 * reason is recorded in db-storage.saveStory -- the optional `heroId`
 * parameter "is exactly why hero_id is NULL on nearly every row:
 * DbStorage.saveStory silently omits it and the caller cannot tell."
 *
 * Naming them here rather than reaching for them through a cast at each site
 * means the signature says what it accepts, and a future carried field has an
 * obvious place to be declared.
 */
export type StoryToSave = StoryResponse & {
  generationId?: string;
  /** The chapter plan. Absent for single-call generations: very-short prose
   *  and every poem. */
  outline?: string[];
};

export interface IStorage {
  // Session store for authentication
  sessionStore: session.Store;

  // User authentication methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<User>): Promise<User | undefined>;

  // User verification methods
  verifyUser(userId: number): Promise<boolean>;
  createVerificationToken(userId: number, tokenType: 'email' | 'password'): Promise<string>;
  getVerificationToken(token: string): Promise<{userId: number, type: string, expiresAt: Date} | undefined>;
  deleteVerificationToken(token: string): Promise<boolean>;

  // User stories methods
  getUserStories(userId: number): Promise<SavedStory[]>;
  /**
   * Every stored story REQUEST for this user, newest first, and nothing else.
   *
   * For counting how many quests a character has already been on, at enqueue.
   * getUserStories would answer the same question and read every story BODY
   * to do it -- megabytes, per generation, to count a handful of rows.
   *
   * Requests rather than a COUNT in SQL on purpose: which stories are quests,
   * and who is in them, are answered by characterRoleOf() and
   * characterIdsOf(), the two helpers that know characterRole/useTimeTravel
   * and characterIds/characterId are each one fact under two names. A jsonb
   * predicate would be a second copy of both, and the older spelling is
   * exactly what it would miss.
   */
  getStoryRequests(userId: number): Promise<StoryRequest[]>;

  /**
   * Character methods. EVERY ONE TAKES THE OWNER.
   *
   * Not a convenience: an id alone is a uuid a user can hold from a previous
   * session or read off a URL, and these rows belong to somebody. The three
   * by-id routes carried a commented-out ownership check for months --
   * "in the future, we should check ownership" -- because Character has no
   * userId to compare against, so the check had nothing to say. Making the
   * owner a required argument means an unscoped read or write cannot be
   * expressed, rather than being possible and remembered against.
   *
   * The scoping is in the SQL, not only in the caller, which also removes the
   * gap between reading a character to check it and writing it back.
   */
  getAllCharacters(userId: number): Promise<Character[]>;
  getCharacterById(id: string, userId: number): Promise<Character | undefined>;
  createCharacter(character: Omit<Character, "id" | "createdAt">, userId: number): Promise<Character>;
  updateCharacter(id: string, userId: number, character: Partial<Character>): Promise<Character | undefined>;
  deleteCharacter(id: string, userId: number): Promise<boolean>;

  // Song related methods
  getAllSongs(): Promise<Song[]>;
  getSongById(id: string): Promise<Song | undefined>;
  createSong(song: Song): Promise<Song>;

  // Story related methods
  getAllStories(userId?: number): Promise<SavedStory[]>;
  getStoryById(id: string, userId?: number): Promise<SavedStory | undefined>;
  saveStory(story: StoryToSave, request: StoryRequest, userId: number, heroId?: string): Promise<SavedStory>;
  toggleFavorite(id: string, isFavorite: boolean, userId: number): Promise<SavedStory | undefined>;
  deleteStory(id: string, userId: number): Promise<boolean>;
  updateStoryHeroId(storyId: string, heroId: string, userId: number): Promise<SavedStory | undefined>;
  /**
   * Attach an illustration to a story that was saved without one.
   *
   * imageUrl lives ONLY inside story_data -- there is no column for it -- so
   * unlike hero_id there is no risk here of writing the same fact twice. See
   * the note on updateStoryHeroId.
   */
  /**
   * The chosen picture and the gallery it came from, written together.
   *
   * One method rather than two, because they are one fact: a picture that is
   * in the gallery and not selected, or selected and not in the gallery, is a
   * story with a broken picture and nothing to say so. `imageUrl: null`
   * removes the key -- the last picture deleted leaves a story with none.
   */
  setStoryImages(
    storyId: string,
    userId: number,
    next: { imageUrl: string | null; images: GeneratedPicture[] },
  ): Promise<SavedStory | undefined>;
  /**
   * A parent's edit to the title and/or text, with an entry appended to the
   * story's edit log. The patch carries only the keys being changed.
   */
  editStory(
    storyId: string,
    patch: { title?: string; content?: string },
    userId: number,
  ): Promise<SavedStory | undefined>;
  
  // Story search methods
  searchStories(query: string, userId?: number): Promise<SavedStory[]>;
  searchStoriesByName(name: string, userId?: number): Promise<SavedStory[]>;
  searchStoriesByBiblePassage(passage: string, userId?: number): Promise<SavedStory[]>;
  searchStoriesByTopic(topic: string, userId?: number): Promise<SavedStory[]>;
  searchStoriesByTags(tags: string[], userId?: number): Promise<SavedStory[]>;
  getStoriesByHeroId(heroId: string, userId?: number): Promise<SavedStory[]>;

  // Heroes of Faith related methods
  getAllHeroesOfFaith(): Promise<HeroOfFaith[]>;
  getHeroOfFaithById(id: string): Promise<HeroOfFaith | undefined>;
  createHeroOfFaith(hero: Omit<HeroOfFaith, "id" | "createdAt">): Promise<HeroOfFaith>;
  /**
   * Write a hero AT ITS OWN ID, creating or replacing.
   *
   * createHeroOfFaith generates a uuid, which is why the seed could only ever
   * run against an empty table: there was no stable identity to update. With
   * slugs there is, so seeding becomes idempotent and adding a person to the
   * data file actually reaches a database that already has rows.
   */
  upsertHeroOfFaith(hero: HeroOfFaith): Promise<HeroOfFaith>;
  /** Hero ids that exist in storage but are not in the given set. */
  findSupersededHeroes(keepIds: string[], names: string[]): Promise<string[]>;
  updateHeroOfFaith(id: string, hero: Partial<HeroOfFaith>): Promise<HeroOfFaith | undefined>;
  deleteHeroOfFaith(id: string): Promise<boolean>;

  // Hero Stories library methods
  getAllHeroStories(heroId?: string): Promise<HeroStory[]>;
  getHeroStoryById(id: string): Promise<HeroStory | undefined>;
  getHeroStoriesByHeroId(heroId: string): Promise<HeroStory[]>;
  createHeroStory(story: Omit<HeroStory, "id" | "createdAt">, userId?: number): Promise<HeroStory>;
  updateHeroStory(id: string, updates: Partial<HeroStory>): Promise<HeroStory | undefined>;
  deleteHeroStory(id: string): Promise<boolean>;
  toggleHeroStoryFeatured(id: string, isFeatured: boolean): Promise<HeroStory | undefined>;

  // Usage tracking per user
  /**
   * The story allowance is READ through storyAllowance() and moved by
   * applyStoryTopUp() below. The five methods that used to be here --
   * get/increment/resetStoryGenerationCount, get/setLastResetDate -- are gone
   * because every one of them was dead: the real increment is raw SQL inside
   * the worker's finishing transaction (storyWorker.ts), which is where it has
   * to be to share that transaction, and the two endpoints that read the rest
   * were collapsed into one. A storage method that LOOKS like the counter and
   * is not is worse than no method at all.
   */
  /**
   * Forgive the months this account is owed, once.
   *
   * Replaces resetStoryGenerationCount on the live path. That one was a blind
   * "count = 0, last_reset_date = now" with no guard, so two concurrent calls
   * both fired and each pushed the date forward again -- granting a month that
   * had not passed. This advances the date by EXACTLY the months it applied,
   * so calling it twice for the same instant is a no-op.
   */
  applyStoryTopUp(userId: number, now?: Date): Promise<{ count: number; lastResetDate: Date | null }>;
  /** Avatars this account has ever generated. Lifetime; nothing resets it. */
  getAvatarCount(userId: number): Promise<number>;
  /**
   * Spend one avatar generation, but only if there is one left.
   *
   * Returns false when the cap is already reached. The check and the charge
   * are ONE statement on purpose: two requests arriving together would both
   * pass a separate "are they under the cap" read and both then increment,
   * which is how a hard cap becomes a soft one. Pass Infinity for a user who
   * is not capped.
   */
  chargeAvatarGeneration(userId: number, limit: number): Promise<boolean>;
  /**
   * Give back an avatar generation that was charged and then did not happen.
   *
   * Never below zero: a refund for something that was not charged would mint
   * an allowance out of nothing.
   */
  refundAvatarGeneration(userId: number): Promise<void>;


  // User settings
  getUserOpenAIKey(userId: number): Promise<string | null>;
  setUserOpenAIKey(userId: number, key: string): Promise<void>;
  getUserOpenAIModel(userId: number): Promise<string | null>;
  setUserOpenAIModel(userId: number, model: string): Promise<void>;
  /**
   * How this user likes to read. One pair for all four axes, not four pairs.
   *
   * The SETTER returns the persisted row read back rather than void, on
   * purpose: this app keeps serving from MemStorage when the database is
   * unavailable, so a successful call proves nothing about what was stored.
   * Returning what is actually there lets the client render truth.
   */
  getUserReadingPrefs(userId: number): Promise<Partial<ReadingPrefs>>;
  setUserReadingPrefs(userId: number, prefs: Partial<ReadingPrefs>): Promise<Partial<ReadingPrefs>>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private characters: Map<string, Character>;
  private songs: Map<string, Song>;
  private stories: Map<string, SavedStory>;
  private heroesOfFaith: Map<string, HeroOfFaith>;
  private heroStories: Map<string, HeroStory>;
  private verificationTokens: Map<string, {userId: number, type: string, expiresAt: Date}>;
  private userStoryGenerationCounts: Map<number, number>;
  /** Lifetime, unlike the story counter above: resetStoryGenerationCount does not touch it. */
  private userAvatarCounts: Map<number, number> = new Map();
  private userLastResetDates: Map<number, Date>;
  private userOpenAIKeys: Map<number, string>;
  private userOpenAIModels: Map<number, string>;
  private userReadingPrefs: Map<number, Partial<ReadingPrefs>>;
  private userCharacters: Map<number, Set<string>>;
  private userStories: Map<number, Set<string>>;
  sessionStore: session.Store;
  currentId: number;

  constructor() {
    // Create memory store for sessions
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000 // prune expired entries every 24h
    });
    this.users = new Map();
    this.characters = new Map();
    this.songs = new Map();
    this.stories = new Map();
    this.heroesOfFaith = new Map();
    this.heroStories = new Map();
    this.verificationTokens = new Map();
    this.userStoryGenerationCounts = new Map();
    this.userLastResetDates = new Map();
    this.userOpenAIKeys = new Map();
    this.userOpenAIModels = new Map();
    this.userReadingPrefs = new Map();
    this.userCharacters = new Map();
    this.userStories = new Map();
    this.currentId = 1;
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email === email,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentId++;
    const now = new Date();

    // Create a new user with default values
    const user: User = { 
      ...insertUser, 
      id,
      isVerified: insertUser.isVerified !== undefined ? insertUser.isVerified : false,
      isAdmin: insertUser.isAdmin !== undefined ? insertUser.isAdmin : false,
      createdAt: now,
      updatedAt: now,
      // Initialize nullable fields
      firstName: insertUser.firstName || null,
      lastName: insertUser.lastName || null,
      verificationToken: insertUser.verificationToken || null,
      resetPasswordToken: null,
      resetPasswordExpires: null
    };

    this.users.set(id, user);

    // Initialize user-specific collections
    this.userCharacters.set(id, new Set());
    this.userStories.set(id, new Set());
    this.userStoryGenerationCounts.set(id, 0);

    return user;
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User | undefined> {
    const user = await this.getUser(id);
    if (!user) return undefined;

    const updatedUser = {
      ...user,
      ...updates,
      updatedAt: new Date()
    };

    this.users.set(id, updatedUser);
    return updatedUser;
  }

  // Verification methods
  async verifyUser(userId: number): Promise<boolean> {
    const user = await this.getUser(userId);
    if (!user) return false;

    const verifiedUser = {
      ...user,
      isVerified: true,
      updatedAt: new Date()
    };

    this.users.set(userId, verifiedUser);
    return true;
  }

  async createVerificationToken(userId: number, tokenType: 'email' | 'password'): Promise<string> {
    // Generate a random token
    const token = Array.from(Array(32), () => Math.floor(Math.random() * 36).toString(36)).join('');

    // Set expiry to 24 hours from now
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // Store token
    this.verificationTokens.set(token, {
      userId,
      type: tokenType,
      expiresAt
    });

    return token;
  }

  async getVerificationToken(token: string): Promise<{userId: number, type: string, expiresAt: Date} | undefined> {
    const tokenData = this.verificationTokens.get(token);

    // Check if token exists and is not expired
    if (tokenData && tokenData.expiresAt > new Date()) {
      return tokenData;
    }

    // If token is expired, delete it
    if (tokenData) {
      this.verificationTokens.delete(token);
    }

    return undefined;
  }

  async deleteVerificationToken(token: string): Promise<boolean> {
    return this.verificationTokens.delete(token);
  }

  // User stories method
  async getUserStories(userId: number): Promise<SavedStory[]> {
    const userStoryIds = this.userStories.get(userId) || new Set();
    const stories = Array.from(userStoryIds)
      .map(id => this.stories.get(id))
      .filter(story => !!story) as SavedStory[];

    // Filter out expired stories that are not favorites
    const now = new Date();
    const validStories = stories.filter(story => {
      if (story.isFavorite) return true;
      if (!story.expiresAt) return true;
      const expiryDate = new Date(story.expiresAt);
      return expiryDate > now;
    });

    return validStories.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  // Character related methods
  async getAllCharacters(userId?: number): Promise<Character[]> {
    if (userId) {
      // Get characters for a specific user
      const userCharacterIds = this.userCharacters.get(userId) || new Set();
      const characters = Array.from(userCharacterIds)
        .map(id => this.characters.get(id))
        .filter(character => !!character) as Character[];

      return characters.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } else {
      // Get all characters (admin function)
      return Array.from(this.characters.values()).sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }
  }

  async getCharacterById(id: string, userId: number): Promise<Character | undefined> {
    if (!this.userCharacters.get(userId)?.has(id)) return undefined;
    return this.characters.get(id);
  }

  async createCharacter(characterData: Omit<Character, "id" | "createdAt">, userId: number): Promise<Character> {
    const id = uuidv4();
    const now = new Date();

    const character: Character = {
      ...characterData,
      id,
      createdAt: now.toISOString()
    };

    this.characters.set(id, character);

    // Add to user's characters
    const userCharacters = this.userCharacters.get(userId) || new Set();
    userCharacters.add(id);
    this.userCharacters.set(userId, userCharacters);

    return character;
  }

  async updateCharacter(
    id: string,
    userId: number,
    updates: Partial<Character>,
  ): Promise<Character | undefined> {
    if (!this.userCharacters.get(userId)?.has(id)) return undefined;
    const character = this.characters.get(id);
    if (!character) return undefined;

    const updatedCharacter: Character = {
      ...character,
      ...updates
    };

    this.characters.set(id, updatedCharacter);
    return updatedCharacter;
  }

  async deleteCharacter(id: string, userId: number): Promise<boolean> {
    const owned = this.userCharacters.get(userId);
    if (!owned?.has(id)) return false;

    owned.delete(id);
    return this.characters.delete(id);
  }

  // Song methods
  async getAllSongs(): Promise<Song[]> {
    return Array.from(this.songs.values());
  }

  async getSongById(id: string): Promise<Song | undefined> {
    return this.songs.get(id);
  }

  async createSong(song: Song): Promise<Song> {
    const songWithId = song.id ? song : { ...song, id: uuidv4() };
    this.songs.set(songWithId.id, songWithId);
    return songWithId;
  }

  // Story methods
  async getAllStories(userId?: number): Promise<SavedStory[]> {
    // If userId is provided, get only that user's stories
    if (userId) {
      return this.getUserStories(userId);
    }

    // Otherwise, get all stories (admin function)
    const now = new Date();
    const validStories = Array.from(this.stories.values()).filter(story => {
      if (story.isFavorite) return true;
      if (!story.expiresAt) return true;
      const expiryDate = new Date(story.expiresAt);
      return expiryDate > now;
    });

    return validStories.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getStoryById(id: string, userId?: number): Promise<SavedStory | undefined> {
    const story = this.stories.get(id);

    // If userId is provided, check if the story belongs to the user
    if (userId && story) {
      const userStories = this.userStories.get(userId);
      if (!userStories || !userStories.has(id)) {
        return undefined; // Story doesn't belong to this user
      }
    }

    return story;
  }

  async saveStory(story: StoryToSave, request: StoryRequest, userId: number, heroId?: string): Promise<SavedStory> {
    const id = uuidv4();
    const now = new Date();

    // Set expiry to 1 year from now
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);

    // Generate search metadata from the story and request
    const keywords: string[] = [];
    const tags: string[] = [];
    const characters: string[] = [];
    const biblicalReferences: string[] = [];
    const themes: string[] = [];

    // Extract child's name and gender if present
    if (request.childName) {
      characters.push(request.childName);
      keywords.push(request.childName);
    }
    if (request.gender) {
      tags.push(request.gender);
    }

    // Add animal if present
    if (request.animal && request.animal !== "None" && request.useAnimal) {
      keywords.push(request.animal);
    }

    // Add theme if present
    if (request.theme && request.theme !== "None") {
      themes.push(request.theme);
      keywords.push(request.theme);
    }

    // Add biblical event if present
    if (request.biblicalEvent && request.biblicalEvent !== "None") {
      tags.push("biblical event");
      keywords.push(request.biblicalEvent);
      biblicalReferences.push(request.biblicalEvent);
    }

    // Add specific Hero of Faith if present
    if (request.heroOfFaith && request.heroOfFaith !== "None") {
      characters.push(request.heroOfFaith);
      keywords.push(request.heroOfFaith);
      tags.push("hero of faith");
    }

    // Add Bible verse reference
    if (story.bibleVerse && story.bibleVerse.reference) {
      biblicalReferences.push(story.bibleVerse.reference);
    }

    // Add story title to keywords
    keywords.push(story.title);

    // Add custom prompt if present
    if (request.customPrompt) {
      const promptWords = request.customPrompt.split(/\s+/).filter(word => word.length > 4);
      keywords.push(...promptWords.slice(0, 5)); // Add up to 5 significant words from custom prompt
    }

    // Add story type
    if (request.storyType) {
      tags.push(request.storyType);
    }

    const savedStory: SavedStory = {
      id,
      story,
      request,
      createdAt: now.toISOString(),
      isFavorite: false,
      expiresAt: expiryDate.toISOString(),
      heroId, // Link to Hero of Faith if provided
      // Read off the story object, exactly as DbStorage does, so the two
      // implementations cannot disagree about where this fact lives. They have
      // already diverged once -- searchMetadata is populated here and written
      // as five empty arrays by DbStorage.
      ...(story.outline ? { outline: story.outline } : {}),
      searchMetadata: {
        keywords,
        tags,
        characters,
        biblicalReferences,
        themes
      }
    };

    this.stories.set(id, savedStory);

    // Add to user's stories
    const userStories = this.userStories.get(userId) || new Set();
    userStories.add(id);
    this.userStories.set(userId, userStories);

    return savedStory;
  }

  async toggleFavorite(id: string, isFavorite: boolean, userId: number): Promise<SavedStory | undefined> {
    // Check if story belongs to the user
    const userStories = this.userStories.get(userId);
    if (!userStories || !userStories.has(id)) {
      return undefined;
    }

    const story = this.stories.get(id);
    if (!story) return undefined;

    const updatedStory: SavedStory = {
      ...story,
      isFavorite,
      // Remove expiry date if it's now a favorite
      expiresAt: isFavorite ? undefined : story.expiresAt
    };

    this.stories.set(id, updatedStory);
    return updatedStory;
  }

  async deleteStory(id: string, userId: number): Promise<boolean> {
    // Check if story belongs to the user
    const userStories = this.userStories.get(userId);
    if (!userStories || !userStories.has(id)) {
      return false;
    }

    // Remove from user's stories
    userStories.delete(id);

    // Remove from storage
    return this.stories.delete(id);
  }
  
  async getStoryRequests(userId: number): Promise<StoryRequest[]> {
    return (await this.getUserStories(userId)).map((s) => s.request);
  }

  async setStoryImages(
    storyId: string,
    userId: number,
    next: { imageUrl: string | null; images: GeneratedPicture[] },
  ): Promise<SavedStory | undefined> {
    // getStoryById already does the user-scoping check, so ownership is
    // enforced in one place rather than re-derived here.
    const story = await this.getStoryById(storyId, userId);
    if (!story) return undefined;
    const { imageUrl: _dropped, ...rest } = story.story;
    const updated = {
      ...story,
      images: next.images,
      story: next.imageUrl ? { ...story.story, imageUrl: next.imageUrl } : rest,
    };
    this.stories.set(storyId, updated);
    return updated;
  }

  async editStory(
    storyId: string,
    patch: { title?: string; content?: string },
    userId: number,
  ): Promise<SavedStory | undefined> {
    const story = await this.getStoryById(storyId, userId);
    if (!story) return undefined;
    const entry: EditLogEntry = {
      at: new Date().toISOString(),
      by: "parent",
      changed: Object.keys(patch),
    };
    const updated: SavedStory = {
      ...story,
      story: { ...story.story, ...patch },
      editLog: [...(story.editLog ?? []), entry],
    };
    this.stories.set(storyId, updated);
    return updated;
  }

  async updateStoryHeroId(storyId: string, heroId: string, userId: number): Promise<SavedStory | undefined> {
    // Check if story belongs to the user
    const userStories = this.userStories.get(userId);
    if (!userStories || !userStories.has(storyId)) {
      return undefined;
    }
    
    // Get the story
    const story = this.stories.get(storyId);
    if (!story) return undefined;
    
    // Update the heroId field
    const updatedStory: SavedStory = {
      ...story,
      heroId
    };
    
    // If story doesn't already have the hero in keywords, add it
    if (updatedStory.searchMetadata) {
      const hero = this.heroesOfFaith.get(heroId);
      if (hero) {
        // Ensure all arrays exist before trying to modify them
        if (!updatedStory.searchMetadata.keywords) {
          updatedStory.searchMetadata.keywords = [];
        }
        if (!updatedStory.searchMetadata.characters) {
          updatedStory.searchMetadata.characters = [];
        }
        if (!updatedStory.searchMetadata.tags) {
          updatedStory.searchMetadata.tags = [];
        }
        
        // Add hero's name to keywords and characters if not already there
        if (!updatedStory.searchMetadata.keywords.includes(hero.name)) {
          updatedStory.searchMetadata.keywords.push(hero.name);
        }
        if (!updatedStory.searchMetadata.characters.includes(hero.name)) {
          updatedStory.searchMetadata.characters.push(hero.name);
        }
        // Add "hero of faith" tag if not already there
        if (!updatedStory.searchMetadata.tags.includes("hero of faith")) {
          updatedStory.searchMetadata.tags.push("hero of faith");
        }
      }
    }
    
    // Save the updated story
    this.stories.set(storyId, updatedStory);
    
    console.log(`Associated story ${storyId} with hero ${heroId}`);
    
    return updatedStory;
  }

  // Search methods implementation
  async searchStories(query: string, userId?: number): Promise<SavedStory[]> {
    // Get all stories for this user (or all stories if no userId)
    const allStories = userId ? await this.getUserStories(userId) : Array.from(this.stories.values());
    
    // Normalize query for case-insensitive search
    const normalizedQuery = query.toLowerCase();
    
    // Filter stories based on the query
    return allStories.filter(story => {
      // Search in title
      if (story.story.title.toLowerCase().includes(normalizedQuery)) {
        return true;
      }
      
      // Search in content
      if (story.story.content.toLowerCase().includes(normalizedQuery)) {
        return true;
      }
      
      // Search in metadata
      if (story.searchMetadata) {
        // Search in keywords
        if (story.searchMetadata.keywords?.some(keyword => 
          keyword.toLowerCase().includes(normalizedQuery)
        )) {
          return true;
        }
        
        // Search in tags
        if (story.searchMetadata.tags?.some(tag => 
          tag.toLowerCase().includes(normalizedQuery)
        )) {
          return true;
        }
        
        // Search in characters
        if (story.searchMetadata.characters?.some(character => 
          character.toLowerCase().includes(normalizedQuery)
        )) {
          return true;
        }
        
        // Search in biblical references
        if (story.searchMetadata.biblicalReferences?.some(reference => 
          reference.toLowerCase().includes(normalizedQuery)
        )) {
          return true;
        }
        
        // Search in themes
        if (story.searchMetadata.themes?.some(theme => 
          theme.toLowerCase().includes(normalizedQuery)
        )) {
          return true;
        }
      }
      
      return false;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  
  async searchStoriesByName(name: string, userId?: number): Promise<SavedStory[]> {
    // Get all stories for this user (or all stories if no userId)
    const allStories = userId ? await this.getUserStories(userId) : Array.from(this.stories.values());
    
    // Normalize name for case-insensitive search
    const normalizedName = name.toLowerCase();
    
    // Filter stories that include the name in their characters or request
    return allStories.filter(story => {
      // Check in child name from request
      if (story.request.childName && 
          story.request.childName.toLowerCase().includes(normalizedName)) {
        return true;
      }
      
      // Check in metadata characters list
      if (story.searchMetadata?.characters?.some(character => 
        character.toLowerCase().includes(normalizedName)
      )) {
        return true;
      }
      
      return false;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  
  async searchStoriesByBiblePassage(passage: string, userId?: number): Promise<SavedStory[]> {
    // Get all stories for this user (or all stories if no userId)
    const allStories = userId ? await this.getUserStories(userId) : Array.from(this.stories.values());
    
    // Normalize passage for case-insensitive search
    const normalizedPassage = passage.toLowerCase();
    
    // Filter stories with matching Bible passages
    return allStories.filter(story => {
      // Check in the bibleVerse reference
      if (story.story.bibleVerse?.reference &&
          story.story.bibleVerse.reference.toLowerCase().includes(normalizedPassage)) {
        return true;
      }
      
      // Check in metadata biblical references
      if (story.searchMetadata?.biblicalReferences?.some(reference => 
        reference.toLowerCase().includes(normalizedPassage)
      )) {
        return true;
      }
      
      // Check in story content (might contain Bible references)
      if (story.story.content.toLowerCase().includes(normalizedPassage)) {
        return true;
      }
      
      return false;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  
  async searchStoriesByTopic(topic: string, userId?: number): Promise<SavedStory[]> {
    // Get all stories for this user (or all stories if no userId)
    const allStories = userId ? await this.getUserStories(userId) : Array.from(this.stories.values());
    
    // Normalize topic for case-insensitive search
    const normalizedTopic = topic.toLowerCase();
    
    // Filter stories with matching topics/themes
    return allStories.filter(story => {
      // Check in story theme
      if (story.request.theme && 
          story.request.theme.toLowerCase().includes(normalizedTopic)) {
        return true;
      }
      
      // Check in metadata themes
      if (story.searchMetadata?.themes?.some(theme => 
        theme.toLowerCase().includes(normalizedTopic)
      )) {
        return true;
      }
      
      // Check in metadata keywords
      if (story.searchMetadata?.keywords?.some(keyword => 
        keyword.toLowerCase().includes(normalizedTopic)
      )) {
        return true;
      }
      
      return false;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  
  async searchStoriesByTags(tags: string[], userId?: number): Promise<SavedStory[]> {
    // Get all stories for this user (or all stories if no userId)
    const allStories = userId ? await this.getUserStories(userId) : Array.from(this.stories.values());
    
    // Normalize tags for case-insensitive search
    const normalizedTags = tags.map(tag => tag.toLowerCase());
    
    // Filter stories with matching tags
    return allStories.filter(story => {
      // If the story has no tags, it doesn't match
      if (!story.searchMetadata?.tags || story.searchMetadata.tags.length === 0) {
        return false;
      }
      
      // Check if any of the story's tags match any of the search tags
      const storyTags = story.searchMetadata.tags.map(tag => tag.toLowerCase());
      return normalizedTags.some(tag => storyTags.includes(tag));
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  
  async getStoriesByHeroId(heroId: string, userId?: number): Promise<SavedStory[]> {
    // Get all stories for this user (or all stories if no userId)
    const allStories = userId ? await this.getUserStories(userId) : Array.from(this.stories.values());
    
    // Filter stories related to the specific hero
    return allStories.filter(story => {
      // Check if story has the heroId directly
      if (story.heroId === heroId) {
        return true;
      }
      
      // Check if story request mentioned this hero
      if (story.request.heroOfFaith) {
        // Get the hero to compare by name
        const hero = this.heroesOfFaith.get(heroId);
        if (hero && story.request.heroOfFaith === hero.name) {
          return true;
        }
      }
      
      return false;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  // Usage tracking methods



  async applyStoryTopUp(userId: number, now: Date = new Date()) {
    const count = this.userStoryGenerationCounts.get(userId) ?? 0;
    const lastResetDate = this.userLastResetDates.get(userId) ?? null;
    const { toppedUpCount, monthsOwed } = storyAllowance({ count, lastResetDate }, now);
    if (monthsOwed === 0) return { count, lastResetDate };
    const advanced = new Date(lastResetDate!.getFullYear(), lastResetDate!.getMonth() + monthsOwed, 1);
    this.userStoryGenerationCounts.set(userId, toppedUpCount);
    this.userLastResetDates.set(userId, advanced);
    return { count: toppedUpCount, lastResetDate: advanced };
  }

  async getAvatarCount(userId: number): Promise<number> {
    return this.userAvatarCounts.get(userId) || 0;
  }

  async chargeAvatarGeneration(userId: number, limit: number): Promise<boolean> {
    const used = this.userAvatarCounts.get(userId) || 0;
    if (used >= limit) return false;
    this.userAvatarCounts.set(userId, used + 1);
    return true;
  }

  async refundAvatarGeneration(userId: number): Promise<void> {
    const used = this.userAvatarCounts.get(userId) || 0;
    this.userAvatarCounts.set(userId, Math.max(0, used - 1));
  }



  // User settings methods
  async getUserOpenAIKey(userId: number): Promise<string | null> {
    return this.userOpenAIKeys.get(userId) || null;
  }

  async setUserOpenAIKey(userId: number, key: string): Promise<void> {
    this.userOpenAIKeys.set(userId, key);
  }

  async getUserOpenAIModel(userId: number): Promise<string | null> {
    // null means "never chosen" -- resolveModel then applies the policy
    // default. Returning a model name here made this a seventh model list.
    return this.userOpenAIModels.get(userId) ?? null;
  }

  async setUserOpenAIModel(userId: number, model: string): Promise<void> {
    this.userOpenAIModels.set(userId, model);
  }

  async getUserReadingPrefs(userId: number): Promise<Partial<ReadingPrefs>> {
    return this.userReadingPrefs.get(userId) ?? {};
  }

  async setUserReadingPrefs(
    userId: number,
    prefs: Partial<ReadingPrefs>,
  ): Promise<Partial<ReadingPrefs>> {
    // Merged, not replaced -- a partial update must never clear a sibling.
    const merged = { ...(this.userReadingPrefs.get(userId) ?? {}), ...prefs };
    this.userReadingPrefs.set(userId, merged);
    return merged;
  }

  // Heroes of Faith methods
  async getAllHeroesOfFaith(): Promise<HeroOfFaith[]> {
    return Array.from(this.heroesOfFaith.values()).sort((a, b) => {
      // Sort by name alphabetically
      return a.name.localeCompare(b.name);
    });
  }

  async getHeroOfFaithById(id: string): Promise<HeroOfFaith | undefined> {
    return this.heroesOfFaith.get(id);
  }

  async upsertHeroOfFaith(hero: HeroOfFaith): Promise<HeroOfFaith> {
    this.heroesOfFaith.set(hero.id, hero);
    return hero;
  }

  async findSupersededHeroes(keepIds: string[], names: string[]): Promise<string[]> {
    const keep = new Set(keepIds);
    const owned = new Set(names.map((n) => n.toLowerCase()));
    return Array.from(this.heroesOfFaith.values())
      .filter((h) => !keep.has(h.id) && owned.has(h.name.toLowerCase()))
      .map((h) => h.id);
  }

  async createHeroOfFaith(heroData: Omit<HeroOfFaith, "id" | "createdAt">): Promise<HeroOfFaith> {
    const id = uuidv4();
    const now = new Date();

    const hero: HeroOfFaith = {
      ...heroData,
      id,
      createdAt: now
    };

    this.heroesOfFaith.set(id, hero);
    return hero;
  }

  async updateHeroOfFaith(id: string, updates: Partial<HeroOfFaith>): Promise<HeroOfFaith | undefined> {
    const hero = this.heroesOfFaith.get(id);
    if (!hero) return undefined;

    const updatedHero: HeroOfFaith = {
      ...hero,
      ...updates
    };

    this.heroesOfFaith.set(id, updatedHero);
    return updatedHero;
  }

  async deleteHeroOfFaith(id: string): Promise<boolean> {
    return this.heroesOfFaith.delete(id);
  }

  // Hero Stories library methods
  async getAllHeroStories(heroId?: string): Promise<HeroStory[]> {
    if (heroId) {
      return this.getHeroStoriesByHeroId(heroId);
    }

    return Array.from(this.heroStories.values()).sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getHeroStoryById(id: string): Promise<HeroStory | undefined> {
    return this.heroStories.get(id);
  }

  async getHeroStoriesByHeroId(heroId: string): Promise<HeroStory[]> {
    const stories = Array.from(this.heroStories.values())
      .filter(story => story.heroId === heroId);

    return stories.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async createHeroStory(storyData: Omit<HeroStory, "id" | "createdAt">, userId?: number): Promise<HeroStory> {
    const id = uuidv4();
    const now = new Date();

    const story: HeroStory = {
      ...storyData,
      id,
      createdAt: now.toISOString(),
      createdBy: userId
    };

    this.heroStories.set(id, story);
    return story;
  }

  async updateHeroStory(id: string, updates: Partial<HeroStory>): Promise<HeroStory | undefined> {
    const story = this.heroStories.get(id);
    if (!story) return undefined;

    const updatedStory: HeroStory = {
      ...story,
      ...updates
    };

    this.heroStories.set(id, updatedStory);
    return updatedStory;
  }

  async deleteHeroStory(id: string): Promise<boolean> {
    return this.heroStories.delete(id);
  }

  async toggleHeroStoryFeatured(id: string, isFeatured: boolean): Promise<HeroStory | undefined> {
    const story = this.heroStories.get(id);
    if (!story) return undefined;

    const updatedStory: HeroStory = {
      ...story,
      isFeatured
    };

    this.heroStories.set(id, updatedStory);
    return updatedStory;
  }
}

import { DbStorage } from './db-storage';

let storageInstance: IStorage | null = null;

// Helper function to safely initialize DbStorage
function initializeDbStorage(): IStorage {
  try {
    if (process.env.DATABASE_URL) {
      console.log("Initializing database storage with DATABASE_URL");
      return new DbStorage();
    } else {
      console.log("DATABASE_URL not found, using in-memory storage");
    }
  } catch (error) {
    console.error("Failed to initialize database storage:", error);
    console.log("Falling back to memory storage");
    // Log more detailed error information for debugging
    if (error instanceof Error) {
      console.error("Error details:", {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
    }
  }
  
  console.log("Using in-memory storage (data will be lost on restart)");
  return new MemStorage();
}

// Use DbStorage if DATABASE_URL is set, otherwise fallback to MemStorage
// Singleton pattern to ensure we only create the storage once
export const storage = (() => {
  if (!storageInstance) {
    try {
      storageInstance = initializeDbStorage();
      console.log("Storage initialization successful");
    } catch (fatalError) {
      console.error("Fatal error during storage initialization:", fatalError);
      console.error("Using emergency in-memory fallback storage");
      storageInstance = new MemStorage();
    }
  }
  return storageInstance;
})();