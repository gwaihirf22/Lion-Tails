import { describe, it, expect } from "vitest";
import { buildAvatarPrompt } from "../server/lib/avatar";
import type { Character } from "@shared/schema";

/**
 * The avatar prompt is a durable artefact, not a throwaway string.
 *
 * It is stored on the character and reused verbatim to keep a story
 * illustration recognisably the same person as the portrait. So these assert
 * what goes IN it and, just as importantly, what stays out: everything the
 * sheet knows that has nothing to do with what someone looks like.
 */
const mk = (o: Partial<Character>): Character =>
  ({ id: "c1", name: "Mia", createdAt: "2026-01-01", ...o }) as Character;

describe("the portrait prompt", () => {
  it("names them and says what they are", () => {
    const p = buildAvatarPrompt(mk({ kind: "girl", age: 8 }));
    expect(p).toContain("Mia");
    expect(p).toContain("8-year-old girl");
  });

  it("uses the covering noun for what they are, not 'hair' for everything", () => {
    expect(buildAvatarPrompt(mk({ kind: "dragon", category: "mythical", hair: "crimson" })))
      .toContain("crimson scales");
    expect(buildAvatarPrompt(mk({ kind: "owl", category: "bird", hair: "brown" })))
      .toContain("brown feathers");
    // A character saved before categories existed still reads correctly.
    expect(buildAvatarPrompt(mk({ gender: "girl", hair: "brown" })))
      .toContain("brown hair");
  });

  it("lets canonicalLook win, because it is the field written to say this", () => {
    const p = buildAvatarPrompt(
      mk({ kind: "dragon", category: "mythical", hair: "crimson", eyes: "gold",
           canonicalLook: "Copper scales with a torn left wing." }),
    );
    expect(p).toContain("Copper scales with a torn left wing.");
    // The sheet's colours are the FALLBACK for a character nobody described.
    // Emitting both would describe two different dragons in one prompt.
    expect(p).not.toContain("crimson");
    expect(p).not.toContain("gold eyes");
  });

  it("keeps everything that is not appearance out of it", () => {
    const p = buildAvatarPrompt(
      mk({ kind: "girl", personality: "curious", hobby: "reading",
           notes: "She hums when she is thinking.",
           mustBeTrue: "Mia uses a wheelchair.",
           favoriteColor: "purple", favoriteAnimal: "rabbit" }),
    );
    for (const leak of ["curious", "reading", "hums", "wheelchair", "purple", "rabbit"]) {
      expect(p).not.toContain(leak);
    }
  });

  it("does not put an implausible age in front of an image model", () => {
    // "aged 300" reads as an instruction to draw a ruin. A dragon is still a
    // dragon; it just does not get a number.
    const old = buildAvatarPrompt(mk({ kind: "dragon", category: "mythical", age: 300 }));
    expect(old).not.toContain("300");
    expect(old).toContain("dragon");
  });

  it("still produces a usable prompt for a character with only a name", () => {
    // Every field is optional. The one thing that is always present is the
    // name, and a portrait request with nothing else must still be a sentence.
    const p = buildAvatarPrompt(mk({}));
    expect(p).toContain("Mia");
    expect(p.length).toBeGreaterThan(40);
    expect(p).not.toContain("undefined");
    expect(p).not.toContain("  ");
  });

  it("asks for no text, because image models write nonsense words", () => {
    expect(buildAvatarPrompt(mk({ kind: "boy" }))).toMatch(/no text/i);
  });

  it("is stable: the same character gives the same string", () => {
    // The whole consistency mechanism rests on this. If the prompt varied
    // between calls, storing it would buy nothing.
    const c = mk({ kind: "girl", age: 8, hair: "brown", eyes: "blue" });
    expect(buildAvatarPrompt(c)).toBe(buildAvatarPrompt(c));
  });
});
