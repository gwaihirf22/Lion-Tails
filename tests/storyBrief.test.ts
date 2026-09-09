import { describe, it, expect } from "vitest";
import fs from "fs";
import { readFileSync } from "fs";
import path from "path";
import {
  buildStoryBrief,
  deserialiseBrief,
  renderBrief,
  resolveStoryFocus,
  type BriefPurpose,
} from "../server/lib/storyBrief";
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
  personality: "curious", createdAt: "2026-01-01",
};

/** A character who is not a person, and not a "boy" or a "girl". */
const ember: Character = {
  id: "c2", name: "Ember", kind: "dragon", category: "mythical", sex: "female",
  age: 300, hair: "emerald", eyes: "gold", personality: "patient",
  createdAt: "2026-01-01",
};

/** A made thing: the only sort of character that may be an "it". */
const bolt: Character = {
  id: "c3", name: "Bolt", kind: "robot", category: "machine", sex: "it",
  hair: "copper", hobby: "inventing", createdAt: "2026-01-01",
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

  // Added when a character stopped having to be a child. Everything above this
  // line predates it and MUST NOT MOVE -- those six are the compatibility
  // assertion, and these four are what the widening is supposed to produce.
  "non-human lead": () =>
    buildStoryBrief({ ...base, characterIds: ["c2"] } as StoryRequest, [ember]),
  "mixed cast": () =>
    buildStoryBrief({ ...base, characterIds: ["c1", "c2", "c3"] } as StoryRequest, [mia, ember, bolt]),
  "lead with notes": () =>
    buildStoryBrief({ ...base, characterIds: ["c1"] } as StoryRequest,
      [{ ...mia, notes: "She keeps a pebble from the riverbank in her pocket." }]),
  "lead with parent notes": () =>
    buildStoryBrief({ ...base, characterIds: ["c1"] } as StoryRequest,
      [{ ...mia, mustBeTrue: "Mia uses a wheelchair." }]),

  /**
   * What StoryForm actually sends, rather than a tidy subset of it.
   *
   * `base` omits characterDetails, so for as long as this fixture has existed
   * it asserted a prompt the form never sent: the form defaulted
   * characterDetails to {age: 8}, no field rendered it, nothing stripped it, and
   * buildStoryBrief read the age out of it whenever no saved character was
   * chosen. The captured string said "Sam, a boy." while production said
   * "Sam, aged 8, a boy." -- a golden test cannot catch what its inputs do not
   * contain.
   */
  "form defaults, no character": () =>
    buildStoryBrief({
      childName: "Sam", gender: "boy", animal: "", useAnimal: true, theme: "kindness",
      storyType: "regular", storyLength: "medium", readingLevel: "early-elementary",
      useCharacter: false, characterIds: [], customPrompt: "", biblePassage: "",
      learningFocus: "", heroOfFaith: "", biblicalEvent: "", useTimeTravel: false,
    } as unknown as StoryRequest, []),
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

describe("the legacy field stays legacy", () => {
  /**
   * `characterId` is declared so that requests frozen before multi-character
   * still parse, and is read ONLY through characterIdsOf. Nothing new may write
   * it or branch on it: code that does works for a single character and
   * silently ignores the other seven.
   *
   * A source scan rather than a CI grep, so it runs with `npm test` and can
   * state its own exemptions instead of a shell pipeline carrying them.
   */
  const roots = ["server", "client/src", "shared"];

  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, out);
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(full);
    }
    return out;
  };

  it("appears nowhere outside the schema that declares it", () => {
    const repo = path.resolve(__dirname, "..");
    const offenders: string[] = [];

    for (const root of roots) {
      for (const file of walk(path.join(repo, root))) {
        const rel = path.relative(repo, file);
        // shared/schema.ts declares the field and the drizzle column, and is
        // the one place characterIdsOf may read it.
        if (rel === path.join("shared", "schema.ts")) continue;
        fs.readFileSync(file, "utf8").split("\n").forEach((line, i) => {
          // Comments explaining the history are fine; code is not.
          const code = line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
          if (/\bcharacterId\b/.test(code)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
        });
      }
    }
    expect(offenders).toEqual([]);
  });

  it("would notice if it came back", () => {
    // Proving the check can fail, which is the only thing that makes the
    // assertion above worth reading.
    const sample = 'const id = request.characterId;';
    expect(/\bcharacterId\b/.test(sample.replace(/\/\/.*$/, ""))).toBe(true);
  });
});

