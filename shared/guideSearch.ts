/**
 * Finding your way into the guide.
 *
 * Blake: *"We need to add a search function to the How to use feature. it
 * should basically just bring the user to the right location for a feature that
 * they are looking for."* So this answers with ITEMS, never with text of its
 * own: the guide's words stay the one copy, and a hit is a place to be taken
 * to.
 *
 * TIERED, NOT FUZZY, which is how every other search in this app works --
 * `searchKinds()` in shared/characterVocab.ts and `searchAnimals()` in
 * shared/animalData.ts both go exact, then prefix, then substring, and
 * `searchKinds`' own comment says they are alike on purpose. A guide item has
 * more than one field to match, so the tiers are scored rather than
 * concatenated: the title outranks the keywords, and the keywords outrank the
 * prose. A wrong first hit is worse than none, because it reads as the guide
 * not knowing its own contents.
 *
 * EVERY WORD MUST MATCH SOMETHING. "picture cost" is a request for one item,
 * not for everything about pictures, so the tokens are an AND.
 *
 * NO REGEX IS BUILT FROM THE QUERY. It is user text, and compiling user text is
 * an escaping bug and a denial of service at once (CLAUDE.md says so twice, for
 * skill names and for character names). Matching is index arithmetic over a
 * lowercased haystack, the technique `containsWholeWord` and `lookBook`'s
 * `mentions` already use.
 */
import {
  GUIDE_KEYWORDS,
  GUIDE_NODES,
  guideNode,
  type GuideNodeSpec,
  type GuideTabId,
} from "./guide";

export type GuideHit = {
  node: GuideNodeSpec;
  tab: GuideTabId;
  /** The titles above it, outermost first, for context in the result row. */
  path: string[];
  /** Higher is a better match. Exposed so a test can assert the ordering. */
  score: number;
};

/** What the matcher compares: lower case, and punctuation is a space. */
export function normaliseQuery(text: string): string {
  let out = "";
  for (const ch of text.toLowerCase()) {
    out += /[\p{L}\p{N}]/u.test(ch) ? ch : " ";
  }
  return out.replace(/\s+/g, " ").trim();
}

/** The words of a query, in order, with the empties gone. */
function tokensOf(query: string): string[] {
  const normalised = normaliseQuery(query);
  return normalised ? normalised.split(" ") : [];
}

/**
 * Whether `word` starts a word in `text`, both already normalised.
 *
 * A prefix of a WORD, not of the string: searching "print" should reach "Print
 * and Save" and searching "rint" should not. No regex -- see the file comment.
 */
function hasWordStartingWith(text: string, word: string): boolean {
  for (let at = text.indexOf(word); at !== -1; at = text.indexOf(word, at + 1)) {
    if (at === 0 || text[at - 1] === " ") return true;
  }
  return false;
}

/** Whether `word` is a whole word of `text`, both already normalised. */
function hasWholeWord(text: string, word: string): boolean {
  for (let at = text.indexOf(word); at !== -1; at = text.indexOf(word, at + 1)) {
    const before = at === 0 || text[at - 1] === " ";
    const after = at + word.length === text.length || text[at + word.length] === " ";
    if (before && after) return true;
  }
  return false;
}

/**
 * The tiers, and the gaps between them are what make the ranking survive a
 * word appearing in thirty items' prose.
 */
const SCORE = {
  titleExact: 100,
  titleWord: 60,
  keywordWhole: 50,
  keywordWord: 35,
  whyWord: 12,
} as const;

/**
 * "colours" is "colour", and "pictures" is "picture".
 *
 * A word START is enough for a query shorter than the word ("picture" reaches
 * "Pictures"), and this is the other direction, which no amount of prefix
 * matching covers. Deliberately the only stemming here: anything cleverer
 * guesses, and a guess that ranks the wrong item first is worse than a miss.
 */
function stem(token: string): string | undefined {
  return token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : undefined;
}

/**
 * What one token is worth against one item, or 0 when it is not there.
 *
 * WORD STARTS ONLY, never the middle of a word: with a substring tier, "rint"
 * found "Print and Save" and every three-letter fragment landed somewhere. The
 * stem counts for the same as the word itself -- a plural is a spelling, not a
 * weaker match.
 */
function scoreToken(token: string, fields: { title: string; keywords: string; why: string }): number {
  let best = 0;
  for (const word of [token, stem(token)]) {
    if (!word) continue;
    const worth =
      fields.title === word
        ? SCORE.titleExact
        : hasWordStartingWith(fields.title, word)
          ? SCORE.titleWord
          : hasWholeWord(fields.keywords, word)
            ? SCORE.keywordWhole
            : hasWordStartingWith(fields.keywords, word)
              ? SCORE.keywordWord
              : hasWordStartingWith(fields.why, word)
                ? SCORE.whyWord
                : 0;
    best = Math.max(best, worth);
  }
  return best;
}

/**
 * The ancestors' titles, outermost first.
 *
 * Shown, never matched: searching "quest" should find the quest item itself,
 * not each of its six descendants, which would bury the answer under its own
 * children.
 */
function pathTo(node: GuideNodeSpec): string[] {
  const path: string[] = [];
  for (let parent = node.parent ? guideNode(node.parent) : undefined; parent; ) {
    path.unshift(parent.title);
    parent = parent.parent ? guideNode(parent.parent) : undefined;
  }
  return path;
}

/**
 * The haystacks, built once at import.
 *
 * The guide's table is a constant, so there is nothing to invalidate -- and
 * building 69 lowercased strings on every keystroke would be work done for
 * nothing.
 */
const HAYSTACKS = GUIDE_NODES.map((node, order) => ({
  node: node as GuideNodeSpec,
  order,
  fields: {
    title: normaliseQuery(node.title),
    keywords: normaliseQuery((GUIDE_KEYWORDS[node.id] ?? []).join(" ")),
    why: normaliseQuery(node.why),
  },
}));

/**
 * The items that answer this query, best first.
 *
 * Ties break on the table's own order, so the same query always returns the
 * same list in the same order -- a result list that reshuffles between
 * keystrokes is one nobody can click.
 */
export function searchGuide(query: string, limit = 8): GuideHit[] {
  const tokens = tokensOf(query);
  if (!tokens.length) return [];

  const hits: Array<GuideHit & { order: number }> = [];
  for (const { node, order, fields } of HAYSTACKS) {
    let score = 0;
    for (const token of tokens) {
      const worth = scoreToken(token, fields);
      // AND: a query is a description of one thing, and a token that matches
      // nothing means this is not it.
      if (!worth) {
        score = 0;
        break;
      }
      score += worth;
    }
    if (score) hits.push({ node, tab: node.tab, path: pathTo(node), score, order });
  }

  return hits
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, Math.max(0, limit))
    .map(({ order: _order, ...hit }) => hit);
}
