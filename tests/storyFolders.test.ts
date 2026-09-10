import { describe, it, expect } from "vitest";
import { STORY_FOLDERS, storyFolder } from "../client/src/lib/storyFolders";
import type { SavedStory } from "../shared/schema";

/**
 * The folders on My Stories. The predicates are what the panel renders AND
 * what the counts say, so a folder that lies here lies twice on the page.
 */
describe("story folders", () => {
  const story = (o: Partial<SavedStory> & Record<string, unknown> = {}) =>
    ({ id: "x", isFavorite: false, request: {}, ...o }) as unknown as SavedStory;

  const filterOf = (value: string) => storyFolder(value).filter!;

  it("All has everything, including a story in a universe", () => {
    expect(filterOf("all")(story({ universeId: "u1" }))).toBe(true);
    expect(filterOf("all")(story())).toBe(true);
  });

  it("Timekeeper has the prologue and every quest, and nothing else", () => {
    expect(filterOf("timekeeper")(story({ builtIn: true }))).toBe(true);
    expect(filterOf("timekeeper")(story({ request: { characterRole: "travels" } }))).toBe(true);
    expect(filterOf("timekeeper")(story({ request: { characterRole: "alongside" } }))).toBe(false);
    expect(filterOf("timekeeper")(story())).toBe(false);
  });

  it("Favorites excludes what is not favourited", () => {
    expect(filterOf("favorites")(story({ isFavorite: true }))).toBe(true);
    expect(filterOf("favorites")(story({ isFavorite: false }))).toBe(false);
  });

  it("Universes lists universes, not stories, and an unknown value falls back to All", () => {
    expect(storyFolder("universes").filter).toBeUndefined();
    expect(storyFolder("temporary").value).toBe("all");
  });

  it("names every tint in full, as a literal class", () => {
    for (const f of STORY_FOLDERS) {
      expect(f.tint).toMatch(/^bg-tab-[a-z-]+$/);
      expect(f.edge).toMatch(/^border-t-tab-[a-z-]+$/);
      expect(f.edge.replace("border-t-", "")).toBe(f.tint.replace("bg-", ""));
    }
  });
});
