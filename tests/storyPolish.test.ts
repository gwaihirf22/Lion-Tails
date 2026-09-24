import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import {
  buildPolishPrompt,
  acceptPolish,
  unwrapPolished,
  polishTokenBudget,
  polishContextNeeded,
  markedDraft,
  partMarker,
  POLISH_LENGTH_FLOOR,
  POLISH_LENGTH_CEILING,
  countWords,
} from "../server/lib/storyPolish";
import { buildStoryBrief } from "../server/lib/storyBrief";
import type { StoryRequest, Character } from "../shared/schema";

/**
 * THE POLISH PASS, from both ends.
 *
 * The prompt is captured whole, the `buildChapterPrompt` precedent: what the
 * editor model reads is the assembled prompt, not the brief inside it, so the
 * assembled prompt is the fixture. And the acceptance check is driven from
 * both sides of every boundary, because each check exists for a loss that
 * happens silently -- a rewrite that drops 1944 reads fine.
 *
 * Regenerate the golden with
 *
 *     UPDATE_GOLDEN=1 npm test -- storyPolish
 *
 * and READ THE DIFF.
 */

const mia: Character = {
  id: "c1", name: "Mia", kind: "girl", age: 8, hair: "brown", eyes: "blue",
  personality: "curious", hobby: "drawing", favoriteColor: "purple",
  createdAt: "2026-01-01",
};
const nell: Character = {
  id: "c4", name: "Nell", kind: "girl", age: 6, hair: "red",
  personality: "shy", createdAt: "2026-01-01",
};

const base = {
  storyLength: "extended", storyType: "regular", useAnimal: false, theme: "kindness",
} as unknown as StoryRequest;

const questBrief = (extra: Partial<StoryRequest> = {}) =>
  buildStoryBrief(
    {
      ...base,
      characterIds: ["c1", "c4"],
      characterRole: "travels",
      biblicalEvent: "noah",
      ...extra,
    } as StoryRequest,
    [mia, nell],
  );

const plainBrief = () =>
  buildStoryBrief({ ...base, characterIds: ["c1"] } as StoryRequest, [mia]);

const DRAFT =
  "Mia found the door on a Tuesday in 1944.\n\n" +
  "Nell was behind her. Nell was always behind her.\n\n" +
  "They went through together, and the rain began.";

const GOLDEN = path.resolve(__dirname, "fixtures/polish-prompt-golden.json");

const promptCases: Record<string, () => string> = {
  "quest in four parts, left open": () =>
    buildPolishPrompt({
      brief: questBrief({ cliffhanger: true } as Partial<StoryRequest>),
      parts: DRAFT.split("\n\n"),
      storyType: "regular",
      moralOutcome: "learning",
    }),
  "ordinary story, one pass, consequences": () =>
    buildPolishPrompt({
      brief: plainBrief(),
      parts: [DRAFT],
      storyType: "regular",
      moralOutcome: "consequences",
    }),
  "a poem": () =>
    buildPolishPrompt({
      brief: plainBrief(),
      parts: ["Mia found a door,\nNell was there too,\nThe rain came down,\nAnd through they flew."],
      storyType: "poem",
      moralOutcome: "positive",
    }),
};

if (process.env.UPDATE_GOLDEN) {
  const next: Record<string, string> = {};
  for (const label of Object.keys(promptCases)) next[label] = promptCases[label]();
  writeFileSync(GOLDEN, JSON.stringify(next, null, 2) + "\n");
}

