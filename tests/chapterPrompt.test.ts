import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import {
  buildChapterPrompt,
  chapterPositionRule,
  questShape,
} from "../server/lib/openai-implementation";
import {
  buildStoryBrief,
  deserialiseBrief,
  renderBrief,
  CLIFFHANGER_PREMISE,
} from "../server/lib/storyBrief";
import type { StoryRequest, Character } from "../shared/schema";

/**
 * WHAT THE CHAPTER WRITER IS ACTUALLY SENT.
 *
 * A four-character quest came back with an ending that did not end: the
 * traveller stood under the tree thinking, two of the four children were
 * deleted in one line ("Ellie and Lucy were no longer beside her"), Barnabas
 * never appeared, and the story simply stopped. Blake reported it as the
 * reader cutting the story off. Nothing was cut off -- all 4,366 words were
 * there, `truncated_calls` was 0 -- the prompt had told the last chapter, in
 * as many words, not to finish the story:
 *
 *     "The story has 4 chapters of similar length, so do not try to finish
 *      the whole story in this one."
 *
 * That sentence was sent unconditionally, on every chapter, and the prompt
 * never said which chapter it was on at all.
 *
 * `brief-golden.json` could not have caught it. It captures `renderBrief`, and
 * this sentence lives in the WRAPPER around the brief -- so the wrapper is now
 * pure, exported, and captured here for the first, a middle and the last part.
 */

const mia: Character = {
  id: "c1", name: "Mia", kind: "girl", age: 8, hair: "brown", eyes: "blue",
  personality: "curious", hobby: "drawing", favoriteColor: "purple",
  createdAt: "2026-01-01",
};
const ember: Character = {
  id: "c2", name: "Ember", kind: "dragon", category: "creature", sex: "she",
  age: 300, hair: "emerald", eyes: "gold", personality: "patient",
  createdAt: "2026-01-01",
};
const bolt: Character = {
  id: "c3", name: "Bolt", kind: "robot", category: "machine", sex: "it",
  hair: "copper", hobby: "inventing", createdAt: "2026-01-01",
};
const nell: Character = {
  id: "c4", name: "Nell", kind: "girl", age: 6, hair: "red",
  personality: "shy", createdAt: "2026-01-01",
};

const base = {
  storyLength: "extended", storyType: "regular", useAnimal: false, theme: "kindness",
} as unknown as StoryRequest;

/** A quest: four children, the lantern, and a real account to arrive in. */
const questBrief = (extra: Partial<StoryRequest> = {}) =>
  buildStoryBrief(
    {
      ...base,
      characterIds: ["c1", "c2", "c3", "c4"],
      characterRole: "travels",
      biblicalEvent: "noah",
      ...extra,
    } as StoryRequest,
    [mia, ember, bolt, nell],
  );

/** The same cast, no lantern: an ordinary story, which has no way home. */
const plainBrief = () =>
  buildStoryBrief(
    { ...base, characterIds: ["c1", "c2", "c3", "c4"] } as StoryRequest,
    [mia, ember, bolt, nell],
  );

const DO_NOT_FINISH = "do not try to finish";

describe("the last part is told that it is the last", () => {
  const four = { totalChapters: 4, wordCountPerChapter: 875, quest: true, cliffhanger: false };

  it("says so, and does NOT tell it to leave the ending alone", () => {
    const last = chapterPositionRule({ ...four, chapterNumber: 4 });
    expect(last).toContain("This is part 4 of 4, the LAST one");
    expect(last).toContain("This is where the story ENDS");
    expect(last).not.toContain(DO_NOT_FINISH);
  });

  it("still tells a middle part not to finish -- that line is right for it", () => {
    const middle = chapterPositionRule({ ...four, chapterNumber: 2 });
    expect(middle).toContain("This is part 2 of 4.");
    expect(middle).toContain(DO_NOT_FINISH);
    expect(middle).not.toContain("LAST");
    expect(middle).not.toContain("HOW THIS ENDS");
  });

  it("gives the last part a wider ceiling, because it carries the ending too", () => {
    expect(chapterPositionRule({ ...four, chapterNumber: 2 })).toContain("no more than 1006");
    expect(chapterPositionRule({ ...four, chapterNumber: 4 })).toContain("no more than 1181");
    // The floor does not move: the problem was never a chapter being too short.
    for (const n of [2, 4]) {
      expect(chapterPositionRule({ ...four, chapterNumber: n })).toContain("no fewer than 744");
    }
  });

  it("counts a one-part story as its own last part", () => {
    const only = chapterPositionRule({ ...four, totalChapters: 1, chapterNumber: 1 });
    expect(only).toContain("the LAST one");
    expect(only).not.toContain(DO_NOT_FINISH);
  });
});

