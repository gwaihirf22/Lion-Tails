import { describe, expect, it } from "vitest";
import {
  RELATIONS,
  inverseOf,
  relationLabel,
  withRelation,
  withoutCharacter,
  relationSchema,
  sexForWords,
} from "../shared/family";
import { characterSchema, type Character, type StoryRequest } from "../shared/schema";
import { vocabularyErrors } from "../shared/characterVocab";
import {
  buildStoryBrief,
  containsWholeWord,
  familySentences,
  namesakeLines,
  petsComingAlong,
  renderBrief,
  sourceNamesOf,
  FAVOURITE_IS_NOT_A_PET,
  PET_CROSSES_OVER,
} from "../server/lib/storyBrief";
import { MemStorage } from "../server/storage";

const base = { storyLength: "medium", storyType: "regular", useAnimal: true, theme: "kindness" } as unknown as StoryRequest;

const lucy: Character = {
  id: "11111111-aaaa-4aaa-8aaa-111111111111", name: "Lucy", kind: "girl", sex: "female", age: 9,
  favoriteAnimal: "otter",
  relations: [{ relativeId: "22222222-bbbb-4bbb-8bbb-222222222222", relation: "parent" }],
  pets: [
    { id: "p1", name: "Biscuit", kind: "dog", inStories: true },
    { id: "p2", name: "Moss", kind: "cat", inStories: false },
  ],
  createdAt: "2026-01-01",
};
const paul: Character = {
  id: "22222222-bbbb-4bbb-8bbb-222222222222", name: "Paul", kind: "man", sex: "male", age: 33,
  relations: [{ relativeId: lucy.id, relation: "child" }],
  createdAt: "2026-01-01",
};

describe("relations mirror", () => {
  it("every relation's inverse points back at it", () => {
    for (const r of RELATIONS) expect(inverseOf(inverseOf(r))).toBe(r);
  });

  it("labels follow the related character's sex, and a machine or a blank is neutral", () => {
    expect(relationLabel("parent", "male")).toBe("Dad");
    expect(relationLabel("parent", "female")).toBe("Mom");
    expect(relationLabel("parent", undefined)).toBe("Parent");
    expect(relationLabel("parent", "it")).toBe("Parent");
    expect(relationLabel("child", "female", "prompt")).toBe("daughter");
    expect(relationLabel("parentInLaw", "male", "prompt")).toBe("father-in-law");
  });

  it("a character whose kind says it needs no sex field to be a Dad", () => {
    // Every "boy" saved before the sex question existed has kind and no sex.
    expect(relationLabel("parent", sexForWords({ kind: "boy" }))).toBe("Dad");
    expect(relationLabel("parent", sexForWords({ gender: "girl" }))).toBe("Mom");
    expect(relationLabel("parent", sexForWords({ kind: "grandmother" }))).toBe("Mom");
    expect(relationLabel("parent", sexForWords({ kind: "dragon" }))).toBe("Parent");
    expect(sexForWords({ kind: "boy", sex: "female" })).toBe("female");
    expect(familySentences([
      { id: "a", name: "Ann", kind: "girl", createdAt: "x", relations: [{ relativeId: "b", relation: "parent" }] },
      { id: "b", name: "Bob", kind: "man", createdAt: "x" },
    ])).toEqual(["Bob is Ann's father."]);
  });

  it("one relation per pair: a new one replaces the old, and null removes it", () => {
    const once = withRelation([], "x", "cousin");
    const twice = withRelation(once, "x", "auntUncle");
    expect(twice).toEqual([{ relativeId: "x", relation: "auntUncle" }]);
    expect(withRelation(twice, "x", null)).toEqual([]);
    expect(withoutCharacter([{ relativeId: "x", relation: "sibling" }, { relativeId: "y", relation: "cousin" }], "x"))
      .toEqual([{ relativeId: "y", relation: "cousin" }]);
  });

  it("survives characterSchema, which strips any key it does not declare", () => {
    const parsed = characterSchema.parse(lucy);
    expect(parsed.relations).toEqual(lucy.relations);
    expect(parsed.pets).toEqual(lucy.pets);
    expect(relationSchema.safeParse({ relativeId: "x", relation: "bestFriend" }).success).toBe(false);
  });
});

