import { editLogEntrySchema } from "./editLog";
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
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { v4 as uuidv4 } from 'uuid';
import { CHARACTER_CATEGORIES } from "./characterVocab";

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

/**
 * A set of stories that share continuity.
 *
 * One summary per universe. The summary is what the next story is written
 * against, so it is the mechanism that lets story 12 stay consistent with
 * story 3 without putting 30,000 words in a prompt.
 */
export const storyUniverses = pgTable(
  "story_universes",
  {
    universeId: text("universe_id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),

    summary: text("summary"),
    summaryUpdatedAt: timestamp("summary_updated_at", { withTimezone: true }),
    /** Last manual Parent Mode edit, which is a different thing from a rebuild. */
    summaryEditedAt: timestamp("summary_edited_at", { withTimezone: true }),
    summaryModel: text("summary_model"),
    /**
     * Fingerprint of what the summary covers. THE staleness mechanism.
     *
     * A story count breaks on delete, and a timestamp watermark breaks on MOVE
     * -- a story moved into a universe has a created_at below the watermark, so
     * the universe would report itself current while holding unsummarised
     * material. Moving stories between universes is a requirement, so that is
     * the version that would ship and be quietly wrong.
     */
    summaryInputsHash: text("summary_inputs_hash"),
    /** How many stories were read in full, and how many the previous summary stood in for. */
    summaryCoveredCount: integer("summary_covered_count"),
    summaryDroppedCount: integer("summary_dropped_count"),

    /**
     * Facts that must never be summarised away, as an array of
     * { id, text, sourceStoryId?, createdAt, status }.
     *
     * Capped (see storyUniverses.ts) and that cap is the design: an uncapped
     * canon list is a second summary that nothing compresses. Held here rather
     * than in a table because it is always read and written whole with its
     * universe, never queried by predicate, and editing the summary and its
     * canon together should be one UPDATE rather than a transaction.
     */
    pinnedCanon: jsonb("pinned_canon").default([]).notNull(),

    /**
     * What the world remembers, extracted after each story in a series.
     *
     * WorldEntry[] -- see server/lib/worldState.ts for the shape and the merge
     * rules. Separate from pinned_canon on purpose: canon is human-curated and
     * capped at 20 because "an uncapped canon list is a second summary that
     * nothing compresses", while this is machine-maintained, larger, and its
     * entries are revised rather than only added -- a character falls ill, a
     * thread is resolved.
     *
     * jsonb because it is always read and written whole with its universe, and
     * because entries carry a kind and a status that a column set would have
     * to model as a second table for no benefit.
     */
    worldState: jsonb("world_state").default([]).notNull(),
    /**
     * What a parent changed by hand -- the name, the summary -- and when.
     * jsonb for the same reasons as world_state: read and written whole with
     * its universe, appended never rewritten. summary_edited_at stays: it
     * clears staleness, which is a different job from telling the reader.
     */
    editLog: jsonb("edit_log").default([]).notNull(),
  },
  (table) => ({
    userIdx: index("idx_story_universes_user_id").on(table.userId),
    nameUnique: uniqueIndex("idx_story_universes_user_name").on(table.userId, table.name),
  }),
);

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
    // SET NULL, never cascade -- same reasoning as heroId above. Deleting a
    // universe must drop its stories to "Unassigned", not delete the user's
    // stories along with the folder they happened to be in.
    universeId: text("universe_id").references(() => storyUniverses.universeId, {
      onDelete: "set null",
    }),
  },
  (table) => ({
    userIdx: index("idx_user_stories_user_id").on(table.userId),
    heroIdx: index("idx_user_stories_hero_id").on(table.heroId),
    generationIdx: index("idx_user_stories_generation_id").on(table.generationId),
    universeIdx: index("idx_user_stories_universe_id").on(table.universeId),
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
  /**
   * Avatar images this account has ever generated. NEVER reset.
   *
   * It sits in this table because this is where per-user counters live, but it
   * is a different kind of number from the one above it: `count` is spending
   * against a story allowance that applyStoryTopUp() forgives a month at a
   * time, and this is a lifetime total that nothing forgives. Adding it here
   * rather than as a jsonb
   * blob follows the argument already made in this file for named columns --
   * and it survives the reset for free, because that statement sets `count`
   * by name and never touches anything else.
   *
   * Lifetime, not live: see MAX_FREE_AVATARS in modelPolicy for why a cap on
   * how many a user currently has would be farmable.
   */
  avatarCount: integer("avatar_count").default(0).notNull(),
});

export const userSettings = pgTable("user_settings", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  openaiKey: text("openai_key"),
  openaiModel: text("openai_model"),
  // How this user likes to READ. Four discrete columns rather than one jsonb
  // blob: verifyOrmSchema() checks columns and cannot see inside a blob, a
  // typo'd key in a blob is invisible, and a named column is greppable. The
  // cost -- a migration for a fifth preference -- is the right cost in a repo
  // whose documented failure mode is parallel and opaque definitions.
  //
  // All nullable with NO SQL default. NULL means "never chosen" and the client
  // applies the app default, which is what makes backfill a non-event.
  readerPalette: text("reader_palette"),
  readerFont: text("reader_font"),
  readerTypeset: text("reader_typeset"),
  readerFontStep: integer("reader_font_step"),
});

/**
 * Reading preferences: four independent axes.
 *
 * The reader previously had ONE axis -- eight bundled "themes" -- doing four
 * jobs badly, which is why "turn the classical feel off" was not expressible.
 * Splitting them means palette is purely about eye strain, font is purely about
 * face, and the classical ornaments are a single switch.
 *
 * Font is orthogonal to typeset ON PURPOSE: bundled, "I want the accessible
 * font" would silently also mean "no drop cap", making an accessibility choice
 * cost a feature the user liked.
 */
export const READER_PALETTES = ["paper", "sepia", "night", "contrast"] as const;
export const READER_FONTS = ["literata", "ebgaramond", "atkinson", "lexend", "system"] as const;
export const READER_TYPESETS = ["classic", "plain"] as const;

/** Text size as an integer STEP, not a px value, so the scale below can be
 *  retuned later without migrating a single stored row. */
export const READER_FONT_STEPS = [16, 17, 18, 20, 22, 25, 28] as const;

export const readingPrefsSchema = z.object({
  palette: z.enum(READER_PALETTES).default("paper"),
  font: z.enum(READER_FONTS).default("literata"),
  typeset: z.enum(READER_TYPESETS).default("classic"),
  fontStep: z.number().int().min(0).max(READER_FONT_STEPS.length - 1).default(2),
});
export type ReadingPrefs = z.infer<typeof readingPrefsSchema>;
export const READING_PREFS_DEFAULTS: ReadingPrefs = readingPrefsSchema.parse({});