describe("the form's own default shape validates", () => {
  /**
   * A regression test for a bug that shipped as "nothing happens".
   *
   * childName was `.min(1).optional()` while the form defaults it to "". An
   * empty string is PRESENT, so .optional() never applied and .min(1) rejected
   * it. That only ever passed because the form force-wrote
   * childName: "Character" whenever a character was chosen -- and when that
   * write was removed, picking a character made submit fail on childName, a
   * field that is HIDDEN once a character is chosen. No request, no error, no
   * symptom.
   *
   * So: exercise the schema with the object the form actually holds, not with
   * a hand-made minimal one. The two diverged and that was the whole bug.
   */
  const formDefaults = {
    childName: "", gender: "boy", animal: "", useAnimal: true, theme: "",
    biblicalEvent: "", heroOfFaith: "", storyType: "regular", useTimeTravel: false,
    characterIds: [], customPrompt: "", biblePassage: "", learningFocus: "",
    readingLevel: "early-elementary", storyLength: "medium", useCharacter: false,
    customSystemPrompt: "", customUserPrompt: "", useCustomPrompts: false,
    characterDetails: { age: 8, hair: "", eyes: "", favoriteColor: "", hobby: "", personality: "", favoriteAnimal: "" },
  };
  const parse = (over: Record<string, unknown>) =>
    storyRequestSchema.safeParse({ ...formDefaults, ...over });

  it("accepts a character picked and the name left empty", () => {
    // THE BUG. This is what a user does: choose someone, press the button.
    expect(parse({ characterIds: ["c1"] }).success).toBe(true);
  });

  it("accepts a whole cast with the name left empty", () => {
    expect(parse({ characterIds: ["c1", "c2", "c3"] }).success).toBe(true);
  });

  it("accepts a typed name and no character", () => {
    expect(parse({ childName: "Mia" }).success).toBe(true);
  });

  it("still refuses untouched defaults", () => {
    // Nobody chosen and nothing typed is genuinely incomplete.
    expect(parse({}).success).toBe(false);
  });

  it("reports that refusal against a field the form is showing", () => {
    // The error must land where the user can see it. With no character chosen
    // the picker is on screen, so characterIds is the right home for it.
    const r = parse({});
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path.join("."))).toEqual(["characterIds"]);
    }
  });

  it("accepts the historical tab's defaults", () => {
    expect(parse({ childName: "Biblical Character", biblicalEvent: "noah" }).success).toBe(true);
  });

  it("accepts a legacy request carrying only characterId", () => {
    expect(parse({ characterId: "c1", characterIds: [] }).success).toBe(true);
  });
});

describe("story focus aims a life at one episode", () => {
  const hero = {
    id: "h1", name: "Corrie ten Boom", description: "d", contribution: "c",
    timePeriod: "1892-1983", group: "modern", collection: "historical",
    keyEvents: [
      { year: "1942", description: "Hides Jewish neighbours behind a false wall" },
      { year: "1944", description: "Arrested and sent to Ravensbruck" },
      { year: "1947", description: "Meets a former guard and forgives him" },
    ],
    tags: [], sources: [], createdAt: new Date(),
  } as never;

  const withFocus = (focus: unknown) =>
    renderBrief(
      buildStoryBrief({ ...base, heroOfFaith: "Corrie ten Boom", storyFocus: focus } as StoryRequest, [], undefined, hero),
      "outline",
    );

  it("says nothing at all when the whole life is wanted", () => {
    // The default must not add scope instructions to every existing story.
    expect(withFocus({ mode: "whole", text: "" })).not.toContain("ONE episode");
    expect(withFocus(undefined)).not.toContain("ONE episode");
  });

  it("scopes the story to a chosen moment", () => {
    const text = withFocus({ mode: "chosen", text: "Arrested and sent to Ravensbruck", reference: "1944" });
    expect(text).toContain("This story covers ONE episode (1944): Arrested and sent to Ravensbruck");
    // The instruction that actually prevents a life summary.
    expect(text).toContain("do not open with where they were born");
  });

  it("ignores a mode with no text", () => {
    // An empty scope line would read as "cover nothing".
    expect(withFocus({ mode: "chosen", text: "" })).not.toContain("ONE episode");
  });
});

