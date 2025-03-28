import { users, type User, type InsertUser, type Song, type SavedStory, type StoryResponse, type StoryRequest, type Character, type HeroOfFaith } from "@shared/schema";
import { v4 as uuidv4 } from 'uuid';

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Character related methods
  getAllCharacters(): Promise<Character[]>;
  getCharacterById(id: string): Promise<Character | undefined>;
  createCharacter(character: Omit<Character, "id" | "createdAt">): Promise<Character>;
  updateCharacter(id: string, character: Partial<Character>): Promise<Character | undefined>;
  deleteCharacter(id: string): Promise<boolean>;
  
  // Song related methods
  getAllSongs(): Promise<Song[]>;
  getSongById(id: string): Promise<Song | undefined>;
  createSong(song: Song): Promise<Song>;
  
  // Story related methods
  getAllStories(): Promise<SavedStory[]>;
  getStoryById(id: string): Promise<SavedStory | undefined>;
  saveStory(story: StoryResponse, request: StoryRequest): Promise<SavedStory>;
  toggleFavorite(id: string, isFavorite: boolean): Promise<SavedStory | undefined>;
  deleteStory(id: string): Promise<boolean>;
  
  // Heroes of Faith related methods
  getAllHeroesOfFaith(): Promise<HeroOfFaith[]>;
  getHeroOfFaithById(id: string): Promise<HeroOfFaith | undefined>;
  createHeroOfFaith(hero: Omit<HeroOfFaith, "id" | "createdAt">): Promise<HeroOfFaith>;
  updateHeroOfFaith(id: string, hero: Partial<HeroOfFaith>): Promise<HeroOfFaith | undefined>;
  deleteHeroOfFaith(id: string): Promise<boolean>;
  
  // Usage tracking
  getStoryGenerationCount(): Promise<number>;
  incrementStoryGenerationCount(): Promise<number>;
  resetStoryGenerationCount(): Promise<void>;
  getLastResetDate(): Promise<Date | null>;
  setLastResetDate(date: Date): Promise<void>;
  
  // User settings
  getUserOpenAIKey(): Promise<string | null>;
  setUserOpenAIKey(key: string): Promise<void>;
  getUserOpenAIModel(): Promise<string | null>;
  setUserOpenAIModel(model: string): Promise<void>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private characters: Map<string, Character>;
  private songs: Map<string, Song>;
  private stories: Map<string, SavedStory>;
  private heroesOfFaith: Map<string, HeroOfFaith>;
  private storyGenerationCount: number;
  private lastResetDate: Date | null;
  private userOpenAIKey: string | null;
  private userOpenAIModel: string | null;
  currentId: number;

  constructor() {
    this.users = new Map();
    this.characters = new Map();
    this.songs = new Map();
    this.stories = new Map();
    this.heroesOfFaith = new Map();
    this.storyGenerationCount = 0;
    this.lastResetDate = null;
    this.userOpenAIKey = null;
    this.userOpenAIModel = 'gpt-4o'; // Default to the newest model
    this.currentId = 1;
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Character related methods
  async getAllCharacters(): Promise<Character[]> {
    return Array.from(this.characters.values()).sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getCharacterById(id: string): Promise<Character | undefined> {
    return this.characters.get(id);
  }

  async createCharacter(characterData: Omit<Character, "id" | "createdAt">): Promise<Character> {
    const id = uuidv4();
    const now = new Date();
    
    const character: Character = {
      ...characterData,
      id,
      createdAt: now.toISOString()
    };
    
    this.characters.set(id, character);
    return character;
  }

  async updateCharacter(id: string, updates: Partial<Character>): Promise<Character | undefined> {
    const character = this.characters.get(id);
    if (!character) return undefined;
    
    const updatedCharacter: Character = {
      ...character,
      ...updates
    };
    
    this.characters.set(id, updatedCharacter);
    return updatedCharacter;
  }

  async deleteCharacter(id: string): Promise<boolean> {
    return this.characters.delete(id);
  }

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
  
  async getAllStories(): Promise<SavedStory[]> {
    // Filter out expired stories that are not favorites
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
  
  async getStoryById(id: string): Promise<SavedStory | undefined> {
    return this.stories.get(id);
  }
  
  async saveStory(story: StoryResponse, request: StoryRequest): Promise<SavedStory> {
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
    
    this.stories.set(id, savedStory);
    return savedStory;
  }
  
  async toggleFavorite(id: string, isFavorite: boolean): Promise<SavedStory | undefined> {
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
  
  async deleteStory(id: string): Promise<boolean> {
    return this.stories.delete(id);
  }
  
  // Usage tracking methods
  async getStoryGenerationCount(): Promise<number> {
    return this.storyGenerationCount;
  }
  
  async incrementStoryGenerationCount(): Promise<number> {
    this.storyGenerationCount += 1;
    return this.storyGenerationCount;
  }
  
  async resetStoryGenerationCount(): Promise<void> {
    this.storyGenerationCount = 0;
    this.lastResetDate = new Date();
  }
  
  async getLastResetDate(): Promise<Date | null> {
    return this.lastResetDate;
  }
  
  async setLastResetDate(date: Date): Promise<void> {
    this.lastResetDate = date;
  }
  
  // User settings methods
  async getUserOpenAIKey(): Promise<string | null> {
    return this.userOpenAIKey;
  }
  
  async setUserOpenAIKey(key: string): Promise<void> {
    this.userOpenAIKey = key;
  }
  
  async getUserOpenAIModel(): Promise<string | null> {
    return this.userOpenAIModel;
  }
  
  async setUserOpenAIModel(model: string): Promise<void> {
    this.userOpenAIModel = model;
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
}

export const storage = new MemStorage();
