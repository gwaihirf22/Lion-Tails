import type { Express, Request, Response } from "express";
import { dbConnectionStatus, pool, schemaStatus, schemaProblems } from "./db";
import { isModelAllowedFor, listSelectableModels, MODEL_CATALOG, DEFAULTS,
  avatarCapFor,
  hasUnlimitedUse,
  avatarsRemaining,
  MAX_FREE_AVATARS,
} from "./lib/modelPolicy";
import { StoryGenerationError } from "./lib/storyErrors";
import {
  enqueueStoryJob,
  getStoryJob,
  listActiveStoryJobs,
  cancelStoryJob,
  countInFlight,
} from "./lib/storyJobs";
import { activeWorld } from "./lib/worldState";
import {
  type StoryBrief,
  buildStoryBrief,
  buildSystemPrompt,
  resolveStoryCharacters,
  resolveStoryFocus,
  resolveHeroOfFaith,
  serialiseBrief,
} from "./lib/storyBrief";
import { getWordCountFromLength , generateStoryImage } from "./lib/openai-implementation";
import { canEnqueueWithinQuota } from "./lib/openai";
import { requireAuth, requireParentMode } from "./lib/requireAuth";
import {
  listUniverses,
  getUniverse,
  createUniverse,
  renameUniverse,
  deleteUniverse,
  setStoryUniverse,
  resolveUniverseForRequest,
  addCanon,
  removeCanon,
  editSummary,
} from "./lib/storyUniverses";
import {
  loadUniverseStories,
  selectWindow,
  summarySystemPrompt,
  SUMMARY_TARGET_WORDS,
} from "./lib/universeSummary";
import { resolveModel } from "./lib/modelPolicy";
import { MODEL_CONTEXT_LIMIT } from "./lib/openai-implementation";
import {
  getModelStats,
  getFailureStats,
  getStepCosts,
  getRecentGenerations,
  getJobHealth,
} from "./lib/generationStats";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  MAX_AVATARS,
  virtueLevels,
  avatarsOf, storyRequestSchema, savedStorySchema, songSchema, characterSchema, heroOfFaithSchema, heroStorySchema, readingPrefsSchema, READING_PREFS_DEFAULTS } from "@shared/schema";
