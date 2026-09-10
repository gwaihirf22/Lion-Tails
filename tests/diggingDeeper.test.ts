import { describe, it, expect } from "vitest";
import {
  buildDiggingDeeperPrompt,
  renderDiggingDeeper,
  type DiggingSource,
} from "../server/lib/diggingDeeper";
import { getBiblicalEvent } from "../server/data/biblicalEvents";
import { DIGGING_DEEPER_HEADING, storyWithoutAppendices } from "../shared/storyAppendices";

const noah = getBiblicalEvent("noah")!;
const account: DiggingSource = {
  kind: "account",
  material: {
    kind: "biblical-event",
    label: noah.label,
    passage: noah.passage,
    account: noah.anchor,
    keyVerse: { ...noah.keyVerse, translation: "World English Bible" },
    cautions: noah.cautions,
  },
};

/**
 * The prompt that answers what a reader asked.
 *
 * Pure and asserted here rather than judged from an output, because the whole
 * risk of this feature is a confident invented answer -- and the only thing a
 * test can check is that the instruction not to invent one is present, in
 * front of the material it applies to.
 */
describe("buildDiggingDeeperPrompt", () => {
  const questions = ["Did Noah collect the animals?", "What was Noah's wife called?"];

  it("puts the questions in verbatim, in order", () => {
    const { user } = buildDiggingDeeperPrompt(account, questions);
    for (const q of questions) expect(user).toContain(q);
    expect(user.indexOf(questions[0])).toBeLessThan(user.indexOf(questions[1]));
  });

  it("supplies the account rather than the label", () => {
    // The same argument that put the anchor in the story brief: give the model
    // the material, do not ask it to remember the text.
    const { user } = buildDiggingDeeperPrompt(account, questions);
    expect(user).toContain(noah.anchor);
    expect(user).toContain(noah.passage);
  });

  it("carries the cautions, which are already half an answer", () => {
    // "GOD gathers the animals to the ark. Noah does not go out collecting
    // them." is written as a correction, which is exactly the shape a good
    // answer to the first question takes.
    const { user } = buildDiggingDeeperPrompt(account, questions);
    for (const c of noah.cautions) expect(user).toContain(c);
  });

  it("says plainly that 'the text does not say' is an answer", () => {
    // The single most important line. The honest answer to the second question
    // is that Scripture does not name her -- and a model would always rather
    // invent than disappoint.
    const { system } = buildDiggingDeeperPrompt(account, questions);
    expect(system).toContain("does not answer");
    expect(system).toContain("say so plainly");
    expect(system).toContain("never invent a name, a date, a number");
  });

  it("quotes the verse exactly or not at all", () => {
    const { user } = buildDiggingDeeperPrompt(account, questions);
    expect(user).toContain(noah.keyVerse.text);
    expect(user).toContain("exactly as given here or not at all");
  });

  it("carries no story-craft scaffolding", () => {
    // This call writes no prose about anybody. Reading level, moral outcome,
    // cast and colour all belong to the story and would only invite it to
    // narrate an answer.
    const { system, user } = buildDiggingDeeperPrompt(account, questions);
    const both = `${system}\n${user}`;
    for (const leak of ["Reading level", "Written for a reader", "WHO THIS IS ABOUT", "moral"]) {
      expect(both).not.toContain(leak);
    }
  });

  it("tells a passage-only story it has the reference and nothing else", () => {
    // There is no anchor for a reference somebody typed, and pretending
    // otherwise is how an answer gets grounded in nothing.
    const { user } = buildDiggingDeeperPrompt(
      { kind: "passage", reference: "Psalm 23" },
      ["Who wrote this?"],
    );
    expect(user).toContain("Psalm 23");
    expect(user).toContain("nothing else");
    expect(user).toContain("Who wrote this?");
  });
});

describe("renderDiggingDeeper", () => {
  const answers = [
    { question: "Did Noah collect the animals?", answer: "No. God brought them to him." },
    { question: "What was Noah's wife called?", answer: "Genesis does not name her." },
  ];

  it("echoes the question, because a saved story outlives the memory of it", () => {
    const out = renderDiggingDeeper(answers);
    expect(out).toContain("*You asked: Did Noah collect the animals?*");
    expect(out).toContain("No. God brought them to him.");
  });

  it("emits nothing at all when there is nothing to say", () => {
    expect(renderDiggingDeeper([])).toBe("");
  });

  it("is not shaped like anything the reader parses as something else", () => {
    /**
     * The reader's markdown parser turns a block whose every line starts with
     * "- " into a list -- which would flatten a question and its answer into
     * peers -- and a lone short bold line into a heading. The section heading
     * is deliberately the second of those; nothing else may be either.
     */
    const out = renderDiggingDeeper(answers);
    const lines = out.split("\n").filter((l) => l.trim());
    expect(lines.filter((l) => l.trim().startsWith("- "))).toHaveLength(0);
    expect(lines.filter((l) => l.trim().startsWith("**"))).toEqual([DIGGING_DEEPER_HEADING]);
  });

  it("is stripped back out before a story becomes universe canon", () => {
    // Answers about the real world must not be summarised as events in an
    // invented one.
    const story = "She opened the door.";
    expect(storyWithoutAppendices(story + renderDiggingDeeper(answers))).toBe(story);
  });
});
