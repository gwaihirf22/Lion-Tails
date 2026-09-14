import { describe, expect, it } from "vitest";
import {
  bibleGatewayUrl,
  furtherReadingFor,
  GENERAL_READING,
  MAX_SPECIFIC_READING,
  normaliseReference,
  wikipediaUrl,
} from "../shared/furtherReading";
import { getBiblicalEvent } from "../server/data/biblicalEvents";
import { heroesOfFaithData as ALL_HEROES } from "../server/data/heroes";
import { QUEST_PROLOGUE } from "../server/data/questPrologue";
import { parseStoryContent, storyToPrintHtml } from "../client/src/lib/storyContent";
import { AI_NOTE } from "../shared/aiNote";

/**
 * Blake: sources "should then be returned and put in this section for each
 * story". Built from the app's own checked data, never from what a model
 * remembers -- so every assertion here is about what the data says.
 */
describe("a story's further reading", () => {
  it("links the exact passage, in the translation the app's verses came from", () => {
    expect(normaliseReference("Genesis 6:9 - 9:17")).toBe("Genesis 6:9-9:17");
    expect(bibleGatewayUrl("Genesis 6:9 - 9:17")).toBe(
      "https://www.biblegateway.com/passage/?search=Genesis%206%3A9-9%3A17&version=WEB",
    );
    const noah = getBiblicalEvent("noah")!;
    const list = furtherReadingFor({ event: noah });
    expect(list[0].url).toBe(bibleGatewayUrl(noah.passage));
    expect(list.some((r) => r.url === bibleGatewayUrl(noah.keyVerse!.reference))).toBe(true);
  });

  it("gives a hero their Wikipedia article, their references and their books, with no invented links", () => {
    const hero = ALL_HEROES.find((h) => (h.sources ?? []).length > 0 && h.wikipedia)!;
    const list = furtherReadingFor({ hero });
    expect(list).toContainEqual({ label: `${hero.name} on Wikipedia`, url: wikipediaUrl(hero.wikipedia!) });
    const book = hero.sources![0];
    const bookEntry = list.find((r) => r.label === book.title || r.label.startsWith(`${book.title},`) || r.label.startsWith(`${book.title} —`));
    expect(bookEntry).toBeTruthy();
    // The data carries no URL for a book, so the list gives none.
    if (!book.url) expect(bookEntry!.url).toBeUndefined();
  });

  it("never repeats itself, keeps to its cap, and always ends with the two general links", () => {
    const hero = ALL_HEROES.find((h) => (h.keyEvents ?? []).filter((k) => k.reference).length >= 3)!;
    const list = furtherReadingFor({ hero, event: getBiblicalEvent("paul"), biblePassage: "Acts 9" });
    const keys = list.map((r) => r.url ?? r.label);
    expect(new Set(keys).size).toBe(keys.length);
    expect(list.length).toBeLessThanOrEqual(MAX_SPECIFIC_READING + GENERAL_READING.length);
    expect(list.slice(-2)).toEqual([...GENERAL_READING]);
  });

  it("gives a story with no account the two general links it has always had", () => {
    expect(furtherReadingFor({})).toEqual([...GENERAL_READING]);
    expect(furtherReadingFor({ biblePassage: "none" })).toEqual([...GENERAL_READING]);
  });

  it("gives the prologue its psalm", () => {
    const list = furtherReadingFor({ biblePassage: QUEST_PROLOGUE.request.biblePassage });
    expect(list[0]).toEqual({ label: "Psalm 78:4 (Bible Gateway)", url: bibleGatewayUrl("Psalm 78:4") });
  });

  it("every hero's Wikipedia title makes a well-formed article address", () => {
    for (const h of ALL_HEROES.filter((x) => x.wikipedia)) {
      expect(wikipediaUrl(h.wikipedia!)).toMatch(/^https:\/\/en\.wikipedia\.org\/wiki\/[^\s]+$/);
    }
  });
});

describe("the AI note on paper", () => {
  const doc = parseStoryContent("Once there was a story.");
  it("prints the note and every source's address, and no note on a story a person wrote", () => {
    const html = storyToPrintHtml(doc, "T", undefined, {
      aiNote: true,
      furtherReading: [{ label: "Psalm 78:4 (Bible Gateway)", url: bibleGatewayUrl("Psalm 78:4") }],
    });
    expect(html).toContain(AI_NOTE.slice(0, 40));
    expect(html).toContain("biblegateway.com/passage/?search=Psalm%2078%3A4");
    expect(storyToPrintHtml(doc, "T", undefined, { aiNote: false })).not.toContain(AI_NOTE.slice(0, 40));
  });
});
