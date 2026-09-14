/**
 * A story's Further reading: built from what the app has already checked,
 * never from what a model remembers.
 *
 * Blake wanted the sources behind each story "returned and put in this
 * section". The story models are plain chat completions with no browsing, and
 * asked for sources from memory they produce plausible books and links that do
 * not exist. So the list is DERIVED from the account the story was written
 * against: the Bible passages in server/data/biblicalEvents.ts (verses fetched
 * from bible-api.com), and a hero's references, Wikipedia article and books
 * from server/data/heroes (checked by scripts/verify-heroes.ts).
 *
 * Derived when a story is served, not stored: stories already in a library get
 * it, and a book added to a hero's profile shows on every story about them.
 */
export type Resource = { label: string; url?: string };

export type ReadingSources = {
  event?: { label?: string; passage?: string; keyVerse?: { reference: string } };
  hero?: {
    name: string;
    wikipedia?: string;
    bibleVerse?: { reference: string };
    keyEvents?: Array<{ reference?: string }>;
    sources?: Array<{ title: string; author?: string; description?: string; url?: string }>;
  };
  /** The request's own passage, when the reader chose one. */
  biblePassage?: string;
};

/** Enough to be useful, few enough to be read. The general links come after. */
export const MAX_SPECIFIC_READING = 8;

/** The two links every story has always ended with. Still there, and last. */
export const GENERAL_READING: readonly Resource[] = [
  { label: "BibleGateway.com — read the Bible stories", url: "https://www.biblegateway.com" },
  { label: "GotQuestions.org — answers about faith", url: "https://www.gotquestions.org" },
];

const isSet = (v: string | undefined): v is string =>
  typeof v === "string" && v.trim() !== "" && v.trim().toLowerCase() !== "none";

/**
 * "Genesis 6:9 - 9:17" -> "Genesis 6:9-9:17". The spaced dash is how the data
 * files write a range, and not how Bible Gateway reads one.
 */
export function normaliseReference(ref: string): string {
  return ref.trim().replace(/\s*[-–—]\s*/g, "-").replace(/\s+/g, " ");
}

/**
 * The passage on Bible Gateway, in the World English Bible -- the translation
 * every verse in this app was fetched in, so the page matches the story's.
 */
export function bibleGatewayUrl(ref: string): string {
  return `https://www.biblegateway.com/passage/?search=${encodeURIComponent(normaliseReference(ref))}&version=WEB`;
}

/** An English Wikipedia article, from the TITLE the hero data stores. */
export function wikipediaUrl(title: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.trim().replace(/ /g, "_"))}`;
}

export function furtherReadingFor(src: ReadingSources): Resource[] {
  const specific: Resource[] = [];
  const seen = new Set<string>();
  const add = (r: Resource) => {
    const key = (r.url ?? r.label).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    specific.push(r);
  };
  const passage = (ref: string | undefined) => {
    if (!isSet(ref)) return;
    add({ label: `${normaliseReference(ref)} (Bible Gateway)`, url: bibleGatewayUrl(ref) });
  };

  passage(src.event?.passage);
  passage(src.event?.keyVerse?.reference);
  passage(src.biblePassage);
  if (src.hero) {
    if (isSet(src.hero.wikipedia)) {
      add({ label: `${src.hero.name} on Wikipedia`, url: wikipediaUrl(src.hero.wikipedia) });
    }
    passage(src.hero.bibleVerse?.reference);
    for (const e of (src.hero.keyEvents ?? []).filter((k) => isSet(k.reference)).slice(0, 3)) {
      passage(e.reference);
    }
    for (const s of src.hero.sources ?? []) {
      if (!isSet(s.title)) continue;
      const by = isSet(s.author) ? `, ${s.author}` : "";
      const about = isSet(s.description) ? ` — ${s.description}` : "";
      // A URL only if the data carries one; none is ever made up.
      add({ label: `${s.title}${by}${about}`, ...(isSet(s.url) ? { url: s.url } : {}) });
    }
  }

  const out = specific.slice(0, MAX_SPECIFIC_READING);
  for (const g of GENERAL_READING) {
    if (!out.some((r) => r.url === g.url)) out.push(g);
  }
  return out;
}