describe("resolveStoryFocus settles surprise on the server", () => {
  const hero = {
    id: "h1", name: "H", description: "d", contribution: "c", timePeriod: "t",
    group: "modern", collection: "historical",
    keyEvents: [
      { year: "1942", description: "First" },
      { year: "1944", description: "Second" },
    ],
    tags: [], sources: [], createdAt: new Date(),
  } as never;

  it("replaces the request for a surprise with the moment chosen", () => {
    // The request is frozen straight after this, so what it holds is the only
    // record of what the story was asked for.
    const req = { ...base, storyFocus: { mode: "surprise" as const, text: "" } } as StoryRequest;
    resolveStoryFocus(req, hero);
    expect(req.storyFocus?.mode).toBe("surprise");
    expect(["First", "Second"]).toContain(req.storyFocus?.text);
    expect(req.storyFocus?.reference).toBeTruthy();
  });

  it("can choose either of them", () => {
    // Guards against a "random" pick that always returns index 0 -- which
    // would look correct in every single-run test.
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const req = { ...base, storyFocus: { mode: "surprise" as const, text: "" } } as StoryRequest;
      resolveStoryFocus(req, hero);
      seen.add(req.storyFocus!.text);
    }
    expect(seen.size).toBe(2);
  });

  it("falls back to the whole life when there is nothing to choose from", () => {
    // A hero with no key events, or no hero at all. Emitting an empty scope
    // line would tell the model to cover nothing.
    const req = { ...base, storyFocus: { mode: "surprise" as const, text: "" } } as StoryRequest;
    resolveStoryFocus(req, undefined);
    expect(req.storyFocus).toEqual({ mode: "whole", text: "" });
  });

  it("leaves a chosen moment alone", () => {
    const req = { ...base, storyFocus: { mode: "chosen" as const, text: "Mine" } } as StoryRequest;
    resolveStoryFocus(req, hero);
    expect(req.storyFocus?.text).toBe("Mine");
  });
});

describe("a retelling needs no protagonist", () => {
  const parse = (over: Record<string, unknown>) =>
    storyRequestSchema.safeParse({ storyLength: "medium", ...over });

  it("accepts a biblical event with nobody named", () => {
    // What the form now actually sends on the historical tab. It used to fail,
    // which is why the form wrote childName: "Biblical Character" to get past
    // it -- a value that then had to be stripped back out of the prompt.
    expect(parse({ biblicalEvent: "noah", childName: "" }).success).toBe(true);
  });

  it("accepts a hero of the faith with nobody named", () => {
    expect(parse({ heroOfFaith: "bible-ruth", childName: "" }).success).toBe(true);
  });

  it("is not fooled by the form's no-value sentinels", () => {
    // The selects write "" and "none" to mean "nothing chosen". Treating either
    // as a source would let a completely empty request through.
    expect(parse({ biblicalEvent: "none", heroOfFaith: "" }).success).toBe(false);
    expect(parse({ biblicalEvent: "", heroOfFaith: "  " }).success).toBe(false);
  });

  it("still renders the retelling as having no invented child", () => {
    // With no name supplied, buildStoryBrief falls back to "A child", which is
    // in PLACEHOLDER_NAMES -- so the anonymous branch still fires and the
    // account keeps its own cast.
    const brief = buildStoryBrief(
      { ...base, biblicalEvent: "noah", childName: "" } as StoryRequest, []);
    const text = renderBrief(brief, "single");
    expect(text).toContain("There is no invented child in this story");
    expect(brief.cast[0].colour).toBe("");
  });
});