describe("MemStorage.setRelation", () => {
  const setup = async () => {
    const s = new MemStorage();
    const a = await s.createCharacter({ name: "Lucy", sex: "female" }, 1);
    const b = await s.createCharacter({ name: "Paul", sex: "male" }, 1);
    const stranger = await s.createCharacter({ name: "Zed" }, 2);
    return { s, a, b, stranger };
  };

  it("writes both sides at once", async () => {
    const { s, a, b } = await setup();
    await s.setRelation(a.id, b.id, 1, "parent");
    expect((await s.getCharacterById(a.id, 1))?.relations).toEqual([{ relativeId: b.id, relation: "parent" }]);
    expect((await s.getCharacterById(b.id, 1))?.relations).toEqual([{ relativeId: a.id, relation: "child" }]);
  });

  it("changing it from the other side replaces both", async () => {
    const { s, a, b } = await setup();
    await s.setRelation(a.id, b.id, 1, "parent");
    await s.setRelation(b.id, a.id, 1, "sibling");
    expect((await s.getCharacterById(a.id, 1))?.relations).toEqual([{ relativeId: b.id, relation: "sibling" }]);
    expect((await s.getCharacterById(b.id, 1))?.relations).toEqual([{ relativeId: a.id, relation: "sibling" }]);
    await s.setRelation(a.id, b.id, 1, null);
    expect((await s.getCharacterById(a.id, 1))?.relations).toEqual([]);
    expect((await s.getCharacterById(b.id, 1))?.relations).toEqual([]);
  });

  it("refuses a self-relation and another owner's character", async () => {
    const { s, a, stranger } = await setup();
    expect(await s.setRelation(a.id, a.id, 1, "sibling")).toBeUndefined();
    expect(await s.setRelation(a.id, stranger.id, 1, "sibling")).toBeUndefined();
    expect(await s.setRelation(stranger.id, a.id, 2, "sibling")).toBeUndefined();
    expect((await s.getCharacterById(a.id, 1))?.relations).toBeUndefined();
  });

  it("an ordinary save cannot overwrite relations, and deleting someone clears their mirror", async () => {
    const { s, a, b } = await setup();
    await s.setRelation(a.id, b.id, 1, "parent");
    // A form that read Paul before the mirror landed sends his old, empty list.
    await s.updateCharacter(b.id, 1, { age: 34, relations: [] });
    expect((await s.getCharacterById(b.id, 1))?.relations).toEqual([{ relativeId: a.id, relation: "child" }]);
    await s.deleteCharacter(b.id, 1);
    expect((await s.getCharacterById(a.id, 1))?.relations).toEqual([]);
  });
});

describe("pets are named and chosen; a favourite animal is not a pet", () => {
  it("only ticked pets come along, once each, with every owner", () => {
    const ernie: Character = {
      id: "e", name: "Ernie", createdAt: "2026-01-01",
      pets: [{ id: "p9", name: "biscuit", kind: "Dog", inStories: true }],
    };
    expect(petsComingAlong([lucy, ernie])).toEqual([{ name: "Biscuit", kind: "dog", owners: ["Lucy", "Ernie"] }]);
  });

  it("a favourite animal is graded, never a companion", () => {
    const brief = buildStoryBrief({ ...base, characterIds: [lucy.id] } as StoryRequest, [{ ...lucy, pets: [] }]);
    const text = renderBrief(brief, "single");
    expect(text).toContain("favourite animal otter");
    expect(text).toContain(FAVOURITE_IS_NOT_A_PET);
    expect(text).not.toContain("as a companion");
    expect(text).not.toContain("Otter,");
  });

  it("switching animals off takes the favourite animal and the pets with it", () => {
    const brief = buildStoryBrief({ ...base, useAnimal: false, characterIds: [lucy.id] } as StoryRequest, [lucy]);
    const text = renderBrief(brief, "single");
    expect(text).not.toContain("otter");
    expect(text).not.toContain("Biscuit");
    expect(text).not.toContain(FAVOURITE_IS_NOT_A_PET);
  });

  it("the story form's own animal is still a companion", () => {
    const brief = buildStoryBrief({ ...base, animal: "horse", characterIds: [lucy.id] } as StoryRequest, [lucy]);
    expect(brief.cast[0].colour).toContain("a horse as a companion");
  });

  it("a pet crosses over only on a quest", () => {
    const quest = buildStoryBrief(
      { ...base, characterRole: "travels", biblicalEvent: "noah", characterIds: [lucy.id] } as StoryRequest, [lucy],
    );
    const plain = buildStoryBrief({ ...base, characterIds: [lucy.id] } as StoryRequest, [lucy]);
    for (const p of ["single", "chapter"] as const) {
      expect(renderBrief(quest, p)).toContain(PET_CROSSES_OVER);
      expect(renderBrief(plain, p)).not.toContain(PET_CROSSES_OVER);
      expect(renderBrief(plain, p)).toContain("Biscuit, Lucy's dog");
    }
  });

  it("pet kinds are checked against the animal list", () => {
    expect(vocabularyErrors({ pets: [{ kind: "dog" }] })).toEqual([]);
    expect(vocabularyErrors({ pets: [{ kind: "blorp" }] })[0]).toContain("blorp");
  });
});