describe("coming home, and when not to ask for it", () => {
  const last = { totalChapters: 4, chapterNumber: 4, wordCountPerChapter: 875 };

  it("a quest ends at home, with Barnabas and without a stated lesson", () => {
    const rule = chapterPositionRule({ ...last, quest: true, cliffhanger: false });
    expect(rule).toContain("HOW THIS ENDS");
    expect(rule).toContain("Barnabas is there and asks what they found");
    expect(rule).toContain("Everyone who set out is still there");
    expect(rule).toMatch(/one action, not a speech/);
  });

  it("says nothing about coming home when the reader asked to leave it open", () => {
    const rule = chapterPositionRule({ ...last, quest: true, cliffhanger: true });
    expect(rule).not.toContain("HOW THIS ENDS");
    expect(rule).not.toContain("Barnabas");
    // It must still be told it is the last part -- a cliffhanger finishes its
    // SCENE, and a chapter that thinks another one is coming does not.
    expect(rule).toContain("the LAST one");
    expect(rule).toContain("finish this SCENE properly");
    // And must NOT be told to end the story, which is the one thing its own
    // premise forbids.
    expect(rule).not.toContain("This is where the story ENDS");
    expect(rule).not.toContain(DO_NOT_FINISH);
  });

  it("says nothing about lanterns in a story that has none", () => {
    expect(chapterPositionRule({ ...last, quest: false, cliffhanger: false })).not.toContain(
      "Barnabas",
    );
  });
});

describe("the outline is given room at BOTH ends of a quest", () => {
  it("budgets the last part for the way home, naming it by number", () => {
    const shape = questShape(questBrief(), 4);
    expect(shape).toContain("END part 1 at the crossing over");
    expect(shape).toContain("Part 4 is the way back and the close");
    expect(shape).toContain("finished in part 3 or");
    expect(shape).toContain("Everyone who set out comes back");
  });

  it("does not ask a cliffhanger to come home", () => {
    const shape = questShape(questBrief({ cliffhanger: true } as Partial<StoryRequest>), 4);
    expect(shape).toContain("END part 1 at the crossing over");
    expect(shape).not.toContain("the way back and the close");
  });

  it("is nothing at all for a story with no lantern in it", () => {
    expect(questShape(plainBrief(), 4)).toBe("");
  });
});

describe("cliffhanger is one fact on the brief, not two derivations", () => {
  it("is set from the request", () => {
    expect(questBrief().cliffhanger).toBe(false);
    expect(questBrief({ cliffhanger: true } as Partial<StoryRequest>).cliffhanger).toBe(true);
  });

  /**
   * `story_jobs.brief` is frozen text: a brief written five minutes before
   * this deploys still has to render afterwards, and it has no `cliffhanger`
   * field. Defaulting to false would hand the last chapter of an in-flight
   * "leave it open" story an order to bring everyone home -- against its own
   * premise. So it is recovered from the premise, which is where the fact was
   * already written down.
   */
  it("is recovered from the premise of a brief frozen before the field existed", () => {
    const frozen = JSON.stringify({
      cast: [{ name: "Mia", identity: "Mia, aged 8, a girl.", colour: "" }],
      soloRetelling: false,
      ensemble: false,
      premise: ["Theme: kindness.", CLIFFHANGER_PREMISE],
      craft: [],
    });
    expect(deserialiseBrief(frozen).cliffhanger).toBe(true);
  });

  it("is false for a frozen brief that did not ask for one", () => {
    const frozen = JSON.stringify({
      cast: [{ name: "Mia", identity: "Mia, aged 8, a girl.", colour: "" }],
      soloRetelling: false,
      ensemble: false,
      premise: ["Theme: kindness."],
      craft: [],
    });
    expect(deserialiseBrief(frozen).cliffhanger).toBe(false);
    // And an unparseable one, which is legacy plain text with no structure.
    expect(deserialiseBrief("write a story about a dog").cliffhanger).toBe(false);
  });
});

