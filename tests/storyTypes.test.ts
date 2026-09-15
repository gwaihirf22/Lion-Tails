import { describe, it, expect } from "vitest";
import { characterRoleOf, storyRequestSchema } from "../shared/schema";
import { STORY_TYPE_OPTIONS, storyTypeFitsRole, type StoryType } from "../shared/storyTypes";
import { AI_NOTE, MAKE_IT_YOURS } from "../shared/aiNote";

/**
 * Poems and moral stories are the free modes: only a regular story is set
 * somewhere real. The form disables the pair; the route refuses it.
 */
describe("storyTypeFitsRole", () => {
  const roles = ["absent", "travels", "alongside"] as const;

  it("lets a regular story take any role", () => {
    for (const role of roles) expect(storyTypeFitsRole("regular", role)).toBe(true);
  });

  it("keeps poems and moral stories out of quests and real settings", () => {
    for (const type of ["poem", "moral"] as const) {
      expect(storyTypeFitsRole(type, "absent")).toBe(true);
      expect(storyTypeFitsRole(type, "travels")).toBe(false);
      expect(storyTypeFitsRole(type, "alongside")).toBe(false);
    }
  });

  it("treats a missing type as regular", () => {
    expect(storyTypeFitsRole(undefined, "travels")).toBe(true);
  });

  it("judges legacy requests through characterRoleOf", () => {
    expect(storyTypeFitsRole("poem", characterRoleOf({ useTimeTravel: true }))).toBe(false);
    expect(storyTypeFitsRole("moral", characterRoleOf({ characterRole: "meets" }))).toBe(false);
    expect(storyTypeFitsRole("poem", characterRoleOf({}))).toBe(true);
  });
});

describe("STORY_TYPE_OPTIONS", () => {
  it("has words for exactly the values the schema accepts", () => {
    const accepted = (["regular", "poem", "moral", "limerick"] as string[]).filter(
      (v) => storyRequestSchema.safeParse({ childName: "Sam", gender: "boy", storyType: v }).success,
    );
    expect(Object.keys(STORY_TYPE_OPTIONS).sort()).toEqual(accepted.sort());
    for (const key of Object.keys(STORY_TYPE_OPTIONS) as StoryType[]) {
      expect(STORY_TYPE_OPTIONS[key].label.length).toBeGreaterThan(0);
      expect(STORY_TYPE_OPTIONS[key].description.length).toBeGreaterThan(0);
    }
  });
});

describe("the invitation to edit", () => {
  it("is separate from the AI note, which stays about accuracy", () => {
    expect(MAKE_IT_YOURS).toMatch(/first draft/);
    expect(AI_NOTE).not.toMatch(/first draft/);
  });
});
