import { describe, it, expect } from "vitest";
import { savedStorySchema } from "../shared/schema";

/**
 * The saved-story contract, around the outline added for continuations.
 *
 * The property that matters is that `outline` is OPTIONAL. Every story written
 * before it existed is parsed by this schema on the way out of the database, so
 * making it required would not be a missing feature — it would be every
 * existing story failing to load.
 */

const base = {
  id: "s1",
  story: {
    title: "The Brass Lantern",
    content: "Once upon a time.",
    moralOutcome: "positive" as const,
    applicationQuestions: ["a", "b", "c", "d", "e"],
  },
  // The nested storyRequestSchema carries a .refine(): a character, or a name
  // and a gender. A fixture that skips it fails for a reason that has nothing
  // to do with what is being tested.
  request: { childName: "Mia", gender: "girl" as const, storyLength: "medium" as const },
  createdAt: new Date().toISOString(),
  isFavorite: false,
};

describe("savedStorySchema.outline", () => {
  it("parses a story that has no outline", () => {
    // Poems and very-short stories are generated in one call and never have
    // one; so does every story written before the field existed.
    const parsed = savedStorySchema.parse(base);
    expect(parsed.outline).toBeUndefined();
  });

  it("round-trips a chapter plan", () => {
    const parsed = savedStorySchema.parse({ ...base, outline: ["Ch 1", "Ch 2", "Ch 3"] });
    expect(parsed.outline).toEqual(["Ch 1", "Ch 2", "Ch 3"]);
  });

  it("rejects an outline that is not a list of strings", () => {
    // story_jobs.outline is jsonb and a SUMMARY job stores story IDs in the
    // same column. Anything that is not string[] means the wrong fact was
    // copied, and it should fail here rather than render as a chapter plan.
    expect(savedStorySchema.safeParse({ ...base, outline: "Ch 1" }).success).toBe(false);
    expect(savedStorySchema.safeParse({ ...base, outline: [{ id: 1 }] }).success).toBe(false);
  });

  it("survives a round trip through JSON, which is how it is stored", () => {
    const withOutline = { ...base, outline: ["Ch 1", "Ch 2"] };
    const parsed = savedStorySchema.parse(JSON.parse(JSON.stringify(withOutline)));
    expect(parsed.outline).toHaveLength(2);
  });
});
