import { describe, it, expect } from "vitest";
import {
  storyWithoutAppendices,
  MEETING_NOTE_HEADING,
  DIGGING_DEEPER_HEADING,
  FURTHER_LEARNING_HEADING,
} from "../server/lib/storyAppendices";

/**
 * What the server adds to a story, and why it must come back off again.
 *
 * These blocks live in the same column as the prose, so everything downstream
 * reads them -- fine for a reader, wrong for the universe summariser, whose
 * output becomes canon for the next story in the world. Left in, "Ada is
 * invented; nobody like them was there" is summarised as an event and a
 * disclaimer becomes a fact about the universe.
 */
describe("storyWithoutAppendices", () => {
  const story = "She opened the door.\n\nIt was raining.";

  it("leaves a story that has none alone", () => {
    expect(storyWithoutAppendices(story)).toBe(story);
    expect(storyWithoutAppendices("")).toBe("");
  });

  it("cuts each block the server appends", () => {
    for (const heading of [
      MEETING_NOTE_HEADING,
      DIGGING_DEEPER_HEADING,
      FURTHER_LEARNING_HEADING,
    ]) {
      expect(storyWithoutAppendices(`${story}\n\n${heading} anything at all`)).toBe(story);
    }
  });

  it("cuts from the FIRST one, not the last", () => {
    // The reason it cuts at a position rather than matching block by block: a
    // story with all three must not keep the two that follow the earliest.
    const full =
      `${story}\n\n${MEETING_NOTE_HEADING} Caleb really lived.` +
      `\n\n${DIGGING_DEEPER_HEADING}\n\n*You asked: why?*\n\nBecause.` +
      `\n\n${FURTHER_LEARNING_HEADING}\n\n- **BibleGateway.com** - Read Bible stories.`;
    const out = storyWithoutAppendices(full);
    expect(out).toBe(story);
    expect(out).not.toContain("really lived");
    expect(out).not.toContain("You asked");
    expect(out).not.toContain("BibleGateway");
  });

  it("cuts whatever the order happens to be", () => {
    // Nothing guarantees the append order stays what it is today.
    const odd = `${story}\n\n${FURTHER_LEARNING_HEADING}\n\n- x\n\n${MEETING_NOTE_HEADING} y`;
    expect(storyWithoutAppendices(odd)).toBe(story);
  });

  it("does not cut a story that merely says the words", () => {
    // The headings carry their asterisks, so prose about further learning is
    // not mistaken for the block.
    const prose = "She thought about further learning, and about this story.";
    expect(storyWithoutAppendices(prose)).toBe(prose);
  });
});