describe("the whole prompt the editor reads", () => {
  const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as Record<string, string>;
  for (const label of Object.keys(promptCases)) {
    it(label, () => {
      expect(promptCases[label]()).toBe(golden[label]);
    });
  }

  it("tells the editor how the draft was made, in the plural only when it was", () => {
    expect(promptCases["quest in four parts, left open"]()).toContain("3 separate passes");
    expect(promptCases["ordinary story, one pass, consequences"]()).toContain("in one pass");
  });

  it("shows the editor where every seam is, and only when there are seams", () => {
    const p = promptCases["quest in four parts, left open"]();
    expect(p).toContain(`${partMarker(2)}\n\nNell was behind her.`);
    expect(p).toContain(`${partMarker(3)}\n\nThey went through`);
    expect(p).not.toContain(partMarker(1));
    expect(promptCases["ordinary story, one pass, consequences"]()).not.toContain("[PART");
    expect(markedDraft(["a", "b"])).toBe("a\n\n[PART 2 BEGINS]\n\nb");
  });

  it("carries the ending's meaning", () => {
    expect(promptCases["quest in four parts, left open"]()).toContain("left open on purpose");
    expect(promptCases["ordinary story, one pass, consequences"]()).toContain("does not end happily");
    expect(promptCases["a poem"]()).toContain("Do not change what happens at the end");
  });

  it("states the length band from the draft, and the form", () => {
    const p = promptCases["ordinary story, one pass, consequences"]();
    const words = countWords(DRAFT);
    expect(p).toContain(`between ${Math.round(words * POLISH_LENGTH_FLOOR)} and ${Math.round(words * POLISH_LENGTH_CEILING)} words`);
    expect(p).toContain("Prose, in paragraphs");
    expect(promptCases["a poem"]()).toContain("This is a POEM");
  });

  it("carries the chapter rules -- the cast and what must hold", () => {
    const p = promptCases["quest in four parts, left open"]();
    expect(p).toContain("The story is about Mia");
    expect(p).toContain("Nell");
  });
});

const accept = (polished: string, over: Partial<Parameters<typeof acceptPolish>[0]> = {}) =>
  acceptPolish({
    draft: DRAFT,
    polished,
    storyType: "regular",
    targetWordCount: 20,
    castNames: ["Mia", "Nell"],
    minimumLengthRatio: 0.6,
    ...over,
  });

describe("what may replace the draft", () => {
  const good =
    "Mia found the door on a Tuesday in 1944, with Nell close behind her, as Nell always was.\n\n" +
    "They went through together, and the rain began.";

  it("accepts a rewrite that keeps the names, the year and the length", () => {
    const v = accept(good);
    expect(v.accepted).toBe(true);
    if (v.accepted) expect(v.content).toBe(good);
  });

  it("rejects an empty reply", () => {
    expect(accept("")).toEqual({ accepted: false, reason: "empty reply" });
    expect(accept("```\n```").accepted).toBe(false);
  });

  it("rejects a lost name, but only one the draft used", () => {
    expect(accept(good.replace(/Nell/g, "her sister")).accepted).toBe(false);
    expect(accept(good.replace(/Nell/g, "her sister")).accepted === false &&
      (accept(good.replace(/Nell/g, "her sister")) as any).reason).toContain("Nell");
    // Bolt is in the cast and not in the draft: not lost by staying absent.
    expect(accept(good, { castNames: ["Mia", "Nell", "Bolt"] }).accepted).toBe(true);
  });

  it("rejects a lost date", () => {
    const v = accept(good.replace("1944", "that year"));
    expect(v.accepted).toBe(false);
    if (!v.accepted) expect(v.reason).toContain("1944");
  });

  it("rejects a heading, a bold heading line, or a chapter marker the draft did not have", () => {
    expect(accept("## The Door\n\n" + good).accepted).toBe(false);
    expect(accept("**The Door**\n\n" + good).accepted).toBe(false);
    expect(accept("Chapter 1\n\n" + good).accepted).toBe(false);
    expect(accept("Part Two\n\n" + good).accepted).toBe(false);
  });

  it("rejects a marker or delimiter left in the story", () => {
    expect(accept(good + "\n\n[PART 2 BEGINS]\n\nMore.").accepted).toBe(false);
    expect(accept("<<< THE STORY >>>\n" + good + "\n<<< END OF THE STORY >>>").accepted).toBe(true);
  });

  it("rejects an appendix heading, which would suppress the server's own", () => {
    expect(accept(good + "\n\n**About this story:** all of it is made up.").accepted).toBe(false);
    expect(accept(good + "\n\n**For Further Learning:**").accepted).toBe(false);
  });

  it("holds the length inside the band, and above the story's own floor", () => {
    const draftWords = countWords(DRAFT);
    const shortest = "Mia found the door in 1944 with Nell. " + "Rain fell. ".repeat(4); // ~16 words
    expect(accept(shortest).accepted).toBe(false);
    const longest = good + " And on and on the story went, past every mark, " + "word ".repeat(20);
    expect(accept(longest).accepted).toBe(false);
    // Inside the band but below the target's floor: still rejected.
    const v = accept(good, { targetWordCount: 200 });
    expect(v.accepted).toBe(false);
    if (!v.accepted) expect(v.reason).toContain("too short");
    expect(Math.round(draftWords * POLISH_LENGTH_FLOOR)).toBe(21);
  });

  it("keeps a poem in verse", () => {
    const poem = "Mia found a door,\nNell was there too,\nThe rain came down,\nAnd through they flew.";
    const prose = "Mia found a door, and Nell was there too. The rain came down, and through they flew.";
    // A poem's target is in words too; sixteen here, so the floor is the draft's.
    expect(accept(poem, { draft: poem, storyType: "poem", targetWordCount: 16 }).accepted).toBe(true);
    const v = accept(prose, { draft: poem, storyType: "poem", targetWordCount: 16 });
    expect(v.accepted).toBe(false);
    if (!v.accepted) expect(v.reason).toContain("verse");
  });
});