// One row per generation REQUEST, which the client polls. Distinct from
// generation_records (one row per attempt): a job may be claimed several times
// -- a container restart mid-story is a new attempt at the same job -- and a job
// is prunable operational state where a record is kept.
//
// The job REFERENCES a story rather than becoming one. user_stories has its own
// lifecycle (favourite, expiry, hero association) and outlives the job that
// produced it.
export const storyJobs = pgTable(
  "story_jobs",
  {
    jobId: text("job_id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /**
     * story | summary.
     *
     * A summary is a job rather than a parallel mechanism, so it inherits the
     * SKIP LOCKED claim, the lease-as-resume, the eviction defence, the
     * heartbeat, cancel, polling and the 409 conflict. Defaulted so every
     * existing row is correct with no backfill.
     */
    kind: text("kind").notNull().default("story"),
    /** Set for summary jobs only. CASCADE: a job is prunable, a universe is not. */
    universeId: text("universe_id").references(() => storyUniverses.universeId, {
      onDelete: "cascade",
    }),

    // queued | running | succeeded | failed | cancelled
    status: text("status").notNull().default("queued"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),

    // The brief is FROZEN at enqueue. resolveStoryCharacter() reads the
    // database at generation time, so a character deleted mid-story would leave
    // chapters 5-7 written against a different brief than 1-4.
    request: jsonb("request").notNull(),
    brief: text("brief").notNull(),
    systemPrompt: text("system_prompt").notNull(),
    targetWordCount: integer("target_word_count").notNull(),
    // The model the user had selected AT ENQUEUE. Recorded for display and
    // diagnosis -- it is deliberately NOT what the worker runs.
    //
    // The worker calls resolveModel() afresh at claim time and uses that. The
    // model is therefore re-decided, not pinned, and that is the point: model,
    // provider and credentials are one decision (decisions.md Â§2), and pinning
    // the model while re-resolving only the key would let a user select a
    // premium model with their own key, delete the key, and have the job run
    // that premium model on the owner's account. Entitlement has to be
    // rechecked on the same side of the line as the credentials.
    //
    // The BRIEF freezes because it describes what was asked for. Entitlement
    // does not freeze, because it describes what is currently permitted.
    //
    // Never store apiKey or baseURL. See generationRecords.ts.
    model: text("model").notNull(),

    // The lease IS the resume mechanism. An orphaned job is exactly
    // status='running' AND lease_expires_at < now(), and the claim query treats
    // that as claimable. Storing "interrupted" as a state would require the
    // write to come from the process that just died.
    workerId: text("worker_id"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),

    // Two counters, deliberately. attemptCount rises on every claim and guards
    // against a runaway; errorCount rises only on application errors. Without
    // the split, three deploys during a long generation would burn a retry
    // budget meant for model failures. An interruption is not a failure.
    attemptCount: integer("attempt_count").default(0).notNull(),
    errorCount: integer("error_count").default(0).notNull(),

    // Checkpoint. Written after the outline and after every chapter: one small
    // UPDATE buying back a paid 20-90s API call. Finer is impossible -- a
    // single completion is not resumable.
    step: text("step"),
    outline: jsonb("outline"),
    chapters: jsonb("chapters"),

    // Cooperative cancel, checked at step boundaries. Cancelling during
    // chapter 4 still pays for chapter 4.
    cancelRequested: boolean("cancel_requested").default(false).notNull(),

    storyId: text("story_id"),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
  },
  (table) => ({
    userIdx: index("idx_story_jobs_user_id").on(table.userId),
    statusIdx: index("idx_story_jobs_status").on(table.status),
    // The claim query orders queued jobs by age; the reaper scans running jobs
    // by lease expiry. Both hit this.
    claimIdx: index("idx_story_jobs_claim").on(table.status, table.leaseExpiresAt),
    /**
     * At most one active summary per universe, enforced by Postgres rather than
     * by an application check that two clicks could race past.
     */
    oneActiveSummary: uniqueIndex("idx_story_jobs_one_active_summary")
      .on(table.universeId)
      .where(sql`kind = 'summary' AND status IN ('queued','running')`),
  }),
);

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

    // The job this attempt belongs to, when it came from one. SET NULL so
    // pruning finished jobs never deletes the statistics they produced.
    jobId: text("job_id").references(() => storyJobs.jobId, {
      onDelete: "set null",
    }),
    /**
     * story | summary. Without it the admin stats average two unrelated
     * workloads -- different token profiles, different word-count semantics.
     * Not recording summaries at all would be worse: a failing summary would be
     * invisible to telemetry.
     */
    kind: text("kind").notNull().default("story"),

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

/**
 * Text a user chose, or nothing at all.
 *
 * An empty box is not a value. Storing "" makes isSet() checks throughout the
 * brief guard against two things instead of one, and a present-but-blank key
 * reads as "they answered" when they did not.
 */
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .transform((v) => v?.trim() || undefined);

/**
 * A character: a child, an animal, a dragon, a robot.
 *
 * VALIDATED ON WRITE ONLY. Reads return the stored blob untouched
 * (db-storage.ts getAllCharacters/getCharacterById), which is the whole
 * backward-compatibility mechanism: a row written before any field below
 * existed cannot fail. Do NOT add .parse() to a read path -- the first row that
 * predates a future field would 500 the Characters page for that user.
 *
 * NOTHING HERE IS DEFAULTED except by explicit user choice. CharacterForm once
 * defaulted hair to brown, eyes to brown and hobby to reading, so every
 * character silently claimed them and every story dutifully mentioned them.
 * The comment that survived beside favoriteAnimal -- "defaulting it put a lion
 * in every story nobody asked for" -- was right about all of them.
 */
/**
 * Pictures one character may keep at once.
 *
 * Not the same number as the free allowance: that counts generations for the
 * lifetime of an ACCOUNT and is about money, this bounds what one character
 * holds and is about the UI and the row size. Deleting a picture frees a slot
 * here and refunds nothing there, which is the point -- otherwise
 * delete-and-regenerate would be free.
 */
/* ------------------------------------------------------------------------
 * The free story allowance.
 *
 * ONE PAIR OF NUMBERS AND ONE FUNCTION, because there were five restatements
 * of 50 and 10 and four different meanings of "a month". The two endpoints
 * that reported it were exact inverses: /api/story/usage called the total 60
 * when there was no reset date, /api/stats/story-generation called it 60 when
 * there was one. The pill on Create Story computed max(0, 10 - count) against
 * a LIFETIME count, so it read 0 for anyone past ten stories while the server
 * happily let them run to fifty.
 * --------------------------------------------------------------------- */

/**
 * What GET /api/story/usage returns.
 *
 * Declared here so both screens and the route agree by construction. The pill
 * used to read `limit` and `nextReset` off an untyped res.json(), so when the
 * shape moved nothing failed -- it just rendered undefined.
 */
export type StoryUsage = {
  used: number;
  remaining: number;
  total: number;
  perMonth: number;
  lastReset: string | null;
  nextTopUp: string;
};

/** Where everyone starts, and the ceiling a top-up can never carry them past. */
export const FREE_STORIES = 50;
/** Added at the start of each calendar month, up to FREE_STORIES. */
export const FREE_STORIES_PER_MONTH = 10;

/** Whole calendar months from a to b. Negative if b is earlier. */
function monthsBetween(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

/** The first moment of the month n months after d. */
function startOfMonthAfter(d: Date, n = 1): Date {
  // Built from year/month directly. The old code did setMonth(+1) then
  // setDate(1), which from 31 January gives 1 MARCH -- the intermediate date
  // overflows before the day is pinned.
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

/**
 * What this account may still spend, and when it next gets more.
 *
 * A BALANCE THAT TOPS UP, not an allowance that refills. Everyone starts with
 * FREE_STORIES; each calendar month forgives FREE_STORIES_PER_MONTH of what
 * they have used, and it stops at zero used. So a heavy user gets ten a month
 * after the first fifty and a light user simply sits at fifty -- which is the
 * rule Blake asked for, and the reason a full monthly refill is wrong.
 *
 * Expressed as forgiving `count` rather than as a stored balance so that the
 * existing column keeps its meaning and nothing needs migrating.
 *
 * PURE. Every screen and the enforcement path call this, so if it is wrong it
 * is wrong everywhere at once rather than differently in five places -- which
 * is the state it replaces.
 */
export function storyAllowance(
  usage?: { count?: number | null; lastResetDate?: Date | string | null } | null,
  now: Date = new Date(),
): {
  used: number;
  remaining: number;
  total: number;
  /** What `count` becomes once the months owed have been forgiven. */
  toppedUpCount: number;
  /** Whole months of top-up owed since lastResetDate. Zero means nothing to do. */
  monthsOwed: number;
  nextTopUp: Date;
} {
  const raw = Math.max(0, usage?.count ?? 0);
  const last = usage?.lastResetDate ? new Date(usage.lastResetDate) : null;

  // No reset date means nothing has been charged yet, so nothing is owed.
  const monthsOwed = last ? Math.max(0, monthsBetween(last, now)) : 0;
  const used = Math.max(0, raw - monthsOwed * FREE_STORIES_PER_MONTH);

  return {
    used,
    // Clamped both ways: a row written before the ceiling was lowered, or by an
    // admin, can carry a count above it, and "-3 remaining" is not a thing.
    remaining: Math.max(0, FREE_STORIES - used),
    total: FREE_STORIES,
    toppedUpCount: used,
    monthsOwed,
    nextTopUp: startOfMonthAfter(last && monthsOwed === 0 ? last : now),
  };
}

export const MAX_AVATARS = 5;

/**
 * Pictures one story keeps.
 *
 * A redraw does not throw the old one away -- "the chances are that the old
 * one may be better than the last with AI" -- so a story collects pictures the
 * way a character collects portraits, and the one on the page is the one that
 * was chosen. Past the cap a new picture is REFUSED and the answer says to
 * delete one, because silently dropping the oldest is exactly the automatic
 * discard this exists to stop.
 *
 * TWELVE, not the five a character keeps, because these are not all the same
 * job any more: one is the picture at the end, and the rest are the pictures
 * IN the story. Twelve is a picture every few paragraphs of a long story --
 * a picture book rather than an illustration -- and at roughly 1.9MB each it
 * is about 23MB for a heavily drawn story in the story_images volume. A
 * character has one face and needs no such range.
 */
export const MAX_STORY_IMAGES = 12;

/**
 * One generated picture: what it is, and what made it.
 *
 * Shared by a character's portraits and a story's illustrations, because they
 * are the same fact in two places and drifted apart would be two shapes for
 * one thing.
 */
export const generatedPictureSchema = z.object({
  id: z.string(),
  url: z.string(),
  /** What made it. Reused verbatim, and shown to nobody. */
  prompt: z.string(),
  createdAt: z.string(),
});

export type GeneratedPicture = z.infer<typeof generatedPictureSchema>;

/**
 * WHERE a picture belongs in the story it was drawn for.
 *
 * A QUOTE FIRST AND A POSITION SECOND, which is the web-annotation shape and
 * the only one that survives what this app does to a story. The reader's
 * blocks have no identity at all -- `StoryContent` keys them by array index
 * and `parseStoryContent` rebuilds the array from scratch whenever the text
 * changes -- and a parent edit rewrites the whole body through a textarea
 * with no concurrency control anywhere on the path. An index alone would
 * silently point at the wrong paragraph the first time somebody adds one.
 *
 * So: find the block whose text still contains `quote`; failing that, trust
 * `blockIndex` if it is still in range; failing that, place the picture
 * NOWHERE. It stays in the gallery either way -- a lost anchor must never be
 * a lost picture.
 */
export const pictureAnchorSchema = z.object({
  /** Enough of the chosen passage to find it again. */
  quote: z.string().max(300),
  /** Where it was when it was drawn. The fallback, never the first answer. */
  blockIndex: z.number().int().min(0),
});

export type PictureAnchor = z.infer<typeof pictureAnchorSchema>;

/**
 * A story's picture: a generated picture that may also know where it goes.
 *
 * The anchor is what makes a story a picture book rather than a story with an
 * illustration at the end. Absent on the end-of-story picture, and on every
 * picture drawn before this existed.
 *
 * A character's portraits keep the bare shape: an avatar has no story to sit
 * in, and a field that means nothing to half its users is how one schema
 * becomes two.
 */
export const storyPictureSchema = generatedPictureSchema.extend({
  anchor: pictureAnchorSchema.optional(),
});

export type StoryPicture = z.infer<typeof storyPictureSchema>;

/**
 * A passage a reader highlighted and wants a picture of.
 *
 * Validated as a REQUEST body, unlike everything else about a picture, which
 * is server-owned: this is the one thing about an illustration a person
 * actually chooses. Both fields are only ever used to find the passage again
 * -- the text is sent to a model and stored as the anchor's quote, and the
 * index is the fallback -- so neither can do anything but point somewhere.
 *
 * Capped at MAX_PASSAGE_CHARS, which is the most passage worth spending
 * prompt on: a page, not a chapter. Over it the request is refused rather
 * than truncated, so nobody gets a picture of half of what they chose.
 */
export const MAX_PASSAGE_CHARS = 2000;

export const storyPassageSchema = z.object({
  text: z.string().trim().min(1).max(MAX_PASSAGE_CHARS),
  blockIndex: z.number().int().min(0),
});

export type StoryPassage = z.infer<typeof storyPassageSchema>;

/**
 * Named skills one character may keep.
 *
 * Six, because each one costs a point and a sheet with more than a handful of
 * notable things stops having anything notable about it.
 */
export const MAX_SKILLS = 6;
/** Ordinary for a child their age. Everyone starts here, on everything. */
export const STAT_BASE = 3;
/** Never 0: "cannot at all" invites a model to treat it as absolute. */
export const STAT_FLOOR = 1;
export const STAT_CAP = 10;

export const characterSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Character name is required").max(60),

  /**
   * The noun the story uses for what they ARE: "girl", "dragon", "robot".
   *
   * Supersedes `gender`. Read it only through characterKind(), the single place
   * that knows the two are the same fact -- the characterIdsOf() precedent.
   * Chosen from shared/characterVocab.ts on the strict write path; free text
   * only through the Parent Mode route, so a stored kind that is not in the
   * catalogue is normal and must never be treated as corrupt.
   */
  kind: optionalText(60),

  /**
   * What sort of thing they are. NEVER reaches a prompt.
   *
   * It selects the form's vocabulary and the covering noun -- fur, feathers,
   * scales -- so the story sees only `kind` and a girl renders "a girl" rather
   * than "a human". Absent on every row written before this shipped.
   */
  category: z.enum(CHARACTER_CATEGORIES).optional(),

  /**
   * LEGACY. Superseded by `kind`; nothing new writes it.
   *
   * Kept, and kept optional, solely so a character saved before `kind` existed
   * survives being edited and re-serialised.
   */
  gender: z.enum(["boy", "girl"]).optional(),

  /**
   * Male or female; `it` for a machine.
   *
   * Rendered as a short pronoun tag, never stored as a pronoun. `it` is offered
   * only when category is "machine" -- a robot is reasonably an it, and a
   * living creature is not.
   */
  sex: z.enum(["male", "female", "it"]).optional(),

  /** Optional, and unbounded upward: a dragon may be three hundred. */
  age: z.number().int().min(0).max(9999).optional(),

  /**
   * The COLOUR of whatever covers them. The noun comes from the category, so
   * this one field serves hair, fur, feathers, scales and plating.
   *
   * Not renamed to something category-neutral: every row written so far stores
   * it as `hair`, and the rendered sentence "Mia has brown hair" is asserted
   * byte-for-byte by tests/fixtures/brief-golden.json.
   */
  hair: optionalText(40),
  eyes: optionalText(40),
  favoriteColor: optionalText(40),
  favoriteAnimal: optionalText(60),
  hobby: optionalText(60),
  personality: optionalText(60),

  /**
   * Anything the user wants said about them. Free text, and the only free field
   * besides the name.
   *
   * SOFT. Rendered as colour, which the brief follows with "use these details
   * only where a scene naturally calls for them". It must never reach
   * userInstructions: that slot is a directive channel and this box is
   * child-writable.
   */
  notes: optionalText(200),

  /**
   * What must stay true of them, whatever the story does. PARENT MODE ONLY.
   *
   * HARD. Rendered into identity, which the chapter projection reprints with
   * "Keep this consistent." -- the right force for "Ella uses a wheelchair",
   * which as colour would be explicitly downgraded to optional set-dressing.
   */
  mustBeTrue: optionalText(200),

  /**
   * How they look, for pictures. Stored now; rendered nowhere yet.
   *
   * The avatar slice will use it for image prompts ONLY. Keeping appearance out
   * of the story prompt is what lets this be as detailed as someone likes
   * without competing for the six-facts-per-character budget the brief rations.
   */
  canonicalLook: optionalText(300),

  /**
   * What they can do well. Five numbers, 1-10, or nothing at all.
   *
   * Absent means untouched: every stat is STAT_BASE. That is the whole
   * migration story -- no backfill, and a character saved before any of this
   * reads as a perfectly ordinary one.
   *
   * NOTHING ELSE ABOUT POINTS IS STORED. Spent points are the distance these
   * numbers sit from the baseline, and earned points are the number of finished
   * stories this character was in. Both are therefore derived, and a story
   * worker that retries, resumes after a lease expiry, or re-queues a
   * story_too_short cannot inflate either -- there is no counter to increment
   * twice. It also self-corrects if a story is deleted.
   */
  stats: z
    .object({
      strength: z.number().int().min(1).max(10),
      agility: z.number().int().min(1).max(10),
      constitution: z.number().int().min(1).max(10),
      wisdom: z.number().int().min(1).max(10),
      heart: z.number().int().min(1).max(10),
    })
    .optional(),

  /**
   * Whether this character uses the stat system at all.
   *
   * Absent means yes, so no existing character needs rewriting and the common
   * case stores nothing. Only an explicit false turns it off -- see
   * statsEnabledFor(), which is the single place that knows that.
   *
   * A disabled character is left out of the table the model is shown, which is
   * the honest thing rather than a gap: "we do not track this for Mia" and "Mia
   * is unremarkable" amount to the same instruction, and the second is what the
   * baseline already says.
   */
  statsEnabled: z.boolean().optional(),

  /**
   * Named things this character is good at, that the five attributes cannot say.
   *
   * "Good at climbing" tells a story something a number cannot, and costs one
   * clause. That is why this exists rather than a dozen more built-in
   * attributes: the table works because an outlier is a SIGNAL, and twelve
   * columns would bury the two that matter in a wall of baselines.
   *
   * They spend from the SAME pool as attributes. A skill is added at
   * STAT_BASE + 1, so having one costs exactly one point by the arithmetic
   * pointsSpent already does -- no special case anywhere. A free list would be
   * unbounded flattery; the pool is what makes a sheet a set of choices.
   *
   * The name is bounded because it reaches an image-free but real prompt.
   */
  skills: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(40),
        value: z.number().int().min(STAT_FLOOR).max(STAT_CAP),
      }),
    )
    .max(MAX_SKILLS)
    .optional(),

  /**
   * The stories they have been through: one entry per finished story.
   *
   * A SET KEYED ON storyId, not a counter. That is what makes it safe against
   * the worker, which retries, resumes after a lease expires, and re-queues a
   * story_too_short with a fresh draw -- any of which can reach the finishing
   * path twice. Adding an id that is already present is a no-op, so a retry
   * cannot award a second point, and a character with one extra point would
   * otherwise be invisible forever.
   *
   * NOT derived by counting user_stories, which was the first design. Saved
   * stories expire after a year unless favourited, and getUserStories filters
   * expired ones out -- so a child's character would quietly lose a stat point
   * on the anniversary of an adventure, and their spent points would then
   * exceed what they had earned. This outlives the story it came from.
   *
   * The theme rides along because it is the virtue: the seventeen story themes
   * and the virtues are the same list, so a virtue level is just how many
   * entries here carry that theme. No matching, and nothing to drift.
   */
  /**
   * Virtues already shown to whoever owns this character. Server-owned.
   *
   * It is the read-receipt for a notification badge, so a client that could
   * write it could silence its own badge -- and more to the point it is
   * derived from adventures, which the client cannot write either. Set by
   * PUT /api/characters/:id/virtues/seen, from the row, never from a body.
   */
  seenVirtues: z.array(z.string()).optional(),

  adventures: z
    .array(
      z.object({
        storyId: z.string(),
        theme: z.string().optional(),
        at: z.string().optional(),
      }),
    )
    .optional(),

  /**
   * Their picture. Stored now, generated in the avatar slice.
   *
   * Declared early so the card and the Basics tab are laid out once rather than
   * twice; until something writes it, both fall back to a silhouette chosen by
   * category.
   */
  /**
   * Every picture this character has, newest last. Server-owned.
   *
   * avatarUrl below is the CHOSEN one and stays the field everything else
   * reads -- the card, the form, and any story illustration. Keeping it rather
   * than deriving it from this list is deliberate: every character saved
   * before this has an avatarUrl and no list, and a derived field would have
   * needed a backfill to keep them showing a picture.
   */
  avatars: z.array(generatedPictureSchema).max(MAX_AVATARS).optional(),

  avatarUrl: optionalText(500),

  /**
   * The EXACT string their portrait was generated from. Server-owned.
   *
   * Kept so a story illustration can be built on the same description rather
   * than a fresh one. Image models do not reproduce a character from scratch --
   * describe the same girl twice and you get two girls -- so reusing the
   * literal prompt is the only thing that keeps a portrait and an illustration
   * recognisably the same person.
   *
   * Reused verbatim, never summarised or regenerated: a "tidied" version of
   * this string is a different prompt, and a different prompt is a different
   * child. It reaches no STORY prompt, only image ones.
   */
  avatarPrompt: optionalText(1200),

  /**
   * Field names holding a value a parent typed rather than picked.
   *
   * The strict path validates only the fields in the request, so a custom value
   * elsewhere never blocks an ordinary edit; this is how the form knows to show
   * such a value as chosen rather than blanking it for being off-list.
   */
  customFields: z.array(z.string()).optional(),

  createdAt: z.string(), // ISO date string
});

