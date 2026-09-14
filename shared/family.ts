import { z } from "zod";

/**
 * How two saved characters are related, and the animals that are theirs.
 *
 * KEYED ON CHARACTER ID, NEVER ON NAME. A reader's Paul can be renamed and stay
 * Lucy's dad, and two characters who share a name are never crossed. The id
 * never reaches a STORY prompt: it can leak into text a child reads, and what
 * keeps Lucy's dad apart from the apostle in prose is the brief SAYING so, in
 * sentences built from these ids (storyBrief.ts, familySentences /
 * namesakeLines). Pictures are the one exception, and a deliberate one -- see
 * pictureRef() at the bottom of this file.
 *
 * Stored gender-neutral. "Dad" or "Mom" is decided when it is shown, from the
 * related character's sex, so changing a character's sex relabels everything
 * and nothing gendered is ever stale.
 */
export const RELATIONS = [
  "parent",
  "child",
  "sibling",
  "grandparent",
  "grandchild",
  "auntUncle",
  "nieceNephew",
  "cousin",
  "spouse",
  "stepparent",
  "stepchild",
  "stepsibling",
  "parentInLaw",
  "childInLaw",
] as const;
export type Relation = (typeof RELATIONS)[number];

/**
 * What the OTHER character is to this one, seen from the other side.
 *
 * If Paul is Lucy's parent, Lucy is Paul's child. setRelation writes both, so
 * the two sheets can never disagree. It is its own inverse -- a test holds that.
 */
const INVERSE: Record<Relation, Relation> = {
  parent: "child",
  child: "parent",
  sibling: "sibling",
  grandparent: "grandchild",
  grandchild: "grandparent",
  auntUncle: "nieceNephew",
  nieceNephew: "auntUncle",
  cousin: "cousin",
  spouse: "spouse",
  stepparent: "stepchild",
  stepchild: "stepparent",
  stepsibling: "stepsibling",
  parentInLaw: "childInLaw",
  childInLaw: "parentInLaw",
};

export function inverseOf(relation: Relation): Relation {
  return INVERSE[relation];
}

export function isRelation(value: unknown): value is Relation {
  return typeof value === "string" && (RELATIONS as readonly string[]).includes(value);
}

type Worded = { male: string; female: string; neither: string };

/** What the form shows. American, like the rest of the form's labels. */
const UI_LABELS: Record<Relation, Worded> = {
  parent: { male: "Dad", female: "Mom", neither: "Parent" },
  child: { male: "Son", female: "Daughter", neither: "Child" },
  sibling: { male: "Brother", female: "Sister", neither: "Sibling" },
  grandparent: { male: "Grandpa", female: "Grandma", neither: "Grandparent" },
  grandchild: { male: "Grandson", female: "Granddaughter", neither: "Grandchild" },
  auntUncle: { male: "Uncle", female: "Aunt", neither: "Aunt or uncle" },
  nieceNephew: { male: "Nephew", female: "Niece", neither: "Niece or nephew" },
  cousin: { male: "Cousin", female: "Cousin", neither: "Cousin" },
  spouse: { male: "Husband", female: "Wife", neither: "Spouse" },
  stepparent: { male: "Stepdad", female: "Stepmom", neither: "Stepparent" },
  stepchild: { male: "Stepson", female: "Stepdaughter", neither: "Stepchild" },
  stepsibling: { male: "Stepbrother", female: "Stepsister", neither: "Stepsibling" },
  parentInLaw: { male: "Father-in-law", female: "Mother-in-law", neither: "Parent-in-law" },
  childInLaw: { male: "Son-in-law", female: "Daughter-in-law", neither: "Child-in-law" },
};

/** What the story is told: plain nouns, whatever the reader calls them at home. */
const PROMPT_LABELS: Record<Relation, Worded> = {
  parent: { male: "father", female: "mother", neither: "parent" },
  child: { male: "son", female: "daughter", neither: "child" },
  sibling: { male: "brother", female: "sister", neither: "sibling" },
  grandparent: { male: "grandfather", female: "grandmother", neither: "grandparent" },
  grandchild: { male: "grandson", female: "granddaughter", neither: "grandchild" },
  auntUncle: { male: "uncle", female: "aunt", neither: "aunt or uncle" },
  nieceNephew: { male: "nephew", female: "niece", neither: "niece or nephew" },
  cousin: { male: "cousin", female: "cousin", neither: "cousin" },
  spouse: { male: "husband", female: "wife", neither: "spouse" },
  stepparent: { male: "stepfather", female: "stepmother", neither: "stepparent" },
  stepchild: { male: "stepson", female: "stepdaughter", neither: "stepchild" },
  stepsibling: { male: "stepbrother", female: "stepsister", neither: "stepsibling" },
  parentInLaw: { male: "father-in-law", female: "mother-in-law", neither: "parent-in-law" },
  childInLaw: { male: "son-in-law", female: "daughter-in-law", neither: "child-in-law" },
};

/**
 * A character's sex for choosing a word, including one that only its KIND says.
 *
 * `sex` is newer than `kind`, and the gendered kinds -- boy, girl, man, woman,
 * grandmother, grandfather -- never needed it: a "boy" saved before the sex
 * question existed has none. Read from `sex` alone, Paul on the dev box was
 * everybody's "Parent". The legacy `gender` is the same word under its old name.
 * Kept here, not taken from characterVocab, because shared/schema.ts imports
 * this file and the vocabulary would make that a cycle.
 */
