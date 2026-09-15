import { describe, it, expect } from "vitest";
import { newLooks, lookBookOf, renderLookBook, withLooks, MAX_LOOKS, MAX_LOOK_CHARS } from "../shared/lookBook";
import {
  buildPassageScenePrompt,
  passageScenePromptParts,
  findPassage,
  storyForScene,
  validateScene,
  MAX_SCENE_STORY_CHARS,
} from "../server/lib/passageScene";
import { storyWithoutAppendices, MEETING_NOTE_HEADING } from "../shared/storyAppendices";

const NOTE = "Ellie and Elijah are invented; the account is from the Book of Esther.";

const HAMAN = "A tall man in his forties with a black oiled beard, in a deep red robe with gold trim.";

describe("the look book", () => {
  it("never rewrites a look it already has, whatever the case of the name", () => {
    // First words win: a book a later picture can revise is Haman changing
    // his beard whenever a scene describes him differently.
    const existing = { Haman: HAMAN };
    expect(newLooks(existing, { haman: "A short bald man.", "  HAMAN ": "Another." }, [])).toEqual({});
  });

  it("adds new people, tidied", () => {
    expect(newLooks({}, { "  Queen   Esther ": "  A young queen,\n dark hair, gold crown. " }, [])).toEqual({
      "Queen Esther": "A young queen, dark hair, gold crown.",
    });
  });

  it("leaves out anyone with a face of their own", () => {
    // A cast member has a portrait and Barnabas has a file; a second, written
    // face for them is a second opinion that can disagree.
    const added = newLooks({}, { Ellie: "A girl.", "mr barnabas": "An old man.", Mordecai: "An old man." }, [
      "Ellie",
      "Mr Barnabas",
    ]);
    expect(added).toEqual({ Mordecai: "An old man." });
  });

  it("keeps a namesake the story tells apart", () => {
    // Child Esther is in the cast; the queen is not her.
    expect(newLooks({}, { "Queen Esther": "A queen." }, ["Esther"])).toEqual({ "Queen Esther": "A queen." });
  });

  it("drops what is not a look, and never throws on a bad reply", () => {
    expect(newLooks({}, { A: 3, B: "", "": "x", C: null, D: ["x"] }, [])).toEqual({});
    for (const bad of [undefined, null, "Haman", ["Haman"], 7]) expect(newLooks({}, bad, [])).toEqual({});
    expect(newLooks("not a book", { Haman: HAMAN }, [])).toEqual({ Haman: HAMAN });
  });

  it("cuts an over-long look and stops at the cap", () => {
    const long = newLooks({}, { Haman: "x".repeat(MAX_LOOK_CHARS + 50) }, []);
    expect(long.Haman.length).toBe(MAX_LOOK_CHARS);
    const full = Object.fromEntries(Array.from({ length: MAX_LOOKS }, (_, i) => [`P${i}`, "a look"]));
    expect(newLooks(full, { Haman: HAMAN }, [])).toEqual({});
    const nearlyFull = Object.fromEntries(Array.from({ length: MAX_LOOKS - 1 }, (_, i) => [`P${i}`, "a look"]));
    expect(Object.keys(newLooks(nearlyFull, { Haman: HAMAN, Zeresh: "x" }, []))).toEqual(["Haman"]);
  });

  it("is attached to the picture by the server, only for people the scene names", () => {
    // The first real test: the model saved Mordecai's look and then described
    // him in its own words. The image model never saw the saved sentence.
    const book = { Haman: HAMAN, Mordecai: "An old man in blue.", "Queen Esther": "A young queen." };
    const drawn = withLooks("In Susa, in the Persian era, Mordecai rides while Haman's hand holds the bridle. Esther watches.", book);
    expect(drawn).toContain(`Haman: ${HAMAN}`);
    expect(drawn).toContain("Mordecai: An old man in blue.");
    // Child Esther is not the queen, and "Esther" alone is not "Queen Esther".
    expect(drawn).not.toContain("A young queen.");
    // Whole words: "Hamanda" is not Haman. Already there: not repeated.
    expect(withLooks("Hamanda waves.", book)).toBe("Hamanda waves.");
    const once = withLooks("Haman walks.", book);
    expect(withLooks(once, book)).toBe(once);
  });

  it("reads a stored book defensively", () => {
    expect(lookBookOf({ Haman: HAMAN, bad: 1, "": "x" })).toEqual({ Haman: HAMAN });
    expect(lookBookOf(null)).toEqual({});
    expect(renderLookBook({})).toBe("");
    expect(renderLookBook({ Haman: HAMAN })).toBe(`- Haman: ${HAMAN}`);
  });
});