describe("a cliffhanger stops the story resolving itself", () => {
  const render = (over: Record<string, unknown>) =>
    renderBrief(buildStoryBrief({ ...base, ...over } as StoryRequest, []), "outline");

  it("suppresses the moral-outcome instruction", () => {
    // moralOutcome is picked at RANDOM when the user does not choose one, and
    // it tells the story to resolve. Left in, the two instructions contradict
    // and the model picks one -- which looks like the flag doing nothing.
    const resolved = render({ moralOutcome: "consequences", cliffhanger: false });
    const open = render({ moralOutcome: "consequences", cliffhanger: true });
    expect(resolved).not.toBe(open);
    expect(open).not.toContain("consequence");
  });

  it("says what to do instead, not only what not to do", () => {
    const text = render({ cliffhanger: true });
    expect(text).toContain("Do NOT resolve this story");
    expect(text).toContain("want the next one");
  });

  it("still asks for a finished scene", () => {
    // An unresolved story is not an unfinished sentence. Without this a model
    // stops mid-paragraph and a child thinks the app broke.
    const text = render({ cliffhanger: true });
    expect(text).toContain("finish the SCENE properly");
    expect(text).toContain('Do not write "to be continued"');
  });

  it("changes nothing when it is off", () => {
    // The default path must be untouched -- the golden strings above are the
    // real guard, this is the statement of intent.
    expect(render({ cliffhanger: false })).toBe(render({}));
  });

  it("does not double up on a retelling, which already suppressed the ending", () => {
    const a = render({ biblicalEvent: "noah", cliffhanger: false });
    const b = render({ biblicalEvent: "noah", cliffhanger: true });
    // The retelling already dropped moralOutcome; the cliffhanger adds only its
    // own instruction rather than re-suppressing something already gone.
    expect(b).toContain("Do NOT resolve this story");
    expect(a).not.toContain("Do NOT resolve this story");
  });
});

describe("the three continuity tiers carry different force", () => {
  const world = {
    characters: ["Lily, 7, lives next door and is afraid of the dark"],
    facts: ["The brass lantern is empty"],
    threads: ["The treehouse was never finished"],
  };
  const render = (c: unknown) =>
    renderBrief(buildStoryBrief({ ...base } as StoryRequest, [], c as never), "outline");

  it("says a named character does not have to appear", () => {
    // A cast list read as a cast call puts everyone on the page. Identity, not
    // obligation.
    const t = render({ canon: [], world });
    expect(t).toContain("none of them has to appear");
    expect(t).toContain("Lily, 7, lives next door");
  });

  it("states facts as hard constraints", () => {
    expect(render({ canon: [], world })).toContain("Do not contradict any of this");
  });

  it("states threads as explicitly optional", () => {
    // THE mechanism. Without permission to ignore them, open threads read as a
    // to-do list and the next story is a sequel-by-checklist.
    const t = render({ canon: [], world });
    expect(t).toContain("You MAY pick ONE of these up");
    expect(t).toContain("or ignore all of them");
    expect(t).toContain("possibilities, not instructions");
  });

  it("keeps the three tiers apart", () => {
    const t = render({ canon: [], world });
    expect(t.indexOf("none of them has to appear")).toBeLessThan(t.indexOf("Do not contradict"));
    expect(t.indexOf("Do not contradict")).toBeLessThan(t.indexOf("You MAY pick ONE"));
  });

  it("omits a tier that is empty rather than heading nothing", () => {
    const t = render({ canon: [], world: { characters: [], facts: ["A fact"], threads: [] } });
    expect(t).toContain("Do not contradict");
    expect(t).not.toContain("has to appear");
    expect(t).not.toContain("You MAY pick ONE");
  });

  it("still emits the background guard alongside them", () => {
    // The line that stops the whole block becoming the plot.
    expect(render({ canon: [], world })).toContain("This is BACKGROUND, not the plot");
  });

  it("does not drop a universe that has only a world", () => {
    // The emptiness test predates the world tier; missing it here would make a
    // universe with extractions but no summary look empty.
    expect(render({ canon: [], world })).toContain("ALREADY TRUE IN THIS WORLD");
  });

  it("adds nothing when there is no world at all", () => {
    expect(render(undefined)).not.toContain("ALREADY TRUE IN THIS WORLD");
  });
});

