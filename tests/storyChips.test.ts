import { describe, it, expect } from "vitest";
import { storyChips } from "../client/src/lib/storyChips";
import { ROLE_OPTIONS } from "../client/src/lib/characterRole";
import { EDITED_BY_PARENT } from "../shared/editLog";
import type { SavedStory } from "../shared/schema";

const sources = {
  heroes: [{ id: "corrie-ten-boom", name: "Corrie ten Boom" }],
  events: [{ id: "noah", label: "Noah's Ark" }],
  characters: [{ id: "c1", name: "Mia" }],
};

const story = (request: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  ({ id: "s", request, story: { title: "t", content: "" }, ...extra }) as unknown as SavedStory;

describe("storyChips", () => {
  it("says nothing for a story with nothing to say", () => {
    expect(storyChips(story({}), sources)).toEqual([]);
  });

  it("names the source by the server's precedence, and resolves a hero by heroId first", () => {
    expect(storyChips(story({ biblicalEvent: "noah", heroOfFaith: "corrie-ten-boom" }), sources)[0]).toBe("Noah's Ark");
    expect(storyChips(story({ heroId: "corrie-ten-boom", heroOfFaith: "Somebody Else" }), sources)[0]).toBe("Corrie ten Boom");
    expect(storyChips(story({ biblePassage: " Psalm 23 " }), sources)).toEqual(["Psalm 23"]);
  });

  it("names the cast and leaves out an id that no longer resolves", () => {
    expect(storyChips(story({ characterIds: ["c1", "gone"] }), sources)).toEqual(["Mia"]);
  });

  it("uses the form's own words for the way in", () => {
    expect(storyChips(story({ characterRole: "travels" }), sources)).toEqual([ROLE_OPTIONS.travels.label]);
    expect(storyChips(story({ useTimeTravel: true }), sources)).toEqual([ROLE_OPTIONS.travels.label]);
    expect(storyChips(story({ characterRole: "absent" }), sources)).toEqual([]);
  });

  it("shows the length, and the edit chip only when something was edited", () => {
    expect(storyChips(story({ storyLength: "long" }), sources)).toEqual(["Long"]);
    expect(storyChips(story({}, { editLog: [] }), sources)).toEqual([]);
    expect(
      storyChips(story({}, { editLog: [{ at: "2026-09-10T00:00:00Z", by: "parent", changed: ["title"] }] }), sources),
    ).toEqual([EDITED_BY_PARENT]);
  });
});
