import { describe, it, expect } from "vitest";
import {
  buildAvatarPrompt,
  buildPhotoAvatarPrompt,
  isPngImage,
  looksLikeRefusal,
} from "../server/lib/avatar";
import {
  avatarsOf,
  chosenAvatarIsPhoto,
  baseStats,
  characterAlerts,
  characterSchema,
  MAX_AVATARS,
  pointsAvailable,
  pointsEarned,
  STARTING_POINTS,
  notableSkills,
  pointsSpent,
  skillsOf,
  SKILL_START,
  STAT_BASE,
  statsAreAffordable,
  startingOver,
  statsOf,
  unseenVirtues,
  virtueLevels,
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

/**
 * Settings can take a character back to the beginning. A RESET, NOT A RESPEC:
 * POST /api/characters/:id/reset clears what was spent AND what was earned, so
 * what these assert is the shape that write leaves behind -- a brand-new sheet,
 * with the starting points and nothing else.
 */
// startingOver() IS what POST /api/characters/:id/reset writes -- the route
// passes it straight to storage. Restating the payload here instead would let
// the route stop clearing a field while these kept passing.
const RESET = startingOver();

describe("starting a character again", () => {
  const sk = (name: string, value: number) => ({ name, value });

  it("leaves a sheet identical to a character who has never done anything", () => {
    const veteran = mk({
      stats: { strength: 8, agility: 2, constitution: 5, wisdom: 4, heart: 6 },
      skills: [sk("climbing", 3), sk("tracking", 2)],
      adventures: [{ storyId: "s1", theme: "courage" }, { storyId: "s2", theme: "mercy" }],
      seenVirtues: ["courage"],
    });
    const after = mk({ ...veteran, ...RESET });
    const newborn = mk({ name: veteran.name });

    // The whole point, as one assertion: afterwards there is no way to tell.
    expect(pointsSpent(statsOf(after), skillsOf(after))).toBe(
      pointsSpent(statsOf(newborn), skillsOf(newborn)),
    );
    expect(pointsEarned(after)).toBe(pointsEarned(newborn));
    expect(pointsAvailable(after)).toBe(pointsAvailable(newborn));
    expect(pointsAvailable(after)).toBe(STARTING_POINTS);
  });

  it("takes the earned points away, which is the whole purpose", () => {
    // The distinction that matters: handing spent points BACK would leave this
    // character better off than a new one, because the stories still counted.
    const earner = mk({
      stats: baseStats(),
      adventures: [{ storyId: "s1" }, { storyId: "s2" }, { storyId: "s3" }],
    });
    expect(pointsAvailable(earner)).toBe(STARTING_POINTS + 3);

    const after = mk({ ...earner, ...RESET });
    expect(pointsEarned(after)).toBe(0);
    expect(pointsAvailable(after)).toBe(STARTING_POINTS);
  });

  it("takes the virtue levels with them, because they were the same record", () => {
    // Virtue levels are just how many adventures carry that theme -- there is
    // no second list to clear, and none to forget to clear.
    const devout = mk({
      adventures: [
        { storyId: "s1", theme: "courage" },
        { storyId: "s2", theme: "courage" },
        { storyId: "s3", theme: "mercy" },
      ],
    });
    expect(virtueLevels(devout)).toEqual({ courage: 2, mercy: 1 });
    expect(virtueLevels(mk({ ...devout, ...RESET }))).toEqual({});
  });

  it("rescues a sheet Parent Mode wrote over budget", () => {
    // Parent Mode writes stats without spending, so a sheet can cost more than
    // the character ever earned -- and the strict route checks the MERGED
    // sheet, so every partial step down is still over budget and is refused.
    const lavish = mk({
      stats: { strength: 10, agility: 10, constitution: 10, wisdom: 10, heart: 10 },
      skills: [sk("climbing", 5)],
      adventures: [{ storyId: "s1", theme: "courage" }],
    });
    expect(pointsAvailable(lavish)).toBeLessThan(0);
    const oneNotchDown = { ...statsOf(lavish), strength: 9 };
    expect(statsAreAffordable(oneNotchDown, lavish, skillsOf(lavish))).toBe(false);

    // After the reset the sheet is affordable again -- and stays affordable
    // even though the earned points went with it, because a baseline sheet
    // spends nothing at all.
    const after = mk({ ...lavish, ...RESET });
    expect(pointsAvailable(after)).toBe(STARTING_POINTS);
    expect(statsAreAffordable(statsOf(after), after, skillsOf(after))).toBe(true);
  });

  it("keeps everything that is not the sheet", () => {
    // A reset is not a delete. Who the character IS survives it.
    const mia = mk({
      name: "Mia",
      kind: "human",
      sex: "female",
      age: 10,
      hair: "brown",
      avatarUrl: "https://example.test/mia.png",
      stats: { ...baseStats(), strength: STAT_BASE + 2 },
      adventures: [{ storyId: "s1" }],
    });
    const after = mk({ ...mia, ...RESET });
    expect(after.name).toBe("Mia");
    expect(after.kind).toBe("human");
    expect(after.age).toBe(10);
    expect(after.hair).toBe("brown");
    expect(after.avatarUrl).toBe(mia.avatarUrl);
  });

  it("changes nothing on a character that never started", () => {
    // What the button being disabled means, stated as arithmetic.
    const fresh = mk({});
    expect(pointsSpent(statsOf(fresh), skillsOf(fresh))).toBe(0);
    expect(pointsEarned(fresh)).toBe(0);
    expect(pointsAvailable(mk({ ...fresh, ...RESET }))).toBe(pointsAvailable(fresh));
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

/**
 * One count, three consumers.
 *
 * The card, the tabs inside the panel and the Characters link in the nav bar
 * all ask this. Three copies of "clamp at zero unless the sheet is off" would
 * be three chances for the bar to promise something the card does not show.
 */
describe("what a character is waiting on", () => {
  it("counts points to spend and virtues to look at", () => {
    const c = {
      adventures: [{ storyId: "s1", theme: "courage" }],
      stats: { ...baseStats(), strength: STAT_BASE + 1 },
    };
    // 2 to start + 1 earned - 1 spent = 2, and one unseen virtue.
    expect(characterAlerts(c)).toEqual({ unspent: 2, unseen: 1 });
  });

  it("says nothing about points when the sheet is switched off", () => {
    const c = { statsEnabled: false, adventures: [{ storyId: "s1", theme: "courage" }] };
    expect(characterAlerts(c).unspent).toBe(0);
    // The virtue still counts: turning the sheet off is about attributes, not
    // about what the character has been through.
    expect(characterAlerts(c).unseen).toBe(1);
  });

  it("never reports a negative, whatever Parent Mode wrote", () => {
    // pointsAvailable is honestly negative for a sheet nobody paid for.
    // "-4 points to spend" is not a thing to put in a bubble.
    const lavish = { stats: { ...baseStats(), strength: 10, agility: 10 } };
    expect(characterAlerts(lavish).unspent).toBe(0);
  });

  it("is quiet for a brand-new character with nothing earned or unseen", () => {
    // STARTING_POINTS is real, so a new character DOES have something to spend
    // -- that is the badge doing its job on day one, not a false alarm.
    expect(characterAlerts({})).toEqual({ unspent: STARTING_POINTS, unseen: 0 });
    expect(characterAlerts(null)).toEqual({ unspent: 0, unseen: 0 });
  });
});

/**
 * A portrait drawn FROM a photograph.
 *
 * The rule these enforce is the surprising one: this prompt deliberately
 * carries LESS of the character sheet than `buildAvatarPrompt` does. A
 * photograph is a more precise description of a face than any field, and
 * feeding the model both means feeding it a contradiction whenever they
 * disagree -- which is most of the time, because nobody updates "hair: brown"
 * before uploading a picture.
 */
describe("the portrait prompt for a photograph", () => {
  it("names them and says what kind of thing they are", () => {
    const p = buildPhotoAvatarPrompt(mk({ name: "Mia", kind: "girl" }));
    expect(p).toContain("Mia");
    expect(p).toContain("a girl");
  });

  it("says the picture is drawn from the photograph provided", () => {
    expect(buildPhotoAvatarPrompt(mk({ kind: "boy" }))).toMatch(
      /drawn from the photograph provided/i,
    );
  });

  it("insists on a drawing, because the default outcome is a retouched photo", () => {
    expect(buildPhotoAvatarPrompt(mk({ kind: "boy" }))).toMatch(/not a photograph/i);
  });

  it("takes NOTHING about their looks off the sheet", () => {
    // Every one of these would contradict the photograph.
    const p = buildPhotoAvatarPrompt(
      mk({
        kind: "girl",
        age: 8,
        hair: "brown",
        eyes: "green",
        canonicalLook: "A red cloak and a wooden sword.",
      }),
    );
    expect(p).not.toMatch(/brown/i);
    expect(p).not.toMatch(/green/i);
    expect(p).not.toMatch(/cloak|sword/i);
    expect(p).not.toMatch(/8-year-old/i);
  });

  it("keeps the same no-text rule as every other portrait", () => {
    expect(buildPhotoAvatarPrompt(mk({ kind: "boy" }))).toMatch(/no text/i);
  });

  it("is stable: the same character gives the same string", () => {
    const c = mk({ kind: "dragon", category: "mythical" });
    expect(buildPhotoAvatarPrompt(c)).toBe(buildPhotoAvatarPrompt(c));
  });
});

/**
 * Everything in AVATAR_DIR is a png, and this is what keeps it true.
 *
 * Not a security check -- the bytes are written and served back as an image
 * either way. It protects an invariant two other modules rely on:
 * `readAvatarFile` only matches `avatar_<uuid>.png`, and `illustration.ts`
 * hands these files to the images API declaring `image/png`. A jpeg under a
 * .png name fails at the far end of a story generation, not here.
 */
describe("recognising a png", () => {
  const png = (extra = 16) =>
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(extra),
    ]);

  it("accepts the png signature", () => {
    expect(isPngImage(png())).toBe(true);
  });

  it("rejects a jpeg", () => {
    expect(isPngImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0]))).toBe(false);
  });

  it("rejects a webp", () => {
    expect(isPngImage(Buffer.from("RIFF????WEBPVP8 ", "binary"))).toBe(false);
  });

  it("rejects an empty buffer and a bare signature with no image after it", () => {
    expect(isPngImage(Buffer.alloc(0))).toBe(false);
    expect(isPngImage(png(0))).toBe(false);
  });

  it("rejects text that merely starts with PNG", () => {
    expect(isPngImage(Buffer.from("PNG is a format for images"))).toBe(false);
  });
});

