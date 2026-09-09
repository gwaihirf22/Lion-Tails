import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { buildStoryBrief, deserialiseBrief, renderBrief, type BriefPurpose } from "../server/lib/storyBrief";
import {
  characterIdsOf,
  MAX_STORY_CHARACTERS,
  storyRequestSchema,
  type StoryRequest,
  type Character,
} from "../shared/schema";

/**
 * The brief, and the invariant the multi-character change is built around.
 *
 * Thousands of existing stories were requested with one character or none.
 * "Backward compatible" is worth nothing as a claim, so the four rendered
 * projections for those requests are captured as golden strings and asserted
 * BYTE-IDENTICAL. Every line added for a cast is guarded on there being a cast.
 *
 * If a change here is deliberate, regenerate the fixture and read the diff --
 * that diff is the prompt every single-character story will be written from.
 */

const PURPOSES: BriefPurpose[] = ["single", "outline", "chapter", "image"];

const golden: Record<string, Record<string, string>> = JSON.parse(
  readFileSync(path.resolve(__dirname, "fixtures/brief-golden.json"), "utf8"),
);

const mia: Character = {
  id: "c1", name: "Mia", gender: "girl", age: 8, hair: "brown", eyes: "blue",
  favoriteColor: "purple", favoriteAnimal: "rabbit", hobby: "drawing",
  timeTravelExperience: 0, personality: "curious", createdAt: "2026-01-01",
};

const base = {
  storyLength: "medium", storyType: "regular", useAnimal: true, theme: "kindness",
} as unknown as StoryRequest;

/** Exactly the cases the fixture was captured from. */
const cases: Record<string, () => ReturnType<typeof buildStoryBrief>> = {
  "no character, name+gender": () =>
    buildStoryBrief({ ...base, childName: "Sam", gender: "boy" } as StoryRequest, []),
  "one saved character": () =>
    buildStoryBrief({ ...base, characterId: "c1", childName: "Character", gender: "boy" } as StoryRequest, [mia]),
  "character + animal off": () =>
    buildStoryBrief({ ...base, useAnimal: false, characterId: "c1" } as StoryRequest, [mia]),
  "biblical, placeholder name": () =>
    buildStoryBrief({ ...base, childName: "Biblical Character", gender: "boy", biblicalEvent: "noah" } as StoryRequest, []),
  "with continuity": () =>
    buildStoryBrief({ ...base, characterId: "c1" } as StoryRequest, [mia],
      { canon: ["The lantern is empty."], summary: "Mia found a lantern." }),
  "time travel": () =>
    buildStoryBrief({ ...base, useTimeTravel: true, characterId: "c1" } as StoryRequest, [mia]),
};

describe("a brief with no cast renders exactly as it always has", () => {
  it("covers every captured case", () => {
    // Guards the guard: a fixture that silently lost its cases would make every
    // assertion below vacuous.
    expect(Object.keys(cases).sort()).toEqual(Object.keys(golden).sort());
    expect(Object.keys(golden).length).toBeGreaterThanOrEqual(6);
  });

  for (const label of Object.keys(cases)) {
    for (const purpose of PURPOSES) {
      it(`${label} / ${purpose}`, () => {
        expect(renderBrief(cases[label](), purpose)).toBe(golden[label][purpose]);
      });
    }
  }
});

