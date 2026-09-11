import { describe, it, expect } from "vitest";
import {
  parseStoryContent,
  blockText,
  normaliseQuote,
  anchorBlock,
} from "../client/src/lib/storyContent";
import { buildPassageScenePrompt } from "../server/lib/passageScene";
import { composeIllustrationPrompt } from "../server/lib/illustration";
import { COVER_SHOWS_PEOPLE } from "../server/lib/openai-implementation";
import { questTitleRule, DEVICE, SHOP, KEEPER } from "../server/data/lionTails";
import {
  MAX_STORY_IMAGES,
  MAX_AVATARS,
  storyPictureSchema,
  storyPassageSchema,
  storyImagesOf,
  MAX_PASSAGE_CHARS,
  storyIsUnseen,
  savedStorySchema,
} from "@shared/schema";
import {
  MEETING_NOTE_HEADING,
  DIGGING_DEEPER_HEADING,
  FURTHER_LEARNING_HEADING,
  splitAppendices,
} from "@shared/storyAppendices";

/**
 * A picture inside a story has to survive the story changing.
 *
 * The reader's blocks have no identity -- the array is rebuilt from scratch
 * whenever the text changes, and a parent edit rewrites the whole body through
 * a textarea with no concurrency control anywhere. So the anchor is a quote
 * first and an index second, and these hold that: a picture follows its text,
 * and when its text is gone it lands nowhere rather than above a paragraph it
 * has nothing to do with.
 */
const STORY = [
  "Sam went down to the river before the sun was up.",
  "The water was cold and the stones were sharp.",
  "He waited.",
  "A heron came, and stood as still as he did.",
  "He waited.",
  "Then the light came over the hill and the whole river turned gold.",
].join("\n\n");

const blocks = (content: string) => parseStoryContent(content).blocks;

describe("a block as plain text", () => {
  it("drops the emphasis and keeps the words", () => {
    const [b] = blocks("The **cold** water and the *sharp* stones.");
    expect(blockText(b)).toBe("The cold water and the sharp stones.");
  });

  it("joins a paragraph's soft-wrapped lines with a space, as the reader does", () => {
    // A newline inside a prose block is the model wrapping, not a line break
    // anybody meant -- and the quote is taken off the SCREEN, where they are
    // one line. Join them differently and nothing ever matches.
    const [b] = blocks("The water was cold\nand the stones were sharp.");
    expect(blockText(b)).toBe("The water was cold and the stones were sharp.");
  });

  it("has nothing to say about a scene break", () => {
    const [b] = blocks("* * *");
    expect(blockText(b)).toBe("");
  });
});