/**
 * Which portrait is a photograph, and therefore what a story may do with it.
 *
 * Keyed on the CHOSEN one. A character holding a photograph and a drawing at
 * once has one reference a story will be drawn from, and choosing the drawing
 * has to stop the photograph mattering -- otherwise the only way to undo
 * "this is a photograph" is to delete the file.
 */
describe("telling a photograph from a drawing", () => {
  const photo = { id: "p", url: "/p/photo.png", prompt: "", createdAt: "2026-01-01", source: "photo" as const };
  const drawn = { id: "d", url: "/p/drawn.png", prompt: "x", createdAt: "2026-01-02" };

  it("is false for a character with no picture at all", () => {
    expect(chosenAvatarIsPhoto({})).toBe(false);
    expect(chosenAvatarIsPhoto(undefined)).toBe(false);
    expect(chosenAvatarIsPhoto(null)).toBe(false);
  });

  it("is false for a row written before `source` existed", () => {
    // The whole reason the field is optional: every one of these is a drawing.
    expect(
      chosenAvatarIsPhoto({ avatarUrl: "/p/old.png", avatarPrompt: "a dragon", createdAt: "2026-01-01" }),
    ).toBe(false);
  });

  it("is true when the chosen picture is the photograph", () => {
    expect(chosenAvatarIsPhoto({ avatarUrl: photo.url, avatars: [drawn, photo] })).toBe(true);
  });

  it("is FALSE when they hold a photograph but have chosen the drawing", () => {
    expect(chosenAvatarIsPhoto({ avatarUrl: drawn.url, avatars: [photo, drawn] })).toBe(false);
  });

  it("survives the schema, which strips keys it does not declare", () => {
    // The trap this codebase warns about: characterSchema is a z.object, so a
    // `source` the schema has not heard of is dropped silently on the way to
    // the database and nothing fails.
    const parsed = characterSchema.parse({
      id: "c1",
      name: "Mia",
      createdAt: "2026-01-01",
      avatarUrl: photo.url,
      avatars: [photo],
    });
    expect(parsed.avatars?.[0]?.source).toBe("photo");
    expect(chosenAvatarIsPhoto(parsed)).toBe(true);
  });
});