describe("family in the brief", () => {
  it("says each pair once, and only between people in the cast", () => {
    const ernieId = "33333333-cccc-4ccc-8ccc-333333333333";
    const withBrother = { ...lucy, relations: [...lucy.relations!, { relativeId: ernieId, relation: "sibling" as const }] };
    expect(familySentences([withBrother, paul])).toEqual(["Paul is Lucy's father."]);
    expect(familySentences([withBrother])).toEqual([]);
  });

  it("never puts a character id into any projection", () => {
    const brief = buildStoryBrief(
      { ...base, characterRole: "travels", biblicalEvent: "paul", characterIds: [lucy.id, paul.id] } as StoryRequest,
      [lucy, paul],
    );
    for (const p of ["single", "outline", "chapter", "image"] as const) {
      const text = renderBrief(brief, p);
      expect(text).not.toContain(lucy.id);
      expect(text).not.toContain(paul.id);
      expect(text).not.toContain("p1");
    }
  });
});

describe("namesakes", () => {
  it("matches whole words only", () => {
    expect(containsWholeWord("Paul's Missionary Journeys", "Paul")).toBe(true);
    expect(containsWholeWord("Pauline and the others", "Paul")).toBe(false);
    expect(containsWholeWord("St. Paul", "Paul")).toBe(true);
    // No regex: a name's "." is a dot, not "any character".
    expect(containsWholeWord("J.R. went home", "J.R.")).toBe(true);
    expect(containsWholeWord("JxRx went home", "J.R.")).toBe(false);
  });

  it("names the clash with the account, or with the Timekeeper, and is silent otherwise", () => {
    expect(namesakeLines([paul], { account: "Paul's Missionary Journeys" })[0]).toContain("not the Paul of the account");
    expect(namesakeLines([{ ...paul, name: "Barnabas" }], { keeper: "Mr Barnabas" })[0]).toContain("not Mr Barnabas");
    expect(namesakeLines([lucy, paul], { account: "Noah's Ark" })).toEqual([]);
    expect(namesakeLines([paul], {})).toEqual([]);
  });

  it("reaches the chapter prompt, where the drift happens", () => {
    const brief = buildStoryBrief(
      { ...base, characterRole: "alongside", biblicalEvent: "paul", characterIds: [lucy.id, paul.id] } as StoryRequest,
      [lucy, paul],
    );
    const chapter = renderBrief(brief, "chapter");
    expect(chapter).toContain("Paul is Lucy's father.");
    expect(chapter).toContain("not the Paul of the account");
  });

  /**
   * "The Rock, the Board, and Malta", 2026-09-16: the story made the apostle
   * Paul into Lucy's father. Everything below is what let it.
   */
  it("says whose father he is NOT, because the relation is what drifted", () => {
    const line = namesakeLines([lucy, paul], { account: "Paul's Missionary Journeys" })[0];
    expect(line).toContain("Lucy's father is this Paul and nobody else");
    expect(line).toContain("the Paul of the account is not, and never becomes anybody's family");
    // A namesake with no family in the cast says nothing about a relation.
    const alone = namesakeLines([paul], { account: "Paul's Missionary Journeys" })[0];
    expect(alone).toContain("they only share a name.");
    expect(alone).not.toContain("father");
  });

  /**
   * The first fix made the model EXPLAIN itself on the page: "Lucy's father,
   * Paul-not the apostle Paul-explained carefully, 'These are two different
   * men.'" The notNarrated rule: told a thing three ways, a model writes it.
   */
  it("gives a naming rule instead of asking for an explanation, and forbids the aside", () => {
    const line = namesakeLines([lucy, paul], { account: "Paul's Missionary Journeys" })[0];
    expect(line).toContain("Tell them apart by what you call them");
    expect(line).toContain("as the account itself names them");
    expect(line).toContain("never remark on the coincidence");
    expect(line).not.toContain("make it plain which one");
  });

  it("protects a typed passage too, which has no account to match against", () => {
    // "Set it somewhere real -> a passage" builds no sourceMaterial: there is
    // no account, no era and no cautions to attach. That used to take the
    // namesake sentence with it, one tap away from the failure above.
    const brief = buildStoryBrief(
      {
        ...base,
        characterRole: "alongside",
        biblePassage: "Acts 27 -- Paul's shipwreck on the way to Rome",
        characterIds: [lucy.id, paul.id],
      } as StoryRequest,
      [lucy, paul],
    );
    expect(brief.sourceMaterial).toBeUndefined();
    for (const p of ["single", "outline", "chapter", "image"] as const) {
      expect(renderBrief(brief, p)).toContain("not the Paul of the account");
    }
  });

  it("protects a setting the app does not hold, and never prints its id", () => {
    // The Malta story's own request: an event id the catalogue has never had.
    const brief = buildStoryBrief(
      {
        ...base,
        characterRole: "alongside",
        biblicalEvent: "pauls-missionary-journeys",
        characterIds: [lucy.id, paul.id],
      } as StoryRequest,
      [lucy, paul],
    );
    const single = renderBrief(brief, "single");
    expect(single).toContain("not the Paul of the account");
    // BiblicalEvent.label: "the slug must never reach a prompt".
    expect(single).not.toContain("pauls-missionary-journeys");
    expect(single).toContain("pauls missionary journeys");
  });

  it("reads the words of a setting, id or prose, and ignores a uuid", () => {
    expect(sourceNamesOf({ biblicalEvent: "pauls-missionary-journeys" } as StoryRequest)).toBe(
      "pauls missionary journeys",
    );
    expect(sourceNamesOf({ biblePassage: "Acts 27" } as StoryRequest)).toBe("Acts 27");
    expect(sourceNamesOf({ heroOfFaith: "Corrie ten Boom" } as StoryRequest)).toBe("Corrie ten Boom");
    // A uuid names nobody, and "none" is the form's way of saying no source.
    expect(sourceNamesOf({ heroOfFaith: "0f8c2a1e-4b77-4a2e-9f3b-77c1d9a8e412" } as StoryRequest)).toBeUndefined();
    expect(sourceNamesOf({ biblicalEvent: "none" } as StoryRequest)).toBeUndefined();
    expect(sourceNamesOf({} as StoryRequest)).toBeUndefined();
  });
});

