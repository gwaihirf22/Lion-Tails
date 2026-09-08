import { describe, it, expect } from "vitest";
import { heroesOfFaithData, heroesWithoutBiography } from "../server/data/heroes";
import { HERO_GROUPS, BIBLE_GROUPS, groupLabel, livedLabel } from "../shared/schema";

/**
 * Structural checks on eighty hand-written profiles.
 *
 * These do NOT check that the content is true -- that is what
 * scripts/verify-heroes.ts does, against Wikipedia, Wikidata and
 * bible-api.com, and it needs network so it is run by hand. What this catches
 * is the class of mistake that survives a typecheck and a code review: a
 * duplicated slug that makes the seed silently drop a person, a biblical
 * figure given a group from the church-history list, a "read more" link built
 * from a URL instead of an article title.
 */

const biblical = heroesOfFaithData.filter((h) => h.collection === "biblical");
const historical = heroesOfFaithData.filter((h) => h.collection !== "biblical");

describe("identity", () => {
  it("has no duplicate ids", () => {
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const h of heroesOfFaithData) {
      if (seen.has(h.id)) dupes.push(`${h.id} (${seen.get(h.id)} and ${h.name})`);
      seen.set(h.id, h.name);
    }
    expect(dupes).toEqual([]);
  });

  it("has no duplicate names", () => {
    // The seed retires superseded rows by NAME, so two people sharing one
    // would retire each other on alternate boots.
    const byName = new Map<string, number>();
    for (const h of heroesOfFaithData) byName.set(h.name, (byName.get(h.name) ?? 0) + 1);
    expect([...byName.entries()].filter(([, n]) => n > 1)).toEqual([]);
  });

  it("uses slugs, not uuids", () => {
    // Ids were uuidv4() at module load, so hero identity changed every process
    // start and the seed had nothing stable to upsert against.
    for (const h of heroesOfFaithData) {
      expect(h.id, `${h.name} has an id that is not a slug`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("prefixes every biblical id with bible-, and no historical one", () => {
    for (const h of biblical) expect(h.id.startsWith("bible-"), h.id).toBe(true);
    for (const h of historical) expect(h.id.startsWith("bible-"), h.id).toBe(false);
  });
});

describe("grouping", () => {
  it("gives every hero a group from its own collection's list", () => {
    for (const h of biblical) {
      expect(BIBLE_GROUPS as readonly string[], `${h.name}: ${h.group}`).toContain(h.group);
    }
    for (const h of historical) {
      expect(HERO_GROUPS as readonly string[], `${h.name}: ${h.group}`).toContain(h.group);
    }
  });

  it("has a display label for every group in use", () => {
    for (const h of heroesOfFaithData) {
      // groupLabel falls back to the raw slug, which would ship "judges-and-kings"
      // to the page as a heading.
      expect(groupLabel(h.group), `${h.group} has no label`).not.toBe(h.group);
    }
  });

  it("leaves no era empty in either collection", () => {
    // An empty era renders as a heading with nothing under it.
    for (const g of BIBLE_GROUPS) {
      expect(biblical.filter((h) => h.group === g).length, `no biblical figure in "${g}"`).toBeGreaterThan(0);
    }
    for (const g of HERO_GROUPS) {
      expect(historical.filter((h) => h.group === g).length, `no hero in "${g}"`).toBeGreaterThan(0);
    }
  });
});

describe("content completeness", () => {
  it("gives every hero a biography", () => {
    // The page's whole purpose is to work with the AI switched off.
    expect(heroesWithoutBiography).toEqual([]);
  });

  it("gives every hero key events", () => {
    // Thirteen of the original fifteen had none, so the story prompt got two
    // sentences and a quote.
    for (const h of heroesOfFaithData) {
      expect(h.keyEvents.length, `${h.name} has no key events`).toBeGreaterThan(0);
    }
  });

  it("writes biographies long enough to be worth reading", () => {
    for (const h of heroesOfFaithData) {
      const words = h.biography!.trim().split(/\s+/).length;
      expect(words, `${h.name}'s biography is ${words} words`).toBeGreaterThan(150);
    }
  });

  it("gives every hero searchable tags", () => {
    // Search covers tags; an untagged hero is findable only by name.
    for (const h of heroesOfFaithData) {
      expect(h.tags.length, `${h.name} has no tags`).toBeGreaterThan(0);
    }
  });
});

describe("wikipedia links", () => {
  it("stores an article TITLE, never a URL", () => {
    // The UI builds the href from this. A URL here produces a link to
    // en.wikipedia.org/wiki/https%3A%2F%2F...
    for (const h of heroesOfFaithData) {
      if (!h.wikipedia) continue;
      expect(h.wikipedia, `${h.name}`).not.toMatch(/^https?:|wikipedia\.org/);
      expect(h.wikipedia.trim()).toBe(h.wikipedia);
    }
  });

  it("gives every hero an article title", () => {
    const missing = heroesOfFaithData.filter((h) => !h.wikipedia).map((h) => h.name);
    expect(missing).toEqual([]);
  });
});

describe("biblical figures", () => {
  it("locates every key event by chapter and verse, not by year", () => {
    // Dating Abraham is an unsettled argument; where an event sits in the
    // narrative is both more useful and more honest.
    for (const h of biblical) {
      for (const e of h.keyEvents) {
        expect(e.reference, `${h.name}: "${e.description}" has no reference`).toBeTruthy();
        expect(e.year, `${h.name}: "${e.description}" carries a year`).toBeFalsy();
      }
    }
  });

  it("writes every scripture reference in a form the API can resolve", () => {
    // Not that the verse exists -- verify-heroes.ts checks that against
    // bible-api.com -- but that the shape is "Book c:v", so a typo like
    // "Genesis 12" or "Gen. 12:1" is caught without a network call.
    const shape = /^(?:[1-3]\s)?[A-Z][a-zA-Z]+(?:\sof\s[A-Z][a-zA-Z]+)?\s\d{1,3}:\d{1,3}(?:-\d{1,3})?$/;
    for (const h of biblical) {
      for (const e of h.keyEvents) {
        expect(e.reference, `${h.name}: "${e.reference}"`).toMatch(shape);
      }
      if (h.bibleVerse) expect(h.bibleVerse.reference, h.name).toMatch(shape);
    }
  });

  /**
   * Dates that are NOT estimates, each fixed by evidence outside the Bible.
   *
   * The default is that a biblical date must carry "c." or "fl.", because
   * "2000 BC" on a children's page states as fact something nobody knows. A
   * handful genuinely are known, and this list is how a precise date gets
   * added: name it here with the reason, or write it as an estimate.
   */
  const FIXED_DATES: Record<string, string> = {
    // Josiah died at Megiddo in the year Pharaoh Neco marched to Carchemish,
    // which the Babylonian Chronicle dates independently of Scripture.
    "Josiah:609 BC": "Battle of Megiddo, fixed by the Babylonian Chronicle",
  };

  it("marks every date as an estimate, unless it is one that is genuinely fixed", () => {
    for (const h of biblical) {
      for (const v of [h.birthYear, h.deathYear]) {
        if (!v) continue;
        if (FIXED_DATES[`${h.name}:${v}`]) continue;
        expect(
          v,
          `${h.name}: "${v}" reads as a settled date. Write it as an estimate, or add it to FIXED_DATES with the evidence that fixes it.`,
        ).toMatch(/^(c\.|fl\.)/);
      }
    }
  });

  it("never renders a bare separator for an undated figure", () => {
    // The page used to show a "Lived: ? - ?" row and an empty " - " badge for
    // every one of them, because none had dates.
    for (const h of heroesOfFaithData) {
      const label = livedLabel(h);
      expect(label, `${h.name}`).not.toMatch(/^\s*[–-]\s*$/);
      if (label) expect(label.trim().length).toBeGreaterThan(3);
    }
  });
});

describe("livedLabel", () => {
  it("joins a birth and a death", () => {
    expect(livedLabel({ birthYear: "1703", deathYear: "1758" })).toBe("1703 – 1758");
  });

  it("leaves a floruit alone", () => {
    // "fl. c. AD 50 – ?" claims ignorance of something already stated.
    expect(livedLabel({ birthYear: "fl. c. AD 50" })).toBe("fl. c. AD 50");
  });

  it("marks the unknown half when only one date is known", () => {
    expect(livedLabel({ deathYear: "c. AD 34" })).toBe("? – c. AD 34");
    expect(livedLabel({ birthYear: "c. 1990 BC" })).toBe("c. 1990 BC – ?");
  });

  it("returns empty for a figure with no dates, so the caller can hide the row", () => {
    expect(livedLabel({})).toBe("");
    expect(livedLabel({ birthYear: "  ", deathYear: null })).toBe("");
  });
});
