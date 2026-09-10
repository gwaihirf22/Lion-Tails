import { describe, it, expect } from "vitest";
import { buildAvatarPrompt } from "../server/lib/avatar";
import { avatarsOf, MAX_AVATARS, characterSchema } from "../shared/schema";
import { avatarCapFor, hasUnlimitedUse } from "../server/lib/modelPolicy";
import type { Character } from "@shared/schema";

/**
 * The avatar prompt is a durable artefact, not a throwaway string.
 *
 * It is stored on the character and reused verbatim to keep a story
 * illustration recognisably the same person as the portrait. So these assert
 * what goes IN it and, just as importantly, what stays out: everything the
 * sheet knows that has nothing to do with what someone looks like.
 */
const mk = (o: Partial<Character>): Character =>
  ({ id: "c1", name: "Mia", createdAt: "2026-01-01", ...o }) as Character;

describe("the portrait prompt", () => {
  it("names them and says what they are", () => {
    const p = buildAvatarPrompt(mk({ kind: "girl", age: 8 }));
    expect(p).toContain("Mia");
    expect(p).toContain("8-year-old girl");
  });

  it("uses the covering noun for what they are, not 'hair' for everything", () => {
    expect(buildAvatarPrompt(mk({ kind: "dragon", category: "mythical", hair: "crimson" })))
      .toContain("crimson scales");
    expect(buildAvatarPrompt(mk({ kind: "owl", category: "bird", hair: "brown" })))
      .toContain("brown feathers");
    // A character saved before categories existed still reads correctly.
    expect(buildAvatarPrompt(mk({ gender: "girl", hair: "brown" })))
      .toContain("brown hair");
  });

  it("lets canonicalLook win, because it is the field written to say this", () => {
    const p = buildAvatarPrompt(
      mk({ kind: "dragon", category: "mythical", hair: "crimson", eyes: "gold",
           canonicalLook: "Copper scales with a torn left wing." }),
    );
    expect(p).toContain("Copper scales with a torn left wing.");
    // The sheet's colours are the FALLBACK for a character nobody described.
    // Emitting both would describe two different dragons in one prompt.
    expect(p).not.toContain("crimson");
    expect(p).not.toContain("gold eyes");
  });

  it("keeps everything that is not appearance out of it", () => {
    const p = buildAvatarPrompt(
      mk({ kind: "girl", personality: "curious", hobby: "reading",
           notes: "She hums when she is thinking.",
           mustBeTrue: "Mia uses a wheelchair.",
           favoriteColor: "purple", favoriteAnimal: "rabbit" }),
    );
    for (const leak of ["curious", "reading", "hums", "wheelchair", "purple", "rabbit"]) {
      expect(p).not.toContain(leak);
    }
  });

  it("does not put an implausible age in front of an image model", () => {
    // "aged 300" reads as an instruction to draw a ruin. A dragon is still a
    // dragon; it just does not get a number.
    const old = buildAvatarPrompt(mk({ kind: "dragon", category: "mythical", age: 300 }));
    expect(old).not.toContain("300");
    expect(old).toContain("dragon");
  });

  it("still produces a usable prompt for a character with only a name", () => {
    // Every field is optional. The one thing that is always present is the
    // name, and a portrait request with nothing else must still be a sentence.
    const p = buildAvatarPrompt(mk({}));
    expect(p).toContain("Mia");
    expect(p.length).toBeGreaterThan(40);
    expect(p).not.toContain("undefined");
    expect(p).not.toContain("  ");
  });

  it("asks for no text, because image models write nonsense words", () => {
    expect(buildAvatarPrompt(mk({ kind: "boy" }))).toMatch(/no text/i);
  });

  it("is stable: the same character gives the same string", () => {
    // The whole consistency mechanism rests on this. If the prompt varied
    // between calls, storing it would buy nothing.
    const c = mk({ kind: "girl", age: 8, hair: "brown", eyes: "blue" });
    expect(buildAvatarPrompt(c)).toBe(buildAvatarPrompt(c));
  });
});

/**
 * What pictures a character has, counting the one saved before galleries.
 *
 * A row written by the first version of this feature has avatarUrl and no
 * avatars array. Reading the list straight off the row would show that person
 * zero pictures while their portrait was on screen, and the next generation
 * would quietly orphan the file.
 */
describe("the picture list", () => {
  it("is empty when there are no pictures", () => {
    expect(avatarsOf({})).toEqual([]);
    expect(avatarsOf(undefined)).toEqual([]);
    expect(avatarsOf(null)).toEqual([]);
  });

  it("folds a pre-gallery avatarUrl in rather than losing it", () => {
    const list = avatarsOf({ avatarUrl: "/p/a.png", avatarPrompt: "a dragon", createdAt: "2026-01-01" });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ url: "/p/a.png", prompt: "a dragon" });
  });

  it("prefers a real gallery over the single field", () => {
    const list = avatarsOf({
      avatarUrl: "/p/old.png",
      avatars: [{ id: "1", url: "/p/one.png", prompt: "x", createdAt: "2026-01-01" }],
    });
    expect(list.map((a) => a.url)).toEqual(["/p/one.png"]);
  });

  it("is bounded by the schema, whatever the number happens to be", () => {
    // Asserting MAX_AVATARS === 4 was wrong the moment it became 5. The
    // invariant is that the schema refuses more than the cap, not what the cap
    // currently is -- see CLAUDE.md on gates that hardcode a number.
    const entry = (i: number) => ({ id: String(i), url: "/p/x.png", prompt: "", createdAt: "2026-01-01" });
    const field = characterSchema.shape.avatars;
    expect(field.safeParse(Array.from({ length: MAX_AVATARS }, (_, i) => entry(i))).success).toBe(true);
    expect(field.safeParse(Array.from({ length: MAX_AVATARS + 1 }, (_, i) => entry(i))).success).toBe(false);
  });
});

/**
 * How many pictures one character may keep, for THIS account.
 *
 * A different question from the lifetime allowance: that one is about money
 * and counts generations forever, this one bounds what a single character
 * holds. They are deliberately unconnected -- deleting a picture frees a slot
 * here and refunds nothing there, which is what stops delete-and-regenerate
 * being a free image.
 */
describe("pictures per character", () => {
  it("gives an own-key or admin account the full set", () => {
    expect(avatarCapFor({ isAdmin: true, hasOwnKey: false })).toBe(MAX_AVATARS);
    expect(avatarCapFor({ isAdmin: false, hasOwnKey: true })).toBe(MAX_AVATARS);
    expect(avatarCapFor({ isAdmin: true, hasOwnKey: true })).toBe(MAX_AVATARS);
  });

  it("gives everyone else exactly one", () => {
    // Eight generations in total, so letting each character hoard five would
    // spend the whole allowance on two of them.
    expect(avatarCapFor({ isAdmin: false, hasOwnKey: false })).toBe(1);
  });

  it("is the same predicate as everything else that asks who pays", () => {
    // If this ever disagrees with hasUnlimitedUse, there are two definitions of
    // "entitled" again, which is the failure this repo names most often.
    for (const isAdmin of [true, false]) {
      for (const hasOwnKey of [true, false]) {
        const unlimited = hasUnlimitedUse({ isAdmin, hasOwnKey });
        expect(avatarCapFor({ isAdmin, hasOwnKey })).toBe(unlimited ? MAX_AVATARS : 1);
      }
    }
  });
});