export type Character = z.infer<typeof characterSchema>;

/**
 * The five things a character can be good at.
 *
 * Deliberately capabilities, not virtues. The seventeen story themes ARE the
 * virtues, and they are a record of what a character has been through; these
 * are what they can do. A little overlap between "heart" and courage is fine —
 * one is a level and one is a stat.
 */
export const CHARACTER_STATS = [
  "strength", "agility", "constitution", "wisdom", "heart",
] as const;
export type CharacterStat = (typeof CHARACTER_STATS)[number];
export type CharacterStats = NonNullable<Character["stats"]>;

/** Spare points a brand-new character has to spend. */
export const STARTING_POINTS = 2;
/** At or above this a stat is worth the model knowing about. */
export const STAT_NOTABLE_HIGH = 6;
/** At or below this it is a real weakness, and may cost them something. */
export const STAT_NOTABLE_LOW = 2;

/** Every stat at the baseline. What an untouched character is. */
export function baseStats(): CharacterStats {
  return { strength: STAT_BASE, agility: STAT_BASE, constitution: STAT_BASE, wisdom: STAT_BASE, heart: STAT_BASE };
}

export type CharacterSkill = NonNullable<Character["skills"]>[number];

/** A character's named skills. Absent means none, like every other list here. */
export function skillsOf(c?: { skills?: CharacterSkill[] } | null): CharacterSkill[] {
  return c?.skills ?? [];
}

