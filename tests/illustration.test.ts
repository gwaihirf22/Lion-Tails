import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  composeIllustrationPrompt,
  illustrationCast,
  charactersAreInTheStory,
  MAX_DRAWN_CHARACTERS,
  MAX_REFERENCE_IMAGES,
  REFERENCE_BUDGET,
  illustrationPlates,
  withinBudget,
  type IllustrationMember,
} from "../server/lib/illustration";
import {
  platesForScene,
  worldSheetLook,
  WORLD_SHEET_FILE,
  WORLD_SHEET_PANELS,
} from "../server/data/referencePlates";
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

  it("numbers the reference images and demands the likeness match", () => {
    const p = composeIllustrationPrompt(SCENE, [
      member({ name: "Mia", look: "Mia, an 8-year-old girl.", reference: file() }),
      member({ name: "Ben", look: "Ben, a 6-year-old boy.", reference: file() }),
    ]);
    expect(p).toContain("Reference image 1 is Mia, an 8-year-old girl.");
    expect(p).toContain("Reference image 2 is Ben, a 6-year-old boy.");
    expect(p).toMatch(/the same face, the same hair/i);
  });

  /**
   * A LIKENESS IS NOT A POSE.
   *
   * The prompt used to ask for a match "especially their faces", which quietly
   * asked for every face to be pointed at the viewer -- passage pictures came
   * back arranged so nobody was ever turned away. Matching and posing are two
   * requests and only one of them belongs in a scene.
   */
  it("lets a scene hide a face, and does not say so on an establishing picture", () => {
    const cast = [member({ reference: file() })];

    const scene = composeIllustrationPrompt(SCENE, cast);
    expect(scene).toMatch(/turned away, partly hidden, or seen from behind/i);
    expect(scene).toMatch(/do not rearrange the scene/i);

    // The cover and the first sight of a new face become the reference
    // everything later is matched against, and COVER_SHOWS_PEOPLE asks them
    // for "recognisable" from the scene prompt's side. Saying both at once
    // would contradict.
    const establishing = composeIllustrationPrompt(SCENE, cast, [], { facesMustShow: true });
    expect(establishing).not.toMatch(/turned away/i);
    expect(establishing).toMatch(/the same face, the same hair/i);
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
    // Phrased against the references rather than a list of names, since the
    // story's own earlier picture carries people nobody named.
    expect(p).toContain("appears in none of the reference images is a different person");
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

  it("keeps more than a character does, because they are not the same job", () => {
    // They were equal when every story picture was THE picture. Now one of
    // them is the picture at the end and the rest are the pictures IN the
    // story, so a story needs a picture-book's worth and a character still
    // has one face. Asserted as a relationship rather than left to drift.
    expect(MAX_STORY_IMAGES).toBeGreaterThan(MAX_AVATARS);
  });
});

/**
 * A photograph is a likeness, not a medium to copy.
 *
 * Once a parent can upload a real photo as a character's portrait, that file
 * becomes the reference image for every story that character is drawn into.
 * With `images.edit` and a photographic reference, the default outcome is a
 * lightly retouched photograph -- a real child's face, in Egypt, in a
 * children's storybook. This line is what stops that, so these assert it says
 * so, says it about the right person, and stays out of every other picture.
 */
