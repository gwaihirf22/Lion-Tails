import { describe, it, expect } from "vitest";
import { buildAvatarPrompt } from "../server/lib/avatar";
import {
  avatarsOf,
  baseStats,
  characterSchema,
  MAX_AVATARS,
  pointsAvailable,
  STARTING_POINTS,
  notableSkills,
  pointsSpent,
  skillsOf,
  SKILL_START,
  STAT_BASE,
  statsAreAffordable,
  unseenVirtues,
} from "../shared/schema";
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

/**
 * What the badges count.
 *
 * Both numbers appear on a card the user has not opened, so being wrong here
 * is worse than being absent: a badge that never clears trains people to
 * ignore every badge.
 */
describe("points waiting to be spent", () => {
  const withStories = (n: number) => ({
    adventures: Array.from({ length: n }, (_, i) => ({ storyId: String(i), theme: "courage" })),
  });

  it("starts everyone with the starting points", () => {
    expect(pointsAvailable({})).toBe(STARTING_POINTS);
  });

  it("adds one per finished story and subtracts what was spent", () => {
    expect(pointsAvailable(withStories(3))).toBe(STARTING_POINTS + 3);
    expect(pointsAvailable({ ...withStories(3), stats: { ...baseStats(), strength: 5 } }))
      .toBe(STARTING_POINTS + 3 - 2);
  });

  it("measures a sheet handed to it instead of the stored one", () => {
    // This is why the override exists: the form asks about stats being dragged
    // around right now, the card asks about what is saved, and they were two
    // separate sums before.
    const c = withStories(1);
    expect(pointsAvailable(c, { ...baseStats(), wisdom: 6 })).toBe(STARTING_POINTS + 1 - 3);
    expect(pointsAvailable(c)).toBe(STARTING_POINTS + 1);
  });

  it("can go negative, which is a Parent Mode sheet and not a badge", () => {
    // Parent Mode writes any sheet it likes. The number is honest here; the
    // callers clamp, because "-4 points to spend" is not a thing to show.
    const over = { ...baseStats(), strength: 10, agility: 10 };
    expect(pointsAvailable({ stats: over })).toBeLessThan(0);
  });
});

describe("virtues nobody has looked at", () => {
  const adv = (...themes: string[]) => ({
    adventures: themes.map((theme, i) => ({ storyId: String(i), theme })),
  });

  it("counts everything when the character has never been looked at", () => {
    // No backfill, and no pretending old virtues were read. One badge, then
    // it is quiet for good.
    expect(unseenVirtues(adv("courage", "kindness")).sort()).toEqual(["courage", "kindness"]);
  });

  it("is quiet once they have been seen", () => {
    expect(unseenVirtues({ ...adv("courage"), seenVirtues: ["courage"] })).toEqual([]);
  });

  it("notices a new one arriving", () => {
    expect(unseenVirtues({ ...adv("courage", "patience"), seenVirtues: ["courage"] }))
      .toEqual(["patience"]);
  });

  it("matches on the same normalised key virtueLevels builds", () => {
    // A theme is stored verbatim from the story form. Comparing raw strings
    // would leave "Courage" unseen against a stored "courage" for ever, and
    // the badge would never go out.
    expect(unseenVirtues({ ...adv(" Courage "), seenVirtues: ["courage"] })).toEqual([]);
    expect(unseenVirtues({ ...adv("courage"), seenVirtues: [" COURAGE "] })).toEqual([]);
  });

  it("ignores stories with no theme", () => {
    expect(unseenVirtues(adv("none", "", "courage"))).toEqual(["courage"]);
  });

  it("is empty for a character with no stories at all", () => {
    expect(unseenVirtues({})).toEqual([]);
    expect(unseenVirtues(null)).toEqual([]);
  });
});

/**
 * Skills spend from the same pool as attributes.
 *
 * The whole reason a new skill starts one above the baseline is that
 * pointsSpent then needs no knowledge that skills exist -- it is the same
 * "distance from baseline" sum. These assert that, because if it ever stops
 * being true the server and the form will disagree about what is affordable.
 */
describe("skills cost points", () => {
  const sk = (name: string, value: number) => ({ name, value });

  it("costs one point to take up", () => {
    // A skill's cost IS its level. Attributes measure distance from an ordinary
    // 3 because everybody has a strength; nobody has climbing by default, so
    // there is no baseline to be a distance from.
    expect(pointsSpent(baseStats(), [sk("climbing", SKILL_START)])).toBe(1);
  });

  it("costs one more for each level after that", () => {
    expect(pointsSpent(baseStats(), [sk("climbing", 4)])).toBe(4);
    expect(pointsSpent(baseStats(), [sk("climbing", 10)])).toBe(10);
  });

  it("never refunds for being low", () => {
    // The bug the old model had: measured against the attribute baseline, a
    // skill at 1 gave back two points and a new one cost four.
    for (let v = SKILL_START; v <= 10; v++) {
      expect(pointsSpent(baseStats(), [sk("x", v)])).toBeGreaterThan(0);
    }
  });

  it("adds to what the attributes already spent", () => {
    const stats = { ...baseStats(), strength: STAT_BASE + 2 };
    expect(pointsSpent(stats, [sk("climbing", SKILL_START)])).toBe(3);
  });

  it("counts against the same allowance", () => {
    const oneStory = { adventures: [{ storyId: "s1", theme: "courage" }] };
    // 2 to start + 1 earned = 3, less one skill at level 1.
    expect(pointsAvailable({ ...oneStory, skills: [sk("climbing", SKILL_START)] })).toBe(2);
  });

  it("is affordable up to the pool and not past it", () => {
    // The boundary, both sides: a check that only ever refuses is off by one.
    expect(statsAreAffordable(baseStats(), undefined, [sk("a", 1), sk("b", 1)])).toBe(true);
    expect(statsAreAffordable(baseStats(), undefined, [sk("a", 1), sk("b", 1), sk("c", 1)])).toBe(false);
    expect(statsAreAffordable(baseStats(), undefined, [sk("a", 2)])).toBe(true);
    expect(statsAreAffordable(baseStats(), undefined, [sk("a", 3)])).toBe(false);
  });

  it("lets a weakness pay for a skill", () => {
    // The same trade the attributes allow: be poor at one thing to be good at
    // another, rather than only ever spending upward.
    const weak = { ...baseStats(), agility: STAT_BASE - 2 };
    expect(statsAreAffordable(weak, undefined, [sk("climbing", 4)])).toBe(true);
  });
});

describe("what reaches the story", () => {
  it("names every skill, because every one was paid for", () => {
    // Unlike an attribute there is no "ordinary" level of climbing that
    // everybody has, so there is nothing to filter out.
    const skills = [{ name: "climbing", value: 5 }, { name: "baking", value: SKILL_START }];
    expect(notableSkills({ skills })).toEqual(skills);
  });

  it("is empty for a character with none", () => {
    expect(skillsOf({})).toEqual([]);
    expect(notableSkills(null)).toEqual([]);
  });
});