const MALE_WORDS = new Set(["boy", "man", "grandfather"]);
const FEMALE_WORDS = new Set(["girl", "woman", "grandmother"]);
export function sexForWords(c: { sex?: string; kind?: string; gender?: string } | undefined): string | undefined {
  if (!c) return undefined;
  if (c.sex) return c.sex;
  const word = (c.kind || c.gender || "").trim().toLowerCase();
  if (MALE_WORDS.has(word)) return "male";
  if (FEMALE_WORDS.has(word)) return "female";
  return undefined;
}

/**
 * The word for what a character IS to someone, from that character's own sex.
 *
 * `relationLabel("parent", paul.sex)` is "Dad": Paul is the parent, so Paul's
 * sex picks the word. A machine, or a sheet with no sex, gets the neutral one.
 */
export function relationLabel(
  relation: Relation,
  sex: string | undefined,
  voice: "ui" | "prompt" = "ui",
): string {
  const words = (voice === "ui" ? UI_LABELS : PROMPT_LABELS)[relation];
  if (sex === "male") return words.male;
  if (sex === "female") return words.female;
  return words.neither;
}

/**
 * One entry on a character: `relativeId` is <relation> to this character.
 *
 * On Lucy's sheet, `{ relativeId: paul.id, relation: "parent" }` reads
 * "Paul is Lucy's parent". Server-owned -- only setRelation writes it.
 */
export const relationSchema = z.object({
  relativeId: z.string().min(1).max(100),
  relation: z.enum(RELATIONS),
});
export type CharacterRelation = z.infer<typeof relationSchema>;

export const MAX_RELATIONS = 24;

/**
 * A character's relation list with `otherId` set to `relation`, or removed.
 *
 * ONE ENTRY PER PAIR: whatever the two were before is dropped first, so
 * choosing "uncle" for someone already listed as "cousin" replaces it rather
 * than making them both. Pure, so both storages share it and it is tested
 * without a database. Order is kept -- the form lists family as it was added.
 */
export function withRelation(
  list: readonly CharacterRelation[] | undefined,
  otherId: string,
  relation: Relation | null,
): CharacterRelation[] {
  const kept = (list ?? []).filter((r) => r.relativeId !== otherId);
  return relation ? [...kept, { relativeId: otherId, relation }] : kept;
}

/** A relation list with every entry pointing at a deleted character removed. */
export function withoutCharacter(
  list: readonly CharacterRelation[] | undefined,
  deletedId: string,
): CharacterRelation[] {
  return (list ?? []).filter((r) => r.relativeId !== deletedId);
}

export const MAX_PETS = 6;

/**
 * An animal that belongs to this character, with the name it really has.
 *
 * This is what a favourite animal used to be mistaken for: the brief turned
 * "favourite animal: rabbit" into "has a rabbit as a companion; give it a name",
 * and every story invented a different rabbit. A pet is chosen, named once, and
 * comes along only when `inStories` is ticked.
 */
export const petSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1, "Every pet needs a name").max(40),
  kind: z.string().trim().min(1, "Say what kind of animal").max(60),
  inStories: z.boolean(),
});
export type Pet = z.infer<typeof petSchema>;

/**
 * A character's ID for PICTURES: `[c6108b]`, the start of their character id.
 *
 * WHY PICTURES NEED ONE. A picture crosses three hops -- the brief, a model
 * writing the scene, the image model with the portraits -- and only names used
 * to cross them. A story with the reader's Paul in Paul's Missionary Journeys
 * came back with the apostle wearing Blake's portrait in all six panels: the
 * scene said "the apostle Paul", a reference image was labelled "Paul", and
 * the image model matched the two. Blake: "if we standardize an id number then
 * we avoid this altogether."
 *
 * The image model cannot look an id up. What it DOES understand is which
 * attached picture a person is -- "reference image 2" -- so this ID is written
 * by the scene writer next to each person it draws, and the server turns it
 * into that number before anything is sent (illustration.ts). It never reaches
 * a story, and readers never see it: withoutPictureRefs() takes it off anything
 * displayed.
 *
 * Hex only and bracketed, so PICTURE_REF_PATTERN is our own constant and never
 * a pattern built from a name.
 */
export const PICTURE_REF_PATTERN = /\s?\[[0-9a-f]{6,32}\]/g;

export function pictureRef(id: string, length = 6): string {
  const hex = id.toLowerCase().replace(/[^0-9a-f]/g, "");
  return `[${hex.slice(0, Math.max(6, length)).padEnd(6, "0")}]`;
}

/**
 * The IDs for one cast, by character id, lengthened until no two are the same.
 * Everything that needs a cast's IDs goes through here, so the brief that asks
 * for them and the picture that reads them always agree.
 */
export function pictureRefs(characterIds: readonly string[]): Map<string, string> {
  const unique = Array.from(new Set(characterIds));
  for (let length = 6; length <= 32; length += 2) {
    const refs = unique.map((id) => pictureRef(id, length));
    if (new Set(refs).size === refs.length || length === 32) {
      return new Map(unique.map((id, i) => [id, refs[i]]));
    }
  }
  return new Map();
}

/** Any text a reader sees, with picture IDs taken off: "Lucy [9768fb]" -> "Lucy". */
export function withoutPictureRefs(text: string): string;
export function withoutPictureRefs(text: string | undefined): string | undefined;
export function withoutPictureRefs(text: string | undefined): string | undefined {
  return text === undefined ? undefined : text.replace(PICTURE_REF_PATTERN, "");
}

/**
 * Said beside the image projection, by both writers of an image prompt (the
 * cover's finalizeStoryDetails and a passage's buildPassageScenePrompt). The
 * projection already asks for the IDs; this is the reminder where the prompt
 * is actually written, because an ID the writer drops is a face that cannot
 * be bound.
 */
export const PICTURE_ID_REMINDER =
  "Keep every picture ID in square brackets exactly as given, straight after that person's name, each time they are in the picture.";