describe("a reference that is a photograph", () => {
  it("says so, and asks for a drawing rather than a reproduction", () => {
    const p = composeIllustrationPrompt(SCENE, [
      member({ reference: file(), fromPhoto: true }),
    ]);
    expect(p).toContain("Reference image 1 is a photograph, not a drawing.");
    expect(p).toMatch(/never reproduce the photograph/i);
  });

  it("names the right image when only one of three is a photograph", () => {
    // The failure this prevents: telling the model all three references are
    // photographs, and getting a photographic Barnabas beside a drawn child.
    const p = composeIllustrationPrompt(SCENE, [
      member({ name: "Mia", look: "Mia, a girl.", reference: file() }),
      member({ name: "Ben", look: "Ben, a boy.", reference: file(), fromPhoto: true }),
      member({ name: "Ada", look: "Ada, a woman.", reference: file() }),
    ]);
    expect(p).toContain("Reference image 2 is a photograph");
    expect(p).not.toContain("Reference image 1 is a photograph");
    expect(p).not.toContain("Reference image 3 is a photograph");
  });

  it("leaves the numbering of every other instruction alone", () => {
    const p = composeIllustrationPrompt(SCENE, [
      member({ name: "Mia", look: "Mia, a girl.", reference: file(), fromPhoto: true }),
      member({ name: "Ben", look: "Ben, a boy.", reference: file() }),
    ]);
    expect(p).toContain("Reference image 1 is Mia, a girl.");
    expect(p).toContain("Reference image 2 is Ben, a boy.");
  });

  it("says NOTHING about photographs in a picture that has none", () => {
    // The other half of "an empty cast renders what it always did": a cast of
    // drawings must not gain a line about a medium nobody uploaded.
    const drawn = composeIllustrationPrompt(SCENE, [
      member({ reference: file() }),
      member({ name: "Ben", look: "Ben, a boy.", reference: file() }),
    ]);
    expect(drawn).not.toMatch(/photograph/i);

    // And the exact-string guard, which is the one that would actually catch a
    // stray space or a reordered clause.
    expect(
      composeIllustrationPrompt(SCENE, [member({ reference: file(), fromPhoto: false })]),
    ).toBe(composeIllustrationPrompt(SCENE, [member({ reference: file() })]));
  });

  it("ignores the flag on somebody with no reference image at all", () => {
    // fromPhoto describes a FILE. With no file there is no photograph to
    // caution anyone about, and `described` members never get numbered lines.
    const p = composeIllustrationPrompt(SCENE, [member({ fromPhoto: true })]);
    expect(p).not.toMatch(/photograph/i);
  });
});

/**
 * The world's furniture, on one sheet.
 *
 * Six separate plates would spend six of the sixteen reference slots on
 * scenery. One sheet spends one, and the panels inside it are still ~512x512
 * of real detail -- ample for a building, and deliberately not where faces go.
 */
describe("the Timekeeper world sheet", () => {
  it("says where every panel is, built from the panel list", () => {
    // A montage nobody can navigate is a collage the model guesses at. The
    // layout is GENERATED from the panels so the two cannot drift apart.
    const look = worldSheetLook();
    for (const panel of WORLD_SHEET_PANELS) expect(look).toContain(panel);
    expect(look).toMatch(/Top row, left to right/);
    expect(look).toMatch(/Bottom row, left to right/);
    expect(look).toContain(`${WORLD_SHEET_PANELS.length} separate pictures`);
  });

  it("lays out in whole rows, whatever the panel count", () => {
    // The artwork is drawn to this. If the list grows and the sentence stops
    // describing every panel, the prompt starts pointing at the wrong one --
    // worse than no sheet, because it is confidently wrong.
    const look = worldSheetLook(["a", "b", "c", "d"]);
    expect(look).toContain("Top row, left to right: a; b.");
    expect(look).toContain("Bottom row, left to right: c; d.");
  });

  it("carries both states of the lantern, which is the point", () => {
    // The canon has said all along that the lantern goes dark on the far side.
    // Nothing had ever drawn one, because nothing asked.
    const panels = WORLD_SHEET_PANELS.join(" | ");
    expect(panels).toMatch(/the lantern, lit/);
    expect(panels).toMatch(/the lantern, dark/);
    expect(panels).toMatch(/stone/);
  });

  it("keeps the white flame off it", () => {
    // Movement III: the lantern burns white when a story cannot be found.
    // A sheet every quest sees would spend the reveal before it is written.
    expect(WORLD_SHEET_PANELS.join(" ")).not.toMatch(/white/i);
  });

  it("comes only when the scene calls for something on it", () => {
    // The Tyndale rule, applied to furniture: a shop front attached to a scene
    // in a granary is a shop front the model may decide to draw.
    expect(platesForScene({ scene: "Mr Barnabas behind the counter of his shop" })).toHaveLength(1);
    expect(platesForScene({ scene: "Ella holds the lantern up to the dark" })).toHaveLength(1);
    expect(platesForScene({ scene: "Joseph counting grain in a granary" })).toHaveLength(0);
  });

  it("does not come for the ordinary word 'stone'", () => {
    // "stone" is a common English word; a stone wall must not drag the sheet
    // in. It earns its place next to the lantern, which is what makes it THE
    // stone.
    expect(platesForScene({ scene: "A boy climbs a stone wall in the sun" })).toHaveLength(0);
  });

  it("does not come for the bare word 'sign'", () => {
    // Another ordinary word. A scene that means Barnabas's sign nearly always
    // names the shop in the same breath, and that already matches.
    expect(platesForScene({ scene: "A sign at the crossroads pointed east" })).toHaveLength(0);
    expect(platesForScene({ scene: "The sign above the shop door swung" })).toHaveLength(1);
  });

  it("is not shipped inside the volume that shadows it", () => {
    // public/images/stories is a docker mount; a file inside it disappears at
    // runtime. The same assertion guards the Timekeeper's face.
    expect(WORLD_SHEET_FILE).not.toContain("/");
    expect(WORLD_SHEET_FILE).toMatch(/\.(png|webp|jpe?g)$/i);
  });

  /**
   * THE ART DOES NOT EXIST YET, and the app has to be fine with that.
   *
   * The sheet is drawn, approved and committed separately. Until then every
   * quest still generates pictures, and they must be no worse than they were
   * before this shipped -- the same rule the Timekeeper's face already follows
   * when it cannot be read.
   */
  it("falls back to words when the file is not there", async () => {
    const plates = await illustrationPlates("Mr Barnabas behind the counter of his shop");
    expect(plates).toHaveLength(1);
    expect(plates[0].file).toBeUndefined();
    // The words still carry the layout, so a future reader of the prompt sees
    // what was meant even though nothing was attached.
    expect(plates[0].look).toContain("the lantern, dark");
  });

  it("attaches nothing at all to a scene that wants nothing", async () => {
    expect(await illustrationPlates("Joseph counting grain in a granary")).toEqual([]);
  });

  it("changes no prompt while the file is missing", async () => {
    // The promise that matters most right now: a plate with no file adds no
    // numbered line, because the numbers must match what images.edit actually
    // received. A described-but-unattached plate would renumber everybody.
    const cast = [member({ reference: file() })];
    const plates = await illustrationPlates("Mr Barnabas in his shop");
    expect(composeIllustrationPrompt(SCENE, cast, plates)).toBe(
      composeIllustrationPrompt(SCENE, cast),
    );
  });
});

