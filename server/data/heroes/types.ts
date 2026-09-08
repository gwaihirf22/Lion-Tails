import type { HeroOfFaith, HeroGroup, BibleGroup, HeroCollection } from "@shared/schema";

/**
 * A hero as WRITTEN, before normalisation.
 *
 * Everything optional except the fields a profile is useless without, so an
 * entry can be added with what is actually known and filled in later rather
 * than padded with invented detail.
 */
export type RawHero = {
  /** Slug. Stable, readable, and what the seed upserts against. */
  id: string;
  name: string;
  /** Omitted means church history, which is the larger list. */
  collection?: HeroCollection;
  group: HeroGroup | BibleGroup;
  /** One sentence, used on the card. */
  description: string;
  /** "1703-1758" or "c. 354-430". Displayed as written. */
  timePeriod: string;
  birthYear?: string;
  deathYear?: string;
  place?: string;
  /** Why they matter, in a sentence or two. */
  contribution: string;
  /**
   * 250-350 words. The reason this page works with the AI switched off.
   *
   * Optional ONLY because the fifteen original heroes are being rewritten in
   * batches and it would be worse to delete them meanwhile. A new entry
   * without one is an unfinished entry -- see the count logged at startup.
   */
  biography?: string;
  /** What they got wrong, where it is significant enough to say. */
  complications?: string;
  famousQuote?: string;
  bibleVerse?: { text: string; reference: string };
  keyEvents?: Array<{
    /** A year for history; for Scripture, leave it and use reference. */
    year?: string;
    description: string;
    /** Chapter and verse, where the event is located in a text not a date. */
    reference?: string;
    /**
     * Why this date is not confirmable from the subject's own article.
     *
     * The verification script flags any event year missing from the Wikipedia
     * text. Some of those are genuinely settled elsewhere -- a date fixed by
     * another person's chronology, or arithmetic from the subject's own
     * writing. Recording the reason here retires the warning AND tells a
     * reader where the date comes from, which is better than a checker that
     * cries wolf until people stop reading it.
     */
    dateNote?: string;
  }>;
  tags?: string[];
  /**
   * The English Wikipedia ARTICLE TITLE, not a URL.
   *
   * A title because the name alone is ambiguous -- "Jonathan Edwards" is a
   * triple jumper before he is a theologian -- so disambiguation is chosen
   * here rather than guessed at fetch time. The verification script uses it to
   * check every date against Wikidata, and the UI builds the link from it.
   */
  wikipedia?: string;
  sources?: Array<{
    title: string;
    author?: string;
    url?: string;
    description?: string;
    type?: "book" | "article" | "website" | "documentary" | "other";
  }>;
};

/**
 * Fill in the shape the rest of the app expects.
 *
 * The previous version generated a uuid here, which is why hero identity
 * changed with every process start and the seed could never update anything.
 * The id now comes from the entry itself.
 */
export function toHero(raw: RawHero): HeroOfFaith {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    timePeriod: raw.timePeriod,
    contribution: raw.contribution,
    group: raw.group,
    collection: raw.collection ?? "historical",
    place: raw.place,
    biography: raw.biography,
    complications: raw.complications,
    birthYear: raw.birthYear,
    deathYear: raw.deathYear,
    famousQuote: raw.famousQuote,
    bibleVerse: raw.bibleVerse,
    keyEvents: raw.keyEvents ?? [],
    tags: raw.tags ?? [],
    wikipedia: raw.wikipedia,
    sources: (raw.sources ?? []).map((s) => ({
      ...s,
      type: (s.type ?? "book") as "book" | "article" | "website" | "documentary" | "other",
    })),
    createdAt: new Date(),
  };
}
