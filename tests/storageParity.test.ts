import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IStorage, StoryToSave } from "../server/storage";
import type { StoryRequest } from "../shared/schema";

/**
 * One suite, two storages.
 *
 * MemStorage and DbStorage implement one interface and have diverged more
 * than once with nothing to say so: searchMetadata was filled by one and
 * left empty by the other for months, and saveStory honoured its heroId
 * argument in memory while Postgres ignored it -- so hero_id was NULL on
 * nearly every real row while every test passed. The roadmap's second
 * testing gap. This runs the same cases against both, so the next
 * divergence fails a test rather than a family.
 *
 * MemStorage always. DbStorage only when DATABASE_URL is set, which is CI's
 * Postgres smoke job (after migrations, before the boot) and nowhere else:
 * `npm test` on a laptop stays what it was, no network and no database.
 * Rows are written under a throwaway user and removed after; the user's
 * cascade takes the stories, characters and shares with it.
 */

const STORY = {
  title: "The Brass Lantern",
  content: "Once upon a time, there was a lantern.",
  moralOutcome: "positive",
  applicationQuestions: ["a", "b", "c", "d", "e"],
} as unknown as StoryToSave;

function request(extra: Partial<StoryRequest> = {}): StoryRequest {
  return { childName: "Mia", gender: "girl", storyLength: "medium", ...extra } as StoryRequest;
}

type Fixture = { storage: IStorage; cleanup: () => Promise<void> };

function parity(name: string, make: () => Promise<Fixture>) {
  describe(`${name}`, () => {
    let s: IStorage;
    let cleanup: () => Promise<void>;
    let owner: number;
    let stranger: number;

    beforeAll(async () => {
      ({ storage: s, cleanup } = await make());
      const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      const mk = async (tag: string) =>
        (
          await s.createUser({
            username: `parity-${tag}-${stamp}`,
            email: `parity-${tag}-${stamp}@example.invalid`,
            password: "scrypt-hash-stands-in",
            isVerified: true,
            isAdmin: false,
          })
        ).id;
      owner = await mk("owner");
      stranger = await mk("stranger");
    }, 30_000);

    afterAll(async () => {
      await cleanup();
    });

    it("saves a story and reads it back, with the hero from the request", async () => {
      const saved = await s.saveStory(STORY, request({ heroId: "paul" }), owner);
      expect(saved.id).toBeTruthy();
      const read = await s.getStoryById(saved.id, owner);
      expect(read?.story.title).toBe("The Brass Lantern");
      expect(read?.request.childName).toBe("Mia");
      // The divergence this suite was written for.
      expect(read?.heroId).toBe("paul");
      expect(read?.isFavorite).toBe(false);
    });

    it("a stranger cannot read it", async () => {
      const saved = await s.saveStory(STORY, request(), owner);
      expect(await s.getStoryById(saved.id, stranger)).toBeUndefined();
    });

    it("favourites, un-favourites, and refuses a stranger", async () => {
      const saved = await s.saveStory(STORY, request(), owner);
      expect((await s.toggleFavorite(saved.id, true, owner))?.isFavorite).toBe(true);
      expect((await s.getStoryById(saved.id, owner))?.isFavorite).toBe(true);
      expect((await s.toggleFavorite(saved.id, false, owner))?.isFavorite).toBe(false);
      expect(await s.toggleFavorite(saved.id, true, stranger)).toBeUndefined();
    });

    it("deletes once, and only for the owner", async () => {
      const saved = await s.saveStory(STORY, request(), owner);
      expect(await s.deleteStory(saved.id, stranger)).toBe(false);
      expect(await s.deleteStory(saved.id, owner)).toBe(true);
      expect(await s.getStoryById(saved.id, owner)).toBeUndefined();
      expect(await s.deleteStory(saved.id, owner)).toBe(false);
    });

    it("lists the owner's stories and nobody else's", async () => {
      const mine = await s.saveStory(STORY, request(), owner);
      const theirs = await s.saveStory(STORY, request(), stranger);
      const ids = (await s.getUserStories(owner)).map((x) => x.id);
      expect(ids).toContain(mine.id);
      expect(ids).not.toContain(theirs.id);
    });

    it("characters belong to their owner", async () => {
      const c = await s.createCharacter({ name: "Mia", kind: "girl", age: 8 }, owner);
      expect(c.id).toBeTruthy();
      expect((await s.getCharacterById(c.id, owner))?.name).toBe("Mia");
      expect(await s.getCharacterById(c.id, stranger)).toBeUndefined();
      expect((await s.updateCharacter(c.id, owner, { hobby: "drawing" }))?.hobby).toBe("drawing");
      expect(await s.updateCharacter(c.id, stranger, { hobby: "spying" })).toBeUndefined();
      expect((await s.getCharacterById(c.id, owner))?.hobby).toBe("drawing");
      expect((await s.getAllCharacters(stranger)).map((x) => x.id)).not.toContain(c.id);
      expect(await s.deleteCharacter(c.id, stranger)).toBe(false);
      expect(await s.deleteCharacter(c.id, owner)).toBe(true);
      expect(await s.getCharacterById(c.id, owner)).toBeUndefined();
    });

    it("mints one share link per story, only for the owner, and stops it", async () => {
      const saved = await s.saveStory(STORY, request(), owner);
      expect(await s.getShareToken(saved.id, owner)).toBeUndefined();
      expect(await s.createShare(saved.id, stranger)).toBeUndefined();
      const token = await s.createShare(saved.id, owner);
      expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(await s.createShare(saved.id, owner)).toBe(token);
      expect(await s.getShareToken(saved.id, owner)).toBe(token);
      expect((await s.getSharedStory(token!))?.id).toBe(saved.id);
      expect(await s.deleteShare(saved.id, owner)).toBe(true);
      expect(await s.getSharedStory(token!)).toBeUndefined();
      expect(await s.getShareToken(saved.id, owner)).toBeUndefined();
    });

    it("answers nothing for a token that never existed", async () => {
      expect(await s.getSharedStory("AAAAAAAAAAAAAAAAAAAAAA")).toBeUndefined();
    });
  });
}

parity("MemStorage", async () => {
  const { MemStorage } = await import("../server/storage");
  return { storage: new MemStorage(), cleanup: async () => undefined };
});

// Only where a database was provided. Set and unreachable is a FAILURE, not a
// skip: CI's Postgres job sets DATABASE_URL on purpose, and a suite that
// quietly skipped there would be the check that cannot fail.
describe.skipIf(!process.env.DATABASE_URL)("against Postgres", () => {
  parity("DbStorage", async () => {
    const { databaseReady, pool } = await import("../server/db");
    const ready = await databaseReady;
    if (!ready || !pool) throw new Error("DATABASE_URL is set but the database is not ready");
    const { DbStorage } = await import("../server/db-storage");
    return {
      storage: new DbStorage(),
      cleanup: async () => {
        // users cascades to stories, characters and shares.
        await pool.query("DELETE FROM users WHERE username LIKE 'parity-%'");
      },
    };
  });
});