describe("four or more of them, and nobody is deleted", () => {
  const rendered = renderBrief(questBrief(), "outline");

  it("keeps the crowd cap, and says what it is not", () => {
    expect(rendered).toContain("Keep no more than three of them in any one scene");
    expect(rendered).toContain("whoever sets out together is still together at the end");
    expect(rendered).toContain("NEVER writes a character out on the page");
  });

  it("tells the outline to write what happens, not the casting", () => {
    expect(rendered).toContain("Write what happens, never the casting");
  });

  it("says none of that to a cast small enough that it cannot arise", () => {
    const two = renderBrief(
      buildStoryBrief({ ...base, characterIds: ["c1", "c2"] } as StoryRequest, [mia, ember]),
      "outline",
    );
    expect(two).not.toContain("Keep no more than three");
    expect(two).not.toContain("Write what happens, never the casting");
  });
});

/**
 * The assembled prompt, captured. Regenerate with:
 *
 *     UPDATE_GOLDEN=1 npm test -- chapterPrompt
 *
 * and READ THE DIFF -- it is what the model is handed for every chapter of
 * every long story.
 */
const GOLDEN = path.resolve(__dirname, "fixtures/chapter-prompt-golden.json");

const promptCases: Record<string, () => string> = {
  "quest, first part": () =>
    buildChapterPrompt({
      brief: questBrief(),
      chapterOutline: "Part 1 -- Mia is waiting for a bus and is tired of waiting.",
      storySoFar: "",
      wordCountPerChapter: 875,
      totalChapters: 4,
      chapterNumber: 1,
    }),
  "quest, middle part": () =>
    buildChapterPrompt({
      brief: questBrief(),
      chapterOutline: "Part 2 -- the rain begins and the ark is not finished.",
      storySoFar: "They stepped through the doorway.",
      wordCountPerChapter: 875,
      totalChapters: 4,
      chapterNumber: 2,
    }),
  "quest, last part": () =>
    buildChapterPrompt({
      brief: questBrief(),
      chapterOutline: "Part 4 -- the water goes down and the dove does not come back.",
      storySoFar: "They stepped through the doorway.",
      wordCountPerChapter: 875,
      totalChapters: 4,
      chapterNumber: 4,
    }),
  "quest, last part, left open": () =>
    buildChapterPrompt({
      brief: questBrief({ cliffhanger: true } as Partial<StoryRequest>),
      chapterOutline: "Part 4 -- the water goes down and the dove does not come back.",
      storySoFar: "They stepped through the doorway.",
      wordCountPerChapter: 875,
      totalChapters: 4,
      chapterNumber: 4,
    }),
  "ordinary story, last part": () =>
    buildChapterPrompt({
      brief: plainBrief(),
      chapterOutline: "Part 3 -- Bolt admits what he broke.",
      storySoFar: "The workshop was quiet.",
      wordCountPerChapter: 500,
      totalChapters: 3,
      chapterNumber: 3,
    }),
};

if (process.env.UPDATE_GOLDEN) {
  const next: Record<string, string> = {};
  for (const label of Object.keys(promptCases)) next[label] = promptCases[label]();
  writeFileSync(GOLDEN, JSON.stringify(next, null, 2) + "\n");
}

describe("the whole prompt a chapter is written from", () => {
  const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as Record<string, string>;
  for (const label of Object.keys(promptCases)) {
    it(label, () => {
      expect(promptCases[label]()).toBe(golden[label]);
    });
  }
});