describe("finding a picture's place", () => {
  const doc = blocks(STORY);

  it("puts it where its words are", () => {
    expect(anchorBlock(doc, { quote: "A heron came", blockIndex: 3 })).toBe(3);
  });

  it("follows its words when the story moves under it", () => {
    // What a parent edit does: two new paragraphs at the top, every index
    // after them wrong by two. The picture still belongs to the heron.
    const edited = blocks("A new opening.\n\nAnd another.\n\n" + STORY);
    expect(anchorBlock(edited, { quote: "A heron came", blockIndex: 3 })).toBe(5);
  });

  it("takes the copy nearest where it was when a sentence repeats", () => {
    // "He waited." is blocks 2 and 4. A story for children repeats itself on
    // purpose, and the picture belongs beside the one it was drawn for.
    expect(anchorBlock(doc, { quote: "He waited.", blockIndex: 4 })).toBe(4);
    expect(anchorBlock(doc, { quote: "He waited.", blockIndex: 2 })).toBe(2);
  });

  it("falls back to where it was when the words were rewritten", () => {
    expect(anchorBlock(doc, { quote: "a sentence nobody wrote", blockIndex: 1 })).toBe(1);
  });

  it("lands nowhere rather than somewhere wrong", () => {
    // Words gone AND the index past the end: the picture stays in the gallery
    // and is simply not in the text. A lost anchor is never a lost picture.
    expect(anchorBlock(doc, { quote: "gone entirely", blockIndex: 99 })).toBe(-1);
  });

  it("ignores whitespace the way a selection does", () => {
    expect(anchorBlock(doc, { quote: "  A heron   came,\n and stood ", blockIndex: 3 })).toBe(3);
    expect(normaliseQuote(" a  b \n c ")).toBe("a b c");
  });

  it("never anchors into what the server appended", () => {
    const content =
      STORY +
      `\n\n${MEETING_NOTE_HEADING} Sam is invented.` +
      `\n\n${DIGGING_DEEPER_HEADING}\n\nSome answer.` +
      `\n\n${FURTHER_LEARNING_HEADING}\n\n- **BibleGateway.com** - Read Bible stories.`;
    const all = blocks(content);
    const bodyBlocks = blocks(splitAppendices(content).body).length;

    // The disclaimer is a real block with real words in it, and a picture of
    // "Sam is invented" is not a thing anyone wants.
    expect(anchorBlock(all, { quote: "Sam is invented", blockIndex: bodyBlocks }, bodyBlocks)).toBe(-1);
    expect(anchorBlock(all, { quote: "A heron came", blockIndex: 3 }, bodyBlocks)).toBe(3);
  });
});

describe("the scene prompt for a passage", () => {
  const passage = "The heron stood as still as he did, one foot in the cold water.";

  it("says THIS moment, which is the whole point of the feature", () => {
    // Without it the model writes a prompt for the story -- that is what it is
    // asked for everywhere else -- and every picture in the book is the same.
    const p = buildPassageScenePrompt({ title: "The River", passage });
    expect(p).toMatch(/THIS MOMENT/);
    expect(p).toMatch(/not a summary of the story/i);
  });

  it("carries the passage and the title", () => {
    const p = buildPassageScenePrompt({ title: "The River", passage });
    expect(p).toContain(passage);
    expect(p).toContain("The River");
  });

  it("carries the brief verbatim when there is one, and omits the line when not", () => {
    // The brief arrives already rendered by renderBrief(brief, "image"). This
    // module never learns what a brief is, so it cannot grow a second opinion
    // about what the cast looks like.
    const brief = "Sam, aged 7, a boy -- a scene from the life of William Tyndale.";
    expect(buildPassageScenePrompt({ title: "T", passage, brief })).toContain(brief);
    expect(buildPassageScenePrompt({ title: "T", passage })).not.toMatch(/must match the character/);
    expect(buildPassageScenePrompt({ title: "T", passage, brief: "   " })).not.toMatch(
      /must match the character/,
    );
  });

  it("asks for JSON, because the answer is read by a machine", () => {
    expect(buildPassageScenePrompt({ title: "T", passage })).toMatch(/"imagePrompt"/);
  });

  it("spends no more prompt than a page of story", () => {
    const long = "word ".repeat(2000);
    const p = buildPassageScenePrompt({ title: "T", passage: long });
    expect(p.length).toBeLessThan(MAX_PASSAGE_CHARS + 800);
  });
});

describe("what a story may keep", () => {
  it("keeps twelve pictures, not the five a character keeps", () => {
    // Two caps, two jobs: one face against a picture every few paragraphs.
    expect(MAX_STORY_IMAGES).toBe(12);
    expect(MAX_AVATARS).toBe(5);
  });

  it("accepts a picture with an anchor and one without", () => {
    const base = { id: "p1", url: "/a.png", prompt: "a scene", createdAt: "2026-01-01" };
    expect(storyPictureSchema.safeParse(base).success).toBe(true);
    expect(
      storyPictureSchema.safeParse({ ...base, anchor: { quote: "He waited.", blockIndex: 2 } })
        .success,
    ).toBe(true);
    expect(
      storyPictureSchema.safeParse({ ...base, anchor: { quote: "x", blockIndex: -1 } }).success,
    ).toBe(false);
  });

  it("still folds a story illustrated before any of this into a list of one", () => {
    const list = storyImagesOf({
      createdAt: "2026-01-01",
      story: { imageUrl: "/a.png", imagePrompt: "a scene" },
    });
    expect(list).toHaveLength(1);
    expect(list[0].anchor).toBeUndefined();
  });
});

