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

// Schema for story generation
export const storyRequestSchema = z.object({
  childName: z.string().min(1, "Child's name is required"),
  animal: z.string().min(1, "Favorite animal is required"),
  theme: z.string().min(1, "Theme is required"),
  biblicalEvent: z.string().optional(),
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
});

export type StoryResponse = z.infer<typeof storyResponseSchema>;

// Schema for songs
export const songSchema = z.object({
  id: z.string(),
  title: z.string(),
  lyrics: z.array(z.object({
    text: z.string(),
    chord: z.string().optional(),
  })),
  chords: z.array(z.string()),
  backgroundColor: z.string().optional(),
});

export type Song = z.infer<typeof songSchema>;