describe("unwrapping what the model wrapped it in", () => {
  it("takes off the delimiters and an echoed fence, but not a scene break inside", () => {
    expect(unwrapPolished("<<< THE STORY >>>\nA story.\n\nMore.\n<<< END OF THE STORY >>>", DRAFT)).toBe("A story.\n\nMore.");
    // The first real run: the tail of a `---` fence, indented as the prompt was.
    expect(unwrapPolished("A story.\n\nMore of it.\n      --", DRAFT)).toBe("A story.\n\nMore of it.");
    expect(unwrapPolished("---\nA story.\n\n---\n\nMore.\n---", DRAFT)).toBe("A story.\n\n---\n\nMore.");
  });

  it("takes off code fences", () => {
    expect(unwrapPolished("```\nA story.\n\nMore of it.\n```", DRAFT)).toBe("A story.\n\nMore of it.");
    expect(unwrapPolished("```markdown\nA story.\n```", DRAFT)).toBe("A story.");
  });

  it("drops a one-line preface that is not a line of the draft", () => {
    expect(unwrapPolished("Here is the revised story:\n\nA story.\n\nMore.", DRAFT)).toBe("A story.\n\nMore.");
    expect(unwrapPolished("Revised story:\n\nA story.", DRAFT)).toBe("A story.");
  });

  it("keeps a short opening line the draft itself has", () => {
    const draft = "Here is what happened:\n\nA story.";
    expect(unwrapPolished(draft, draft)).toBe(draft);
    // And a plain short opening sentence is a sentence, not a preface.
    expect(unwrapPolished("It rained.\n\nA story.", DRAFT)).toBe("It rained.\n\nA story.");
  });
});

describe("the budget", () => {
  it("grows with the draft and never starts below the chapter budget", () => {
    expect(polishTokenBudget(0)).toBe(2048);
    expect(polishTokenBudget(1000)).toBeGreaterThan(polishTokenBudget(500));
    // A 5,000-word story needs the story out again, plus a fifth, plus reasoning.
    expect(polishTokenBudget(5000)).toBeGreaterThanOrEqual(5000 * 1.3 * POLISH_LENGTH_CEILING);
  });

  it("counts the prompt as well as the output for the context check", () => {
    expect(polishContextNeeded(5000)).toBeGreaterThan(polishTokenBudget(5000) + 5000);
    // The local window is 16384: a 5,000-word story does not fit through.
    expect(polishContextNeeded(5000)).toBeGreaterThan(16384);
    // A 1,500-word one does.
    expect(polishContextNeeded(1500)).toBeLessThan(16384);
  });
});
