import { describe, expect, it } from "vitest";
import { GUIDE_KEYWORDS, GUIDE_NODES } from "../shared/guide";
import { normaliseQuery, searchGuide } from "../shared/guideSearch";

/**
 * Search in the guide. The whole job is "take me to the item", so what these
 * hold is that the right item is FIRST -- a wrong first hit reads as the guide
 * not knowing its own contents.
 */
const ids = (query: string, limit?: number) => searchGuide(query, limit).map((h) => h.node.id);

describe("finding your way into the guide", () => {
  it("answers nothing at all until something is typed", () => {
    expect(searchGuide("")).toEqual([]);
    expect(searchGuide("   ")).toEqual([]);
    expect(searchGuide("\n\t")).toEqual([]);
  });

  it("puts the items it is the TITLE of above the ones that merely mention it", () => {
    const hits = searchGuide("picture", 8);
    const named = hits.filter((h) => normaliseQuery(h.node.title).includes("picture"));
    const rest = hits.filter((h) => !normaliseQuery(h.node.title).includes("picture"));
    expect(named.map((h) => h.node.id)).toContain("make-a-picture");
    // Five items have it in the title; none of them may sit under an item that
    // only mentions pictures somewhere.
    expect(Math.min(...named.map((h) => h.score))).toBeGreaterThan(
      Math.max(0, ...rest.map((h) => h.score)),
    );
    const scores = hits.map((h) => h.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));

    // And where the title IS the query, that item leads.
    expect(ids("credits")[0]).toBe("credits");
    expect(ids("focus")[0]).toBe("focus");
    expect(ids("parent mode")[0]).toBe("parent-mode");
    expect(ids("share")[0]).toBe("share");
  });

  it("reads a word's start, not the middle of one", () => {
    expect(ids("print")).toContain("print-save");
    // With a substring tier, every three-letter fragment landed somewhere.
    expect(searchGuide("rint")).toEqual([]);
  });

  it("does not mind a plural either way round", () => {
    expect(ids("colours")).toContain("palette");
    expect(ids("colour")).toContain("palette");
    expect(ids("pictures")).toContain("make-a-picture");
  });

  it("treats the words as an AND, because a query describes one thing", () => {
    expect(ids("picture cost")).toContain("picture-cost");
    expect(ids("picture cost").length).toBeLessThan(ids("picture").length);
    // A word that is in nothing takes the whole query with it.
    expect(searchGuide("picture xyzzy")).toEqual([]);
  });

  it("finds what people type rather than what the guide says", () => {
    expect(ids("pdf")).toContain("print-save");
    expect(ids("dark mode")).toContain("palette");
    expect(ids("sequel")).toContain("series");
    expect(ids("time travel")).toContain("quest");
    expect(ids("dog")).toContain("pets");
    expect(ids("api key")).toContain("own-key");
  });

  /**
   * The check that stops the vocabulary rotting: a word added here years ago
   * has to still reach the item it was added for, whatever the prose has done
   * since. Generous limit -- this is about reachability, not ranking.
   */
  it("keeps every keyword pointing at its own item", () => {
    for (const [id, words] of Object.entries(GUIDE_KEYWORDS)) {
      for (const word of words ?? []) {
        expect(ids(word, 30), `${id} / "${word}"`).toContain(id);
      }
    }
  });

  it("keeps the keywords tidy enough to search", () => {
    for (const [id, words] of Object.entries(GUIDE_KEYWORDS)) {
      const list = words ?? [];
      expect(list.length, id).toBeGreaterThan(0);
      expect(new Set(list).size, id).toBe(list.length);
      for (const word of list) {
        expect(word, id).toBe(word.toLowerCase());
        expect(word, id).toBe(word.trim());
        expect(word.length, `${id} / "${word}"`).toBeGreaterThan(1);
        // A keyword is words, not punctuation: the matcher normalises both
        // sides, so anything else here is silently doing nothing.
        expect(normaliseQuery(word), id).toBe(word);
      }
    }
  });

  it("can reach every item in the guide by its own title", () => {
    // An item nothing can find is an item that may as well not be written.
    for (const node of GUIDE_NODES) {
      expect(ids(node.title, GUIDE_NODES.length), node.id).toContain(node.id);
    }
  });

  it("honours the limit and does not reshuffle between keystrokes", () => {
    expect(searchGuide("a picture", 3).length).toBeLessThanOrEqual(3);
    expect(searchGuide("picture", 0)).toEqual([]);
    expect(ids("story")).toEqual(ids("story"));
    // Case and punctuation are the reader's business, not the matcher's.
    expect(ids("Dark Mode!")).toEqual(ids("dark mode"));
  });

  it("says where a hit lives, so a result row can name it", () => {
    const hit = searchGuide("choosing the moment")[0];
    expect(hit.node.id).toBe("picking");
    expect(hit.tab).toBe("reading");
    // Outermost first: My Stories > the bar > Make a picture > this.
    expect(hit.path[0]).toBe("My Stories");
    expect(hit.path.at(-1)).toBe("Make a picture");
  });
});
