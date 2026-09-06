import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  jsonb,
  json,
  varchar,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { v4 as uuidv4 } from 'uuid';

// Enhanced user table with email verification
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  isVerified: boolean("is_verified").default(false).notNull(),
  isAdmin: boolean("is_admin").default(false).notNull(),
  verificationToken: text("verification_token"),
  resetPasswordToken: text("reset_password_token"),
  resetPasswordExpires: timestamp("reset_password_expires", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Verification tokens
export const verificationTokens = pgTable("verification_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  token: text("token").notNull(),
  type: text("type").notNull(), // 'email' or 'password'
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Every table the application touches is declared here.
//
// Previously only users and verification_tokens were declared, while the other
// seven existed solely as hand-written SQL in scripts/ensure-database.js and as
// lazy CREATE TABLE statements inside db-storage.ts. Those definitions drifted:
// the bootstrap created `characters` and `stories` which nothing ever read,
// while the app queried `user_characters` and `user_stories`, and `users` was
// created with 6 of its 13 columns. Declaring everything here makes this file
// the single source of truth, and lets verifyOrmSchema() in server/db.ts check
// all of it via getTableColumns() with no hand-maintained list to drift.
//
// Timestamps are standardised on timestamptz. Production had a mix, which was
// an accident of two hand-written bootstraps rather than a decision.
// ---------------------------------------------------------------------------

export const userCharacters = pgTable(
  "user_characters",
  {
    characterId: text("character_id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    characterData: jsonb("character_data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    userIdx: index("idx_user_characters_user_id").on(table.userId),
  }),
);

export const heroesOfFaith = pgTable("heroes_of_faith", {
  heroId: text("hero_id").primaryKey(),
  heroData: jsonb("hero_data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const userStories = pgTable(
  "user_stories",
  {
    storyId: text("story_id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    storyData: jsonb("story_data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    isFavorite: boolean("is_favorite").default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    // SET NULL, never cascade: deleting a hero must not delete the user's
    // stories that happen to reference it.
    heroId: text("hero_id").references(() => heroesOfFaith.heroId, {
      onDelete: "set null",
    }),
    // Which generation produced this story. SET NULL for the same reason as
    // heroId: generation_records is prunable operational data, user_stories is
    // not, so pruning records must never delete a story.
    //
    generationId: text("generation_id").references(
      () => generationRecords.generationId,
      { onDelete: "set null" },
    ),
  },
  (table) => ({
    userIdx: index("idx_user_stories_user_id").on(table.userId),
    heroIdx: index("idx_user_stories_hero_id").on(table.heroId),
    generationIdx: index("idx_user_stories_generation_id").on(table.generationId),
  }),
);

export const heroStories = pgTable(
  "hero_stories",
  {
    storyId: text("story_id").primaryKey(),
    heroId: text("hero_id")
      .notNull()
      .references(() => heroesOfFaith.heroId, { onDelete: "cascade" }),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    storyData: jsonb("story_data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    isFeatured: boolean("is_featured").default(false),
  },
  (table) => ({
    heroIdx: index("idx_hero_stories_hero_id").on(table.heroId),
  }),
);

export const songs = pgTable("songs", {
  songId: text("song_id").primaryKey(),
  songData: jsonb("song_data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const userUsage = pgTable("user_usage", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  count: integer("count").default(0),
  lastResetDate: timestamp("last_reset_date", { withTimezone: true }),
});

export const userSettings = pgTable("user_settings", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  openaiKey: text("openai_key"),
  openaiModel: text("openai_model"),
});

// One row per generation ATTEMPT, including attempts that never became a
// story. Kept as a separate table rather than columns on user_stories for two
// reasons: a failed attempt has no story to hang off, and stories are the
// user's data while records are operational telemetry with a different
// lifetime.
//
// SECURITY: this row is derived from ResolvedModel, which also carries apiKey
// and baseURL. Only the five descriptive fields below are ever copied across.
// Never spread `resolved` into this table -- it is one careless `...resolved`
// away from writing a live API key into the database.
export const generationRecords = pgTable(
  "generation_records",
  {
    generationId: text("generation_id").primaryKey(),
    // SET NULL rather than cascade: deleting a user must not silently delete
    // the record of what the models were doing.
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),

    // What was asked for.
    storyLength: text("story_length"),
    storyType: text("story_type"),
    readingLevel: text("reading_level"),
    targetWordCount: integer("target_word_count"),

    // Which AI produced it. These five are the whole of what may be copied
    // from ResolvedModel.
    model: text("model").notNull(),
    provider: text("provider").notNull(),
    tier: text("tier").notNull(),
    usingOwnKey: boolean("using_own_key").default(false).notNull(),
    downgradedFrom: text("downgraded_from"),

    // What happened.
    outcome: text("outcome").notNull(), // "succeeded" | "failed"
    failureCode: text("failure_code"), // StoryFailureCode, when it failed
    failureMessage: text("failure_message"),

    // Measurements. durationMs is wall clock for the whole attempt, so it
    // includes the image call and every retry.
    durationMs: integer("duration_ms"),
    actualWordCount: integer("actual_word_count"),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    totalTokens: integer("total_tokens"),
    modelCalls: integer("model_calls"),
    retriedCalls: integer("retried_calls"),
    truncatedCalls: integer("truncated_calls"),

    // Which build produced this row. Prompts are deliberately not stored (see
    // generationRecords.ts) and are only reconstructible from the request while
    // the prompt-building code is unchanged -- buildStoryBrief and the chapter
    // instruction both changed during stage 1, so a record from before that
    // cannot be reconstructed with today's code. Recording the build makes a
    // row's era knowable, and it cannot be added retroactively.
    appVersion: text("app_version"),

    // Per-chapter word counts, not just the total. The total says "81% of
    // target" and nothing more; the per-chapter numbers separated three
    // different causes with three different fixes when nemotron undershot.
    chapterWordCounts: jsonb("chapter_word_counts"),

    // The full debugData: prompts, raw replies, finish reasons, token usage
    // and parse errors. Capped before writing -- see recordGeneration().
    steps: jsonb("steps"),
  },
  (table) => ({
    userIdx: index("idx_generation_records_user_id").on(table.userId),
    createdIdx: index("idx_generation_records_created_at").on(table.createdAt),
    modelIdx: index("idx_generation_records_model").on(table.model),
    outcomeIdx: index("idx_generation_records_outcome").on(table.outcome),
  }),
);

// Owned and written by connect-pg-simple, never by the ORM. Declared only so
// migrations create it and verifyOrmSchema() checks it; db-storage.ts sets
// createTableIfMissing:false accordingly.
//
// These column types are copied from the pre-wipe production dump, which is
// what connect-pg-simple actually created: unbounded varchar, json (not jsonb),
// and timestamp(6) WITHOUT time zone. Do not "improve" them -- the library
// queries against these exact types.
export const session = pgTable(
  "session",
  {
    sid: varchar("sid").primaryKey(),
    sess: json("sess").notNull(),
    expire: timestamp("expire", { precision: 6 }).notNull(),
  },
  (table) => ({
    expireIdx: index("IDX_session_expire").on(table.expire),
  }),
);

// User schema for registration
export const registerUserSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

// Login schema
export const loginUserSchema = z.object({
  email: z.string().email("Please enter a valid email address").optional(),
  username: z.string().min(3, "Username must be at least 3 characters").optional(),
  password: z.string().min(1, "Password is required"),
}).refine(data => data.email || data.username, {
  message: "Either email or username is required",
  path: ["email"]
});

// Email verification schema
export const verifyEmailSchema = z.object({
  token: z.string().min(1, "Verification token is required"),
});

// Reset password request schema
export const resetPasswordRequestSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

// Reset password schema
export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  email: true,
  password: true,
  firstName: true,
  lastName: true,
  isVerified: true,
  isAdmin: true,
}).extend({
  verificationToken: z.string().optional(),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type RegisterUser = z.infer<typeof registerUserSchema>;
export type LoginUser = z.infer<typeof loginUserSchema>;
export type VerifyEmail = z.infer<typeof verifyEmailSchema>;
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;
export type ResetPassword = z.infer<typeof resetPasswordSchema>;

// Schema for character creation
export const characterSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Character name is required"),
  gender: z.enum(["boy", "girl"], {
    required_error: "Please select a gender",
    invalid_type_error: "Gender must be 'boy' or 'girl'",
  }),
  age: z.number().int().min(5).max(12).default(8),
  hair: z.string().default("brown"),
  eyes: z.string().default("brown"),
  favoriteColor: z.string().default("blue"),
  specialPower: z.string().optional(),
  favoriteAnimal: z.string().optional(),
  hobby: z.string().optional(),
  timeTravelExperience: z.number().int().min(0).max(10).default(0),
  personality: z.string().optional(),
  createdAt: z.string(), // ISO date string
});

export type Character = z.infer<typeof characterSchema>;

// Schema for story generation with optional fields
export const storyRequestSchema = z.object({
  // Fields that are conditionally required based on useTimeTravel
  childName: z.string().min(1, "Character name is required").optional(),
  gender: z.enum(["boy", "girl"], {
    invalid_type_error: "Gender must be 'boy' or 'girl'",
  }).optional(),
  // Optional fields with defaults or optional values
  animal: z.string().default("").optional(),
  useAnimal: z.boolean().default(true), // Toggle for including animal in story
  theme: z.string().default(""),
  biblicalEvent: z.string().default(""),
  heroOfFaith: z.string().default("").optional(),
  useTimeTravel: z.boolean().default(false),
  characterId: z.string().optional(),
  storyType: z.enum(["regular", "poem", "moral", "biblical_narrative"]).default("regular"),
  customPrompt: z.string().default("").optional(),
  biblePassage: z.string().default("").optional(), // Bible passage to study
  historicalAccuracy: z.boolean().default(true).optional(), // Toggle for historical accuracy
  learningFocus: z.string().default("").optional(), // Focus area for historical/educational stories
  // New fields for reading level and story length
  readingLevel: z.enum([
    "preschool", 
    "kindergarten", 
    "early-elementary", 
    "late-elementary", 
    "middle-school"
  ]).default("early-elementary"),
  storyLength: z.enum([
    "very-short",
    "short", 
    "medium", 
    "long", 
    "extended"
  ]).default("medium"),
  // Custom prompts for Parent Mode
  customSystemPrompt: z.string().optional(),
  customUserPrompt: z.string().optional(),
  useCustomPrompts: z.boolean().default(false),
  // Character details for both time travel and regular stories
  useCharacter: z.boolean().default(false), // Toggle for including custom character in any story type
  characterDetails: z.object({
    age: z.number().int().min(3).max(14).optional(),
    hair: z.string().optional(),
    eyes: z.string().optional(),
    favoriteColor: z.string().optional(),
    specialPower: z.string().optional(),
    hobby: z.string().optional(),
    personality: z.string().optional(),
    favoriteAnimal: z.string().optional(),
  }).optional(),
}).refine((data) => {
  // Biblical narrative doesn't require a child character
  if (data.storyType === "biblical_narrative") {
    return true;
  }
  
  // If time travel is enabled, characterId is required
  if (data.useTimeTravel) {
    return !!data.characterId;
  }
  
  // If custom character is enabled for any story type, characterDetails is required
  if (data.useCharacter) {
    return !!data.characterDetails;
  }
  
  // If characterId is provided, it overrides the need for childName and gender
  if (data.characterId) {
    return true;
  }
  
  // If characterId not provided, time travel is disabled, useCharacter is disabled, and it's not a biblical narrative, childName and gender are required
  return !!data.childName && !!data.gender;
}, {
  message: "You can select a character for any story type. If no character is selected, the child's name and gender are required (except for Biblical narratives).",
  path: ["characterId"]
});

export type StoryRequest = z.infer<typeof storyRequestSchema>;

// Schema for story response
export const storyResponseSchema = z.object({
  title: z.string(),
  content: z.string(),
  moralOutcome: z.enum(["positive", "learning", "consequences", "creative"]),
  bibleVerse: z.object({
    text: z.string(),
    reference: z.string(),
  }).optional(),
  applicationQuestions: z.array(z.string()).min(5).max(5),
  imagePrompt: z.string().optional(),
  imageUrl: z.string().optional(),
  // Debug entries as the generator actually emits them. Every field is
  // optional except `step`, because the entries differ per call site --
  // the outline step has no wordCount, a chapter step has no targetWordCount,
  // and so on.
  //
  // This previously required systemPrompt/userPrompt/attempt/maxAttempts/
  // timestamp/maxTokens and had no `step` at all. That described an older
  // generator; the current one pushes { step, prompt, response, wordCount }
  // (openai-implementation.ts:109) and DebugPanel reads `step` as required.
  // The mismatch was invisible because nothing typechecked until recently.
  debugData: z.array(z.object({
    step: z.string(),
    prompt: z.string().optional(),
    response: z.string().optional(),
    wordCount: z.number().optional(),
    targetWordCount: z.number().optional(),
    model: z.string().optional(),
    // Older shapes, kept so previously-saved stories still parse.
    systemPrompt: z.string().optional(),
    userPrompt: z.string().optional(),
    attempt: z.number().optional(),
    maxAttempts: z.number().optional(),
    timestamp: z.string().optional(),
    maxTokens: z.union([z.number(), z.string()]).optional(),
    parseError: z.string().optional(),
  })).optional(),
});

export type StoryResponse = z.infer<typeof storyResponseSchema>;

// Schema for saved stories with enhanced search metadata
export const savedStorySchema = z.object({
  id: z.string(),
  story: storyResponseSchema,
  request: storyRequestSchema,
  createdAt: z.string(), // ISO date string
  isFavorite: z.boolean().default(false),
  expiresAt: z.string().optional(), // ISO date string
  
  // Search and relationship metadata
  heroId: z.string().optional(), // ID of the Hero of Faith if story is related to one
  searchMetadata: z.object({
    keywords: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    characters: z.array(z.string()).optional(),
    biblicalReferences: z.array(z.string()).optional(),
    themes: z.array(z.string()).optional(),
  }).optional().default({
    keywords: [],
    tags: [],
    characters: [],
    biblicalReferences: [],
    themes: []
  }),
});

export type SavedStory = z.infer<typeof savedStorySchema>;

// Schema for songs with chord diagrams
export const chordDiagramSchema = z.object({
  name: z.string(),
  fingering: z.object({
    string1: z.number(),
    string2: z.number(),
    string3: z.number(),
    string4: z.number(),
    string5: z.number(),
    string6: z.number(),
  }),
  barres: z.array(z.object({
    fromString: z.number(),
    toString: z.number(),
    fret: z.number(),
  })).optional(),
  position: z.number().optional(),
});

export type ChordDiagram = z.infer<typeof chordDiagramSchema>;

// Verse schema with lyrics and chords
export const verseSchema = z.object({
  lyrics: z.array(z.string()),
  chords: z.array(z.string())
});

export type Verse = z.infer<typeof verseSchema>;

// Music note schema for tablature/notation
export const musicNoteSchema = z.object({
  time: z.number(),  // position in song (milliseconds or beats)
  note: z.string(),  // musical note (e.g., "C4", "D#3")
  duration: z.number(),  // duration of note
  instrument: z.string().default("guitar"),
  position: z.object({
    string: z.number().optional(),  // for guitar: which string (1-6)
    fret: z.number().optional(),    // for guitar: which fret
  }).optional(),
});

export type MusicNote = z.infer<typeof musicNoteSchema>;

// Updated song schema with audio support
export const songSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string().optional(),
  verses: z.array(verseSchema),
  chorus: verseSchema.nullable(),
  bridge: verseSchema.nullable(),
  chords: z.array(chordDiagramSchema).default([]),
  audioUrl: z.string().optional(),  // URL to audio file
  hasGeneratedAudio: z.boolean().default(false),
  musicNotes: z.array(musicNoteSchema).optional(),  // For playable sheet music/tablature
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).default("beginner"),
  key: z.string().default("C"),  // Musical key
  timeSignature: z.string().default("4/4"),
  tempo: z.number().default(120),  // BPM
  tags: z.array(z.string()).default([]),
  backgroundColor: z.string().optional(),
  createdAt: z.date().or(z.string()).transform(val => 
    typeof val === 'string' ? new Date(val) : val
  ).default(() => new Date()),
  updatedAt: z.date().or(z.string()).transform(val => 
    typeof val === 'string' ? new Date(val) : val
  ).default(() => new Date()),
});