/**
 * The skills worth telling a story about: all of them.
 *
 * Unlike an attribute, a skill at its lowest level was still bought -- there is
 * no "ordinary" level of climbing that everybody has. So there is nothing to
 * filter out, and this exists as the name for that fact rather than as a filter.
 */
export function notableSkills(c?: { skills?: CharacterSkill[] } | null): CharacterSkill[] {
  return skillsOf(c);
}

export function statsOf(c?: { stats?: CharacterStats } | null): CharacterStats {
  return c?.stats ?? baseStats();
}

/**
 * Points already committed: how far the sheet sits above the baseline.
 *
 * Dropping a stat BELOW the baseline refunds, which is what makes a weakness a
 * real trade rather than a penalty — a child buys Strength 6 by accepting
 * Agility 1. Nobody starts weak; they choose it.
 */
export function pointsSpent(stats: CharacterStats, skills: CharacterSkill[] = []): number {
  return (
    CHARACTER_STATS.reduce((n, s) => n + (stats[s] - STAT_BASE), 0) +
    skills.reduce((n, s) => n + skillCost(s), 0)
  );
}

/**
 * What one skill costs: its level.
 *
 * Attributes measure distance from an ordinary 3, because everybody HAS a
 * strength whether they spent on it or not. Nobody has a skill by default, so
 * there is no baseline to be a distance from -- a skill at 1 is a skill you
 * bought, and it costs the one point that bought it. Level 4 costs four.
 *
 * This is why SKILL_START is 1 and not STAT_BASE + 1. The earlier version
 * measured skills against the attribute baseline, which made a new skill cost
 * four points and a skill at 1 REFUND two.
 */
export function skillCost(skill: CharacterSkill): number {
  return skill.value;
}

/** Where a new skill starts, and therefore what it costs to have one at all. */
export const SKILL_START = 1;
/** At or above this a skill is more than a beginner's. */
export const SKILL_COMPETENT = 3;

/**
 * Whether the stat system applies to this character.
 *
 * Absent means enabled. Only an explicit false disables, so a character saved
 * before the checkbox existed keeps working and nothing had to be backfilled.
 */
export function statsEnabledFor(c?: { statsEnabled?: boolean } | null): boolean {
  return c?.statsEnabled !== false;
}

/** One point per finished story. */
export function pointsEarned(c?: { adventures?: Character["adventures"] } | null): number {
  return c?.adventures?.length ?? 0;
}

/** Spare points left to spend. May be negative only if a sheet was written by Parent Mode. */
export function pointsAvailable(
  c: { stats?: CharacterStats; skills?: CharacterSkill[]; adventures?: Character["adventures"] },
  /**
   * The sheet to measure, when it is not the one on the row.
   *
   * The form asks this about stats the user is dragging around right now while
   * the card asks it about what is stored, and they were two different sums --
   * this function existed and the form re-derived it inline anyway. One
   * definition, two callers, and the difference is a parameter.
   */
  stats: CharacterStats = statsOf(c),
  skills: CharacterSkill[] = skillsOf(c as { skills?: CharacterSkill[] }),
): number {
  return pointsEarned(c) + STARTING_POINTS - pointsSpent(stats, skills);
}