describe("a scene written from the whole story", () => {
  const body = [
    "Ellie had already picked up the lantern from where it sat among the things by the door.",
    "They crossed to the shop together.",
    "The next thing she saw was Mordecai in royal clothing, riding through Susa while Haman led the horse before him.",
  ].join("\n\n");
  const story = storyWithoutAppendices(`${body}\n\n${MEETING_NOTE_HEADING} ${NOTE}`);
  const passage = "The next thing she saw was Mordecai in royal clothing";
  const full = () =>
    buildPassageScenePrompt({
      title: "The Creased Silver Gate",
      passage,
      brief: "Ellie [c6108b], aged 10, a girl -- a scene from the Book of Esther.",
      story,
      blockIndex: 2,
      outline: ["The gate is torn.", "Susa.", "Home."],
      coverPrompt: "Six panels: Mordecai in sackcloth.",
      lookBook: { Haman: HAMAN },
    });

  it("puts everything that is the same for every picture first, so it is cached", () => {
    const p = full();
    const order = ["=== THE STORY ===", "=== ITS CHAPTER PLAN ===", "=== WHO IS IN IT ===", "=== HOW THE COVER DREW THEM ===", "=== THE LOOK BOOK ===", "=== THE MOMENT TO DRAW ==="];
    const at = order.map((h) => p.indexOf(h));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    // The passage appears inside the story AND after it; the copy to draw is last.
    expect(p.lastIndexOf(passage)).toBeGreaterThan(p.indexOf("=== THE MOMENT TO DRAW ==="));
  });

  it("splits at the end of the story, so the breakpoint caches only what every picture shares", () => {
    const { prefix, rest } = passageScenePromptParts({
      title: "The Creased Silver Gate",
      passage,
      story,
      blockIndex: 2,
      coverPrompt: "Six panels.",
      lookBook: { Haman: HAMAN },
    });
    expect(prefix).toContain("=== THE STORY ===");
    expect(prefix).toContain("=== HOW THE COVER DREW THEM ===");
    // Nothing that changes between pictures may sit before the breakpoint.
    expect(prefix).not.toContain("=== THE LOOK BOOK ===");
    expect(prefix).not.toContain("It comes straight after");
    expect(rest.startsWith("=== THE LOOK BOOK ===")).toBe(true);
    // The same story and a different passage: the same prefix, byte for byte.
    const other = passageScenePromptParts({ title: "The Creased Silver Gate", passage: "They crossed to the shop together.", story, blockIndex: 1, coverPrompt: "Six panels." });
    expect(other.prefix).toBe(prefix);
    // The passage-only prompt has nothing to cache.
    expect(passageScenePromptParts({ title: "T", passage }).prefix).toBe("");
  });

  it("makes the scene say when it is and what everyone wears", () => {
    // The shop scene never said "present day", and the image model dressed
    // the children for Susa.
    expect(full()).toMatch(/Begin the image prompt with when and where/);
    expect(full()).toMatch(/what each person in the picture is wearing/);
  });

  it("does not hand the model the appended note as part of the story", () => {
    expect(full()).not.toContain(NOTE);
  });

  it("uses the cover for looks only, and the look book word for word", () => {
    const p = full();
    expect(p).toMatch(/only for how people and places LOOK/);
    expect(p).toContain(`- Haman: ${HAMAN}`);
    expect(p).toMatch(/WORD FOR WORD/);
    expect(p).toMatch(/"looks"/);
  });

  it("asks where everyone is from the story, not from the passage alone", () => {
    // The rule that drew Barnabas's shop "in ancient Susa".
    const p = full();
    expect(p).not.toMatch(/from the passage above and from nothing else/);
    expect(p).toMatch(/where\s+everyone physically is right now/);
    expect(p).toMatch(/THIS MOMENT/);
    expect(p).toMatch(/Keep every picture ID/);
  });

  it("quotes what comes just before the passage", () => {
    expect(full()).toContain('It comes straight after: "…Ellie had already picked up');
  });

  it("finds a repeated line nearest the paragraph it was chosen in", () => {
    const repeated = ["He waited.", "Rain.", "He waited.", "Sun.", "He waited."].join("\n\n");
    expect(findPassage(repeated, "He waited.", 4)).toBe(repeated.lastIndexOf("He waited."));
    expect(findPassage(repeated, "He waited.", 2)).toBe(repeated.indexOf("He waited.", 1));
    expect(findPassage(repeated, "Not in it", 0)).toBe(-1);
  });

  it("sends the part around the passage when a story is too long", () => {
    const long = `${"a".repeat(MAX_SCENE_STORY_CHARS)}HERE${"b".repeat(MAX_SCENE_STORY_CHARS)}`;
    const window = storyForScene(long, long.indexOf("HERE"));
    expect(window).toContain("HERE");
    expect(window.length).toBeLessThanOrEqual(MAX_SCENE_STORY_CHARS + 10);
    expect(window.startsWith("[…]")).toBe(true);
    expect(storyForScene("short", 0)).toBe("short");
  });

  it("accepts a reply without looks, because the book is never worth a retry", () => {
    expect(validateScene({ imagePrompt: " A street. " })).toEqual({ imagePrompt: "A street." });
    expect(validateScene({ imagePrompt: "A street.", looks: ["x"] })).toEqual({ imagePrompt: "A street." });
    expect(validateScene({ imagePrompt: "A street.", looks: { Haman: HAMAN } })?.looks).toEqual({ Haman: HAMAN });
    expect(validateScene({ looks: {} })).toBeUndefined();
  });
});