/**
 * A refusal and an outage need opposite advice.
 *
 * "Try again" is wrong when the model has declined to draw a copyrighted
 * character, and "describe them in your own words" is insulting when OpenAI is
 * down. The tight reading is deliberate in BOTH directions -- see especially
 * the input_fidelity case, which is this codebase's own known 400 on this
 * exact call and must never be reported to a parent as their fault.
 */
describe("telling a refusal from a failure", () => {
  it("believes an explicit moderation code", () => {
    expect(looksLikeRefusal({ status: 400, code: "moderation_blocked" })).toBe(true);
    expect(looksLikeRefusal({ error: { code: "content_policy_violation" } })).toBe(true);
  });

  it("reads a 400 that talks about the safety system", () => {
    expect(
      looksLikeRefusal({
        status: 400,
        // Verbatim from gpt-image-2 on 2026-09-11, asked for Yoshi -- the case
        // Blake hit (request req_e075ab41c93f4e35907aa58bcdc46cd6).
        message:
          "400 Your request was rejected by the safety system. If you believe this is an error, contact us at help.openai.com and include the request ID req_e075ab41c93f4e35907aa58bcdc46cd6.",
      }),
    ).toBe(true);
  });

  it("does NOT blame the user for our own bad request shape", () => {
    // gpt-image-2 answering 400 to input_fidelity: a 400, about this call, and
    // entirely ours. See docs/decisions.md and illustration.ts.
    expect(
      looksLikeRefusal({
        status: 400,
        message: "Unknown parameter: 'input_fidelity'.",
      }),
    ).toBe(false);
  });

  it("does not read an outage as a refusal", () => {
    expect(looksLikeRefusal({ status: 500, message: "internal server error" })).toBe(false);
    expect(looksLikeRefusal({ status: 429, message: "rate limited" })).toBe(false);
    expect(looksLikeRefusal(new Error("socket hang up"))).toBe(false);
    expect(looksLikeRefusal(undefined)).toBe(false);
  });
});
