import { describe, it, expect } from "vitest";
import { QUEST_PROLOGUE, QUEST_PROLOGUE_ID } from "../server/data/questPrologue";
import {
  builtInStoryById,
  isBuiltInStoryId,
  withBuiltInStories,
} from "../server/lib/builtInStories";
import { parseStoryContent } from "../client/src/lib/storyContent";
import { storyWithoutAppendices } from "../shared/storyAppendices";
import { savedStorySchema, storyResponseSchema, type SavedStory } from "../shared/schema";
import { KEEPER, SHOP } from "../server/data/lionTails";

/**
 * The first story everyone has.
 *
 * It is fixed text, so the only way it can be wrong is in how it is shaped --
 * and the reader's parser has opinions about shape that a long file can
 * violate with one stray newline.
 */
describe("the prologue", () => {
  const { content } = QUEST_PROLOGUE.story;
  const words = content.split(/\s+/).filter(Boolean).length;

  it("is prose, not verse, to the parser", () => {
    // One sentence to a line. Joined with single newlines the parser calls
    // that a poem and preserves every line break; joined with blank lines it
    // is paragraphs. This is the check that fails if someone reflows it.
    const doc = parseStoryContent(content);
    expect(doc.blocks.some((b) => b.kind === "verse")).toBe(false);
    expect(doc.blocks.filter((b) => b.kind === "paragraph").length).toBeGreaterThan(100);
  });

  it("renders the sign as a heading, from the one place the sign is defined", () => {
    const doc = parseStoryContent(content);
    const texts = doc.blocks.map((b) =>
      b.kind === "heading" ? b.content.map((i) => i.v).join("") : "",
    );
    expect(texts).toContain(SHOP.sign);
  });

  it("names the keeper through KEEPER, and carries no server appendix", () => {
    expect(content).toContain(KEEPER.shortName);
    // Nothing for storyWithoutAppendices to cut: the prologue must never be
    // mistaken for a story with a disclaimer or a Digging deeper section.
    expect(storyWithoutAppendices(content)).toBe(content);
  });

  it("is a real SavedStory, not a look-alike", () => {
    expect(storyResponseSchema.parse(QUEST_PROLOGUE.story)).toBeTruthy();
    expect(savedStorySchema.parse(QUEST_PROLOGUE).builtIn).toBe(true);
    expect(QUEST_PROLOGUE.story.applicationQuestions).toHaveLength(5);
    expect(QUEST_PROLOGUE.request.biblePassage).toBe("Psalm 78:4");
  });

  it("is the length of the text that was approved", () => {
    expect(words).toBeGreaterThan(1000);
    expect(words).toBeLessThan(2000);
  });
});

describe("built-in stories", () => {
  const mine = {
    ...QUEST_PROLOGUE,
    id: "11111111-2222-3333-4444-555555555555",
    builtIn: undefined,
  } as unknown as SavedStory;

  it("come first in a library, and only once", () => {
    const list = withBuiltInStories([mine]);
    expect(list[0].id).toBe(QUEST_PROLOGUE_ID);
    expect(list.filter((s) => s.id === QUEST_PROLOGUE_ID)).toHaveLength(1);
    expect(list).toHaveLength(2);
  });

  it("are known by id, and a uuid is never one", () => {
    expect(isBuiltInStoryId(QUEST_PROLOGUE_ID)).toBe(true);
    expect(builtInStoryById(QUEST_PROLOGUE_ID)?.builtIn).toBe(true);
    expect(isBuiltInStoryId(mine.id)).toBe(false);
    expect(builtInStoryById(mine.id)).toBeUndefined();
  });
});