export type Song = z.infer<typeof songSchema>;

// Schema for Heroes of Faith
export const heroOfFaithSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  timePeriod: z.string(),
  contribution: z.string(),
  imageUrl: z.string().optional(),
  birthYear: z.string().optional(),
  deathYear: z.string().optional(),
  famousQuote: z.string().optional(),
  bibleVerse: z.object({
    text: z.string(),
    reference: z.string(),
  }).optional(),
  sources: z.array(z.object({
    title: z.string(),
    author: z.string().optional(),
    url: z.string().optional(),
    description: z.string().optional(),
    type: z.enum(["book", "article", "website", "documentary", "other"]).default("other"),
  })).optional().default([]),
  keyEvents: z.array(z.object({
    year: z.string(),
    description: z.string()
  })).optional().default([]),
  createdAt: z.date().or(z.string()).transform(val => 
    typeof val === 'string' ? new Date(val) : val
  ),
});

export type HeroOfFaith = z.infer<typeof heroOfFaithSchema>;

// Schema for Hero Stories Library
export const heroStorySchema = z.object({
  id: z.string(),
  heroId: z.string(),
  title: z.string(),
  content: z.string(),
  isHistoricallyAccurate: z.boolean().default(true),
  sources: z.array(z.object({
    title: z.string(),
    author: z.string().optional(),
    url: z.string().optional(),
  })).optional().default([]),
  bibleVerse: z.object({
    text: z.string(),
    reference: z.string(),
  }),
  createdAt: z.string(), // ISO date string
  createdBy: z.number().optional(), // User ID
  isFeatured: z.boolean().default(false),
});

export type HeroStory = z.infer<typeof heroStorySchema>;
