import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  composeIllustrationPrompt,
  charactersAreInTheStory,
  MAX_DRAWN_CHARACTERS,
  type IllustrationMember,
} from "../server/lib/illustration";
import { describeCharacter, buildAvatarPrompt } from "../server/lib/avatar";
import { KEEPER, KEEPER_FACE_FILE, worldCanon, FRAMING_APPROACHES } from "../server/data/lionTails";
import type { Character, StoryRequest } from "@shared/schema";

/**
 * A picture cannot be asserted. What we asked for can.
 *
 * These hold the prompt a story illustration is generated from -- who is in
 * it, which reference image is which, and, just as importantly, what is left
 * out: the sheet's personality, hobby and stats have no business in a picture,
 * and a story nobody was written into must not have a child's face in it.
 */
const mk = (o: Partial<Character>): Character =>
  ({ id: "c1", name: "Mia", createdAt: "2026-01-01", ...o }) as Character;

const req = (o: Partial<StoryRequest>): StoryRequest => o as StoryRequest;

const member = (o: Partial<IllustrationMember>): IllustrationMember => ({
  name: "Mia",
  look: "Mia, a girl.",
  ...o,
});

const SCENE = "A child on a hilltop at dawn";
/** What the app produced before any of this, and must still produce. */
const PLAIN =
  "A child on a hilltop at dawn. Render in a beautiful biblical storybook illustration style with soft colors.";

describe("the illustration prompt", () => {
  it("is unchanged when there is nobody to match", () => {
    // The guard on every picture this feature does not apply to: a retelling
    // with no character in it, a cast with no portraits and no description, an
    // older row. None of those may change because this shipped.
    expect(composeIllustrationPrompt(SCENE)).toBe(PLAIN);
    expect(composeIllustrationPrompt(SCENE, [])).toBe(PLAIN);
  });

  it("starts with the scene and the style, whoever is in it", () => {
    const p = composeIllustrationPrompt(SCENE, [member({ reference: Buffer.from("x") })]);
    expect(p.startsWith(PLAIN)).toBe(true);
  });

  it("numbers the reference images and demands the faces match", () => {
    const p = composeIllustrationPrompt(SCENE, [
      member({ name: "Mia", look: "Mia, an 8-year-old girl.", reference: Buffer.from("a") }),
      member({ name: "Ben", look: "Ben, a 6-year-old boy.", reference: Buffer.from("b") }),
    ]);
    expect(p).toContain("Reference image 1 is Mia, an 8-year-old girl.");
    expect(p).toContain("Reference image 2 is Ben, a 6-year-old boy.");
    expect(p).toMatch(/faces/i);
  });

  it("takes the person from the reference and nothing else from it", () => {
    // Barnabas's canon face is a whole scene -- a shop, shelves, a lit lantern.
    // Without this the reference is a background as much as a man.
    const p = composeIllustrationPrompt(SCENE, [member({ reference: Buffer.from("a") })]);
    expect(p).toMatch(/nothing else from it/i);
    expect(p).toMatch(/background/i);
  });

  it("describes anyone who has no picture instead", () => {
    const p = composeIllustrationPrompt(SCENE, [
      member({ name: "Mia", look: "Mia, an 8-year-old girl. They have brown hair." }),
    ]);
    expect(p).toContain("Also in the picture: Mia, an 8-year-old girl. They have brown hair.");
    expect(p).not.toMatch(/reference image/i);
  });

  it("says the optional ones need not appear", () => {
    const p = composeIllustrationPrompt(SCENE, [
      member({ name: "Mia", reference: Buffer.from("a") }),
      member({ name: "Mr Barnabas", look: "an old man.", reference: Buffer.from("b"), optional: true }),
    ]);
    expect(p).toContain("Mr Barnabas need not appear");
    // And Mia is not made optional by his presence.
    expect(p).not.toContain("Mia need not appear");
  });

  it("never collapses into blank space or 'undefined'", () => {
    const p = composeIllustrationPrompt(SCENE, [
      member({ reference: Buffer.from("a") }),
      member({ name: "Ben", look: "Ben, a boy." }),
    ]);
    expect(p).not.toContain("undefined");
    expect(p).not.toContain("  ");
  });
});

