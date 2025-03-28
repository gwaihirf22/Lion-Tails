import { pgTable, text, serial, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

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
  animal: z.string().default("lion").optional(),
  theme: z.string().default("faith"),
  biblicalEvent: z.string().default("none"),
  useTimeTravel: z.boolean().default(false),
  characterId: z.string().optional(),
  storyType: z.enum(["regular", "poem", "moral"]).default("regular"),
  characterDetails: z.object({
    age: z.number().int().min(5).max(12).optional(),
    hair: z.string().optional(),
    eyes: z.string().optional(),
    favoriteColor: z.string().optional(),
    specialPower: z.string().optional(),
    hobby: z.string().optional(),
    personality: z.string().optional(),
  }).optional(),
}).refine((data) => {
  // If time travel is enabled, characterId is required
  if (data.useTimeTravel) {
    return !!data.characterId;
  }
  // If time travel is disabled, childName and gender are required
  return !!data.childName && !!data.gender;
}, {
  message: "Character selection is required for time travel mode. Child's name and gender are required otherwise.",
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

// Schema for saved stories
export const savedStorySchema = z.object({
  id: z.string(),
  story: storyResponseSchema,
  request: storyRequestSchema,
  createdAt: z.string(), // ISO date string
  isFavorite: z.boolean().default(false),
  expiresAt: z.string().optional(), // ISO date string
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