import { analyzeImageWithOpenAI } from "./lib/openai-implementation";
import { getBibleVerseByTheme } from "./data/bibleVerses";
import { categoryOf, vocabularyErrors } from "@shared/characterVocab";
import { randomUUID } from "crypto";
import { promises as fsp } from "fs";
import path from "path";
import { generateAvatar, AVATAR_DIR } from "./lib/avatar";
import { statsAreAffordable } from "@shared/schema";
import { z, ZodError } from "zod";
// The /v3 entry point, deliberately. zod-validation-error 5 defaults to
// zod 4's $ZodError type, and this app defines its schemas with zod 3's
// classic API -- so the default export rejects every ZodError we pass it with
// "missing the following properties: type, _zod". zod 3.25 ships both APIs
// side by side and this package ships a matching entry for each. Switch this
// to the bare specifier as part of the zod 4 migration, not before.
import { fromZodError } from "zod-validation-error/v3";
import { v4 as uuidv4 } from "uuid";
import { setupAuth } from "./auth";
import { registerSongRoutes } from "./songs";
import { requireAdmin } from "./lib/requireAuth";

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication with passport and session
  setupAuth(app);

  /**
   * Characters. Two write paths, because two people write them.
   *
   * A CHILD SELECTS. Everything descriptive comes from shared/characterVocab.ts
   * -- the same catalogue the form draws its options from -- so the strict path
   * below refuses anything off-list. The only free text is the name and the
   * notes box.
   *
   * A PARENT MAY TYPE ANYTHING, through PUT /api/characters/:id/custom, which
   * carries requireParentMode. That is a separate route rather than a flag on
   * this one because requireParentMode is middleware: it reads the session, and
   * it cannot look inside a body to decide whether this particular request is
   * allowed to be permissive. Deciding that inside the handler instead is the
   * shape requireAuth.ts warns about, and how eight unguarded write routes once
   * shipped. It also matches PUT /api/universes/:id/summary, which is the same
   * arrangement for the same reason.
   *
   * Ownership is a required argument to every storage call rather than a check
   * here, so an unscoped read or write cannot be written by accident.
   */

  /**
   * What may be said about ONE generation.
   *
   * `note` is a one-off steer -- "wearing a blue scarf" -- appended to the
   * prompt for this picture only. `remember` promotes it into canonicalLook so
   * later pictures inherit it. Bounded because it reaches an image prompt.
   */
  const avatarRequestSchema = z.object({
    note: z.string().trim().max(200).optional(),
    remember: z.boolean().optional(),
  });

  /** What a child may send. id and createdAt are the server's to assign. */
  const characterWriteSchema = characterSchema.omit({
    id: true,
    createdAt: true,
    // Parent Mode's, both of them. Accepting either here would make
    // create-then-never-edit a way around the gate.
    mustBeTrue: true,
    customFields: true,
    // The server's, not the client's. A body that could add an adventure could
    // award itself unlimited stat points.
    adventures: true,
    // Also the server's. This ends up in <img src> on the card, so accepting it
    // from a request means any session can point a child's character at a
    // third-party URL -- a tracking pixel that fires on every page view, with
    // no UI ever having offered it. The avatar work will write it from the
    // server after generating or storing an image; nothing else should.
    avatarUrl: true,
    avatarPrompt: true,
    avatars: true,
    // The read-receipt for a badge. A client that could write it could
    // silence its own notification.
    seenVirtues: true,
    // Derived from `kind` below, never taken from the client: a body claiming
    // {kind: "dragon", category: "human"} would otherwise pick the human
    // colour lists to validate against.
    category: true,
  });

  app.get("/api/characters", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const characters = await storage.getAllCharacters(userId);
      res.json(characters);
    } catch (error) {
      console.error("Error fetching characters:", error);
      res.status(500).json({ message: "Failed to fetch characters" });
    }
  });

  app.get("/api/characters/:id", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const character = await storage.getCharacterById(req.params.id, userId);
      // 404 rather than 403 for a character owned by someone else. A 403 would
      // confirm the id names a real character, which is an oracle for anyone
      // guessing ids.
      if (!character) {
        return res.status(404).json({ message: "Character not found" });
      }
      res.json(character);
    } catch (error) {
      console.error("Error fetching character:", error);
      res.status(500).json({ message: "Failed to fetch character" });
    }
  });

  app.post("/api/characters", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;

      // characterSchema was imported and never called, so this handler used to
      // spread req.body straight into the jsonb column and the catch below was
      // unreachable. Parsing also strips unknown keys, which is what the manual
      // destructure of id and createdAt was standing in for.
      const parsed = characterWriteSchema.parse(req.body);
      const category = categoryOf(parsed.kind);

      const problems = vocabularyErrors(parsed, category);
      if (problems.length) {
        return res.status(400).json({ message: problems.join(" ") });
      }
      // A new character has earned nothing, so this allows exactly the starting
      // points and no more.
      if (parsed.stats && !statsAreAffordable(parsed.stats, undefined)) {
        return res.status(400).json({ message: "That character has spent more points than they have." });
      }

      const character = await storage.createCharacter({ ...parsed, category }, userId);
      res.status(201).json(character);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      console.error("Error creating character:", error);
      res.status(500).json({ message: "Failed to create character" });
    }
  });

  /**
   * Creating a character a parent typed rather than picked.
   *
   * The same gate as the custom PUT below, and it exists so that making a space
   * whale is one step. Without it a parent has to create something the
   * catalogue allows and then immediately customise it, and the character they
   * asked for never exists on its own.
   */
  app.post("/api/characters/custom", requireAuth, requireParentMode, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const parsed = characterSchema
        .omit({ id: true, createdAt: true, customFields: true, adventures: true,
                 avatarUrl: true, avatarPrompt: true, avatars: true,
                 seenVirtues: true })
        .parse(req.body);

      const customFields = Object.keys(parsed).filter((k) => k !== "category");
      const character = await storage.createCharacter({ ...parsed, customFields }, userId);
      res.status(201).json(character);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      console.error("Error creating custom character:", error);
      res.status(500).json({ message: "Failed to create character" });
    }
  });

  app.put("/api/characters/:id", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const existing = await storage.getCharacterById(req.params.id, userId);
      if (!existing) {
        return res.status(404).json({ message: "Character not found" });
      }

      const updates = characterWriteSchema.partial().parse(req.body);

      // THE PATCH IS VALIDATED, NOT THE MERGED CHARACTER. A parent may have
      // typed a value this catalogue does not contain; checking the whole
      // merged document would then reject a child's unrelated edit to some
      // other field, and only for the families who used Parent Mode.
      const category = "kind" in updates ? categoryOf(updates.kind) : existing.category;
      const problems = vocabularyErrors(updates, category);
      if (problems.length) {
        return res.status(400).json({ message: problems.join(" ") });
      }

      // Against the adventures THIS character has been through -- read from the
      // stored row, never from the request, which cannot be trusted to say how
      // many stories it has earned.
      if (updates.stats && !statsAreAffordable(updates.stats, existing)) {
        return res.status(400).json({ message: "That is more points than this character has." });
      }

      const patch = "kind" in updates ? { ...updates, category } : updates;
      const character = await storage.updateCharacter(req.params.id, userId, patch);
      if (!character) {
        return res.status(404).json({ message: "Character not found" });
      }
      res.json(character);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      console.error("Error updating character:", error);
      res.status(500).json({ message: "Failed to update character" });
    }
  });

  /**
   * The Parent Mode escape hatch: any field, any value.
   *
   * The catalogue cannot anticipate everything, and a parent should not be held
   * to a list a child needs. Nothing here is checked against the vocabulary --
   * only lengths, so a field cannot become a document. Whatever they typed is
   * recorded in customFields so the form shows it as chosen rather than
   * blanking it for being off-list.
   */
  app.put("/api/characters/:id/custom", requireAuth, requireParentMode, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const existing = await storage.getCharacterById(req.params.id, userId);
      if (!existing) {
        return res.status(404).json({ message: "Character not found" });
      }

      // Stats are deliberately NOT budget-checked here: a parent may hand their
      // child an already-remarkable character rather than making them earn it
      // over twenty stories. adventures stays server-owned even so -- it is a
      // record of what happened, not a setting.
      // avatarUrl is server-owned on this path too. Parent Mode is a licence to
      // type anything into the STORY, not to choose which host the browser
      // fetches a child's picture from.
      const updates = characterSchema
        .omit({ id: true, createdAt: true, customFields: true, adventures: true,
                 avatarUrl: true, avatarPrompt: true, avatars: true,
                 seenVirtues: true })
        .partial()
        .parse(req.body);

      const touched = Object.keys(updates).filter((k) => k !== "category");
      const customFields = Array.from(new Set([...(existing.customFields ?? []), ...touched]));

      const character = await storage.updateCharacter(req.params.id, userId, {
        ...updates,
        customFields,
      });
      if (!character) {
        return res.status(404).json({ message: "Character not found" });
      }
      res.json(character);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      console.error("Error customising character:", error);
      res.status(500).json({ message: "Failed to update character" });
    }
  });

  /**
   * Generate this character's portrait.
   *
   * NOT behind Parent Mode. Generating is the path we want people to take --
   * it is the alternative to a child's photograph, not a privileged extra --
   * and what governs it is the allowance, not a password. Uploading a photo is
   * the one that needs a grown-up.
   *
   * CHARGED BEFORE THE CALL, REFUNDED IF IT FAILS. Charging on success is the
   * pattern storyWorker uses and it is the wrong one here: between a "do they
   * have one left" read and a later increment, a second request reads the same
   * number, and a cap that can be beaten by pressing a button twice is not a
   * cap. So the allowance is reserved by the same statement that checks it, and
   * given back when nothing was generated. The two failure modes are not
   * symmetric -- losing a generation to a crash costs a user one picture, and
   * getting it wrong the other way costs the owner an unbounded image bill.
   */
  app.post("/api/characters/:id/avatar", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const character = await storage.getCharacterById(req.params.id, userId);
      if (!character) {
        return res.status(404).json({ message: "Character not found" });
      }

      // What they asked to be different about this one, and whether to keep
      // it. Parsed rather than trusted: it reaches an image prompt, and it can
      // be written into canonicalLook, which is a field a person owns.
      const { note, remember } = avatarRequestSchema.parse(req.body ?? {});

      const isAdmin = Boolean((req.user as any).isAdmin);
      const hasOwnKey = Boolean(await storage.getUserOpenAIKey(userId).catch(() => null));
      const unlimited = hasUnlimitedUse({ isAdmin, hasOwnKey });
      const used = await storage.getAvatarCount(userId);
      const remaining = avatarsRemaining(used, { isAdmin, hasOwnKey });

      if (remaining <= 0) {
        return res.status(403).json({
          code: "avatar_allowance_spent",
          message:
            `You have used all ${MAX_FREE_AVATARS} of your free pictures. ` +
            "Add your own OpenAI API key in Settings to make more.",
          used,
          limit: MAX_FREE_AVATARS,
        });
      }

      // Checked BEFORE the charge: a refusal must not spend an allowance.
      // Separate from that allowance on purpose -- this bounds what one
      // character holds, the allowance bounds what an account may spend, and
      // deleting a picture frees a slot here while refunding nothing there.
      const cap = avatarCapFor({ isAdmin, hasOwnKey });
      if (avatarsOf(character).length >= cap) {
        return res.status(409).json({
          code: "avatar_limit",
          message:
            cap === 1
              ? `${character.name} already has a picture. Delete it to draw another, or ` +
                "add your own OpenAI API key in Settings to keep up to " +
                `${MAX_AVATARS}.`
              : `${character.name} already has ${cap} pictures. Delete one to make room.`,
          limit: cap,
        });
      }

      // The check and the charge, in one statement. Unlimited users are still
      // counted -- the number stays true -- but never blocked.
      const charged = await storage.chargeAvatarGeneration(
        userId,
        unlimited ? Infinity : MAX_FREE_AVATARS,
      );
      if (!charged) {
        return res.status(403).json({
          code: "avatar_allowance_spent",
          message: `You have used all ${MAX_FREE_AVATARS} of your free pictures.`,
          used,
          limit: MAX_FREE_AVATARS,
        });
      }

      // grantedByAllowance ONLY for the capped user: an admin or own-key user
      // already passes the premium gate on their own, and saying otherwise
      // would hide which of the two actually paid for this call.
      // Draw it to LOOK LIKE the one they already chose, when there is one.
      const gallery = avatarsOf(character);
      const result = await generateAvatar(character, userId, {
        grantedByAllowance: !unlimited,
        likeUrl: character.avatarUrl ?? gallery[gallery.length - 1]?.url,
        note,
      });

      if (!result) {
        await storage.refundAvatarGeneration(userId);
        return res.status(502).json({
          code: "avatar_generation_failed",
          message: "The picture could not be made just now. Please try again.",
        });
      }

      // Appended AND selected. A picture you just asked for is the one you
      // meant to look at; making it a two-step would be pedantry.
      const entry = {
        id: randomUUID(),
        url: result.url,
        prompt: result.prompt,
        createdAt: new Date().toISOString(),
      };
      /**
       * "Remember this" folds the note into canonicalLook, which is the field
       * that steers every future picture AND is a field the user owns and can
       * see. Appended, never replaced, and REFUSED rather than truncated when
       * it will not fit: silently cutting the end off a description someone
       * wrote is a worse outcome than not saving the note.
       */
      const keepNote =
        remember && note
          ? [character.canonicalLook, note].filter(Boolean).join(" ").trim()
          : undefined;

      const updated = await storage.updateCharacter(req.params.id, userId, {
        avatars: [...avatarsOf(character), entry].slice(-cap),
        avatarUrl: result.url,
        avatarPrompt: result.prompt,
        ...(keepNote && keepNote.length <= 300 ? { canonicalLook: keepNote } : {}),
      });
      if (!updated) {
        // The image exists but its owner does not, which means the character
        // was deleted mid-generation. Do not refund: the money was spent.
        return res.status(404).json({ message: "Character not found" });
      }

      res.json({
        character: updated,
        remaining: unlimited ? null : avatarsRemaining(used + 1, { isAdmin, hasOwnKey }),
      });
    } catch (error) {
      // A note that is too long is the CALLER's problem, and every other write
      // route in this file says so with a 400. Without this branch it fell
      // through to the 500 below and read as "the picture could not be made",
      // which is the one thing it was not.
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      console.error("Error generating character avatar:", error);
      res.status(500).json({ message: "Failed to generate a picture" });
    }
  });

  /**
   * Mark this character's virtues as looked at.
   *
   * The list is computed HERE, from the row, and never taken from the body:
   * virtues are derived from adventures, which are server-owned, so letting a
   * request name what it had seen would let it acknowledge a virtue that does
   * not exist -- and then a real one arriving with the same name would never
   * badge.
   */
  app.put("/api/characters/:id/virtues/seen", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const character = await storage.getCharacterById(req.params.id, userId);
      if (!character) return res.status(404).json({ message: "Character not found" });

      const updated = await storage.updateCharacter(req.params.id, userId, {
        seenVirtues: Object.keys(virtueLevels(character)),
      });
      res.json(updated);
    } catch (error) {
      console.error("Error marking virtues seen:", error);
      res.status(500).json({ message: "Failed to update this character" });
    }
  });

  /** Choose which of a character's pictures the stories and the card use. */
  app.put("/api/characters/:id/avatar/:avatarId", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const character = await storage.getCharacterById(req.params.id, userId);
      if (!character) return res.status(404).json({ message: "Character not found" });

      const picked = avatarsOf(character).find((a) => a.id === req.params.avatarId);
      if (!picked) return res.status(404).json({ message: "Picture not found" });

      // avatarUrl and avatarPrompt ARE the selection. Everything downstream --
      // the card, the form, a story illustration -- reads those two and knows
      // nothing about the gallery, which is what keeps this a display change
      // rather than a change to how a character is drawn into a story.
      const updated = await storage.updateCharacter(req.params.id, userId, {
        avatars: avatarsOf(character),
        avatarUrl: picked.url,
        avatarPrompt: picked.prompt,
      });
      res.json(updated);
    } catch (error) {
      console.error("Error selecting avatar:", error);
      res.status(500).json({ message: "Failed to choose that picture" });
    }
  });

  /**
   * Delete one picture.
   *
   * Frees a slot for this character and REFUNDS NOTHING against the account's
   * lifetime allowance -- the money was spent when the image was made. If the
   * two were connected, delete-and-regenerate would be a free image forever,
   * which is the exact hole MAX_FREE_AVATARS counts generations to avoid.
   */
  app.delete("/api/characters/:id/avatar/:avatarId", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const character = await storage.getCharacterById(req.params.id, userId);
      if (!character) return res.status(404).json({ message: "Character not found" });

      const gallery = avatarsOf(character);
      const gone = gallery.find((a) => a.id === req.params.avatarId);
      if (!gone) return res.status(404).json({ message: "Picture not found" });

      const kept = gallery.filter((a) => a.id !== req.params.avatarId);
      // Deleting the chosen one has to choose again, or the character keeps an
      // avatarUrl pointing at a file that is about to stop existing.
      const stillChosen = kept.some((a) => a.url === character.avatarUrl);
      const next = stillChosen ? undefined : kept[kept.length - 1];

      const updated = await storage.updateCharacter(req.params.id, userId, {
        avatars: kept,
        ...(stillChosen
          ? {}
          : { avatarUrl: next?.url ?? undefined, avatarPrompt: next?.prompt ?? undefined }),
      });

      // The row is updated FIRST and the file removed after. The other order
      // leaves a character pointing at a file that is already gone if the
      // write fails, which shows a broken image; this order leaves an orphan
      // file nobody references, which shows nothing.
      const name = path.basename(gone.url);
      if (/^avatar_[0-9a-f-]+\.png$/i.test(name)) {
        await fsp.rm(path.join(AVATAR_DIR, name), { force: true }).catch((e) => {
          console.warn(`[avatar] could not remove ${name}:`, e);
        });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error deleting avatar:", error);
      res.status(500).json({ message: "Failed to delete that picture" });
    }
  });

  app.delete("/api/characters/:id", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const success = await storage.deleteCharacter(req.params.id, userId);
      if (!success) {
        return res.status(404).json({ message: "Character not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting character:", error);
      res.status(500).json({ message: "Failed to delete character" });
    }
  });
  
  // Register song routes
  registerSongRoutes(app);

  // POST /api/generate-story was deleted here. It had zero client callers and
  // was a second generation path with different save semantics -- exactly the
  // kind of parallel definition that has produced most of this repo's bugs.

  // Enqueue-only. The URL is kept because the client posts here, but it now
  // answers 202 with a job id instead of holding the request open for the whole
  // generation. That request could run 500s on a local model, past SWAG's 240s
  // proxy timeout -- at which point nginx returns its own HTML error page, the
  // client parses it as JSON, and the user sees
  // `Unexpected token '<', "<!DOCTYPE "`. Removing the long-lived request is
  // what removes that failure, and it also means navigating away no longer
  // abandons the story.
  app.post("/api/story/generate", requireAuth, async (req, res) => {
    try {
      const validatedData = storyRequestSchema.parse(req.body);
      const userId = (req.user as any).id;

      // Quota is charged at SUCCESS now (see storyWorker.finishSucceeded), so
      // the check here must count work already in flight as well as work
      // already paid for -- otherwise a user could enqueue repeatedly before
      // any of it completed.
      const allowed = await canEnqueueWithinQuota(userId);
      if (!allowed.ok) {
        return res.status(429).json({ message: allowed.message, code: "quota_exceeded" });
      }

      // The brief is resolved and FROZEN here. resolveStoryCharacter reads the
      // database, so building it at generation time would let a character
      // deleted mid-story change the brief between chapter 4 and chapter 5.
      // Chosen HERE, before the brief, so it is frozen with everything else and
      // actually reaches the prompt. It used to be picked with Math.random()
      // after generation and attached as a label the story had never seen.
      if (!validatedData.moralOutcome) {
        const shapes = ["positive", "learning", "consequences", "creative"] as const;
        validatedData.moralOutcome = shapes[Math.floor(Math.random() * shapes.length)];
      }

      // Resolve the universe BEFORE the brief is built, so membership,
      // continuity and the brief all freeze together. Continuing a story
      // adopts its universe, creating one from the parent if it has none.
      const universeId = await resolveUniverseForRequest(userId, {
        universeId: validatedData.universeId,
        continuesStoryId: validatedData.continuesStoryId,
      });
      validatedData.universeId = universeId;

      // Typed from the brief rather than restated, so a new tier cannot be
      // added there and silently dropped here.
      let continuity: StoryBrief["continuity"];
      if (universeId) {
        const universe = await getUniverse(userId, universeId);
        if (universe) {
          continuity = {
            // Proposed canon is inert until a human approves it: a 20B model
            // does not get to write permanent world-facts.
            canon: universe.pinnedCanon.filter((c) => c.status === "active").map((c) => c.text),
            summary: universe.summary ?? undefined,
            // Graded rather than merged: renderBrief gives characters, facts
            // and threads three different degrees of force, and the third being
            // optional is what stops a remembered world becoming a repeated one.
            world: activeWorld(universe.worldState ?? []),
          };
        }
      }

      const characters = await resolveStoryCharacters(validatedData, userId);
      // Resolved HERE, with the character, so the hero's actual biography is
      // frozen into the brief. The prompt used to receive the raw select value
      // -- a uuid -- as the hero's name.
      const hero = await resolveHeroOfFaith(validatedData);
      // Frozen onto the request so the worker's saveStory finds it without a
      // caller having to remember to pass it.
      if (hero) validatedData.heroId = hero.id;
      // "Surprise me" is settled HERE, before the request is frozen, so the
      // stored request records the moment that was actually chosen rather than
      // an instruction to choose one. Same reasoning as heroId above.
      resolveStoryFocus(validatedData, hero);
      const result = await enqueueStoryJob({
        userId,
        request: validatedData,
        // JSON, not prose: the worker renders a different projection per
        // prompt site, so freezing one rendering would lose the others.
        brief: serialiseBrief(buildStoryBrief(validatedData, characters, continuity, hero)),
        // Parent Mode is derived inside buildSystemPrompt from the request, so
        // there is no second argument here to forget. See storyBrief.ts.
        systemPrompt: buildSystemPrompt(validatedData),
        targetWordCount: getWordCountFromLength(validatedData.storyLength || "medium", validatedData.storyType),
      });

      if (!result.ok) {
        return res.status(result.status).json({
          message: result.message,
          code: result.code,
          inFlight: result.inFlight,
        });
      }
      return res.status(202).json({ jobId: result.jobId, status: "queued" });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      // A typed generation failure already knows its status and carries a
      // message written for the person reading it. Flattening it to a 500
      // "Failed to start story generation" is what made a missing server API
      // key indistinguishable from a bug.
      if (error instanceof StoryGenerationError) {
        console.error(`Enqueue rejected (${error.code}):`, error.message);
        return res.status(error.statusCode).json({ message: error.message, code: error.code });
      }
      console.error("Error enqueueing story:", error);
      res.status(500).json({ message: "Failed to start story generation" });
    }
  });

  // ---------------------------------------------------------------------
  // Universes
  //
  // Every route is user-scoped in the statement itself, not by a prior SELECT:
  // request.universeId is client-supplied, and without that scoping a user
  // could attach a story to someone else's universe and read its summary.
  // ---------------------------------------------------------------------
  app.get("/api/universes", requireAuth, async (req, res) => {
    res.json(await listUniverses((req.user as any).id));
  });

  app.post("/api/universes", requireAuth, async (req, res) => {
    const result = await createUniverse((req.user as any).id, String(req.body?.name ?? ""));
    if ("error" in result) return res.status(400).json({ message: result.error });
    res.status(201).json(result);
  });

  app.patch("/api/universes/:id", requireAuth, async (req, res) => {
    const ok = await renameUniverse((req.user as any).id, req.params.id, String(req.body?.name ?? ""));
    if (!ok) return res.status(404).json({ message: "No such universe" });
    res.json({ renamed: true });
  });

  // The stories survive: universe_id is ON DELETE SET NULL, so they return to
  // Unassigned rather than being deleted with the folder they were in.
  app.delete("/api/universes/:id", requireAuth, async (req, res) => {
    const ok = await deleteUniverse((req.user as any).id, req.params.id);
    if (!ok) return res.status(404).json({ message: "No such universe" });
    res.json({ deleted: true, storiesKept: true });
  });

  app.put("/api/stories/:id/universe", requireAuth, async (req, res) => {
    const target = req.body?.universeId ?? null;
    const ok = await setStoryUniverse((req.user as any).id, req.params.id, target);
    if (!ok) return res.status(404).json({ message: "No such story or universe" });
    res.json({ universeId: target });
  });

  /**
   * Enqueue a summary.
   *
   * A job rather than a synchronous call: a summary reads several full stories
   * and on gpt-oss that is minutes, which is the same request-length problem
   * that made story generation asynchronous.
   *
   * canMakeSummary is computed server-side and enforced here as well as
   * displayed -- the client must not hold a second definition of "current".
   */
  app.post("/api/universes/:id/summary", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const universe = await getUniverse(userId, req.params.id);
    if (!universe) return res.status(404).json({ message: "No such universe" });

    // Parent Mode may force a rebuild of a summary that is already current.
    // Without it a bad summary is permanent until hand-rewritten, and these
    // models produce a bad one often enough for that to matter.
    const force = req.body?.force === true;
    if (force) {
      const expiry = (req.session as { parentModeExpiry?: number } | undefined)?.parentModeExpiry;
      if (!expiry || Date.now() >= expiry) {
        return res.status(403).json({
          code: "parent_mode_required",
          message: "Rebuilding a summary that is already current needs Parent Mode.",
        });
      }
    }
    if (universe.activeSummaryJobId) {
      return res.status(409).json({
        code: "summary_in_progress",
        message: "A summary is already being written for this universe.",
        jobId: universe.activeSummaryJobId,
      });
    }
    if (universe.storyCount < 2) {
      return res.status(400).json({
        code: "not_enough_stories",
        message: "A universe needs at least two stories before a summary is worth making.",
      });
    }
    if (!universe.canMakeSummary && !force) {
      return res.status(409).json({
        code: "summary_current",
        message: "This summary is already up to date. It unlocks again when a story is added.",
      });
    }

    const resolved = await resolveModel(userId, "chat");
    if (!resolved) {
      return res.status(503).json({
        code: "no_model_available",
        message: "No model is available for your account.",
      });
    }

    const stories = await loadUniverseStories(universe.universeId);
    const window = selectWindow({
      stories,
      existingSummary: universe.summary,
      canon: universe.pinnedCanon,
      contextLimit: MODEL_CONTEXT_LIMIT,
    });

    const result = await enqueueStoryJob({
      userId,
      kind: "summary",
      universeId: universe.universeId,
      // Frozen at enqueue for the same reason a story brief is: a story added
      // or deleted mid-run would otherwise change the input between a crash and
      // the resume.
      request: {} as any,
      brief: window.text,
      systemPrompt: summarySystemPrompt(),
      targetWordCount: SUMMARY_TARGET_WORDS,
      // The ids this window covers. Recorded so the covered count is real and so a
      // truncated summary can rebuild a SMALLER window and retry.
      outline: window.storyIds,
    });
    if (!result.ok) {
      return res.status(result.status).json({
        message: result.message,
        code: result.code,
        inFlight: result.inFlight,
      });
    }
    res.status(202).json({
      jobId: result.jobId,
      status: "queued",
      coveredCount: window.coveredCount,
      droppedCount: window.droppedCount,
    });
  });

  // Editing the summary and pinning canon change what EVERY future story in
  // the universe is written against, so they are the first operations where
  // Parent Mode is enforced on the server rather than only hidden in the UI.
  app.put("/api/universes/:id/summary", requireParentMode, async (req, res) => {
    const ok = await editSummary((req.user as any).id, req.params.id, String(req.body?.summary ?? ""));
    if (!ok) return res.status(404).json({ message: "No such universe" });
    res.json({ saved: true });
  });

  app.post("/api/universes/:id/canon", requireParentMode, async (req, res) => {
    const result = await addCanon(
      (req.user as any).id,
      req.params.id,
      String(req.body?.text ?? ""),
      req.body?.sourceStoryId,
    );
    if (!result.ok) return res.status(400).json({ message: result.error });
    res.status(201).json({ added: true });
  });

  app.delete("/api/universes/:id/canon/:canonId", requireParentMode, async (req, res) => {
    const ok = await removeCanon((req.user as any).id, req.params.id, req.params.canonId);
    if (!ok) return res.status(404).json({ message: "No such universe" });
    res.json({ removed: true });
  });

  // Poll one job. 404 rather than 403 for someone else's job, so ids are not
  // enumerable. The full story is returned inline on success -- the poller is
  // already asking, so make the answer complete.
  app.get("/api/story/jobs/:jobId", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const job = await getStoryJob(req.params.jobId, userId);
    if (!job) return res.status(404).json({ message: "Job not found" });
    let story: unknown;
    if (job.status === "succeeded" && job.story_id) {
      story = await storage.getStoryById(job.story_id, userId).catch(() => undefined);
    }
    res.json({ ...job, story });
  });

  // Admin-only stats over generation_records. requireAdmin is the same guard
  // the hero/song write routes use -- deliberately not a second notion of who
  // is an admin. Authorisation is users.is_admin, never a username comparison.
  app.get("/api/admin/generation-stats", requireAdmin, async (req, res) => {
    // Clamped rather than trusted: this reaches a date_trunc interval.
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
    try {
      const [models, failures, steps, recent, jobs] = await Promise.all([
        getModelStats({ days }),
        getFailureStats({ days }),
        getStepCosts({ days }),
        getRecentGenerations(Number(req.query.limit) || 50),
        getJobHealth({ days }),
      ]);
      res.json({ windowDays: days, models, failures, steps, recent, jobs });
    } catch (error) {
      console.error("Failed to build generation stats:", error);
      res.status(500).json({ message: "Could not load generation stats" });
    }
  });

  // In-flight jobs plus anything finished in the last hour. That window is how
  // a reloaded page rediscovers a job it was not watching, with no
  // localStorage involved.
  app.get("/api/story/jobs", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    res.json(await listActiveStoryJobs(userId));
  });

  // Cooperative cancel, checked at step boundaries. Cancelling during chapter 4
  // still pays for chapter 4 -- a completion already in flight cannot be
  // recalled, and the UI should say so rather than implying otherwise.
  app.post("/api/story/jobs/:jobId/cancel", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const ok = await cancelStoryJob(req.params.jobId, userId);
    if (!ok) return res.status(404).json({ message: "No cancellable job with that id" });
    res.json({ cancelled: true });
  });
  
  // Get user's story generation usage stats
  app.get("/api/story/usage", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to view usage stats" });
      }
      
      // Get user ID from authenticated user
      const userId = (req.user as any).id;
      
      // Get the user's current generation count
      const count = await storage.getStoryGenerationCount(userId);
      
      // Get the last reset date or use the current date if none exists
      const lastReset = await storage.getLastResetDate(userId) || new Date();
      
      // Calculate next reset date (1st of next month)
      const nextReset = new Date(lastReset);
      nextReset.setMonth(nextReset.getMonth() + 1);
      nextReset.setDate(1);
      
      // Set standard monthly limit (free tier)
      const monthlyLimit = 10;
      
      // Add initial 50 stories for new users
      const initialBonus = 50;
      
      // Calculate remaining generations
      // If this is the first month (no reset date is set or it's the first time using the app)
      const isNewUser = !await storage.getLastResetDate(userId);
      const limit = isNewUser ? initialBonus + monthlyLimit : monthlyLimit;
      const remaining = Math.max(0, limit - count);
      
      res.json({
        count,
        remaining,
        limit,
        lastReset: lastReset.toISOString(),
        nextReset: nextReset.toISOString(),
        isNewUser
      });
    } catch (error) {
      console.error("Error fetching usage stats:", error);
      res.status(500).json({ message: "Failed to fetch usage statistics" });
    }
  });
  
  // API endpoint to save a story after generation
  app.post("/api/story/save", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to save stories" });
      }
      
      const { story, request, isFavorite } = req.body;
      
      if (!story || !request) {
        return res.status(400).json({ message: "Story and request data are required" });
      }
      
      // Get user ID from authenticated user
      const userId = (req.user as any).id;
      
      // Check if the story is about a Hero of Faith and get the ID
      let heroId: string | undefined = undefined;
      
      // The form's select value is hero.id, so matching on name alone never
      // succeeded and heroId stayed undefined on every story ever saved.
      // resolveHeroOfFaith accepts either shape.
      const resolvedHero = await resolveHeroOfFaith(request);
      if (resolvedHero) {
        heroId = resolvedHero.id;
        // Stamped on the request as well: the fourth argument below exists on
        // IStorage but DbStorage does not accept it, so on Postgres it is
        // silently dropped. The request is the path that actually persists.
        request.heroId = resolvedHero.id;
        console.log(`Found Hero of Faith ID ${heroId} for ${resolvedHero.name}`);
      }
      
      // Save the story with associated hero if applicable
      const savedStory = await storage.saveStory(story, request, userId, heroId);
      
      // If isFavorite is specified, set favorite status
      if (typeof isFavorite === 'boolean' && isFavorite) {
        await storage.toggleFavorite(savedStory.id, true, userId);
        savedStory.isFavorite = true;
      }
      
      // If this is a Hero of Faith story, also save it to the hero stories collection
      if (heroId && story.bibleVerse) {
        try {
          // Create a hero story entry
          await storage.createHeroStory({
            heroId,
            title: story.title,
            content: story.content,
            isHistoricallyAccurate: true,
            bibleVerse: story.bibleVerse,
            isFeatured: false,
            sources: [
              {
                title: "User Generated Story",
                author: "AI Story Generator",
                url: `/stories/${savedStory.id}`
              }
            ]
          }, userId);
          console.log(`Created hero story for hero ${heroId}`);
        } catch (heroStoryError) {
          console.error("Error creating hero story:", heroStoryError);
          // Don't fail the entire request if this part fails
        }
      }
      
      res.status(201).json(savedStory);
    } catch (error) {
      console.error("Error saving story:", error);
      res.status(500).json({ message: "Failed to save story" });
    }
  });
  
  // Search for stories - general search query
  app.get("/api/stories/search", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to search stories" });
      }
      
      const query = req.query.q as string;
      
      if (!query) {
        return res.status(400).json({ message: "Search query is required" });
      }
      
      // Get user ID from authenticated user
      const userId = (req.user as any).id;
      
      // Search stories with the query
      const stories = await storage.searchStories(query, userId);
      
      res.status(200).json(stories);
    } catch (error) {
      console.error("Error searching stories:", error);
      res.status(500).json({ message: "Failed to search stories" });
    }
  });
  
  // Search for stories by name
  app.get("/api/stories/search/name/:name", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to search stories" });
      }
      
      const name = req.params.name;
      
      if (!name) {
        return res.status(400).json({ message: "Name parameter is required" });
      }
      
      // Get user ID from authenticated user
      const userId = (req.user as any).id;
      
      // Search stories with the name
      const stories = await storage.searchStoriesByName(name, userId);
      
      res.status(200).json(stories);
    } catch (error) {
      console.error("Error searching stories by name:", error);
      res.status(500).json({ message: "Failed to search stories by name" });
    }
  });
  
  // Search for stories by Bible passage
  app.get("/api/stories/search/passage/:passage", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to search stories" });
      }
      
      const passage = req.params.passage;
      
      if (!passage) {
        return res.status(400).json({ message: "Bible passage parameter is required" });
      }
      
      // Get user ID from authenticated user
      const userId = (req.user as any).id;
      
      // Search stories with the Bible passage
      const stories = await storage.searchStoriesByBiblePassage(passage, userId);
      
      res.status(200).json(stories);
    } catch (error) {
      console.error("Error searching stories by Bible passage:", error);
      res.status(500).json({ message: "Failed to search stories by Bible passage" });
    }
  });
  
  // Search for stories by topic
  app.get("/api/stories/search/topic/:topic", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to search stories" });
      }
      
      const topic = req.params.topic;
      
      if (!topic) {
        return res.status(400).json({ message: "Topic parameter is required" });
      }
      
      // Get user ID from authenticated user
      const userId = (req.user as any).id;
      
      // Search stories with the topic
      const stories = await storage.searchStoriesByTopic(topic, userId);
      
      res.status(200).json(stories);
    } catch (error) {
      console.error("Error searching stories by topic:", error);
      res.status(500).json({ message: "Failed to search stories by topic" });
    }
  });
  
  // Get stories for a specific Hero of Faith
  app.get("/api/heroes/:heroId/stories", async (req, res) => {
    try {
      const heroId = req.params.heroId;
      
      if (!heroId) {
        return res.status(400).json({ message: "Hero ID parameter is required" });
      }
      
      // Get the hero to confirm it exists
      const hero = await storage.getHeroOfFaithById(heroId);
      
      if (!hero) {
        return res.status(404).json({ message: "Hero not found" });
      }
      
      // Get user ID from authenticated user for permission check
      const userId = req.user ? (req.user as any).id : undefined;
      
      // Get both dedicated hero stories and regular stories about this hero
      const heroStories = await storage.getHeroStoriesByHeroId(heroId);
      
      // Get user-generated stories about this hero
      const userStories = userId ? await storage.getStoriesByHeroId(heroId, userId) : [];
      
      console.log(`Found ${heroStories.length} dedicated hero stories and ${userStories.length} user stories for hero ${heroId}`);
      
      // Return both types of stories
      res.status(200).json({
        heroStories,
        userStories
      });
    } catch (error) {
      console.error("Error fetching hero stories:", error);
      res.status(500).json({ message: "Failed to fetch hero stories" });
    }
  });
  
  // API endpoint to toggle favorite status of a story
  app.post("/api/story/favorite/:id", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to modify stories" });
      }
      
      const { isFavorite } = req.body;
      
      if (typeof isFavorite !== 'boolean') {
        return res.status(400).json({ message: "isFavorite must be a boolean" });
      }
      
      // Get the user ID from the authenticated user
      const userId = (req.user as any).id;
      const story = await storage.toggleFavorite(req.params.id, isFavorite, userId);
      
      if (!story) {
        return res.status(404).json({ message: "Story not found or unauthorized" });
      }
      
      res.json(story);
    } catch (error) {
      console.error("Error updating favorite status:", error);
      res.status(500).json({ message: "Failed to update favorite status" });
    }
  });
  
  // API endpoint to associate a story with a hero of faith
  /**
   * Add an illustration to a story that was saved without one.
   *
   * Stories generated on the free tier never get a picture: illustration is
   * premium and has no cheap or local equivalent, so generation skips it
   * rather than failing the whole story. This lets someone who later adds
   * their own key illustrate a story they already have, instead of having to
   * regenerate it and lose the text they liked.
   */
  app.post("/api/stories/:id/illustrate", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const saved = await storage.getStoryById(req.params.id, userId);
      if (!saved) {
        return res.status(404).json({ message: "Story not found" });
      }
      // Idempotent: a double-click, or two tabs, must not spend twice.
      if (saved.story.imageUrl) {
        return res.json({ imageUrl: saved.story.imageUrl, alreadyExisted: true });
      }

      // The prompt the model wrote for this story when it was generated. Older
      // rows may not have one, so fall back to something derived from the
      // story itself rather than refusing.
      const prompt =
        saved.story.imagePrompt ||
        `An illustration for a children's story titled "${saved.story.title}"`;

      const imageUrl = await generateStoryImage(prompt, userId);
      if (!imageUrl) {
        // generateStoryImage returns undefined for BOTH "not entitled" and
        // "the image call failed", and the caller cannot tell them apart --
        // so this says what to check rather than guessing which it was.
        return res.status(503).json({
          message:
            "Could not create a picture. Illustration needs an admin account or your own OpenAI API key, which you can add in Settings.",
          code: "no_model_available",
        });
      }

      const updated = await storage.setStoryImageUrl(req.params.id, imageUrl, userId);
      if (!updated) {
        // The picture exists on disk but could not be attached. Say so rather
        // than returning a URL the story does not actually carry.
        return res.status(500).json({ message: "The picture was made but could not be saved to the story." });
      }
      res.json({ imageUrl, alreadyExisted: false });
    } catch (error) {
      console.error("Error illustrating story:", error);
      res.status(500).json({ message: "Could not create a picture for this story." });
    }
  });

  app.post("/api/stories/:id/associate-hero", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to modify stories" });
      }
      
      const { heroId } = req.body;
      
      if (!heroId || typeof heroId !== 'string') {
        return res.status(400).json({ message: "Valid hero ID is required" });
      }
      
      // Verify the hero exists
      const hero = await storage.getHeroOfFaithById(heroId);
      if (!hero) {
        return res.status(404).json({ message: "Hero not found" });
      }
      
      // Get the user ID from the authenticated user
      const userId = (req.user as any).id;
      
      // Get the story and update its heroId
      const storyId = req.params.id;
      const story = await storage.getStoryById(storyId, userId);
      
      if (!story) {
        return res.status(404).json({ message: "Story not found or unauthorized" });
      }
      
      // Update the heroId field in the story
      const updatedStory = await storage.updateStoryHeroId(storyId, heroId, userId);
      
      if (!updatedStory) {
        return res.status(500).json({ message: "Failed to associate story with hero" });
      }
      
      res.json(updatedStory);
    } catch (error) {
      console.error("Error associating story with hero:", error);
      res.status(500).json({ message: "Failed to associate story with hero" });
    }
  });
  
  // Get all saved stories - requires authentication
  app.get("/api/stories", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to view stories" });
      }
      
      // Get only the stories belonging to the authenticated user
      const userId = (req.user as any).id;
      const stories = await storage.getUserStories(userId);
      res.json(stories);
    } catch (error) {
      console.error("Error fetching stories:", error);
      res.status(500).json({ message: "Failed to fetch stories" });
    }
  });
  
  // Get a specific story - requires authentication
  app.get("/api/stories/:id", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to view stories" });
      }
      
      // Get the story, but only if it belongs to the authenticated user
      const userId = (req.user as any).id;
      const story = await storage.getStoryById(req.params.id, userId);
      
      if (!story) {
        return res.status(404).json({ message: "Story not found" });
      }
      
      res.json(story);
    } catch (error) {
      console.error("Error fetching story:", error);
      res.status(500).json({ message: "Failed to fetch story" });
    }
  });
  
  // Toggle a story as favorite - requires authentication
  app.put("/api/stories/:id/favorite", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to modify stories" });
      }
      
      const { isFavorite } = req.body;
      
      if (typeof isFavorite !== 'boolean') {
        return res.status(400).json({ message: "isFavorite must be a boolean" });
      }
      
      // Get the user ID from the authenticated user
      const userId = (req.user as any).id;
      const story = await storage.toggleFavorite(req.params.id, isFavorite, userId);
      
      if (!story) {
        return res.status(404).json({ message: "Story not found or unauthorized" });
      }
      
      res.json(story);
    } catch (error) {
      console.error("Error updating story:", error);
      res.status(500).json({ message: "Failed to update story" });
    }
  });
  
  // Delete a story - requires authentication
  app.delete("/api/stories/:id", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to delete stories" });
      }
      
      // Get the user ID from the authenticated user
      const userId = (req.user as any).id;
      const success = await storage.deleteStory(req.params.id, userId);
      
      if (!success) {
        return res.status(404).json({ message: "Story not found or unauthorized" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting story:", error);
      res.status(500).json({ message: "Failed to delete story" });
    }
  });
  
  // All song routes are handled by registerSongRoutes
  
  // API routes for OpenAI settings - all require authentication
  
  // Get user's OpenAI API key (note: we never return the actual key for security, just if it exists)
  app.get("/api/settings/openai-key-status", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to access settings" });
      }
      
      const userId = (req.user as any).id;
      const key = await storage.getUserOpenAIKey(userId);
      res.json({ hasKey: !!key });
    } catch (error) {
      console.error("Error fetching OpenAI key status:", error);
      res.status(500).json({ message: "Failed to fetch API key status" });
    }
  });
  
  // Set user's OpenAI API key
  app.post("/api/settings/openai-key", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to update settings" });
      }
      
      const userId = (req.user as any).id;
      const { key } = req.body;
      
      if (!key || typeof key !== 'string') {
        return res.status(400).json({ message: "Valid API key is required" });
      }
      
      await storage.setUserOpenAIKey(userId, key);
      res.json({ success: true });
    } catch (error) {
      console.error("Error setting OpenAI key:", error);
      res.status(500).json({ message: "Failed to set API key" });
    }
  });
  
  // Delete user's OpenAI API key
  app.delete("/api/settings/openai-key", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to update settings" });
      }
      
      const userId = (req.user as any).id;
      await storage.setUserOpenAIKey(userId, '');
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting OpenAI key:", error);
      res.status(500).json({ message: "Failed to delete API key" });
    }
  });
  
  // Get user's OpenAI model
  app.get("/api/settings/openai-model", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to access settings" });
      }
      
      const userId = (req.user as any).id;
      // The policy's default, not a literal of this route's own. Reporting
      // a model the user is not entitled to would make the settings page and
      // the story-form accuracy note both lie about what is generating.
      const model = (await storage.getUserOpenAIModel(userId)) || DEFAULTS.chat;
      // The tier rides along so the story form can warn about local-model
      // accuracy without a second round trip and without the client keeping its
      // own copy of the catalogue -- there are already six model lists in this
      // codebase and every one of them has drifted at least once.
      res.json({ model, tier: MODEL_CATALOG[model]?.tier ?? 'economy' });
    } catch (error) {
      console.error("Error fetching OpenAI model:", error);
      res.status(500).json({ message: "Failed to fetch model setting" });
    }
  });
  
  // Models this user may select, with tier and quality warnings, so the UI can
  // present the local option honestly rather than offering models that will be
  // rejected or silently downgraded.
  app.get("/api/settings/models", async (req, res) => {
    try {
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const userId = (req.user as any).id;
      const ownKey = await storage.getUserOpenAIKey(userId);
      const isAdmin = Boolean((req.user as any).isAdmin);
      res.json({
        models: listSelectableModels({ isAdmin, hasOwnKey: Boolean(ownKey) }),
        hasOwnKey: Boolean(ownKey),
        // Illustration is premium and has no cheap or local tier. Derived from
        // the policy rather than re-stated as "admin or own key", so the UI
        // cannot drift from what the server will actually allow.
        canIllustrate: isModelAllowedFor(DEFAULTS.image, "image", {
          isAdmin,
          hasOwnKey: Boolean(ownKey),
        }),
        // How many pictures ONE character may keep, for this account. Derived
        // from the same helper the generate route enforces with, for the same
        // reason canIllustrate is derived rather than restated: the UI must not
        // be able to disagree with what the server will actually allow.
        avatarCap: avatarCapFor({ isAdmin, hasOwnKey: Boolean(ownKey) }),
      });
    } catch (error) {
      console.error("Error listing models:", error);
      res.status(500).json({ message: "Failed to list models" });
    }
  });

  // Set user's OpenAI model
  app.post("/api/settings/openai-model", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to update settings" });
      }
      
      const userId = (req.user as any).id;
      const { model } = req.body;
      
      if (!model || typeof model !== 'string') {
        return res.status(400).json({ message: "Valid model name is required" });
      }

      // Reject anything not in the catalog, and anything this user is not
      // entitled to. This is defence in depth, not the enforcement point --
      // resolveModel() re-checks at generation time, because entitlement can
      // change after a model is stored (a user can delete their own API key).
      const ownKey = await storage.getUserOpenAIKey(userId);
      const isAdmin = Boolean((req.user as any).isAdmin);
      if (!isModelAllowedFor(model, "chat", { isAdmin, hasOwnKey: Boolean(ownKey) })) {
        return res.status(403).json({
          message:
            "That model is not available on your account. Premium models require your own OpenAI API key.",
          allowed: listSelectableModels({ isAdmin, hasOwnKey: Boolean(ownKey) }),
        });
      }
      
      await storage.setUserOpenAIModel(userId, model);
      res.json({ success: true });
    } catch (error) {
      console.error("Error setting OpenAI model:", error);
      res.status(500).json({ message: "Failed to set model" });
    }
  });
  
  /**
   * Reading preferences.
   *
   * requireAuth in the SIGNATURE rather than an inline `if (!req.user)` --
   * there are already 29 of those in this file, and that pattern is how eight
   * unguarded write routes once shipped. A missing guard is visible here.
   */
  app.get("/api/settings/reading", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const stored = await storage.getUserReadingPrefs(userId);
      // Defaults filled server-side so the client has one place to read from.
      // NULL columns mean "never chosen", which is why there is no SQL default
      // and nothing to backfill.
      res.json({ ...READING_PREFS_DEFAULTS, ...stored });
    } catch (error) {
      console.error("Error fetching reading preferences:", error);
      res.status(500).json({ message: "Failed to fetch reading preferences" });
    }
  });

  app.post("/api/settings/reading", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      // .partial(): the reader bar sends ONE axis at a time.
      const parsed = readingPrefsSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message ?? "Invalid reading preferences",
        });
      }
      const stored = await storage.setUserReadingPrefs(userId, parsed.data);
      // What is ACTUALLY stored, read back -- not an echo of the request.
      // Storage falls back to memory when the database is away, so a 200 here
      // does not by itself mean anything was persisted.
      res.json({ ...READING_PREFS_DEFAULTS, ...stored });
    } catch (error) {
      console.error("Error saving reading preferences:", error);
      res.status(500).json({ message: "Failed to save reading preferences" });
    }
  });

  // API routes for Heroes of Faith
  
  // Heroes of Faith seeding lives in server/seed.ts and runs after the database
  // is ready. It used to be a fire-and-forget IIFE here, which raced database
  // initialisation and silently seeded into memory.
  
  // Get all heroes of faith
  app.get("/api/heroes", async (req, res) => {
    try {
      const heroes = await storage.getAllHeroesOfFaith();
      res.json(heroes);
    } catch (error) {
      console.error("Error fetching heroes of faith:", error);
      res.status(500).json({ message: "Failed to fetch heroes of faith" });
    }
  });
  
  // Get a specific hero of faith
  app.get("/api/heroes/:id", async (req, res) => {
    try {
      const hero = await storage.getHeroOfFaithById(req.params.id);
      if (!hero) {
        return res.status(404).json({ message: "Hero of faith not found" });
      }
      res.json(hero);
    } catch (error) {
      console.error("Error fetching hero of faith:", error);
      res.status(500).json({ message: "Failed to fetch hero of faith" });
    }
  });
  
  // Create a new hero of faith
  app.post("/api/heroes", requireAdmin, async (req, res) => {
    try {
      // The id and createdAt fields will be added by the storage method
      const { id, createdAt, ...heroData } = req.body;
      
      // Validate the heroData
      const validatedData = heroOfFaithSchema.omit({ id: true, createdAt: true }).parse(heroData);
      
      // Create the hero
      const hero = await storage.createHeroOfFaith(validatedData);
      res.status(201).json(hero);
    } catch (error) {
      console.error("Error creating hero of faith:", error);
      
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      
      res.status(500).json({ message: "Failed to create hero of faith" });
    }
  });
  
  // Update a hero of faith
  app.put("/api/heroes/:id", requireAdmin, async (req, res) => {
    try {
      const { id: bodyId, createdAt, ...updates } = req.body;
      
      const hero = await storage.updateHeroOfFaith(req.params.id, updates);
      
      if (!hero) {
        return res.status(404).json({ message: "Hero of faith not found" });
      }
      
      res.json(hero);
    } catch (error) {
      console.error("Error updating hero of faith:", error);
      
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      
      res.status(500).json({ message: "Failed to update hero of faith" });
    }
  });
  
  // Delete a hero of faith
  app.delete("/api/heroes/:id", requireAdmin, async (req, res) => {
    try {
      const success = await storage.deleteHeroOfFaith(req.params.id);
      
      if (!success) {
        return res.status(404).json({ message: "Hero of faith not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting hero of faith:", error);
      res.status(500).json({ message: "Failed to delete hero of faith" });
    }
  });

  // Analyze an image with OpenAI Vision API - requires authentication
  app.post("/api/analyze-image", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to analyze images" });
      }
      
      const { imageBase64 } = req.body;
      
      if (!imageBase64 || typeof imageBase64 !== 'string') {
        return res.status(400).json({ message: "Valid image data is required" });
      }
      
      // Get the user ID to check for API key
      const userId = (req.user as any).id;
      
      // Check if user has their own OpenAI API key
      const userOpenAIKey = await storage.getUserOpenAIKey(userId);
      
      if (!userOpenAIKey) {
        return res.status(403).json({ 
          message: "Image analysis requires your own OpenAI API key. Please add your API key in Settings."
        });
      }
      
      // Analyze the image with OpenAI using user's API key and userId
      const analysis = await analyzeImageWithOpenAI(imageBase64, userId);
      
      res.json({ analysis });
    } catch (error) {
      console.error("Error analyzing image:", error);
      res.status(500).json({ message: "Failed to analyze image" });
    }
  });
  
  // Generate a story based on an image - requires authentication
  app.post("/api/generate-story-from-image", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to generate stories from images" });
      }
      
      const { imageBase64, childName, gender, theme } = req.body;
      
      if (!imageBase64 || typeof imageBase64 !== 'string') {
        return res.status(400).json({ message: "Valid image data is required" });
      }
      
      if (!childName || !gender) {
        return res.status(400).json({ message: "Child's name and gender are required" });
      }
      
      // Get the user ID to check for API key
      const userId = (req.user as any).id;
      
      // Check if user has their own OpenAI API key
      const userOpenAIKey = await storage.getUserOpenAIKey(userId);
      
      if (!userOpenAIKey) {
        return res.status(403).json({ 
          message: "Generating stories from images requires your own OpenAI API key. Please add your API key in Settings."
        });
      }
      
      // Generate a story based on the image
      const { generateStoryFromImage } = await import('./lib/openai-vision');
      const story = await generateStoryFromImage(imageBase64, childName, gender, theme || 'faith', userId);
      
      // Generate a Bible verse related to the theme
      const bibleVerse = getBibleVerseByTheme(theme || 'faith');
      
      // Create the full story response
      const storyResponse = {
        title: story.title,
        content: story.content,
        bibleVerse,
        imageUrl: undefined // No image URL since we're using the uploaded image
      };
      
      res.json(storyResponse);
    } catch (error) {
      console.error("Error generating story from image:", error);
      res.status(500).json({ 
        title: "Story Generation Error",
        content: "There was an error generating your story from the image. Please check your API key and try again.",
        bibleVerse: {
          text: "Trust in the LORD with all your heart and lean not on your own understanding.",
          reference: "Proverbs 3:5"
        }
      });
    }
  });
  
  // Analyze an attached asset image - requires authentication
  app.post("/api/analyze-attached-image", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to analyze images" });
      }
      
      const { filename } = req.body;
      
      if (!filename || typeof filename !== 'string') {
        return res.status(400).json({ message: "Valid filename is required" });
      }
      
      // Get the user ID to check for API key
      const userId = (req.user as any).id;
      
      // Check if user has their own OpenAI API key
      const userOpenAIKey = await storage.getUserOpenAIKey(userId);
      
      if (!userOpenAIKey) {
        return res.status(403).json({ 
          message: "Image analysis requires your own OpenAI API key. Please add your API key in Settings."
        });
      }
      
      // Load the image from the attached_assets directory
      const { loadAttachedImage } = await import('./lib/openai-vision');
      const imageBase64 = await loadAttachedImage(filename);
      
      if (!imageBase64) {
        return res.status(404).json({ message: `Image file ${filename} not found` });
      }
      
      // Analyze the image with OpenAI
      const analysis = await analyzeImageWithOpenAI(imageBase64, userId);
      
      res.json({ analysis });
    } catch (error) {
      console.error("Error analyzing attached image:", error);
      res.status(500).json({ message: "Failed to analyze image" });
    }
  });

  // Get story generation statistics - requires authentication
  app.get("/api/stats/story-generation", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required to view statistics" });
      }
      
      // Get the user ID from the authenticated user
      const userId = (req.user as any).id;
      const count = await storage.getStoryGenerationCount(userId);
      const lastResetDate = await storage.getLastResetDate(userId);
      
      // Calculate quotas
      const initialQuota = 50;
      const monthlyQuota = 10;
      const used = count;
      let remaining = initialQuota - used;
      
      // Add monthly quotas if applicable
      if (lastResetDate) {
        const now = new Date();
        const monthsSinceReset = Math.floor((now.getTime() - lastResetDate.getTime()) / (30 * 24 * 60 * 60 * 1000));
        
        if (monthsSinceReset > 0) {
          remaining += monthsSinceReset * monthlyQuota;
        }
      }
      
      remaining = Math.max(0, remaining);
      
      res.json({
        used,
        remaining,
        total: initialQuota + (lastResetDate ? monthlyQuota : 0),
        lastResetDate
      });
    } catch (error) {
      console.error("Error fetching story generation stats:", error);
      res.status(500).json({ message: "Failed to fetch story statistics" });
    }
  });

  // Hero Stories Library API Routes
  // Get all hero stories
  app.get("/api/hero-stories", async (req, res) => {
    try {
      const heroId = req.query.heroId as string;
      const stories = await storage.getAllHeroStories(heroId);
      res.json(stories);
    } catch (error) {
      console.error("Error fetching hero stories:", error);
      res.status(500).json({ message: "Failed to fetch hero stories" });
    }
  });
  
  // Get a specific hero story
  app.get("/api/hero-stories/:id", async (req, res) => {
    try {
      const story = await storage.getHeroStoryById(req.params.id);
      if (!story) {
        return res.status(404).json({ message: "Hero story not found" });
      }
      res.json(story);
    } catch (error) {
      console.error("Error fetching hero story:", error);
      res.status(500).json({ message: "Failed to fetch hero story" });
    }
  });
  
  // Create a new hero story
  app.post("/api/hero-stories", requireAdmin, async (req, res) => {
    try {
      const { id, createdAt, ...storyData } = req.body;
      
      // Validate the storyData
      const validatedData = heroStorySchema.omit({ id: true, createdAt: true }).parse(storyData);
      
      const userId = req.user?.id;
      
      // Create the story
      const story = await storage.createHeroStory(validatedData, userId);
      res.status(201).json(story);
    } catch (error) {
      console.error("Error creating hero story:", error);
      
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      
      res.status(500).json({ message: "Failed to create hero story" });
    }
  });
  
  // Update a hero story
  app.put("/api/hero-stories/:id", requireAdmin, async (req, res) => {
    try {
      const { id: bodyId, createdAt, ...updates } = req.body;
      
      const story = await storage.updateHeroStory(req.params.id, updates);
      
      if (!story) {
        return res.status(404).json({ message: "Hero story not found" });
      }
      
      res.json(story);
    } catch (error) {
      console.error("Error updating hero story:", error);
      
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      
      res.status(500).json({ message: "Failed to update hero story" });
    }
  });
  
  // Delete a hero story
  app.delete("/api/hero-stories/:id", requireAdmin, async (req, res) => {
    try {
      const success = await storage.deleteHeroStory(req.params.id);
      
      if (!success) {
        return res.status(404).json({ message: "Hero story not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting hero story:", error);
      res.status(500).json({ message: "Failed to delete hero story" });
    }
  });
  
  // Toggle a hero story's featured status
  app.patch("/api/hero-stories/:id/featured", requireAdmin, async (req, res) => {
    try {
      const { isFeatured } = req.body;
      
      if (typeof isFeatured !== 'boolean') {
        return res.status(400).json({ message: "isFeatured must be a boolean" });
      }
      
      const story = await storage.toggleHeroStoryFeatured(req.params.id, isFeatured);
      
      if (!story) {
        return res.status(404).json({ message: "Hero story not found" });
      }
      
      res.json(story);
    } catch (error) {
      console.error("Error toggling hero story featured status:", error);
      res.status(500).json({ message: "Failed to toggle hero story featured status" });
    }
  });

  // Liveness/readiness probe used by the container healthcheck.
  // See docs/decisions.md §6 before changing the status code or the probe.
  //
  // Returns 503 when a database is configured but unreachable, so that a
  // container which silently fell back to in-memory storage FAILS its
  // healthcheck instead of reporting success while quietly losing every write
  // on the next restart. The compose healthcheck only inspects the status
  // code, so the status code has to carry that meaning.
  //
  // The check probes the pool live rather than reading dbConnectionStatus:
  // that flag is only ever set to "connected" during startup, so a transient
  // idle-client error would otherwise latch it to "error" for the lifetime of
  // the process and the container could never recover its healthy state.
  app.get("/api/health", async (_req, res) => {
    const uptime = Math.round(process.uptime());

    // No DATABASE_URL means in-memory storage was chosen deliberately, so this
    // is healthy-but-not-persistent rather than broken.
    if (!process.env.DATABASE_URL) {
      return res.status(200).json({
        status: "ok",
        db: "not_configured",
        persistence: false,
        uptime,
      });
    }

    let timer: NodeJS.Timeout | undefined;
    let live = false;
    try {
      live = await Promise.race([
        pool
          ? pool.query("SELECT 1").then(() => true)
          : Promise.resolve(false),
        new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(false), 5000);
        }),
      ]);
    } catch {
      live = false;
    } finally {
      if (timer) clearTimeout(timer);
    }

    // A reachable database is not the same as a correct one: the schema
    // drifted once and the only symptom was a 500 on the first signup. Treat a
    // mismatch as unhealthy so it fails the deploy rather than a user.
    const schemaOk = schemaStatus !== "mismatch";
    const healthy = live && schemaOk;

    res.status(healthy ? 200 : 503).json({
      status: healthy ? "ok" : "degraded",
      db: live ? "connected" : dbConnectionStatus,
      persistence: live,
      schema: schemaStatus,
      ...(schemaOk ? {} : { schemaProblems }),
      uptime,
    });
  });

  // Database status endpoint - useful for monitoring
  app.get("/api/system/db-status", async (req, res) => {
    try {
      // Check if DATABASE_URL is even set
      if (!process.env.DATABASE_URL) {
        return res.json({
          status: "not_configured",
          message: "Database connection not configured. Using in-memory storage.",
          persistence: false
        });
      }

      // We'll use the Pool class directly to test the connection
      import('pg').then(async ({ default: pgModule }) => {
        const { Pool } = pgModule;
        try {
          const pool = new Pool({ connectionString: process.env.DATABASE_URL });
          
          // Test a simple query to verify connection
          const client = await pool.connect();
          await client.query('SELECT NOW() as time');
          client.release();
          
          return res.json({
            status: "connected",
            message: "Database connection successful. Data will persist across deployments.",
            persistence: true
          });
        } catch (dbError: any) {
          console.error("Database check failed:", dbError);
          return res.json({
            status: "error",
            message: "Database connection failed. Using in-memory storage as fallback.",
            persistence: false,
            error: dbError?.message || String(dbError)
          });
        }
      }).catch(importError => {
        console.error("Error importing database module:", importError);
        return res.json({
          status: "error",
          message: "Error importing database module. Using in-memory storage as fallback.",
          persistence: false,
          error: importError?.message || String(importError)
        });
      });
    } catch (error: any) {
      console.error("Database check failed:", error);
      return res.json({
        status: "error",
        message: "Database check failed. Using in-memory storage as fallback.",
        persistence: false,
        error: error?.message || String(error)
      });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
