import { describe, it, expect } from "vitest";
import {
  CHARACTER_CATEGORIES,
  KINDS_BY_CATEGORY,
  categoryOf,
  coveringNoun,
  isKnownKind,
  optionsFor,
  popularKinds,
  NAME_POOLS,
  randomName,
  searchKinds,
  vocabularyErrors,
  kindNeedsSex,
  GENDERED_KINDS,
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
    // Was "wizard" until wizards were added. Any word nobody catalogued will do.
    expect(isKnownKind("astronaut")).toBe(false);
    expect(categoryOf("astronaut")).toBeUndefined();
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
    //
    // `faun` was on this list and was taken off on purpose: Blake asked for
    // Lewis's fauns. `satyr` stays -- in the classical myths the satyrs are the
    // lecherous ones, which is the very line Lewis drew with Mr Tumnus -- and so
    // does `nymph`, with `dryad` covering the gentle tree-spirit instead.
    for (const k of ["banshee", "wendigo", "kelpie", "selkie", "nymph", "satyr"]) {
      expect(isKnownKind(k), k).toBe(false);
    }
  });
});

describe("names", () => {
  it("has no duplicates in any pool", () => {
    // Checked against the ARRAY, not by drawing. A duplicate does not change
    // what can come out, only how often -- it makes one name quietly twice as
    // likely as its neighbours -- so sampling cannot see it. Three had crept
    // into the human list: Clara, Isaac and Reuben.
    for (const [pool, names] of Object.entries(NAME_POOLS)) {
      const dupes = names.filter((n, i) => names.indexOf(n) !== i);
      expect(dupes, pool).toEqual([]);
    }
  });

  it("never hands back the name already in the box", () => {
    // Press twice, get the same answer, and it reads as broken.
    for (let i = 0; i < 200; i++) {
      expect(randomName("human", "Noah")).not.toBe("Noah");
    }
  });

  it("suits what they are", () => {
    const machine = new Set(Array.from({ length: 200 }, () => randomName("machine")));
    const human = new Set(Array.from({ length: 200 }, () => randomName("human")));
    // No overlap: a robot is not called Sarah and a child is not called Sprocket.
    expect([...machine].some((n) => human.has(n))).toBe(false);
  });
});

describe("hobbies a child would actually name", () => {
  it("accepts the phrasings the dev fixtures use", () => {
    // scripts/dev-seed.ts had all three and the strict route silently refused
    // them, so the dev box came up with one character instead of four.
    for (const hobby of ["building things", "climbing trees", "collecting rocks"]) {
      expect(optionsFor("hobby", "human"), hobby).toContain(hobby);
    }
  });

  it("spells blonde the way the seed does", () => {
    expect(optionsFor("hair", "human")).toContain("blonde");
  });
});

/**
 * Blake's rule, stated as a rule: nothing that is a villain in almost every
 * story it appears in. He named these three; the faun/satyr line is above.
 */
describe("what is never offered", () => {
  it("has no witch, hag or werewolf", () => {
    for (const k of ["witch", "hag", "werewolf"]) {
      expect(isKnownKind(k), k).toBe(false);
    }
  });
});

/**
 * "Human" replaces Boy and Girl, and the peoples closest to man come first.
 */
describe("the peoples", () => {
  const folk = ["elf", "dwarf", "hobbit", "wizard", "gnome", "faun", "dryad", "centaur", "minotaur"];

  it("puts people and the fantasy folk ahead of every animal", () => {
    expect(CHARACTER_CATEGORIES.slice(0, 2)).toEqual(["human", "folk"]);
  });

  it("files every one of the folk as folk, not make-believe", () => {
    for (const k of folk) expect(categoryOf(k), k).toBe("folk");
  });

  it("gives the folk colours a person could have", () => {
    // In `mythical` an elf could only have emerald or sapphire hair and
    // "starlight" eyes. The human lists are the point of the category.
    expect(optionsFor("hair", "folk")).toEqual(optionsFor("hair", "human"));
    expect(optionsFor("eyes", "folk")).toEqual(optionsFor("eyes", "human"));
    expect(optionsFor("hair", "folk")).toContain("brown");
  });

  it("gives them hair, except the minotaur's fur and the ent's bark", () => {
    expect(coveringNoun("folk", "elf")).toBe("hair");
    expect(coveringNoun("folk", "minotaur")).toBe("fur");
    expect(coveringNoun(categoryOf("ent"), "ent")).toBe("bark");
  });

  it("offers Human as the one person, not Boy and Girl", () => {
    expect(popularKinds("human")).toEqual(["human"]);
  });

  it("still knows the old words, so a character saved as 'girl' stays saveable", () => {
    for (const k of ["boy", "girl", "man", "woman", "grandmother", "grandfather", "baby"]) {
      expect(isKnownKind(k), k).toBe(true);
    }
  });
});

describe("he or she", () => {
  it("is required for a Human and for the folk", () => {
    expect(kindNeedsSex("human")).toBe(true);
    expect(kindNeedsSex("elf")).toBe(true);
    expect(kindNeedsSex("hobbit")).toBe(true);
  });

  it("is not required where the word already says it, or for an animal", () => {
    // "girl" is exempt so the existing character stays saveable; the dog is
    // exempt because nobody should have to sex a jellyfish.
    expect(kindNeedsSex("girl")).toBe(false);
    expect(kindNeedsSex("grandmother")).toBe(false);
    expect(kindNeedsSex("dog")).toBe(false);
    expect(kindNeedsSex("robot")).toBe(false);
    expect(kindNeedsSex(undefined)).toBe(false);
  });

  it("is refused by the server when a Human is saved without it", () => {
    const errs = vocabularyErrors({ kind: "human" }, categoryOf("human"));
    expect(errs.join(" ")).toMatch(/he or a she/);
    expect(vocabularyErrors({ kind: "human", sex: "female" }, categoryOf("human"))).toEqual([]);
  });

  it("is refused for the folk too", () => {
    expect(vocabularyErrors({ kind: "elf" }, categoryOf("elf")).join(" ")).toMatch(/he or a she/);
    expect(vocabularyErrors({ kind: "elf", sex: "male" }, categoryOf("elf"))).toEqual([]);
  });

  it("does not block the existing 'girl' character or an animal", () => {
    expect(vocabularyErrors({ kind: "girl" }, categoryOf("girl"))).toEqual([]);
    expect(vocabularyErrors({ kind: "dog" }, categoryOf("dog"))).toEqual([]);
  });

  it("does not refuse an edit that leaves the kind alone", () => {
    // vocabularyErrors validates the PATCH, not the merged character.
    expect(vocabularyErrors({ name: "Ellie" } as never, categoryOf("human"))).toEqual([]);
  });

  it("lists exactly the words that already carry a gender", () => {
    expect([...GENDERED_KINDS].sort()).toEqual(
      ["boy", "girl", "grandfather", "grandmother", "man", "woman"],
    );
  });
});