/**
 * Whether a sheet is reachable with the points this character has earned.
 *
 * Enforced on the strict path only. Parent Mode writes stats without spending
 * anything, on purpose: a parent may want to hand their child a character who
 * is already remarkable, rather than making them earn it over twenty stories.
 */
export function statsAreAffordable(
  stats: CharacterStats,
  c?: { adventures?: Character["adventures"] } | null,
  skills: CharacterSkill[] = [],
): boolean {
  return pointsSpent(stats, skills) <= pointsEarned(c) + STARTING_POINTS;
}

/**
 * How far along they are in each virtue.
 *
 * The seventeen story themes ARE the virtues, so this is a count rather than a
 * mapping -- there is no theme-to-virtue table to fall out of step with the
 * themes the form offers. Never reaches the model: it is a record of what a
 * character has been through, which is for the child to look at.
 */
export function virtueLevels(c?: { adventures?: Character["adventures"] } | null): Record<string, number> {
  const levels: Record<string, number> = {};
  for (const a of c?.adventures ?? []) {
    const theme = a.theme?.trim().toLowerCase();
    if (!theme || theme === "none") continue;
    levels[theme] = (levels[theme] ?? 0) + 1;
  }
  return levels;
}

/**
 * Virtues this character has earned that nobody has looked at yet.
 *
 * Compared on the SAME normalised key virtueLevels builds -- it lowercases and
 * trims, because a theme is stored verbatim from whatever the story form sent.
 * Comparing raw strings would leave "Courage" permanently unseen against a
 * stored "courage", and the badge would never go out.
 *
 * A character with no seenVirtues has genuinely never had them looked at, so
 * they all count as new. That is one badge on an existing character, cleared
 * the first time the tab is opened -- better than pretending they were read.
 */
/**
 * What one character is waiting on: points to spend, virtues to look at.
 *
 * ONE definition, because three places ask it now -- the card, the tabs inside
 * the panel, and the Characters link in the nav bar, which sums it across
 * everybody. Three copies of "max(0, ...) unless stats are off" is three
 * chances for the bar to promise something the card does not show.
 *
 * Clamped at zero: pointsAvailable is legitimately negative for a sheet Parent
 * Mode wrote, and "-2 points to spend" is not a thing to put in a bubble.
 */
export function characterAlerts(
  c?:
    | {
        stats?: CharacterStats;
        skills?: CharacterSkill[];
        adventures?: Character["adventures"];
        seenVirtues?: string[];
        statsEnabled?: boolean;
      }
    | null,
): { unspent: number; unseen: number } {
  if (!c) return { unspent: 0, unseen: 0 };
  return {
    unspent: statsEnabledFor(c) ? Math.max(0, pointsAvailable(c)) : 0,
    unseen: unseenVirtues(c).length,
  };
}

export function unseenVirtues(
  c?: { adventures?: Character["adventures"]; seenVirtues?: string[] } | null,
): string[] {
  const seen = new Set((c?.seenVirtues ?? []).map((v) => v.trim().toLowerCase()));
  return Object.keys(virtueLevels(c)).filter((v) => !seen.has(v));
}

/**
 * The noun the story uses for what this character is.
 *
 * THE ONLY place that knows `kind` and `gender` are the same fact. Every
 * character saved before the cast could be anything carries the singular
 * `gender`, and those blobs are never rewritten, so the compatibility read
 * lives here rather than in a migration -- exactly as characterIdsOf() does for
 * characterId. Confining it to one function is the point: the alternative
 * leaves every read site to compute a fallback, and this repo has already paid
 * for that shape once.
 *
 * Structurally typed so the client can call it on a character read back out of
 * a saved story.
 */
/**
 * Every picture a character has, including one saved before galleries existed.
 *
 * A row written by the first version of this feature has avatarUrl and no
 * avatars array. Reading the list straight off the row would show that person
 * zero pictures while their portrait was on screen, and the next generation
 * would quietly orphan the file. Folding it in here means no backfill and one
 * answer to "what have they got".
 */
export function avatarsOf(
  // Everything optional: callers hold anything from a full row to the empty
  // object a form starts with, and demanding a whole Character here would only
  // push casts out to every call site.
  character?: Partial<Pick<Character, "avatars" | "avatarUrl" | "avatarPrompt" | "createdAt">> | null,
): NonNullable<Character["avatars"]> {
  if (character?.avatars?.length) return character.avatars;
  if (!character?.avatarUrl) return [];
  return [
    {
      id: "legacy",
      url: character.avatarUrl,
      prompt: character.avatarPrompt ?? "",
      createdAt: character.createdAt ?? new Date().toISOString(),
    },
  ];
}

/**
 * What pictures a story has, counting the one saved before galleries.
 *
 * avatarsOf()'s counterpart, and deliberately the same shape: a row written by
 * the first version of illustration has story.imageUrl and no list, and
 * reading the list straight off the row would show that story no pictures
 * while its picture was on screen.
 */
export function storyImagesOf(
  story?: Partial<Pick<SavedStory, "images" | "createdAt">> & {
    story?: { imageUrl?: string; imagePrompt?: string } | null;
  } | null,
): StoryPicture[] {
  if (story?.images?.length) return story.images;
  if (!story?.story?.imageUrl) return [];
  return [
    {
      id: "legacy",
      url: story.story.imageUrl,
      prompt: story.story.imagePrompt ?? "",
      createdAt: story.createdAt ?? new Date().toISOString(),
    },
  ];
}

export function characterKind(
  c?: { kind?: string | null; gender?: string | null } | null,
): string | undefined {
  return c?.kind?.trim() || c?.gender?.trim() || undefined;
}

/**
 * Everything about a character worth matching a search box against.
 *
 * Lives here rather than in CharacterPicker because the picker's own comment
 * admitted its field list was hand-maintained, which is a promise to forget a
 * field. One list, next to the schema it mirrors.
 */
