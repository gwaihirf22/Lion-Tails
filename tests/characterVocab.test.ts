import { describe, it, expect } from "vitest";
import {
  CHARACTER_CATEGORIES,
  KINDS_BY_CATEGORY,
  categoryOf,
  coveringNoun,
  isKnownKind,
  optionsFor,
  popularKinds,
  searchKinds,
  type CharacterCategory,
  type VocabField,
} from "../shared/characterVocab";

/**
 * Structural checks on the catalogue a child picks from.
 *
 * This file is BOTH the option source for the form and the validation source
 * for the strict write path, so the failure it exists to catch is the two
 * drifting apart: an option the form offers and the server refuses, or a
 * category whose colour list is empty so a field renders as a dead dropdown.
 *
 * It does not check taste. Whether "prickleback" earns a place is a content
 * question; whether it has a category and a covering noun is this file's.
 */

const FIELDS: VocabField[] = ["hair", "eyes", "favoriteColor", "hobby", "personality"];

describe("every kind is classified", () => {
  it("has no duplicate kinds across categories", () => {
    const seen = new Map<string, CharacterCategory>();
    const dupes: string[] = [];
    for (const cat of CHARACTER_CATEGORIES) {
      for (const k of KINDS_BY_CATEGORY[cat]) {
        if (seen.has(k)) dupes.push(`${k} (${seen.get(k)} and ${cat})`);
        seen.set(k, cat);
      }
    }
    expect(dupes).toEqual([]);
  });

  it("resolves every listed kind back to its own category", () => {
    for (const cat of CHARACTER_CATEGORIES) {
      for (const k of KINDS_BY_CATEGORY[cat]) {
        expect(categoryOf(k), k).toBe(cat);
      }
    }
  });

  it("accepts every listed kind on the strict path", () => {
    const rejected = CHARACTER_CATEGORIES.flatMap((c) =>
      KINDS_BY_CATEGORY[c].filter((k) => !isKnownKind(k)),
    );
    expect(rejected).toEqual([]);
  });

  it("rejects a kind nobody catalogued", () => {
    // Parent Mode writes these through the custom route. The strict path must
    // refuse them, and a stored one must not be treated as corrupt.
    expect(isKnownKind("wizard")).toBe(false);
    expect(categoryOf("wizard")).toBeUndefined();
    expect(isKnownKind(undefined)).toBe(false);
    expect(isKnownKind("")).toBe(false);
  });

  it("gives every category at least one kind", () => {
    for (const cat of CHARACTER_CATEGORIES) {
      expect(KINDS_BY_CATEGORY[cat].length, cat).toBeGreaterThan(0);
    }
  });
});

describe("options", () => {
  it("gives every category a non-empty list for every field", () => {
    for (const cat of CHARACTER_CATEGORIES) {
      for (const f of FIELDS) {
        expect(optionsFor(f, cat).length, `${cat}/${f}`).toBeGreaterThan(0);
      }
    }
  });

  it("has no duplicates within any option list", () => {
    for (const cat of CHARACTER_CATEGORIES) {
      for (const f of FIELDS) {
        const opts = optionsFor(f, cat);
        expect(new Set(opts).size, `${cat}/${f}`).toBe(opts.length);
      }
    }
  });

  it("falls back to the human list when a legacy row has no category", () => {
    // A row written before categories existed must still render a usable form
    // rather than an empty dropdown.
    expect(optionsFor("hair", undefined)).toEqual(optionsFor("hair", "human"));
  });
});

describe("covering nouns", () => {
  it("calls it hair when nothing is known", () => {
    // Load-bearing: this is what keeps "Mia has brown hair" byte-identical for
    // every character saved before this catalogue existed.
    expect(coveringNoun(undefined, undefined)).toBe("hair");
    expect(coveringNoun(undefined, "girl")).toBe("hair");
  });

  it("uses the right noun for each kind of thing", () => {
    const expected: Record<string, string> = {
      girl: "hair", dog: "fur", owl: "feathers", snake: "scales",
      frog: "skin", goldfish: "scales", butterfly: "shell", octopus: "skin",
      dragon: "scales", robot: "plating",
    };
    for (const [kind, noun] of Object.entries(expected)) {
      expect(coveringNoun(categoryOf(kind), kind), kind).toBe(noun);
    }
  });

  it("overrides the category default where it is wrong", () => {
    // "mythical" is the one heterogeneous category: a dragon has scales and a
    // unicorn does not, so the per-kind map has to win.
    expect(coveringNoun("mythical", "dragon")).toBe("scales");
    expect(coveringNoun("mythical", "unicorn")).toBe("coat");
    expect(coveringNoun("mythical", "phoenix")).toBe("feathers");
  });
});

describe("browsing and search", () => {
  it("only offers popular kinds that are really in the catalogue", () => {
    for (const cat of CHARACTER_CATEGORIES) {
      for (const k of popularKinds(cat)) {
        expect(categoryOf(k), `${cat} popular: ${k}`).toBe(cat);
      }
    }
  });

  it("prefers the shorter match, so 'drag' offers the dragon first", () => {
    // Category order alone puts insects ahead of mythical, which surfaced the
    // dragonfly to someone typing "drag".
    expect(searchKinds("drag")[0]).toBe("dragon");
  });

  it("returns nothing for an empty query", () => {
    expect(searchKinds("")).toEqual([]);
    expect(searchKinds("   ")).toEqual([]);
  });

  it("finds a kind that is not in any popular list", () => {
    expect(searchKinds("axolotl").concat(searchKinds("pangolin"))).toContain("pangolin");
  });
});

describe("content rules", () => {
  it("offers no alien", () => {
    expect(isKnownKind("alien")).toBe(false);
    expect(searchKinds("alien")).toEqual([]);
  });

  it("offers no folklore spirits or pagan deities", () => {
    // Dropped deliberately from the mythological list shared/animalData.ts
    // carries for the favourite-animal autocomplete.
    for (const k of ["banshee", "wendigo", "kelpie", "selkie", "nymph", "satyr", "faun"]) {
      expect(isKnownKind(k), k).toBe(false);
    }
  });
});