describe("picture IDs reach the picture prompt and nothing else", () => {
  it("only the image projection carries them, with the clash named", () => {
    const brief = buildStoryBrief(
      { ...base, characterRole: "alongside", biblicalEvent: "paul", characterIds: [lucy.id, paul.id] } as StoryRequest,
      [lucy, paul],
    );
    const image = renderBrief(brief, "image");
    expect(image).toContain("Lucy is [111111]; Paul is [222222]");
    expect(image).toContain("The Paul of the account is someone else and never gets [222222].");
    for (const p of ["single", "outline", "chapter"] as const) {
      expect(renderBrief(brief, p)).not.toMatch(/\[[0-9a-f]{6,}\]/);
    }
  });
});

describe("the picture dresses a character who was always there", () => {
  it("alongside carries its own dress rule; a quest keeps the lantern's; a pet loses modern gear in the past", async () => {
    const { ALONGSIDE_DRESS, ANIMALS_AS_THEY_ARE, CROSSING_OVER_DRESS } = await import("../server/data/referencePlates");
    const alongside = renderBrief(buildStoryBrief(
      { ...base, characterRole: "alongside", biblicalEvent: "paul", characterIds: [lucy.id] } as StoryRequest, [lucy]), "image");
    const quest = renderBrief(buildStoryBrief(
      { ...base, characterRole: "travels", biblicalEvent: "paul", characterIds: [lucy.id] } as StoryRequest, [lucy]), "image");
    const now = renderBrief(buildStoryBrief({ ...base, characterIds: [lucy.id] } as StoryRequest, [lucy]), "image");
    expect(alongside).toContain(ALONGSIDE_DRESS);
    expect(alongside).not.toContain(CROSSING_OVER_DRESS);
    expect(quest).toContain(CROSSING_OVER_DRESS);
    expect(quest).not.toContain(ALONGSIDE_DRESS);
    expect(now).not.toContain(ALONGSIDE_DRESS);
    expect(alongside).toContain(ANIMALS_AS_THEY_ARE);
    expect(now).not.toContain(ANIMALS_AS_THEY_ARE);
    // The story text already says it ("nothing from another century"); the
    // new rule is the picture's, and the prose projections do not change.
    expect(renderBrief(buildStoryBrief(
      { ...base, characterRole: "alongside", biblicalEvent: "paul", characterIds: [lucy.id] } as StoryRequest, [lucy]), "single"))
      .not.toContain(ALONGSIDE_DRESS);
  });
});