/**
 * Sixteen is the API's limit; twelve is ours. The four spare exist because a
 * request that lands exactly on a hard limit fails completely the first time
 * anything is added -- and the thing most likely to be added is one more face.
 */
describe("the reference budget", () => {
  const person = (n: string) => member({ name: n, look: `${n}.`, reference: file() });
  const extra = (role: "style" | "background") => ({
    role,
    name: role,
    look: `${role}.`,
    file: file(),
  });

  it("leaves room under the API's own limit", () => {
    expect(REFERENCE_BUDGET).toBeLessThan(MAX_REFERENCE_IMAGES);
  });

  it("sends everything when everything fits", () => {
    const cast = [person("a"), person("b")];
    const extras = [extra("style")];
    const out = withinBudget(cast, extras);
    expect(out.cast).toHaveLength(2);
    expect(out.extras).toHaveLength(1);
  });

  it("keeps the style reference before any face", () => {
    // Dropping it changes every pixel of the picture; dropping one face of
    // eight changes one person.
    const cast = Array.from({ length: 20 }, (_, i) => person(`p${i}`));
    const out = withinBudget(cast, [extra("style")], 3);
    expect(out.extras.map((e) => e.role)).toEqual(["style"]);
    expect(out.cast).toHaveLength(2);
  });

  it("drops the furniture before it drops a face", () => {
    // A shop drawn slightly differently is a blemish. A child drawn as
    // somebody else is the bug this whole feature exists to prevent.
    const cast = [person("a"), person("b")];
    const out = withinBudget(cast, [extra("style"), extra("background")], 3);
    expect(out.cast).toHaveLength(2);
    expect(out.extras.map((e) => e.role)).toEqual(["style"]);
  });

  it("never sends more than the budget, however much is asked for", () => {
    const cast = Array.from({ length: 30 }, (_, i) => person(`p${i}`));
    const extras = Array.from({ length: 10 }, () => extra("background"));
    const out = withinBudget(cast, [extra("style"), ...extras]);
    expect(out.cast.length + out.extras.length).toBeLessThanOrEqual(REFERENCE_BUDGET);
  });
});