describe("how a character is described to an illustrator", () => {
  it("is the same sentence the portrait is built from", () => {
    // One definition of how somebody looks. If these two ever disagree, the
    // story picture stops matching the portrait, which is the entire bug this
    // was written to fix.
    const c = mk({ kind: "girl", age: 8, hair: "brown", eyes: "blue" });
    expect(buildAvatarPrompt(c)).toContain(describeCharacter(c));
  });

  it("leads with canonicalLook and never prints both", () => {
    const c = mk({ kind: "girl", hair: "brown", eyes: "blue", canonicalLook: "A tall girl in a red coat." });
    const d = describeCharacter(c);
    expect(d).toContain("A tall girl in a red coat.");
    expect(d).not.toContain("brown");
  });

  it("keeps the sheet out of the picture", () => {
    // A picture of a child holding a book because their hobby is reading is
    // what feeding the whole sheet to an image model buys you.
    const d = describeCharacter(
      mk({
        kind: "boy",
        hair: "black",
        personality: "patient",
        hobby: "reading",
        notes: "afraid of the dark",
        mustBeTrue: "always wears the blue scarf",
        favoriteColor: "green",
      }),
    );
    for (const leak of ["patient", "reading", "afraid", "scarf", "green"]) {
      expect(d).not.toContain(leak);
    }
  });

  it("is stable: the same character gives the same string", () => {
    const c = mk({ kind: "girl", age: 8, hair: "brown", eyes: "blue" });
    expect(describeCharacter(c)).toBe(describeCharacter(c));
  });
});

describe("who gets drawn", () => {
  it("draws at most three, because a picture is a moment", () => {
    expect(MAX_DRAWN_CHARACTERS).toBe(3);
  });

  it("draws the character in an ordinary story", () => {
    expect(charactersAreInTheStory(req({ characterIds: ["c1"] }))).toBe(true);
  });

  it("draws them when they travel or stand alongside", () => {
    expect(charactersAreInTheStory(req({ characterRole: "travels", heroOfFaith: "polycarp" }))).toBe(true);
    expect(charactersAreInTheStory(req({ characterRole: "alongside", biblicalEvent: "red-sea" }))).toBe(true);
  });

  it("draws nobody into a retelling they are not in", () => {
    // The image-side Esther bug: the account is accurate, and a child's face
    // in the middle of it makes the app look like it confused two people.
    expect(charactersAreInTheStory(req({ characterRole: "absent", biblicalEvent: "red-sea" }))).toBe(false);
    expect(charactersAreInTheStory(req({ characterRole: "absent", heroOfFaith: "polycarp" }))).toBe(false);
    expect(charactersAreInTheStory(req({ characterRole: "absent", biblePassage: "Ruth 1" }))).toBe(false);
  });

  it("treats a legacy time-travel request as travelling", () => {
    expect(charactersAreInTheStory(req({ useTimeTravel: true, biblicalEvent: "red-sea" }))).toBe(true);
  });
});

describe("the Timekeeper's face", () => {
  it("is a file that is actually there", () => {
    // Asserted as an invariant rather than a path typed twice: the constant
    // names it, and a picture prompt that quietly loses its reference is the
    // silent failure this whole module exists to stop.
    const file = path.join(process.cwd(), "public", "images", KEEPER_FACE_FILE);
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.statSync(file).size).toBeGreaterThan(1024);
  });

  it("is not shipped inside the volume that shadows it", () => {
    // public/images/stories is the story_images mount point. A file committed
    // there exists in the repo, in the image, and nowhere at runtime.
    expect(KEEPER_FACE_FILE).not.toContain("/");
  });

  it("describes the same man in words, for when the file cannot be read", () => {
    expect(KEEPER.look).toMatch(/hair/);
    expect(KEEPER.look.length).toBeGreaterThan(20);
  });

  it("keeps the filename out of every story prompt", () => {
    // KEEPER is the text a model may read, and worldCanon renders it. A path
    // in there is prompt weight spent on nothing and a leak of our filesystem.
    const canon = worldCanon(FRAMING_APPROACHES[0]).join(" ");
    expect(canon).not.toContain(KEEPER_FACE_FILE);
    expect(canon).not.toContain(KEEPER.look);
  });
});
