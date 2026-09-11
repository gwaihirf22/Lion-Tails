import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  composeIllustrationPrompt,
  illustrationCast,
  charactersAreInTheStory,
  MAX_DRAWN_CHARACTERS,
  type IllustrationMember,
} from "../server/lib/illustration";
import { describeCharacter, buildAvatarPrompt } from "../server/lib/avatar";
import { KEEPER, KEEPER_FACE_FILE, worldCanon, FRAMING_APPROACHES } from "../server/data/lionTails";
import { storyImagesOf, MAX_STORY_IMAGES, MAX_AVATARS } from "@shared/schema";
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

/** A stand-in for a portrait on disk. */
const file = (name = "portrait.png") => ({
  data: Buffer.from("x"),
  filename: name,
  type: "image/png",
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
    const p = composeIllustrationPrompt(SCENE, [member({ reference: file() })]);
    expect(p.startsWith(PLAIN)).toBe(true);
  });

  it("numbers the reference images and demands the faces match", () => {
    const p = composeIllustrationPrompt(SCENE, [
      member({ name: "Mia", look: "Mia, an 8-year-old girl.", reference: file() }),
      member({ name: "Ben", look: "Ben, a 6-year-old boy.", reference: file() }),
    ]);
    expect(p).toContain("Reference image 1 is Mia, an 8-year-old girl.");
    expect(p).toContain("Reference image 2 is Ben, a 6-year-old boy.");
    expect(p).toMatch(/faces/i);
  });

  it("takes the person from the reference and nothing else from it", () => {
    // Barnabas's canon face is a whole scene -- a shop, shelves, a lit lantern.
    // Without this the reference is a background as much as a man.
    const p = composeIllustrationPrompt(SCENE, [member({ reference: file() })]);
    expect(p).toMatch(/nothing else/i);
    expect(p).toMatch(/background/i);
  });

  it("forbids a spare face being handed to somebody else", () => {
    // The defect the first real generation found: a quest story about William
    // Tyndale came back with Tyndale drawn as Barnabas. The scene wanted an
    // older man at a desk and there was one attached.
    const p = composeIllustrationPrompt(SCENE, [member({ reference: file() })]);
    expect(p).toContain("Everyone else in the picture is a different person");
  });

  it("describes anyone who has no picture instead", () => {
    const p = composeIllustrationPrompt(SCENE, [
      member({ name: "Mia", look: "Mia, an 8-year-old girl. They have brown hair." }),
    ]);
    expect(p).toContain("Also in the picture: Mia, an 8-year-old girl. They have brown hair.");
    expect(p).not.toMatch(/reference image/i);
  });

  it("never collapses into blank space or 'undefined'", () => {
    const p = composeIllustrationPrompt(SCENE, [
      member({ reference: file() }),
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
    const shipped = path.join(process.cwd(), "public", "images", KEEPER_FACE_FILE);
    expect(fs.existsSync(shipped)).toBe(true);
    expect(fs.statSync(shipped).size).toBeGreaterThan(1024);
  });

  it("is in a format the images API will take", () => {
    // png, webp or jpg. He ships as webp -- the artwork is a photographic
    // render, and PNG costs 2.2MB against 167KB for the same picture -- so
    // the extension is not decoration and the API is told what it is being
    // handed. Sent under the wrong type it is a 400, and a 400 costs the
    // whole picture rather than one likeness.
    expect(KEEPER_FACE_FILE).toMatch(/\.(png|webp|jpe?g)$/i);
  });

  it("is small enough to ship in every clone and every image layer", () => {
    const shipped = path.join(process.cwd(), "public", "images", KEEPER_FACE_FILE);
    expect(fs.statSync(shipped).size).toBeLessThan(400 * 1024);
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

describe("when Barnabas is attached", () => {
  /**
   * The rule that cost two real generations to find.
   *
   * He was attached to every quest and marked "need not appear", so that a
   * scene calling him "the old shopkeeper" could not slip past. What came back
   * was William Tyndale wearing Barnabas's face and coat: the scene wanted an
   * older man at a desk and an older man's face was in the request. A generic
   * old man is a smaller mistake than a real historical figure drawn as a
   * fictional one.
   */
  const quest = req({ characterRole: "travels", heroOfFaith: "william-tyndale" });

  it("is attached when the scene names him", async () => {
    const cast = await illustrationCast(quest, 1, "Mr Barnabas hands the boy the lantern.");
    expect(cast.some((m) => m.name.includes(KEEPER.shortName))).toBe(true);
  });

  it("is attached when the scene calls him the Timekeeper", async () => {
    const cast = await illustrationCast(quest, 1, "The Timekeeper watches from the doorway.");
    expect(cast.some((m) => m.name.includes(KEEPER.shortName))).toBe(true);
  });

  it("is NOT attached to a scene he is not in", async () => {
    const cast = await illustrationCast(quest, 1, "Tyndale at his desk in a dim study, a boy beside him.");
    expect(cast.some((m) => m.name.includes(KEEPER.shortName))).toBe(false);
  });

  it("is never attached to a story that is not a quest", async () => {
    const cast = await illustrationCast(req({ characterRole: "alongside" }), 1, "Mr Barnabas and the lantern.");
    expect(cast.some((m) => m.name.includes(KEEPER.shortName))).toBe(false);
  });
});

describe("a story's pictures", () => {
  /**
   * A redraw appends. Nothing discards a picture on its own.
   *
   * Blake, after seeing the first redraw replace one: "the chances are that
   * the old one may be better than the last with AI. I do not want to
   * automatically discard the old photo."
   */
  const row = (o: Record<string, unknown>) => o as Parameters<typeof storyImagesOf>[0];

  it("folds a story illustrated before galleries into a list of one", () => {
    const list = storyImagesOf(
      row({ createdAt: "2026-01-01", story: { imageUrl: "/a.png", imagePrompt: "a scene" } }),
    );
    expect(list).toEqual([
      { id: "legacy", url: "/a.png", prompt: "a scene", createdAt: "2026-01-01" },
    ]);
  });

  it("prefers the real list once there is one", () => {
    const list = storyImagesOf(
      row({
        story: { imageUrl: "/a.png" },
        images: [{ id: "1", url: "/a.png", prompt: "", createdAt: "2026-01-01" }],
      }),
    );
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("1");
  });

  it("is empty for a story that never had one", () => {
    expect(storyImagesOf(row({ story: { title: "x" } }))).toEqual([]);
    expect(storyImagesOf(null)).toEqual([]);
  });

  it("keeps as many as a character keeps portraits", () => {
    // Two caps that answer the same question should not disagree by accident.
    expect(MAX_STORY_IMAGES).toBe(MAX_AVATARS);
  });
});