describe("characterIdsOf", () => {
  it("reads a request that only has the legacy singular field", () => {
    // Every request frozen before multi-character shipped looks like this, and
    // those jsonb blobs are never rewritten.
    expect(characterIdsOf({ characterId: "c1" })).toEqual(["c1"]);
  });

  it("prefers the array when both are present", () => {
    expect(characterIdsOf({ characterIds: ["a", "b"], characterId: "legacy" })).toEqual(["a", "b"]);
  });

  it("falls back to the legacy field when the array is empty", () => {
    // An empty array is not a choice to have nobody -- it is the default value
    // of a field the form may never have touched.
    expect(characterIdsOf({ characterIds: [], characterId: "c1" })).toEqual(["c1"]);
  });

  it("drops duplicates", () => {
    // "Mia and Mia" in the prompt, and a wasted cast slot.
    expect(characterIdsOf({ characterIds: ["a", "b", "a"] })).toEqual(["a", "b"]);
  });

  it("trims, and drops blanks", () => {
    expect(characterIdsOf({ characterIds: [" a ", "", "   ", "b"] })).toEqual(["a", "b"]);
  });

  it("caps the cast, whatever was asked for", () => {
    // The Zod .max() rejects an over-long array at the route boundary; this cap
    // bounds the PROMPT. Different jobs, both needed -- a hand-rolled POST that
    // slipped past validation must not blow the context window.
    const many = Array.from({ length: 40 }, (_, i) => `c${i}`);
    expect(characterIdsOf({ characterIds: many })).toHaveLength(MAX_STORY_CHARACTERS);
  });

  it("returns an empty list for nothing at all", () => {
    expect(characterIdsOf(undefined)).toEqual([]);
    expect(characterIdsOf(null)).toEqual([]);
    expect(characterIdsOf({})).toEqual([]);
    expect(characterIdsOf({ characterId: null, characterIds: null })).toEqual([]);
  });
});

