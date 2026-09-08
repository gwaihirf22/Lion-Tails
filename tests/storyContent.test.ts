import { describe, it, expect } from "vitest";
import {
  parseInline,
  parseStoryContent,
  storyToPrintHtml,
} from "../client/src/lib/storyContent";

/**
 * The parser that replaced BookPage.tsx.
 *
 * Every case here is a bug that actually shipped, not a hypothetical. The old
 * path split on whitespace and re-joined with spaces, which annihilated every
 * newline in the document; for prose that produced one wall of text, and for a
 * poem it destroyed the poem outright.
 */

const countLines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean).length;

describe("parseInline", () => {
  it("reads **strong** and *em*", () => {
    expect(parseInline("a **b** c *d*")).toEqual([
      { t: "text", v: "a " },
      { t: "strong", v: "b" },
      { t: "text", v: " c " },
      { t: "em", v: "d" },
    ]);
  });

  it("leaves an unclosed asterisk as literal text rather than eating the rest", () => {
    // The regex approach this replaced would either swallow the remainder of
    // the paragraph or backtrack catastrophically on a long one.
    const out = parseInline("the *lion roared and the whole valley heard it");
    expect(out.map((p) => p.v).join("")).toBe("the *lion roared and the whole valley heard it");
    expect(out.every((p) => p.t === "text")).toBe(true);
  });

  it("does not treat an apostrophe or a mid-word asterisk as emphasis", () => {
    const out = parseInline("Noah's ark 2*3");
    expect(out.map((p) => p.v).join("")).toBe("Noah's ark 2*3");
  });

  it("is linear on a long paragraph with one unclosed marker", () => {
    const long = "word ".repeat(3000) + "*dangling";
    const started = Date.now();
    const out = parseInline(long);
    expect(out.map((p) => p.v).join("")).toBe(long);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe("parseStoryContent — verse", () => {
  const poem = [
    "The lion woke at break of day,",
    "And shook the dew from off his mane,",
    "He sang a song and went his way,",
    "And never once looked back again.",
    "",
    "The little cub was left behind,",
    "With grass still wet beneath his feet,",
    "He asked the sky to please be kind,",
    "And found the answer very sweet.",
  ].join("\n");

  it("preserves every line of a poem", () => {
    const doc = parseStoryContent(poem, { verse: true });
    const emitted = doc.blocks
      .filter((b): b is Extract<typeof b, { kind: "verse" }> => b.kind === "verse")
      .reduce((n, b) => n + b.lines.length, 0);
    // The regression test for the original bug: lines in must equal lines out.
    expect(emitted).toBe(countLines(poem));
  });

  it("detects verse from the text alone, with no storyType hint", () => {
    // Old rows have no storyType, so the heuristic is the safety net for them.
    const doc = parseStoryContent(poem);
    expect(doc.blocks.some((b) => b.kind === "verse")).toBe(true);
  });

  it("does not mistake prose for verse", () => {
    const prose =
      "Once upon a time there was a lion who lived at the very top of a tall green hill, " +
      "and every morning he looked out across the valley below him.\n\n" +
      "He had a friend named Bramble, and Bramble was a hedgehog who was afraid of almost " +
      "everything, especially the dark and the sound of the river after rain.";
    const doc = parseStoryContent(prose);
    expect(doc.blocks.every((b) => b.kind !== "verse")).toBe(true);
  });
});

describe("parseStoryContent — prose", () => {
  it("emits one block per blank-line-separated paragraph", () => {
    const body = "First para.\n\nSecond para.\n\n\nThird para.";
    const doc = parseStoryContent(body);
    expect(doc.blocks.filter((b) => b.kind === "paragraph")).toHaveLength(3);
  });

  it("reads a short wholly-bold line as a heading", () => {
    const doc = parseStoryContent("**Chapter One**\n\nAnd so it began.");
    expect(doc.blocks[0]).toMatchObject({ kind: "heading" });
  });

  it("reads a bulleted block as a list", () => {
    const doc = parseStoryContent("Things:\n\n- one\n- two\n- three");
    const list = doc.blocks.find((b) => b.kind === "list");
    expect(list).toBeDefined();
    expect(list && "items" in list ? list.items : []).toHaveLength(3);
  });
});

describe("parseStoryContent — For Further Learning", () => {
  const literal =
    "The end.\n\n**For Further Learning:**\n\n" +
    "- **BibleGateway.com** - Read Bible stories.\n" +
    "- **GotQuestions.org** - Find answers about faith.";

  it("lifts the appended block out of the reading flow", () => {
    const doc = parseStoryContent(literal);
    expect(doc.furtherLearning).toHaveLength(2);
    // And it must not also be left in the story body.
    const bodyText = JSON.stringify(doc.blocks);
    expect(bodyText).not.toContain("BibleGateway");
  });

  it("keeps a resource line that names no domain", () => {
    // THE LIVE DATA LOSS this replaced: processResourceLinks filtered to lines
    // containing ".com" or ".org" and silently dropped every other one, so
    // "Ask a parent about..." vanished from the page entirely.
    const doc = parseStoryContent(
      "The end.\n\n**For Further Learning:**\n\n" +
        "- **BibleGateway.com** - Read Bible stories.\n" +
        "- Ask a grown-up to read Genesis 6 with you.",
    );
    expect(doc.furtherLearning).toHaveLength(2);
    expect(doc.furtherLearning?.[1].label).toContain("Genesis 6");
    expect(doc.furtherLearning?.[1].url).toBeUndefined();
  });

  it("returns null when the story has no appended block", () => {
    expect(parseStoryContent("Just a story.").furtherLearning).toBeNull();
  });
});

describe("storyToPrintHtml", () => {
  it("escapes text rather than interpolating it", () => {
    // Replaces two `story.content.replace(/\n/g, "<br>")` sites that wrote raw
    // model output into a document and then printed it.
    const doc = parseStoryContent('<script>alert("x")</script> & <b>bold</b>');
    const html = storyToPrintHtml(doc, "Title");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
  });

  it("escapes the title too", () => {
    const html = storyToPrintHtml(parseStoryContent("body"), '<img src=x onerror="alert(1)">');
    // The substring "onerror=" still appears, harmlessly: what makes it inert
    // is that no unescaped "<" survives, so it is text and never an attribute.
    expect(html).toContain("&lt;img src=x onerror=&quot;");
    expect(html).not.toContain("<img");
  });

  it("escapes a bible verse passed alongside", () => {
    const html = storyToPrintHtml(parseStoryContent("body"), "Title", {
      text: "<script>bad</script>",
      reference: "<b>Genesis 1:1</b>",
    });
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<b>Genesis");
  });
});