describe("the passage a reader may ask for", () => {
  it("refuses an empty one and a chapter-length one", () => {
    expect(storyPassageSchema.safeParse({ text: "  ", blockIndex: 0 }).success).toBe(false);
    expect(
      storyPassageSchema.safeParse({ text: "x".repeat(2001), blockIndex: 0 }).success,
    ).toBe(false);
    // Refused, never truncated: nobody gets a picture of half what they chose.
    expect(storyPassageSchema.safeParse({ text: "x".repeat(2000), blockIndex: 0 }).success).toBe(
      true,
    );
  });

  it("refuses a position that is not one", () => {
    expect(storyPassageSchema.safeParse({ text: "ok", blockIndex: -1 }).success).toBe(false);
    expect(storyPassageSchema.safeParse({ text: "ok", blockIndex: 1.5 }).success).toBe(false);
  });
});

describe("who and where come from different places", () => {
  /**
   * The brief names the account, and the model believes it over the passage.
   *
   * The first real generation of a passage set in Barnabas's shop came back
   * as "a 16th-century English storeroom in the world of William Tyndale",
   * because renderBrief's image projection is "<the lead> -- a scene from
   * <the account>" and the setting rides along with the cast. The picture was
   * fine; the next one would not have been.
   */
  it("says to take only the people from the brief", () => {
    const p = buildPassageScenePrompt({
      title: "The Lantern and the Word",
      passage: "Sam searched the crowded shop.",
      brief: "Sam, aged 7, a boy -- a scene from the life of William Tyndale.",
    });
    expect(p).toMatch(/only WHO the people are/);
    expect(p).toMatch(/from the passage above and from nothing else/);
  });

  it("says nothing about it when there is no brief to mislead anyone", () => {
    const p = buildPassageScenePrompt({ title: "T", passage: "Sam searched." });
    expect(p).not.toMatch(/only WHO the people are/);
  });

  it("spends no more prompt on the passage than the route would accept", () => {
    // One number. A slice here that disagreed with the schema's max would be
    // a silent half-picture on one path and a 400 on the other.
    expect(MAX_PASSAGE_CHARS).toBe(2000);
  });
});

describe("the look of the book", () => {
  /**
   * The people a story invented have nothing else.
   *
   * illustrationCast attaches a portrait for anyone with a character sheet.
   * A hero of faith has none -- hero.imageUrl is on the schema and empty for
   * all eighty of them -- and neither does a shopkeeper the model made up, so
   * without this they are drawn fresh, and differently, on every page.
   */
  const cast = [
    { name: "Mia", look: "Mia, a girl.", reference: { data: Buffer.from("x"), filename: "portrait.png", type: "image/png" } },
  ];

  it("numbers the story's picture after the cast, so the cast keeps its numbers", () => {
    const p = composeIllustrationPrompt("A scene", cast, true);
    expect(p).toContain("Reference image 1 is Mia, a girl.");
    expect(p).toContain("Reference image 2 is an earlier picture from this same story");
  });

  it("calls it a picture, not a person", () => {
    // Described as one more face, the model places it in the scene.
    expect(composeIllustrationPrompt("A scene", cast, true)).toContain("not a person");
  });

  it("asks for the people and nothing else from it", () => {
    const p = composeIllustrationPrompt("A scene", cast, true);
    expect(p).toMatch(/must look the same here as they do there/);
    expect(p).toMatch(/Take nothing else from it/);
  });

  it("still forbids handing its faces to somebody new", () => {
    // The Barnabas-as-Tyndale rule has to survive the earlier picture being
    // attached -- and now has to be phrased against the references rather
    // than a list of names, because that picture carries people nobody named.
    const p = composeIllustrationPrompt("A scene", cast, true);
    expect(p).toContain("appears in none of the reference images is a different person");
  });

  it("says nothing at all when no picture is attached", () => {
    // The end-of-story picture and the redraw send no story look, and their
    // prompt must not change because this shipped.
    const p = composeIllustrationPrompt("A scene", cast, false);
    expect(p).toBe(composeIllustrationPrompt("A scene", cast));
    expect(p).not.toMatch(/earlier picture/);
  });
});

