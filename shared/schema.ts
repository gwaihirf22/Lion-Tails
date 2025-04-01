import { pgTable, text, serial, integer, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
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
  resetPasswordExpires: timestamp("reset_password_expires"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Verification tokens
export const verificationTokens = pgTable("verification_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  token: text("token").notNull(),
  type: text("type").notNull(), // 'email' or 'password'
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
  bibleVerse: z.object({
    text: z.string(),
    reference: z.string(),
  }),
  imagePrompt: z.string().optional(),
  imageUrl: z.string().optional(),
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

// Updated song schema
export const songSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string(),
  verses: z.array(verseSchema),
  chorus: verseSchema.nullable(),
  bridge: verseSchema.nullable(),
  chords: z.array(chordDiagramSchema),
  backgroundColor: z.string().optional(),
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