describe("storyRequestSchema still accepts what it always did", () => {
  const ok = (r: unknown) => storyRequestSchema.safeParse(r).success;

  it("accepts a legacy single-character request", () => {
    expect(ok({ characterId: "c1" })).toBe(true);
  });

  it("accepts a name and gender with no character", () => {
    expect(ok({ childName: "Sam", gender: "boy" })).toBe(true);
  });

  it("accepts a cast", () => {
    expect(ok({ characterIds: ["c1", "c2", "c3"] })).toBe(true);
  });

  it("still refuses a request with neither", () => {
    expect(ok({ storyLength: "medium" })).toBe(false);
  });

  it("still requires somebody for time travel, including via the legacy field", () => {
    expect(ok({ useTimeTravel: true })).toBe(false);
    expect(ok({ useTimeTravel: true, characterId: "c1" })).toBe(true);
    expect(ok({ useTimeTravel: true, characterIds: ["c1"] })).toBe(true);
  });

  it("rejects a cast larger than the cap", () => {
    expect(ok({ characterIds: Array.from({ length: 9 }, (_, i) => `c${i}`) })).toBe(false);
  });

  it("reports the error against the field the form renders", () => {
    const r = storyRequestSchema.safeParse({ storyLength: "medium" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(["characterIds"]);
  });
});

describe("a cast is weighted, not enumerated", () => {
  const make = (n: number) => {
    const cast: Character[] = Array.from({ length: n }, (_, i) => ({
      ...mia, id: `c${i}`, name: `Person${i}`, hobby: "climbing", personality: "patient",
    }));
    return buildStoryBrief({ ...base, characterIds: cast.map((c) => c.id) } as StoryRequest, cast);
  };

  it("puts the protagonist first and says whose story it is", () => {
    const text = renderBrief(make(4), "single");
    expect(text).toContain("This is Person0's story");
    expect(text.indexOf("This is Person0's story")).toBeLessThan(text.indexOf("ALSO IN THE STORY"));
  });

  it("gives the lead full colour and the others at most two facts", () => {
    const brief = make(3);
    // The lead keeps eyes, favourite colour and the animal companion.
    expect(brief.cast[0].colour).toContain("eyes");
    expect(brief.cast[0].colour).toContain("Favourite colour");
    expect(brief.cast[0].colour).toContain("as a companion");
    // The supporting cast keeps none of those: they are sheet data with nothing
    // for a scene to do, and eight companions is a menagerie.
    for (const c of brief.cast.slice(1)) {
      expect(c.colour).not.toContain("eyes");
      expect(c.colour).not.toContain("Favourite colour");
      expect(c.colour).not.toContain("as a companion");
    }
  });

  it("tells the model these are N people in one story, not N stories", () => {
    // The round-robin failure: handed N equal entities, a model gives each a
    // paragraph and a turn.
    const text = renderBrief(make(5), "single");
    expect(text).toContain("5 people in one story, not 5 stories");
    expect(text).toContain("may say nothing at all");
  });

  it("forbids inventing a ninth child", () => {
    expect(renderBrief(make(3), "single")).toContain("do not add extra children of your own");
  });

  it("caps a scene at three of them once the cast is large", () => {
    expect(renderBrief(make(4), "single")).toContain("no more than three of them in any one scene");
    expect(renderBrief(make(2), "single")).not.toContain("no more than three");
  });

  it("tells the OUTLINE, and only the outline, to cast each part", () => {
    // The outline is where per-chapter casting is actually decided; anywhere
    // else the instruction can only be admired.
    expect(renderBrief(make(3), "outline")).toContain("Decide who is in each part");
    expect(renderBrief(make(3), "single")).not.toContain("Decide who is in each part");
  });

  it("keeps the chapter projection to names only", () => {
    // This projection exists BECAUSE re-injecting attributes per chapter made a
    // story a tour of the character sheet. Eight characters is eight times that.
    const text = renderBrief(make(8), "chapter");
    expect(text).toContain("Also in this story: Person1");
    // Scoped to the SUPPORTING segment. The lead keeps its identity sentence
    // here -- "Mia, aged 8, a girl." -- exactly as it always has; that is in
    // the golden strings. What must not appear is seven more of them.
    const also = text.slice(text.indexOf("Also in this story:"));
    expect(also).not.toContain("aged");
    expect(also).not.toContain("hair");
    expect(also).not.toContain("Favourite colour");
    expect(also).not.toContain("nature");
  });

  it("keeps the chapter projection short even at eight characters", () => {
    // Cost, not taste: this prompt is sent once per chapter and already carries
    // storySoFar.
    expect(renderBrief(make(8), "chapter").length).toBeLessThan(700);
  });

  it("does not ask an illustrator to draw eight children", () => {
    const text = renderBrief(make(8), "image");
    expect(text).toContain("at most two of the others");
  });

  it("says nothing multi-specific when there is only a lead", () => {
    // The guard behind the byte-identical invariant above.
    const one = renderBrief(make(1), "single");
    expect(one).not.toContain("ALSO IN THE STORY");
    expect(one).not.toContain("people in one story");
    expect(renderBrief(make(1), "image")).not.toContain("at most two");
    expect(renderBrief(make(1), "chapter")).not.toContain("Also in this story");
  });

  it("keeps a retelling's cast as visitors", () => {
    // Without this, eight modern children reshape the flood.
    const cast: Character[] = [mia, { ...mia, id: "c2", name: "Noah2" }];
    const brief = buildStoryBrief(
      { ...base, biblicalEvent: "noah", characterIds: ["c1", "c2"] } as StoryRequest, cast);
    const text = renderBrief(brief, "single");
    expect(text).toContain("The account comes first");
    expect(text).toContain("nothing they do changes");
  });
});

describe("deserialiseBrief upgrades a brief frozen before the cast", () => {
  it("reads a pre-change brief and finds the character", () => {
    // story_jobs.brief is frozen text written at enqueue. A job queued five
    // minutes before this shipped still has to render.
    const legacy = JSON.stringify({
      identity: "Mia, aged 8, a girl.",
      colour: "Mia has brown hair.",
      premise: ["Theme: kindness."],
      craft: [],
    });
    const brief = deserialiseBrief(legacy);
    expect(brief.cast).toHaveLength(1);
    expect(brief.cast[0].name).toBe("Mia");
    expect(brief.cast[0].identity).toBe("Mia, aged 8, a girl.");
    expect(brief.cast[0].colour).toBe("Mia has brown hair.");
  });

  it("renders an upgraded legacy brief through every projection", () => {
    const brief = deserialiseBrief(JSON.stringify({
      identity: "Sam, a boy.", colour: "", premise: ["Theme: courage."], craft: [],
    }));
    for (const p of PURPOSES) expect(() => renderBrief(brief, p)).not.toThrow();
    expect(renderBrief(brief, "chapter")).toContain("Sam");
  });

  it("still handles the plain-text briefs from before briefs were structured", () => {
    const brief = deserialiseBrief("just some prose that is not JSON at all");
    expect(brief.cast).toHaveLength(1);
    expect(brief.premise).toEqual(["just some prose that is not JSON at all"]);
  });

  it("passes a current brief straight through", () => {
    const current = buildStoryBrief({ ...base, characterIds: ["c1"] } as StoryRequest, [mia]);
    expect(deserialiseBrief(JSON.stringify(current)).cast).toHaveLength(1);
  });
});