describe("the cover's instruction", () => {
  it("asks for recognisable people", () => {
    expect(COVER_SHOWS_PEOPLE).toMatch(/recognisable/i);
  });

  it("does not ask for a school photograph", () => {
    // The wording IS the risk: these are the phrases that produce a posed
    // cover, which is a worse picture for the sake of a better reference.
    for (const posed of ["facing the viewer", "clearly visible", "portrait", "posed", "camera"]) {
      expect(COVER_SHOWS_PEOPLE.toLowerCase()).not.toContain(posed);
    }
  });
});

describe("what a quest may be called", () => {
  /**
   * Four quests in a row came back "The Lantern and the ...", across four
   * different framing approaches. The frames were not the problem -- their
   * openings genuinely differ -- the title was asked for with no guidance at
   * all while the lantern was the most repeated noun in the story.
   */
  const rule = questTitleRule();

  it("rules out the three props that are in every quest", () => {
    // The test the rule embodies: a title that would fit any of these stories
    // is not a title for one of them.
    expect(rule).toContain(DEVICE.name);
    expect(rule).toContain(SHOP.name);
    expect(rule).toContain(KEEPER.shortName);
  });

  it("bans the bare word, not just the phrase", () => {
    // "The Lantern and the Word" does not contain "the lantern".
    expect(rule).toContain('"lantern"');
  });

  it("asks for a title that suggests rather than explains", () => {
    expect(rule).toMatch(/suggest rather than summarise/i);
  });

  it("is composed from the canon, not typed again", () => {
    // Rename the shop and this must follow, or it bans a word nobody uses.
    expect(rule).not.toContain("Barnabas & Co.".replace("Barnabas", "Barnabus"));
    expect(rule.includes(SHOP.name)).toBe(true);
  });
});

describe("a story nobody has read yet", () => {
  /**
   * THREE STATES, and they are what let this ship without a migration or a
   * backfill: undefined is a story written before any of this existed and is
   * treated as seen, null is written-and-not-opened, a date is opened.
   *
   * The alternative -- unseen meaning "no seenAt" -- would have counted
   * somebody's entire library on the day it shipped, which is a notification
   * that tells you nothing and trains you to ignore the next one.
   */
  it("counts a story that was written and not opened", () => {
    expect(storyIsUnseen({ seenAt: null })).toBe(true);
  });

  it("does not count one written before this existed", () => {
    expect(storyIsUnseen({})).toBe(false);
    expect(storyIsUnseen(undefined)).toBe(false);
    expect(storyIsUnseen(null)).toBe(false);
  });

  it("does not count one already opened", () => {
    expect(storyIsUnseen({ seenAt: "2026-09-11T11:17:00.251Z" })).toBe(false);
  });

  it("accepts all three on the schema", () => {
    // The field itself, not a whole row: what matters is that null is a legal
    // value and not merely an absent one, because the difference between them
    // is the entire mechanism.
    for (const seenAt of [undefined, null, "2026-09-11T11:17:00.251Z"]) {
      expect(savedStorySchema.shape.seenAt.safeParse(seenAt).success).toBe(true);
    }
    expect(savedStorySchema.shape.seenAt.safeParse(123).success).toBe(false);
  });
});