/**
 * A character can now be a dragon, and can carry text somebody typed.
 *
 * The rules being asserted are about FORCE, not wording. Three fields reach the
 * prompt with three different weights, and the whole design of the brief is
 * that those weights stay different:
 *
 *   kind / mustBeTrue  identity -- reprinted every chapter, "keep consistent"
 *   notes              colour   -- "only where a scene naturally calls for it"
 *   canonicalLook      nowhere  -- it is for pictures, in a later slice
 */
describe("a character who is not a child", () => {
  const of = (c: Partial<Character>, p: BriefPurpose = "single") =>
    renderBrief(
      buildStoryBrief({ ...base, characterIds: ["c9"] } as StoryRequest, [
        { id: "c9", name: "Ember", createdAt: "2026-01-01", ...c } as Character,
      ]),
      p,
    );

  it("says what they are, in the slot a gender used to fill", () => {
    expect(of({ kind: "dragon" })).toContain("Ember, a dragon.");
  });

  it("keeps that in every chapter, because it is not decoration", () => {
    // A supporting dragon whose species is dropped becomes a person with a
    // strange name. This is identity, so it survives the tightest projection.
    expect(of({ kind: "dragon" }, "chapter")).toContain("a dragon");
  });

  it("names the covering after what they are", () => {
    expect(of({ kind: "dragon", category: "mythical", hair: "emerald" })).toContain("emerald scales");
    expect(of({ kind: "owl", category: "bird", hair: "brown" })).toContain("brown feathers");
    expect(of({ kind: "robot", category: "machine", hair: "copper" })).toContain("copper plating");
  });

  it("still calls it hair when the character predates categories", () => {
    // The compatibility path: every character saved before this has no
    // category, and "Mia has brown hair" is asserted byte-for-byte above.
    expect(of({ gender: "girl", hair: "brown" })).toContain("brown hair");
  });

  it("refers to a machine as an it, and a creature as a he or a she", () => {
    expect(of({ kind: "robot", sex: "it" })).toContain("a robot (it)");
    expect(of({ kind: "dragon", sex: "female" })).toContain("a dragon (she)");
  });

  it("says a, or an, for whatever noun it was given", () => {
    // The companion-animal line already paid for this once: ungrammatical input
    // made a model stop naming the animal and repeat the bare noun instead.
    expect(of({ kind: "owl" })).toContain("Ember, an owl.");
    expect(of({ kind: "elephant" })).toContain("an elephant");
  });
});

describe("text somebody typed", () => {
  const brief = (c: Partial<Character>) =>
    buildStoryBrief({ ...base, characterIds: ["c9"] } as StoryRequest, [
      { id: "c9", name: "Ember", createdAt: "2026-01-01", kind: "dragon", ...c } as Character,
    ]);

  it("carries a parent's must-be-true into every chapter", () => {
    const t = renderBrief(brief({ mustBeTrue: "Ember cannot fly." }), "chapter");
    expect(t).toContain("Ember cannot fly.");
  });

  it("punctuates it as its own sentence", () => {
    // "a dragon Ember cannot fly." is the failure this guards.
    expect(renderBrief(brief({ mustBeTrue: "Ember cannot fly." }), "chapter"))
      .toContain("a dragon. Ember cannot fly.");
  });

  it("keeps the open notes box out of the chapter prompt", () => {
    // notes is the one field a child types freely, so it is colour: usable,
    // never required, and never repeated as a per-chapter constant.
    const b = brief({ notes: "She hums when she is thinking." });
    expect(renderBrief(b, "single")).toContain("She hums when she is thinking.");
    expect(renderBrief(b, "chapter")).not.toContain("hums");
  });

  it("never puts canonicalLook into any prompt", () => {
    // Stored for the avatar slice, which will use it for image prompts only.
    // Keeping appearance out of the story prompt is what lets it be as long as
    // anyone likes without competing for the cast's few facts.
    const b = brief({ canonicalLook: "Copper scales with a torn left wing." });
    for (const p of ["single", "outline", "chapter", "image"] as BriefPurpose[]) {
      expect(renderBrief(b, p), p).not.toContain("torn left wing");
    }
  });
});