export function characterSearchText(c: Character): string {
  return [
    c.name,
    characterKind(c),
    c.age != null ? String(c.age) : undefined,
    c.hair,
    c.eyes,
    c.favoriteColor,
    c.favoriteAnimal,
    c.hobby,
    c.personality,
    c.notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

// Schema for story generation with optional fields
/** The most characters one story can hold. */
/**
 * Lengths that are worth warning somebody about before they wait for one.
 *
 * A story is written a chapter at a time, so the wait scales with the length:
 * long is five model calls and epic is seven, and an epic measured at 208
 * seconds even after the chapters were made bigger. Nothing is broken while
 * that happens, and a reader who does not know that thinks it is.
 *
 * SEPARATE FROM QUEST_LENGTHS even though the two lists currently match. They
 * answer different questions -- "will this take a while" and "can a quest fit
 * in this" -- and tying them together means moving the quest floor silently
 * changes who gets warned.
 */
export const SLOW_STORY_LENGTHS = ["long", "extended", "epic"] as const;

export function storyTakesAWhile(storyLength?: string | null): boolean {
  return SLOW_STORY_LENGTHS.includes((storyLength ?? "") as (typeof SLOW_STORY_LENGTHS)[number]);
}

export const MAX_STORY_CHARACTERS = 8;


/**
 * The characters a request asks for, in order, protagonist first.
 *
 * THE ONLY place that knows `characterId` and `characterIds` are the same
 * fact. Every request frozen before multi-character shipped carries the
 * singular field -- thousands of rows inside story_jobs.request and
 * user_stories.story_data.request -- and those blobs are never rewritten, so
 * the compatibility read lives here rather than in a migration.
 *
 * Confining it to one function is the point. The alternative considered was
 * keeping `characterId` as the protagonist and adding a second live array:
 * that leaves every read site to compute a union, makes "who is the lead" a
 * property of which field a value happens to sit in, and turns promoting a
 * character into a two-field mutation that can leave an id in both. This repo
 * has already paid for that shape once -- four schema sources, six model
 * lists. `resolveHeroOfFaith` is the precedent: absorb the duality in one
 * function rather than teach every caller about both.
 *
 * Structurally typed rather than taking StoryRequest, so it can be declared
 * above the schema that infers it, and so the CLIENT can call it on a request
 * read back out of a saved story.
 */
/**
 * Present, and not one of the form's "no value" sentinels.
 *
 * EXPORTED, because the form has to ask the same question the refine and the
 * brief ask -- "is there a source on this request" -- and "none" is truthy.
 * The selects write the literal string, and a second opinion about what set
 * means is how the brief came to emit "Animal companion: none", telling the
 * model the child's companion was an animal called None.
 */
export const isChosen = (v: unknown): boolean =>
  typeof v === "string" && v.trim() !== "" && v.trim().toLowerCase() !== "none";
const isSet = isChosen;

export type CharacterRole = "absent" | "travels" | "alongside";

/**
 * How -- if at all -- the chosen character is in this account.
 *
 *   "absent"     a straight retelling. They are not in it.
 *   "travels"    they are here, now, and they GO there. The account is the
 *                past, and they arrive in it from outside.
 *   "alongside"  they were always there. No travel and no frame: they belong
 *                to that time and that place, and always did.
 *
 * The two ways in are mutually exclusive BY CONSTRUCTION, which is the whole
 * reason this is one field with three values rather than two booleans. Two
 * flags can contradict each other, and when they did the model picked one.
 *
 * The ONE place that knows characterRole and useTimeTravel are the same fact.
 * A request frozen before characterRole existed still answers correctly, which
 * matters because story_jobs.request is written at enqueue and never rewritten.
 *
 * Defaults to "absent". A retelling is about the person it is about, and being
 * wrong that way produces a story that is merely plainer than intended --
 * whereas defaulting the other way would put a character into Scripture
 * because a form field was left alone.
 */
export function characterRoleOf(
  request?: { characterRole?: string | null; useTimeTravel?: boolean | null } | null,
): CharacterRole {
  const explicit = request?.characterRole;
  if (explicit === "absent" || explicit === "travels" || explicit === "alongside") {
    return explicit;
  }
  /**
   * LEGACY -- and the two legacy spellings do NOT resolve the same way.
   *
   * "meets" was written by the historical tab's radio, whose label said the
   * character meets the figure and said nothing whatever about travel. Those
   * stories were requested with no journey in them. Resolving them to
   * "travels" would put a frame around a story that never had one, so a reader
   * reopening an old story would find lore the app invented after the fact.
   *
   * useTimeTravel is the normal tab's old checkbox, and it named time travel
   * outright. That one really is "travels".
   */
  if (explicit === "meets") return "alongside";
  return request?.useTimeTravel ? "travels" : "absent";
}

export function characterIdsOf(
  request?: { characterIds?: string[] | null; characterId?: string | null } | null,
): string[] {
  const raw = request?.characterIds?.length
    ? request.characterIds
    : request?.characterId
      ? [request.characterId]
      : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of raw) {
    const trimmed = typeof id === "string" ? id.trim() : "";
    // The same person twice reads as "Mia and Mia" in the prompt, and costs a
    // cast slot. A duplicate is a mistake in every case, never a request.
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out.slice(0, MAX_STORY_CHARACTERS);
}

/**
 * The reading levels, and what each one MEANS in years.
 *
 * The age is the point. Until now `readingLevel` reached the model as a bare
 * slug -- "Reading level: early-elementary." -- and the model had to know what
 * an American school stage implies about a reader's age, unaided. That worked
 * only because every persona also said the word "children", which did the real
 * work. With that word gone the age has to be said outright, or nothing in the
 * prompt says who the story is for.
 *
 * The tuple is the single source: z.enum() reads it, and READING_LEVEL_AGES is
 * typed as a total Record over it, so adding a level without giving it an age
 * is a compile error rather than a silent fall through to the default.
 *
 * This map used to live -- client-side only -- in PromptEditor.tsx, where it
 * shaped the Parent Mode preview and nothing else. A second definition of a
 * fact the server needed and did not have.
 */
export const READING_LEVELS = [
  "preschool",
  "kindergarten",
  "early-elementary",
  "late-elementary",
  "middle-school",
] as const;

export type ReadingLevel = (typeof READING_LEVELS)[number];

export const READING_LEVEL_AGES: Record<ReadingLevel, string> = {
  "preschool": "ages 3-4",
  "kindergarten": "ages 5-6",
  "early-elementary": "ages 6-8",
  "late-elementary": "ages 9-11",
  "middle-school": "ages 12-14",
};

/** The default reading level, named once so the fallback below cannot drift. */
export const DEFAULT_READING_LEVEL: ReadingLevel = "early-elementary";

/**
 * The age range for a reading level, tolerating anything at all.
 *
 * Takes a string rather than a ReadingLevel because the callers read it off a
 * request that may have been frozen years ago, and a level that no longer
 * exists must give a sane age rather than `undefined` -- which would reach a
 * prompt as the literal word.
 */
export function readingLevelAges(level?: string | null): string {
  return (
    READING_LEVEL_AGES[(level ?? "") as ReadingLevel] ??
    READING_LEVEL_AGES[DEFAULT_READING_LEVEL]
  );
}

/**
 * How many questions one story may be asked.
 *
 * Each is answered from the source material in a single call, so a list of
 * twenty produces a paragraph of nothing each. Named because the form has to
 * enforce the same number and must not hold a second opinion about it.
 */
export const MAX_STUDY_QUESTIONS = 5;

export const storyRequestSchema = z.object({
  // Fields that are conditionally required based on useTimeTravel
  /**
   * The protagonist name, when no saved character is chosen.
   *
   * NO .min(1). The form defaults this to "" and an empty string is PRESENT,
   * so .optional() never applied and .min(1) rejected the default -- which
   * only ever passed because the form force-wrote childName: "Character"
   * whenever a character was selected. That write is gone (it reached the
   * prompt as a protagonist, which is why PLACEHOLDER_NAMES exists to strip
   * it), so the rule has to be stated where it is actually decided.
   *
   * The refine below is the single authority on whether a name is needed:
   * a cast, or a name and a gender. Duplicating it here as .min(1) put the
   * error on a field that is HIDDEN once a character is chosen, so submit
   * failed silently and the page did nothing at all.
   */
  childName: z.string().optional(),
  gender: z.enum(["boy", "girl"], {
    invalid_type_error: "Gender must be 'boy' or 'girl'",
  }).optional(),
  // Optional fields with defaults or optional values
  animal: z.string().default("").optional(),
  useAnimal: z.boolean().default(true), // Toggle for including animal in story
  theme: z.string().default(""),
  biblicalEvent: z.string().default(""),
  heroOfFaith: z.string().default("").optional(),
  // The RESOLVED hero id, written server-side at enqueue. heroOfFaith carries
  // whatever the form's select produced (a uuid today, a name historically);
  // this is the id that actually exists in the heroes table, or absent.
  //
  // It lives on the request rather than being a fourth argument to saveStory
  // for the reason documented in db-storage.saveStory: the optional-parameter
  // version is why hero_id is NULL on essentially every existing row.
  heroId: z.string().optional(),
  /**
   * Which part of a life or an account this story covers.
   *
   * A Hero of Faith is a whole life, and asked for "a story about Corrie ten
   * Boom" a model gives you a summary of all of it -- born here, did this,
   * died there. One episode, told properly, is a better story and teaches
   * more, so the user picks a moment or asks to be surprised by one.
   *
   * ONE field, not a mode plus a text: "surprise" is a request that the SERVER
   * chooses, and the choice it makes is written into `text` at enqueue. So the
   * frozen request records what was actually used, the debug panel can show
   * it, and the same request replays to the same story rather than a different
   * one each time -- which is the difference between a bug you can chase and
   * one you cannot.
   */
  storyFocus: z
    .object({
      mode: z.enum(["whole", "chosen", "surprise"]).default("whole"),
      /** The moment, verbatim. Empty for "whole"; filled by the server for "surprise". */
      text: z.string().default(""),
      /** Chapter and verse, where the moment came from a key event that had one. */
      reference: z.string().optional(),
    })
    .optional(),
  /**
   * The user expects to write more stories in this world.
   *
   * What it buys is one extra model call after the story is written, which
   * extracts what a later story would need to know -- who appeared, what is now
   * true, what was left open. That is not worth paying for on a one-off, so it
   * is opt-in rather than automatic.
   *
   * A CONTINUATION implies it without the box being ticked: a story that has
   * already been continued once is very likely to be continued again.
   */
  mayContinue: z.boolean().default(false),
  /**
   * End without resolving.
   *
   * moralOutcome is picked at random when the user does not choose one, and it
   * instructs the story to resolve -- so a cliffhanger has to suppress it, in
   * exactly the way a retelling already does. See the `ending` line in
   * buildStoryBrief: "the account already has an ending; it is not ours to
   * assign." The same is true of a story the user has said is not over.
   */
  cliffhanger: z.boolean().default(false),
  /**
   * What the chosen character is DOING in a retelling. The explicit choice,
   * and the ONLY way a hero of faith and a user's character are brought
   * together. See characterRoleOf for what the three values mean.
   *
   * ONE field with three values, not two flags, because the two ways in are
   * mutually exclusive and a pair of booleans can say both at once. When they
   * did, the model picked one and the user could not tell which.
   *
   * "meets" is still ACCEPTED though nothing writes it any more. Requests are
   * frozen onto story_jobs.request as jsonb at enqueue and never rewritten, so
   * dropping the value from the enum would make every story requested through
   * the old historical tab fail to parse on the way back out. Read only
   * through characterRoleOf(), which normalises it -- the characterIdsOf() and
   * characterKind() precedent.
   *
   * LEGACY: useTimeTravel below is the old spelling of "travels".
   *
   * This field exists because the flag and the cast used to be able to
   * contradict each other and nothing made the user choose. A character
   * attached to an account with time travel off was silently written into it
   * anyway; see the Caleb/Esther case in storyBrief.ts.
   */
  characterRole: z.enum(["absent", "travels", "alongside", "meets"]).optional(),
  /**
   * Which framing approach a "travels" story opens with. The server's choice.
   *
   * SERVER-OWNED, and the storyFocus "surprise" precedent exactly: the client
   * never sends it, the server picks one at enqueue and writes it here before
   * the request is frozen. Choosing in the browser would make the same request
   * produce a different story on every replay -- the class of bug that is
   * impossible to chase six weeks later -- and the frozen request is the only
   * record of what a story was actually asked for.
   *
   * The ID, not the prose. The wording of each approach lives in
   * server/data/lionTails.ts where it can be tuned, and tuning it must not
   * require rewriting stored jsonb. A stored id that no longer exists resolves
   * to a documented fallback rather than to a fresh roll; see
   * framingApproachOf.
   *
   * Meaningless for any other characterRole, and not written for one.
   */
  travelFrame: z.string().optional(),
  /** LEGACY. Superseded by characterRole; read via characterRoleOf(). */
  useTimeTravel: z.boolean().default(false),
  /**
   * The cast, in order. Index 0 is the protagonist, and that ordering is
   * load-bearing -- it decides who gets full description and who gets a name.
   *
   * Never read directly. Call characterIdsOf(request).
   */
  characterIds: z.array(z.string().min(1)).max(MAX_STORY_CHARACTERS).optional(),
  /**
   * LEGACY. Read only through characterIdsOf(). Declared because every request
   * frozen before the cast became plural carries it; nothing new writes it.
   */
  characterId: z.string().optional(),
  storyType: z.enum(["regular", "poem", "moral"]).default("regular"),
  customPrompt: z.string().default("").optional(),
  // The shape the story should end in. Previously chosen with Math.random()
  // AFTER generation, never sent to the model, and used to decide whether a
  // Bible verse was attached -- so a coin flip determined both the declared
  // moral shape and whether Scripture appeared, with no relation to the text.
  // It is on the request now so it is frozen with the brief and reaches the
  // prompt. Optional: stories enqueued before this shipped have none.
  moralOutcome: z
    .enum(["positive", "learning", "consequences", "creative"])
    .optional(),
  // Continuation. Carried on the request rather than as a self-FK on
  // user_stories: universe membership plus created_at ordering is everything
  // the summariser and the library need, and this way both story_jobs.request
  // and story_data.request persist it for free -- the same place characterId
  // already lives.
  continuesStoryId: z.string().optional(),
  universeId: z.string().optional(),
  /**
   * ONE OF THREE SOURCES. `biblicalEvent`, `heroOfFaith` and `biblePassage`
   * are the three things a story can be ABOUT, and exactly one of them may be
   * set on a request that reaches the model.
   *
   * They are three fields rather than one because all three are frozen on
   * thousands of requests already and jsonb is never rewritten. What makes
   * them behave as one choice is resolveStorySource(), which settles the
   * request at enqueue -- not a rule anybody has to remember here. See the
   * note on that function for what combining them used to do silently.
   */
  biblePassage: z.string().default("").optional(),
  /**
   * LEGACY. Nothing writes this any more and no prompt reads it.
   *
   * It was a Select of seven slugs whose value reached the model unrendered --
   * the prompt literally said "Learning focus: theological-significance." --
   * with no description in the UI saying what any of them meant.
   * `studyQuestions` replaces it: the same intent, in the user's own words.
   *
   * DECLARED, not deleted. z.object strips what it does not declare, so
   * removing it would silently drop the field from every frozen request that
   * carries it the moment anything re-parses one.
   */
  learningFocus: z.string().default("").optional(),
  /**
   * What the reader actually wants to know about this account.
   *
   * Answered AFTER the story, in an appended "Digging deeper" section, and
   * deliberately not woven into it -- a model asked to answer a history
   * question inside a scene answers it by inventing history, which is the one
   * thing every other prompt in this file is arranged to prevent.
   *
   * Capped at five because each one has to be answered from the source
   * material and a list of twenty produces a paragraph of nothing each. Capped
   * at 300 characters because this is a question, and anything longer is
   * somebody using it as the free-text steering box, which is a different
   * field on a different tab.
   */
  studyQuestions: z.array(z.string().min(1).max(300)).max(MAX_STUDY_QUESTIONS).optional(),
  // New fields for reading level and story length
  readingLevel: z.enum(READING_LEVELS).default(DEFAULT_READING_LEVEL),
  storyLength: z.enum([
    "very-short",
    "short", 
    "medium", 
    "long", 
    "extended",
    /**
     * ~5000 words, about ten chapters.
     *
     * Added for quests, which have two stories to tell -- the way in and the
     * account -- and were visibly short of room at anything less: the same
     * Joseph quest gave its traveller one line of dialogue at medium and five
     * at long, because at medium one chapter had to carry the pit, the prison
     * and the dreams.
     *
     * NOT UNBOUNDED. finalizeStoryDetails embeds the entire assembled story
     * and is documented as the call site with the least headroom -- it is what
     * broke when "long" was introduced. At 5000 words that prompt is roughly
     * 8800 tokens against MODEL_CONTEXT_LIMIT's 16384, which leaves room; a
     * tier past this one needs that call fixed first, not just a bigger number
     * here.
     */
    "epic"
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
    hobby: z.string().optional(),
    personality: z.string().optional(),
    favoriteAnimal: z.string().optional(),
  }).optional(),
}).refine((data) => {
  // Through characterIdsOf, so a request frozen with the singular field
  // satisfies these rules exactly as it did before.
  const cast = characterIdsOf(data);

  // Either way in needs somebody to come in. Asked through the reader so the
  // old flag and the new field are one rule, not two -- and so a mode added
  // later is covered by this without anyone remembering to widen it.
  if (characterRoleOf(data) !== "absent") {
    return cast.length > 0 || Boolean(data.childName?.trim());
  }

  // If custom character is enabled for any story type, characterDetails is required
  if (data.useCharacter) {
    return !!data.characterDetails;
  }

  // Any chosen character overrides the need for childName and gender.
  if (cast.length > 0) {
    return true;
  }

  // A retelling supplies its own cast. Asked for the account of Noah, the
  // story is about Noah -- there is no child to name, and demanding one is why
  // the form wrote childName: "Biblical Character" to get past this rule, a
  // value that then reached the prompt as a protagonist and had to be stripped
  // back out by PLACEHOLDER_NAMES. Stating the rule here removes the need for
  // the workaround rather than the need to undo it.
  //
  // biblePassage was missing from this list, and had been for as long as the
  // field has existed on the form. A request carrying nothing but a typed
  // passage fell through to the name-and-gender rule below and was rejected --
  // so "Bible Passage to Study" could be filled in but never submitted alone.
  if (
    isSet(data.biblicalEvent) ||
    isSet(data.heroOfFaith) ||
    isSet(data.biblePassage)
  ) {
    return true;
  }

  // Otherwise a name and gender are required.
  return !!data.childName && !!data.gender;
}, {
  message:
    "Pick something for this story to be about -- a character of your own, " +
    "or an event, a person or a passage to dig into.",
  // Must name the field the FORM renders, or the error attaches to a control
  // that no longer exists and the user sees nothing.
  path: ["characterIds"],
});

export type StoryRequest = z.infer<typeof storyRequestSchema>;

// Schema for story response
export const storyResponseSchema = z.object({
  title: z.string(),
  content: z.string(),
  // What KIND of thing content is. OPTIONAL, because every story saved before
  // this shipped has none -- and the reader must still parse those rows.
  //
  // The reader needs it because a poem's line breaks are single "\n" and prose
  // paragraphs are "\n\n"; rendering one as the other destroys it. Story.tsx
  // falls back to saved.request.storyType, which IS present on every existing
  // row, so no backfill is needed.
  storyType: z.enum(["regular", "poem", "moral"]).optional(),
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
  /**
   * A story the app ships with, present in every library and owned by nobody.
   *
   * SERVER-OWNED: set by server/lib/builtInStories.ts on the way out, never
   * read from a request and never stored. It is on the schema for the TYPE --
   * so the client reads `story.builtIn` rather than casting -- and because a
   * built-in story is still a SavedStory in every other respect.
   */
  builtIn: z.boolean().optional(),
  /**
   * Which universe the story is in, if any. SERVER-OWNED: it is a column on
   * user_stories, grafted onto the row by db-storage on the way out, and set
   * only through PUT /api/stories/:id/universe. On the schema for the TYPE --
   * three components used to cast for it.
   */
  universeId: z.string().optional(),
  id: z.string(),
  story: storyResponseSchema,
  request: storyRequestSchema,
  createdAt: z.string(), // ISO date string
  isFavorite: z.boolean().default(false),
  expiresAt: z.string().optional(), // ISO date string

  /**
   * The chapter plan this story was written from, one string per chapter.
   *
   * Copied here from `story_jobs.outline`, where it is written as a resume
   * checkpoint. It is on the STORY as well because that job row is described in
   * this file as "prunable operational state" -- a permanent, user-facing
   * feature reading from a table whose own schema invites deletion breaks
   * silently the day someone adds the pruning it invites.
   *
   * Absent for anything generated in one call: `targetWordCount < 1000`, which
   * is very-short prose and EVERY poem. Those have no outline and never will,
   * so a reader must handle its absence rather than assume it.
   *
   * The plan, not a transcript. Chapters can drift from it.
   */
  outline: z.array(z.string()).optional(),
  /**
   * What a parent changed by hand. SERVER-OWNED and appended, never rewritten:
   * PATCH /api/stories/:id adds an entry; nothing reads it from a request.
   * Optional because every story written before it existed has none.
   */
  editLog: z.array(editLogEntrySchema).optional(),

  /**
   * Every picture this story has had, oldest first. SERVER-OWNED.
   *
   * `story.imageUrl` stays the CHOSEN one and the field everything else reads
   * -- the card's thumbnail, the reader, the library. Keeping it rather than
   * deriving it from this list is the same decision `avatarUrl` made: every
   * story illustrated before this has an imageUrl and no list, and a derived
   * field would have needed a backfill to keep them showing a picture.
   * storyImagesOf() folds those rows in instead.
   */
  images: z.array(storyPictureSchema).max(MAX_STORY_IMAGES).optional(),

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

/** What a parent may change on a story. At least one of the two. */
export const storyEditSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    content: z.string().trim().min(1).optional(),
  })
  .refine((b) => b.title !== undefined || b.content !== undefined, {
    message: "Nothing to change.",
  });

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
/**
 * Two separate lists, not one.
 *
 * People in Scripture and people from church history are not the same kind of
 * subject: what is known about Moses comes from a text the reader treats as
 * revelation, and what is known about Calvin comes from letters and council
 * records. Mixing them on one page would quietly suggest they are the same
 * sort of claim. They get their own tab.
 */
export const HERO_COLLECTIONS = ["historical", "biblical"] as const;
export type HeroCollection = (typeof HERO_COLLECTIONS)[number];

export const HERO_COLLECTION_LABELS: Record<HeroCollection, string> = {
  historical: "Through History",
  biblical: "In the Bible",
};

/**
 * The eras of church history, browsed chronologically -- which is how a reader
 * thinks about them and how the page groups them.
 */
export const HERO_GROUPS = [
  "early-church",
  "medieval",
  "reformers",
  "puritans",
  "awakening",
  "missionaries",
  "modern",
] as const;
export type HeroGroup = (typeof HERO_GROUPS)[number];

/**
 * Where a biblical figure sits in the story of Scripture.
 *
 * Deliberately not years. Dating Abraham is a scholarly argument with no
 * agreed answer, and putting "c. 2000 BC" on a children's page states as fact
 * something that is not one. Where they appear in the narrative is both more
 * useful and more honest.
 */
export const BIBLE_GROUPS = [
  "beginnings",
  "patriarchs",
  "exodus",
  "judges-and-kings",
  "prophets",
  "exile",
  "gospels",
  "early-church",
] as const;
export type BibleGroup = (typeof BIBLE_GROUPS)[number];

export const BIBLE_GROUP_LABELS: Record<BibleGroup, string> = {
  beginnings: "In the Beginning",
  patriarchs: "The Patriarchs",
  exodus: "The Exodus",
  "judges-and-kings": "Judges & Kings",
  prophets: "The Prophets",
  exile: "Exile & Return",
  gospels: "The Gospels",
  "early-church": "The First Christians",
};

export const HERO_GROUP_LABELS: Record<HeroGroup, string> = {
  "early-church": "The Early Church",
  medieval: "The Middle Ages",
  reformers: "The Reformation",
  puritans: "The Puritans",
  awakening: "Awakening & Revival",
  missionaries: "Missionaries",
  modern: "The Modern Era",
};

/** The display name for an era, from whichever collection it belongs to. */
export function groupLabel(group: string | undefined): string {
  if (!group) return "";
  return (
    (HERO_GROUP_LABELS as Record<string, string>)[group] ??
    (BIBLE_GROUP_LABELS as Record<string, string>)[group] ??
    group
  );
}

/**
 * The "Lived:" line, from whatever dates a hero actually has.
 *
 * Three call sites were rendering `{birthYear || ""} - {deathYear || ""}`,
 * which gave a bare " - " badge and a "? - ?" for every biblical figure,
 * because none of them had dates at all. Returning "" lets the caller hide the
 * row instead of displaying punctuation.
 *
 * A "fl." value stands alone: a floruit IS the estimate, so "fl. c. AD 50 - ?"
 * would be claiming ignorance of something already stated.
 */
export function livedLabel(hero: {
  birthYear?: string | null;
  deathYear?: string | null;
}): string {
  const born = hero.birthYear?.trim();
  const died = hero.deathYear?.trim();
  if (born && died) return `${born} – ${died}`;
  if (born) return /^fl\./i.test(born) ? born : `${born} – ?`;
  if (died) return `? – ${died}`;
  return "";
}

export const heroOfFaithSchema = z.object({
  /**
   * A SLUG, not a uuid.
   *
   * These were uuidv4() generated at module load, which meant the identity of
   * a hero depended on when the process started -- there was nothing stable to
   * upsert against, so the seed could only ever run on an empty table and
   * adding a hero to the data file did nothing to a database that already had
   * rows. A slug is stable across environments, readable in a URL, and makes
   * the seed idempotent.
   */
  id: z.string(),
  name: z.string(),
  description: z.string(),
  timePeriod: z.string(),
  contribution: z.string(),
  /** Which list this person belongs to. Absent means church history. */
  collection: z.enum(HERO_COLLECTIONS).optional(),
  /**
   * Which era this person is browsed under: a church-history era for the
   * historical collection, a period of Scripture for the biblical one.
   */
  group: z.string().optional(),
  /** Where they lived and worked, in a few words. "Colonial America". */
  place: z.string().optional(),
  /** 250-350 words. The thing a child can read without any AI involved. */
  biography: z.string().optional(),
  /**
   * What they got wrong, where it matters.
   *
   * Optional and used sparingly, but present on purpose: several of these
   * people held positions their own tradition later repudiated, and a
   * children's history that leaves that out is not history.
   */
  complications: z.string().optional(),
  /** Free-text terms for search -- "martyr", "translator", "hymn writer". */
  tags: z.array(z.string()).optional().default([]),
  /** English Wikipedia article title, for the "read more" link. */
  wikipedia: z.string().optional(),
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
    year: z.string().optional(),
    description: z.string(),
    /** Where a date comes from, when the usual source does not state it. */
    dateNote: z.string().optional(),
    /** Chapter and verse, for events located in Scripture rather than in time. */
    reference: z.string().optional(),
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
