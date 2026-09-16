import { describe, expect, it } from "vitest";
import {
  MAX_PICTURE_NOTE_CHARS,
  renderPictureNoteSection,
  withPictureNote,
} from "@shared/pictureNote";
import { pictureNoteSchema, priceLabel } from "@shared/schema";

/**
 * What the reader asks for in a picture.
 *
 * The one risky property is WHERE it goes: isPresentDayScene reads the opening
 * of a scene prompt to decide whether a quest traveller keeps their own
 * clothes, so a note in front of "In the present day," costs a child their
 * coat. And a picture asked for with no note must be the picture that would
 * have been drawn before any of this existed.
 */
const SCENE = "In the present day, in a small shop, a girl in a yellow raincoat looks up.";

describe("the reader's note on a picture", () => {
  it("leaves the prompt alone when there is no note", () => {
    expect(withPictureNote(SCENE)).toBe(SCENE);
    expect(withPictureNote(SCENE, "")).toBe(SCENE);
    expect(withPictureNote(SCENE, "   \n ")).toBe(SCENE);
    expect(renderPictureNoteSection()).toBe("");
    expect(renderPictureNoteSection("  ")).toBe("");
  });

  it("appends, never prepends -- the opening of a scene is read by the server", () => {
    const withNote = withPictureNote(SCENE, "show it raining hard");
    expect(withNote.startsWith("In the present day,")).toBe(true);
    expect(withNote).toContain("show it raining hard");
    expect(withNote.indexOf("raining")).toBeGreaterThan(withNote.indexOf("raincoat"));
  });

  it("says it is the reader's, and that it must be in the picture", () => {
    const withNote = withPictureNote(SCENE, "a red umbrella");
    expect(withNote).toMatch(/reader asked for this/i);
    expect(withNote).toMatch(/must be in the picture/i);
    expect(withNote).toContain('"a red umbrella."');
  });

  it("keeps the reader's own sentence ending when they wrote one", () => {
    expect(withPictureNote(SCENE, "Make it night!")).toContain('"Make it night!"');
    expect(withPictureNote(SCENE, "Is it raining?")).toContain('"Is it raining?"');
  });

  it("cannot break out of its own quotes", () => {
    // A prompt, not markup -- but one pair of quotes has to keep meaning one
    // thing, and the note is somebody's typing.
    const withNote = withPictureNote(SCENE, 'she says "hello" to him');
    expect(withNote).not.toContain('"hello"');
    expect(withNote).toContain("she says 'hello' to him");
  });

  it("is a section for the scene writer, with the same words behind it", () => {
    const section = renderPictureNoteSection("show it raining hard");
    expect(section).toContain("=== WHAT THE READER ASKED FOR ===");
    expect(section).toContain('"show it raining hard."');
    // It may add to the moment; it may not move it somewhere else.
    expect(section).toMatch(/do not let it change who is here/i);
  });

  it("is refused over the limit rather than quietly cut in half", () => {
    const long = "x".repeat(MAX_PICTURE_NOTE_CHARS + 1);
    expect(pictureNoteSchema.safeParse(long).success).toBe(false);
    expect(pictureNoteSchema.safeParse("x".repeat(MAX_PICTURE_NOTE_CHARS)).success).toBe(true);
    // Blank is a note nobody wrote, and the route accepts it as one.
    expect(pictureNoteSchema.safeParse("").success).toBe(true);
    expect(pictureNoteSchema.parse("  a red umbrella  ")).toBe("a red umbrella");
  });
});

describe("what a picture costs, in words", () => {
  it("reads as cents under a dollar and as dollars above one", () => {
    expect(priceLabel(14)).toBe("14¢");
    expect(priceLabel(99)).toBe("99¢");
    expect(priceLabel(100)).toBe("$1.00");
    expect(priceLabel(1234)).toBe("$12.34");
  });
});
