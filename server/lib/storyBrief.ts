import {
  SKILL_COMPETENT,
  type CharacterSkill,
  notableSkills,
  skillsOf,
  characterRoleOf,
  type CharacterRole,
  readingLevelAges,
  characterIdsOf,
  characterKind,
  statsOf,
  CHARACTER_STATS,
  STAT_BASE,
  STAT_NOTABLE_HIGH,
  STAT_NOTABLE_LOW,
  MAX_STORY_CHARACTERS,
  isEnsemble,
  type CharacterStat,
  type CharacterStats,
  type StoryRequest,
  type Character,
  type HeroOfFaith,
} from "@shared/schema";
import { coveringNoun, GENDERED_KINDS, type CharacterCategory } from "@shared/characterVocab";
import { storage } from "../storage";
import { getBiblicalEvent } from "../data/biblicalEvents";
import {
  KEEPER,
  framingApproachOf,
  pickFramingApproach,
  worldAnchor,
  worldCanon,
  questFamiliarity,
} from "../data/lionTails";
import { CROSSING_OVER_DRESS, STONE_IN_PICTURES } from "../data/referencePlates";

export type CustomPrompts = {
  systemPrompt?: string;
  userPrompt?: string;
};

/**
 * "a" or "an", for a noun the user chose.
 *
 * Extracted from the companion-animal line, which had it inline. That comment
 * is worth keeping in view: "There is rabbit in Mia's life" is ungrammatical,
 * and a model handed ungrammatical input stopped naming the animal and repeated
 * the bare noun instead -- one prompt produced a companion called Benny, the
 * other produced "the rabbit" fifteen times. A cast that can contain an owl, an
 * elephant and an android needs the same care the rabbit got.
 */
function article(noun: string): string {
  return /^[aeiou]/i.test(noun.trim()) ? "an" : "a";
}

/**
 * How to refer to them, in two words, inside the clause that already exists.
 *
 * Derived from `sex` rather than stored as a pronoun. Absent for every
 * character saved before this, and after a noun that carries it already.
 *
 * That second rule used to be true only by accident -- the form hid `sex` for
 * people, so a girl never had one. Now a Human has to have one, and
 * characterKind() turns human + female into "girl"; without the check a new
 * character would render "a girl (she)" where every existing girl renders "a
 * girl", and the same child would read differently depending on when she was
 * made. So `noun` is the word actually being printed, and it decides.
 */
function sexTag(sex?: Character["sex"], noun?: string): string {
  if (noun && GENDERED_KINDS.has(noun.trim().toLowerCase())) return "";
  if (sex === "male") return " (he)";
  if (sex === "female") return " (she)";
  if (sex === "it") return " (it)";
  return "";
}

/**
 * Resolves the saved characters a request refers to, in the requested order.
 *
 * ONE user-scoped read, then an index. The request supplies nothing but the
 * ORDER.
 *
 * This used to be the only thing standing between a request and another user's
 * characters: getCharacterById took an id alone, Character carries no userId,
 * and a loop of it would have starred anyone's character in anyone's story.
 * That is no longer true -- every storage method now REQUIRES the owner and
 * scopes in the SQL, so an unscoped fetch cannot be written. The reason to keep
 * one read is now ordinary: it is a single round trip instead of N, and it
 * gives the warning below somewhere to live.
 *
 * Left explicit because a comment that still described a fixed hole would
 * eventually be read as licence to re-open it.
 *
 * Returns [] rather than undefined on any failure -- story generation must
 * still work when the database is unavailable and storage has fallen back to
 * memory -- and an empty array is harder for a caller to forget than undefined.
 */
export async function resolveStoryCharacters(
  request: StoryRequest,
  userId: number,
): Promise<Character[]> {
  const wanted = characterIdsOf(request);
  if (wanted.length === 0) return [];

  try {
    const owned = await storage.getAllCharacters(userId);
    const byId = new Map(owned.map((c) => [c.id, c]));
    const found: Character[] = [];
    for (const id of wanted) {
      const match = byId.get(id);
      if (match) found.push(match);
      // An id the user does not own, or one they deleted after choosing it.
      // Dropping it silently would shrink the cast with no symptom, so say so
      // -- and generateStory surfaces requested/resolved counts in the debug
      // header for the same reason.
      else console.warn(`Character ${id} not found for user ${userId}; leaving them out of the cast.`);
    }
    return found.slice(0, MAX_STORY_CHARACTERS);
  } catch (error) {
    console.error("Could not load character details for story generation:", error);
    return [];
  }
}

/**
 * Settle "surprise me" into an actual moment, once.
 *
 * Chosen on the SERVER at enqueue rather than in the browser, and written back
 * onto the request before it is frozen. Choosing in the client would make the
 * same request produce a different story every time it was replayed, which is
 * the kind of thing that is impossible to debug six weeks later -- and the
 * frozen request is the only record of what the story was actually asked for.
 *
 * Mutates the request deliberately: routes.ts freezes it immediately after, and
 * heroId is already set the same way a few lines above.
 */
export function resolveStoryFocus(request: StoryRequest, hero?: HeroOfFaith): void {
  const focus = request.storyFocus;
  if (!focus || focus.mode !== "surprise") return;

  const events = (hero?.keyEvents ?? []).filter((e) => e.description);
  if (events.length === 0) {
    // Nothing to choose from -- a hero with no key events, or no hero at all.
    // Downgrade to the whole life rather than emit an empty scope instruction
    // that would read as "cover nothing".
    request.storyFocus = { mode: "whole", text: "" };
    return;
  }

  const pick = events[Math.floor(Math.random() * events.length)];
  request.storyFocus = {
    mode: "surprise",
    text: pick.description,
    reference: pick.reference || pick.year || undefined,
  };
}

/**
 * Settle which framing a travelling story opens with, once.
 *
 * Same reasoning as resolveStoryFocus above, same place in the request's life:
 * chosen on the SERVER at enqueue and written back before the request is
 * frozen, so the stored request records the frame that was actually used and
 * the story can be traced back to it.
 *
 * OVERWRITES whatever arrived. The field is server-owned and it is on the
 * write schema only because the request object is one shape end to end -- so
 * a client that sends its own travelFrame must not be able to pin the choice.
 * Cleared outright for the other modes, which have no frame: leaving a stale
 * value on a request switched from "travels" to "alongside" would put a
 * lantern in the debug panel for a story that has none.
 *
 * Mutates deliberately: routes.ts freezes the request immediately after.
 */
/**
 * How many quests each of these characters has already been on.
 *
 * COUNTED IN TYPESCRIPT, not in SQL. Which stories are quests, and who is in
 * them, are answered by characterRoleOf() and characterIdsOf() -- the two
 * helpers that know characterRole/useTimeTravel and characterIds/characterId
 * are each one fact under two names. A jsonb predicate would be a second copy
 * of both, and the older spelling is precisely what it would miss.
 *
 * The prologue does not count. It is second person, shared by every library,
 * and belongs to no character.
 *
 * A deleted story lowers a count, and that is the right answer: the library is
 * what the reader has, and a quest they can no longer find is not one they
 * remember being on.
 */
export async function countQuestsFor(
  userId: number,
  characterIds: string[],
): Promise<Record<string, number>> {
  const visits: Record<string, number> = Object.fromEntries(characterIds.map((id) => [id, 0]));
  if (characterIds.length === 0) return visits;
  const requests = await storage.getStoryRequests(userId);
  for (const request of requests) {
    if (characterRoleOf(request) !== "travels") continue;
    const cast = new Set(characterIdsOf(request));
    for (const id of characterIds) if (cast.has(id)) visits[id] += 1;
  }
  return visits;
}

export function resolveTravelFrame(request: StoryRequest): void {
  request.travelFrame =
    characterRoleOf(request) === "travels" ? pickFramingApproach().id : undefined;
}

/**
 * Settle the story down to ONE source, once.
 *
 * A story is about a biblical event, OR a person, OR a passage. Three fields
 * carry that one choice, because all three are frozen on requests already in
 * the database and jsonb is never rewritten -- so the choice is enforced here,
 * at enqueue, rather than by a rule every reader has to remember.
 *
 * WHAT COMBINING THEM USED TO DO, silently, with nothing logged:
 *
 *   event + hero      buildStoryBrief builds sourceMaterial event-first, so
 *                     the hero was dropped ENTIRELY -- biography, key events,
 *                     quote, verse -- and the only trace left was a premise
 *                     line that is itself suppressed for a uuid, which is
 *                     exactly what the picker sends. The hero vanished.
 *
 *   hero + passage    storytellerPersona asks
 *                     `isSet(biblicalEvent) || isSet(biblePassage)` to decide
 *                     whether this is Scripture, so a typed passage flipped a
 *                     hero story onto the retelling persona -- "faithful to
 *                     what Scripture actually records" -- while sourceMaterial
 *                     was still that person's biography. The persona and the
 *                     brief then described two different stories.
 *
 * NORMALISE, DO NOT REJECT. A refine that refused two sources would also
 * refuse requests already sitting in story_jobs, which are replayed and
 * re-read. Clearing the losers instead fixes both failures by construction,
 * leaves old rows working, and makes the frozen request say which source was
 * actually used rather than which three were offered.
 *
 * The precedence is the one buildStoryBrief already had. It is kept rather
 * than improved on purpose: changing it would change what an existing request
 * means.
 *
 * Mutates deliberately: routes.ts freezes the request immediately after, the
 * same as resolveStoryFocus and resolveTravelFrame above.
 */
export function resolveStorySource(request: StoryRequest): void {
  /**
   * Keyed on whether the event RESOLVES, not on whether the field is filled.
   *
   * A slug getBiblicalEvent() does not recognise carries no account, no verse
   * and no cautions -- all it produces is the fallback premise line "Draw on
   * this biblical event: <slug>.", which is the raw-slug-into-the-prompt
   * failure being deleted from learningFocus in this same change. Letting an
   * unrecognised slug win and clear a perfectly good hero would trade a whole
   * biography for a word the model has to guess the meaning of.
   */
  if (getBiblicalEvent(request.biblicalEvent)) {
    request.heroOfFaith = "";
    request.biblePassage = "";
    clearStoryFocus(request);
    return;
  }
  if (isSet(request.heroOfFaith)) {
    request.biblePassage = "";
    return;
  }
  // A passage alone, an unrecognised slug, or no source at all. An unset field
  // is left exactly as it arrived rather than normalised to "", so this does
  // not rewrite fields it has no opinion about.
  clearStoryFocus(request);
}

/**
 * storyFocus belongs to a HERO, and to nothing else.
 *
 * The episode select is populated from the chosen hero's own keyEvents and
 * only RENDERS while a hero with events is selected -- but it was never
 * cleared when the hero changed or went away. Pick a hero, pick an episode,
 * switch to a biblical event: the control disappears and
 * `{mode:"chosen", text:"<that hero's event>"}` is still on the request, so
 * the brief emits "This story covers ONE episode: ..." naming a moment from
 * somebody else's life against an unrelated account.
 *
 * Cleared to undefined rather than to {mode:"whole"} so the field is absent
 * from the frozen request, exactly as it is for a story that never had one.
 */
function clearStoryFocus(request: StoryRequest): void {
  if (request.storyFocus) request.storyFocus = undefined;
}

/**
 * The load-bearing sentences of both modes, NAMED, because they are said twice.
 *
 * Once in the full brief, and once again in every chapter -- the chapter
 * projection used to carry none of this, so a long story obeyed "does not die"
 * in chapter 1 and was free of it by chapter 3. Two strings that must agree
 * are one string.
 */
const HISTORY_FIXED =
  "The real events still happen exactly as the account gives them, in that " +
  "order, with those names and that outcome. Invent the journey and the " +
  "arrival; do not invent history. The invented character does not change what " +
  "happened and does not rescue anyone from it.";

/**
 * One character is never "they".
 *
 * A story written for two girls came back calling one of them "they" -- "'You're
 * being annoying,' they snapped" -- and the cause was not missing data: the
 * brief said "Ellie, aged 10, a girl." plainly. It was that this file and
 * lionTails.ts between them wrote singular "they" about sixty times, in the
 * anchor that reprints in every chapter and in the world canon, so the prompt
 * demonstrated the construction it wanted to forbid. Those are rewritten to name
 * the person; this line is the rule stated out loud, because prose alone is a
 * convention and a model needs the instruction.
 *
 * Deliberately does NOT branch on `sex`. It is optional and usually unset, and
 * most kinds -- dragon, dog, robot -- imply nothing, so a rule keyed on it would
 * need a fallback for the ordinary case anyway. Naming the character covers
 * every case in one sentence and no code.
 */
const ONE_PERSON_PRONOUNS =
  "Each character named here is one person, not a group. Write each one as he " +
  'or she, as the description above gives; never write "they", "them" or ' +
  '"their" about a single character. Where the description does not say, use ' +
  "the character's name again rather than a pronoun.";

/**
 * WHAT THEY MAY DO, which nothing used to say.
 *
 * Every line the chapter prompt carried about being in a real account was a
 * prohibition -- HISTORY_FIXED's four, and "does not die". Told only what they
 * may not do, a model writes somebody who does nothing: in a Joseph quest that
 * used the lantern-stone perfectly, the traveller spoke ONCE in a hundred and
 * nine paragraphs, and that was back in the shop. Forty-one paragraphs of
 * dialogue inside the account and nobody addressed her. She carried water,
 * gathered grain and watched.
 *
 * THE GAPS ARE WHERE THEY LIVE. An account records what it records; it does
 * not say who fetched the water, who sat with him in the dark, who was told to
 * move along. That is room to act in, with real effect, that changes nothing
 * written down -- and it is the honest reading of Blake's "having the
 * character do things that affect the story yet somehow it remains on track".
 *
 * WHAT IS NOT HERE, deliberately: the account happening BECAUSE of them. Blake
 * raised it and doubted it himself -- "I don't know if that can be safely
 * integrated". It cannot. The story ends with a note saying this character was
 * invented, and that note stops being true the moment the recorded events
 * needed them; a child cannot then tell which half of what they read was real.
 * They may try and fail. Failing is allowed to matter.
 */
const partOfIt = (name: string) =>
  `${name} is IN this and not watching it: ${name} speaks and is spoken to, ` +
  `helps, gets in the way, is noticed. Let ${name} act where the account ` +
  "is silent -- who carried the water, who sat with him, who was told to move " +
  "along -- and let trying and failing cost something. What the account does " +
  `record happens anyway, and never because of ${name}.`;

/**
 * The mission: given a sympathetic character who thinks the hero's choice is
 * mad, the obvious scene is the one where they talk him out of it. That is
 * the story this mode exists to NOT tell. He listens, and he goes anyway --
 * that is the whole point of putting someone there to argue with him.
 */
const missionHolds = (name: string) =>
  "The person the account is about stays on that mission, is not talked out " +
  `of it, and does not change course because of ${name}. That person may ` +
  "listen, and may answer.";

/**
 * The death: a character the reader made is going to be in accounts where
 * people die, and some of them die badly. The reader has to be safe to ask the
 * hard question. This is the one place either mode is allowed to be
 * unrealistic, and it is worth it.
 */
const neverDies = (name: string) =>
  `${name} does not die, whatever happens to anybody else in this account, ` +
  `and is never the one standing in the way. ${name} is never the villain of ` +
  "this story.";

type Participation = {
  /** Full-brief lines, into `premise`. */
  lines: string[];
  /** The load-bearing rules, for every chapter. */
  anchor: string;
  /** The Lion Tails world, for a quest. Absent for the other mode. */
  world?: StoryBrief["world"];
};

/**
 * How the character came to be in this account, and what they may do in it.
 *
 * Two modes, and they say almost opposite things -- which is exactly why the
 * request carries ONE field with three values rather than two flags. When the
 * form could set both, the brief said both, and the model picked one.
 */
function participationPremise(
  role: CharacterRole,
  name: string,
  hasSource: boolean,
  request: StoryRequest,
): Participation {
  const out: string[] = [];

  if (role === "travels") {
    /**
     * They are here, now, and they GO there. So the story has a present as
     * well as a past, and the present is not a doorway to be got out of the
     * way in a sentence.
     *
     * The frame is chosen per story from a set (see server/data/lionTails.ts)
     * because a single line of arrival makes every travelling story open
     * identically, and "it cannot be the same each time" is the requirement
     * Blake put hardest. Which one was chosen is frozen on the request, so a
     * story can be traced back to the frame it was given.
     */
    const frame = framingApproachOf(request.travelFrame);
    /**
     * The world itself -- the shop, the man, the lantern, the rules -- is not
     * pushed here any more. It is `world`, rendered under its own heading,
     * because `premise` renders under "Also asked for:" and a universe is not
     * something that was asked for. What stays here is the one line that is
     * about THIS character rather than about the world.
     */
    out.push(
      `${name} lives in the present day, and this story is a quest with ` +
        `${KEEPER.name}, ${KEEPER.title}.`,
    );
    if (hasSource) {
      /**
       * Blake's framing, and the balance is the whole instruction: let the
       * journey be fun, but the real events still happen and still land. Left
       * as the bare "travels back in time and witnesses this first-hand", a
       * model writes a polite tour -- the character stands and watches,
       * nothing is at stake, and the account is narrated at them. That is the
       * dullest possible use of the mode and it was what the sentence asked
       * for.
       *
       * The licence to be silly is attached to the JOURNEY and not to what
       * they do once they arrive. It used to cover both. "A little silly in
       * how they help" is a fine instruction for the plagues of Egypt and a
       * terrible one for the crucifixion, and the account block cannot rescue
       * a tone the premise has already set.
       */
      out.push(
        `Once there, ${name} is part of what happens -- not a visitor watching ` +
          "it happen. Let the journey itself be fun and surprising; let what " +
          `${name} finds at the end of it be as serious as it actually was.`,
      );
      out.push(HISTORY_FIXED);
    }
    return {
      lines: out,
      // "Does not die" was the alongside mode's alone. A traveller is in the
      // same accounts, and a reader who made them has the same question.
      // The permission FIRST: a chapter prompt that opens with four things
      // they must not do is one that writes somebody standing still.
      anchor: [hasSource ? partOfIt(name) : "", hasSource ? HISTORY_FIXED : "", neverDies(name)]
        .filter(Boolean)
        .join(" "),
      // CROSSING_OVER_DRESS rides with the canon so the STORY says it too.
      // The picture is told the same thing by renderBrief's image projection;
      // if only one of them knew, the prose would put a child in a fleece and
      // the illustration would put them in linen, in the same scene.
      world: {
        canon: [...worldCanon(frame), CROSSING_OVER_DRESS],
        anchor: worldAnchor(),
      },
    };
  }

  // role === "alongside". They were always there.
  out.push(
    `${name} was there. Not a visitor and not a traveller: ${name} belongs to ` +
      `that time and that place and always did. Do not have ${name} arrive, do ` +
      `not give ${name} anything from another century, and do not put a frame ` +
      "around the story.",
  );
  if (!hasSource) return { lines: out, anchor: neverDies(name) };

  out.push(
    `${name} matters to what happens -- not a bystander and not a rescuer. ` +
      `${name} helps, asks hard questions, and pushes back when the choice ` +
      `in front of ${name} looks mad from where ${name} is standing.`,
  );
  out.push(
    "The account still happens exactly as it is recorded -- the same events, " +
      `in the same order, at the same cost. Nothing ${name} does changes it.`,
  );
  /**
   * LOAD-BEARING, both of them, and they are here because a model reaching for
   * drama reaches for exactly these two things first.
   *
   * The mission: given a sympathetic character who thinks the hero's choice is
   * mad, the obvious scene is the one where they talk him out of it. That is
   * the story this mode exists to NOT tell. He listens, and he goes anyway --
   * that is the whole point of putting someone there to argue with him.
   *
   * The death: a character the reader made is going to be in accounts where
   * people die, and some of them die badly. The reader has to be safe to ask
   * the hard question. This is the one place the mode is allowed to be
   * unrealistic, and it is worth it.
   */
  out.push(missionHolds(name));
  out.push(neverDies(name));
  /**
   * What the mode is FOR, said outright, because everything above it is a
   * constraint and constraints alone produce a careful, pointless story.
   */
  out.push(
    "What this story is for: the reader should come out of it understanding " +
      `WHY that choice was made. Let ${name} ask the question the reader would ` +
      "ask, and let the answer be the story.",
  );
  return { lines: out, anchor: `${missionHolds(name)} ${neverDies(name)}` };
}

/**
 * Sentinel values the form writes to mean "no animal".
 *
 * StoryForm sets `animal` to the literal string "none" in four places, and
 * "none" is truthy -- so `request.animal || favoriteAnimal` short-circuited and
 * the brief emitted "Animal companion: none", telling the model the child's
 * companion was an animal called None. storage.ts guarded against capital
 * "None", which never matched what the form actually writes.
 */
const NO_VALUE = new Set(["", "none", "n/a", "na", "null", "undefined"]);
const isSet = (v: unknown): v is string =>
  typeof v === "string" && !NO_VALUE.has(v.trim().toLowerCase());

/**
 * Names the FORM invents to satisfy validation, which are not names.
 *
 * StoryForm sets childName to "Biblical Character" for the historical tab and
 * "Character" for time travel, purely because childName has a .min(1) and the
 * fields are hidden in those modes. Both went straight into the prompt, so a
 * Noah story opened "WHO THIS IS ABOUT: Biblical Character, a boy." and the
 * model, given a protagonist, wrote about him instead of about Noah.
 */
/**
 * Said in the full brief AND in every chapter prompt, so it is written once.
 *
 * "Child" was the wrong noun and had become misleading. A character is not
 * assumed to be the reader's child any more -- it may be a dragon or a robot --
 * and "do not add a child" does not forbid inserting a dragon into Numbers 13.
 * The audience is still a child; the CAST is not, and this sentence is about
 * the cast.
 */
export const SOLO_RETELLING_GUARD =
  "Nobody has been invented to walk through this account. Do not add a modern " +
  "character, a narrator being told the story, or any framing device around it.";

const PLACEHOLDER_NAMES = new Set([
  "biblical character",
  "character",
  "a character",
  // Kept: rows and in-flight requests written before the rename still say it.
  "a child",
  "child",
]);
const isPlaceholderName = (v: string | undefined): boolean =>
  typeof v === "string" && PLACEHOLDER_NAMES.has(v.trim().toLowerCase());

/**
 * Resolve the hero of faith a request refers to.
 *
 * Tolerant of id OR name on purpose. The form's SelectItem value is hero.id
 * (a uuid), while routes.ts looked the hero up by `h.name === request.heroOfFaith`
 * -- a comparison that can never be true, which is why hero_id is NULL on
 * essentially every saved story. The brief was worse: it emitted the raw uuid
 * into the prompt as "Feature this hero of faith: 7f3a9c12-...".
 *
 * Matching both shapes fixes it without a data migration and without depending
 * on which end gets corrected first.
 */
export async function resolveHeroOfFaith(
  request: StoryRequest,
): Promise<HeroOfFaith | undefined> {
  if (!isSet(request.heroOfFaith)) return undefined;
  const wanted = request.heroOfFaith.trim().toLowerCase();
  try {
    const heroes = await storage.getAllHeroesOfFaith();
    return heroes.find(
      (h) => h.id.toLowerCase() === wanted || h.name.toLowerCase() === wanted,
    );
  } catch (error) {
    console.error("Could not load hero of faith for story generation:", error);
    return undefined;
  }
}

/** Joins clauses into a sentence without stray commas when parts are missing. */
function sentence(parts: Array<string | undefined>): string {
  const kept = parts.filter((p): p is string => Boolean(p && p.trim()));
  if (kept.length === 0) return "";
  return kept.join(" ") + (kept[kept.length - 1].endsWith(".") ? "" : ".");
}

/**
 * What the story is, in the words the prompts should use.
 *
 * storyType previously reached only the one-line system persona; every user
 * prompt hardcoded "story", "chapter" and a word count. The concrete
 * instruction beats the persona, which is why asking for a poem produced a
 * story. Derived here, once, so the three prompt sites cannot drift.
 */
/**
 * Words per line of childrens verse. MEASURED, not assumed: across the poems
 * generated during this change gpt-oss wrote 174 words over 20 lines and
 * gpt-4o-mini 300 over 32 -- 8.7 and 9.4. The first draft used 7, which made
 * every poem overshoot its word target by 30-90% while hitting the requested
 * LINE count exactly. The line count was never wrong; the words-per-line
 * constant behind the target was.
 */
export const WORDS_PER_VERSE_LINE = 9;

export type StoryForm_ = {
  /** "story" | "poem" -- the noun every prompt should use. */
  noun: string;
  /** How to describe the length requirement to the model. */
  lengthPhrase: (targetWords: number) => string;
  /** Form-specific craft instruction. */
  craft: string;
};

export function storyFormFor(storyType: string | undefined): StoryForm_ {
  if (storyType === "poem") {
    return {
      noun: "poem",
      // Poems are measured in lines, not words. The word target still exists
      // because the length check needs one, but the model is asked for verse.
      lengthPhrase: (w) =>
        `Write approximately ${Math.max(4, Math.round(w / WORDS_PER_VERSE_LINE))} lines of verse. ` +
        `Use a consistent rhythm and a rhyme scheme you keep to throughout.`,
      craft:
        "Write it as verse, not prose. Line breaks and rhythm carry the story. " +
        "Do not write paragraphs.",
    };
  }
  if (storyType === "moral") {
    return {
      noun: "story",
      lengthPhrase: (w) => `The story should be approximately ${w} words long.`,
      craft:
        "Build the whole story around one clear moral choice. The lesson must " +
        "emerge from what the character decides and what follows, never from " +
        "the narrator explaining it.",
    };
  }
  return {
    noun: "story",
    lengthPhrase: (w) => `The story should be approximately ${w} words long.`,
    craft: "",
  };
}

/** How the story should end, sent to the model instead of labelled afterwards. */
function moralOutcomeInstruction(outcome: string | undefined): string | undefined {
  switch (outcome) {
    case "positive":
      return "End well: the character's good choice leads somewhere good.";
    case "learning":
      return "End with the character understanding something not understood at the start. That change is the ending.";
    case "consequences":
      return "A poor choice should lead to a real consequence the character has to face. Do not soften it into a happy ending, and do not moralise about it.";
    case "creative":
      return "Resolve it in a way the reader will not have predicted, without cheating the setup.";
    default:
      return undefined;
  }
}

/**
 * The assembled brief, in sections rather than one flat list.
 *
 * The old brief emitted ~14 equally-weighted bullets under the instruction
 * "The story must be built around these details:". A model handed a bullet list
 * uses every bullet -- that is what a list is for -- so hair colour carried the
 * same weight as the theme, and every story dutifully mentioned brown hair and
 * the rabbit. That is the cookie-cutter mechanism.
 *
 * Sections let each part carry its own verb: WHO is portrayal guidance, WHAT is
 * the thing to invent around, HOW is a constraint. Same information, different
 * instructional weight.
 */
/**
 * One person in the story.
 *
 * `name` is carried apart from `identity` because it is needed in list
 * positions -- the "also in this story" roll, the chapter line, the image line
 * -- and re-extracting it from a rendered sentence is worse than storing it.
 */
export type BriefCharacter = {
  name: string;
  /** "Mia, aged 8, a girl." */
  identity: string;
  /**
   * What must stay true of them, if a parent said so. Carried apart from
   * `identity` because the chapter projection reduces the supporting cast to
   * names, and this is the one thing about them that must survive that.
   */
  mustHold?: string;
  /** Appearance, hobbies, companions. Colour, not requirements. */
  colour: string;
  /**
   * What they can do, as five numbers. Absent for a character who has never
   * spent a point, which is what keeps this free for everyone who has not.
   */
  stats?: CharacterStats;
  /** False when this character opted out of stats entirely. */
  statsEnabled?: boolean;
  /**
   * Named skills. Absent on every brief frozen before this shipped, and
   * story_jobs.brief is written at enqueue and never rewritten -- so every
   * reader below treats absence as "none" rather than reaching for a length.
   */
  skills?: CharacterSkill[];
};

/**
 * Everything a character's COLOUR slot says: looks, nature, what they like,
 * their companion, whatever their owner wrote about them.
 *
 * Lifted out of the lead's construction unchanged, because a story with no
 * main character gives every character this same treatment (up to three of
 * them) -- and two copies of it would drift the first time one was edited.
 * The lead still passes the request-level extras it alone owns: the quick
 * character's fields, and the companion `animal`, which is one per story
 * rather than one each ("give it a name and a personality" eight times is a
 * menagerie, not a cast").
 *
 * The golden briefs are the proof this move changed nothing: cases 1-5 render
 * character for character what they always did.
 */
function fullColour(f: {
  name: string;
  kind?: string;
  hair?: string;
  eyes?: string;
  personality?: string;
  hobby?: string;
  favoriteColor?: string;
  animal?: string;
  category?: CharacterCategory;
  notes?: string;
}): string {
  const traits: string[] = [];
  // The noun follows what they are: hair, fur, feathers, scales, plating. The
  // stored field is `hair` whatever the answer, and a character with no
  // category -- which is every character saved before this -- gets "hair".
  if (isSet(f.hair)) traits.push(`${f.hair} ${coveringNoun(f.category, f.kind)}`);
  if (isSet(f.eyes)) traits.push(`${f.eyes} eyes`);
  if (isSet(f.personality)) traits.push(`a ${f.personality} nature`);
  const colourParts: string[] = [];
  if (traits.length) colourParts.push(`${f.name} has ${traits.join(", ")}.`);
  if (isSet(f.hobby)) colourParts.push(`${f.name} likes ${f.hobby}.`);
  if (isSet(f.favoriteColor)) colourParts.push(`Favourite colour: ${f.favoriteColor}.`);
  if (f.animal) {
    colourParts.push(
      `${f.name} has ${article(f.animal)} ${f.animal} as a companion; give it a name and a personality.`,
    );
  }
  // Whatever the user wrote about them, LAST and SOFT. It is the one field a
  // child can type into freely, so it must not be able to act as an
  // instruction: colour is followed by "use these details only where a scene
  // naturally calls for them", and it never goes near userInstructions.
  if (isSet(f.notes)) colourParts.push(sentence([f.notes]));
  return colourParts.join(" ");
}

/** Up to three share the lead's description; beyond that, the ration. */
const ENSEMBLE_FULL_DETAIL_MAX = 3;

/**
 * The premise line for "leave it open", named because two readers need it.
 *
 * It is written into the premise when the brief is built, and it is how
 * `deserialiseBrief` recognises a cliffhanger in a brief frozen before
 * `cliffhanger` was a field -- those jobs are in flight across this deploy,
 * and getting it wrong would order a homecoming into a story whose own
 * premise forbids one.
 */
export const CLIFFHANGER_PREMISE =
  "Do NOT resolve this story. End it at a moment that makes the reader " +
  "want the next one -- a decision not yet made, a door not yet opened, " +
  "a question just asked. Still finish the SCENE properly: an unresolved " +
  "story is not an unfinished sentence, and a child should not feel the " +
  'story broke off. Do not write "to be continued".';

export type StoryBrief = {
  /**
   * The people in this story. Index 0 is the protagonist.
   *
   * Every projection treats index 0 differently from the rest, and that is the
   * whole design: eight equal names is eight protagonists, which is the
   * multi-character form of the character-sheet tour this brief already exists
   * to prevent.
   */
  cast: BriefCharacter[];
  /**
   * A retelling with nobody invented walking through it.
   *
   * EXPLICIT, because the thing it replaced was an inference. Both the full
   * brief and the per-chapter prompt need this fact, and they used to derive it
   * separately -- one from "is the lead's colour empty", the other not at all.
   * A child who simply has no hair or hobby recorded ALSO has empty colour, so
   * the proxy could not tell "there is no child" from "there is a child nobody
   * described", and the two prompts could contradict each other in the same
   * generation. Carried on the brief so there is one answer.
   */
  soloRetelling: boolean;
  /**
   * Nobody is the protagonist: the story belongs to the whole cast.
   *
   * Carried like soloRetelling rather than derived: the full brief and the
   * chapter projection both need it, and two derivations of one fact is how
   * two prompts in the same generation come to disagree. False for every brief
   * frozen before this existed, which is what those stories meant.
   */
  ensemble: boolean;
  /**
   * The reader asked for the story NOT to be resolved.
   *
   * Carried for the same reason as the two above: the premise already says
   * "Do NOT resolve this story", and the quest shape and the last chapter's
   * instruction both need to know it so they do not order a homecoming the
   * premise has just forbidden. Deriving it twice from the request is how two
   * prompts in one generation come to contradict each other -- which is the
   * failure this whole change is about.
   */
  cliffhanger: boolean;
  /** What the story is about -- the thing to actually invent around. */
  premise: string[];
  /** Constraints on how it is written. */
  craft: string[];
  /**
   * The Lion Tails world, for a quest. `canon` is the full section; `anchor`
   * is the handful of rules repeated into every chapter. Absent for every
   * other kind of story, and for every brief frozen before this existed --
   * those render exactly as they did.
   */
  world?: {
    canon: string[];
    anchor: string;
    /**
     * Who among THIS cast has been to the shop before, and what that changes
     * about the opening. Per story, unlike the canon, which is why it is a
     * field of its own rather than another canon line -- and why the canon's
     * word cap is not asked to absorb a cast of eight.
     *
     * Absent on every brief frozen before it existed, and those render exactly
     * as they did.
     */
    familiarity?: string;
  };
  /**
   * The per-chapter form of the rules a character in a real account lives by:
   * stays on their mission, does not die, does not change history. The full
   * brief says them at length; a chapter prompt used to say nothing, and a
   * long story forgot them by chapter 3.
   */
  participationAnchor?: string;
  /** Free-text steering from the user. Deliberately last and unqualified. */
  userInstructions?: string;
  /**
   * Universe continuity: what is already true. Never the plot of this story.
   *
   * THREE TIERS, and the grading is the point. Handed one undifferentiated list
   * of facts a model treats it as a checklist and writes the same story again,
   * so a world that remembers becomes a world that repeats. Each tier is
   * rendered with its own force -- identity, constraint, invitation -- and the
   * third being explicitly optional is what lets the next story be different.
   */
  continuity?: {
    /** Human-pinned. Hardest of all: never forget. */
    canon: string[];
    /** Prose background for the reader of the prompt. */
    summary?: string;
    /** Extracted after each story. See lib/worldState.ts. */
    world?: { characters: string[]; facts: string[]; threads: string[] };
  };
  /**
   * A real account the story must be FAITHFUL to rather than invent around.
   *
   * The whole point of this field is that the model is not asked to remember
   * anything. The brief used to say "Draw on this biblical event: noah." -- the
   * slug, with no account attached -- and then, two sections later, "Invent the
   * events yourself." Those are contradictory instructions and the model
   * resolved them the only way it could.
   */
  sourceMaterial?: {
    kind: "biblical-event" | "hero-of-faith";
    label: string;
    passage?: string;
    /**
     * When and where this LOOKS like, for the illustrator.
     *
     * Separate from `passage` because they answer different questions and only
     * one of them helps a picture: "Genesis 37; 39-45; 50" is where to read the
     * account, and "Egypt of the Middle Kingdom, around 1800 BC" is what to
     * draw. The image projection used to carry neither, so every historical
     * story was illustrated in no particular century.
     */
    era?: string;
    account: string;
    keyVerse?: { reference: string; text: string; translation?: string };
    cautions: string[];
  };
};

export function buildStoryBrief(
  request: StoryRequest,
  /**
   * The cast, protagonist first, already resolved and already owned by this
   * user. REQUIRED rather than optional: db-storage.saveStory records what an
   * optional parameter costs -- "the optional heroId parameter is exactly why
   * hero_id is NULL on nearly every row" -- and a silently empty cast here
   * produces a perfectly valid story about nobody in particular.
   */
  characters: Character[],
  continuity?: StoryBrief["continuity"],
  hero?: HeroOfFaith,
  /**
   * How many quests each character has already been on, by id. Counted and
   * FROZEN at enqueue like everything else here: a character's fifth quest
   * must still read as their fifth if the job is retried next week.
   *
   * Optional, and omitted by every caller that does not have it -- the brief
   * then says nothing about who has been before, which is how it read until
   * now and is what keeps the golden fixtures for non-quest cases still.
   */
  visits?: Record<string, number>,
): StoryBrief {
  // The LEAD. Everything below this line that builds identity and colour is
  // unchanged from the single-character version, deliberately: a request with
  // one character or none must render byte-identically, and
  // tests/storyBrief.test.ts asserts exactly that against captured strings.
  const details = characters[0];
  const supporting = characters.slice(1);
  /** Nobody is the protagonist. Read through the helper: see isEnsemble(). */
  const ensemble = isEnsemble(request);

  /**
   * The inline character the form collects when nobody picked a saved one.
   *
   * ALL OR NOTHING against `details`, not merged field by field. The old code
   * took each field from the saved character "or" this shape, which meant a
   * saved character who had left a field blank silently inherited a stranger's
   * value from a form section that was not even on screen. Once a field can be
   * genuinely unset -- which is the point of removing the defaults -- that stops
   * being theoretical.
   */
  const d = details ? undefined : request.characterDetails;

  const name = details?.name || request.childName || "A character";
  // What they ARE. characterKind() is the one place that knows the widened
  // `kind` and the legacy `gender` are the same fact.
  const kind = characterKind(details) || request.gender;
  const age = details?.age ?? d?.age;
  const hair = details?.hair || d?.hair;
  const eyes = details?.eyes || d?.eyes;
  const favoriteColor = details?.favoriteColor || d?.favoriteColor;
  const hobby = details?.hobby || d?.hobby;
  const personality = details?.personality || d?.personality;
  const favoriteAnimal = details?.favoriteAnimal || d?.favoriteAnimal;

  const animalRaw = request.useAnimal === false ? undefined : request.animal || favoriteAnimal;
  const animal = isSet(animalRaw) ? animalRaw : undefined;

  // ---- The real account, if there is one ------------------------------------
  // Built FIRST because it changes what the sections below are allowed to say.
  const event = getBiblicalEvent(request.biblicalEvent);
  let sourceMaterial: StoryBrief["sourceMaterial"];
  if (event) {
    sourceMaterial = {
      kind: "biblical-event",
      label: event.label,
      passage: event.passage,
      era: event.era,
      account: event.anchor,
      keyVerse: { ...event.keyVerse, translation: "World English Bible" },
      cautions: event.cautions,
    };
  } else if (hero) {
    // A hero of faith is a real person, so the same rule applies: supply the
    // biography rather than the name. heroesOfFaith.ts has carried timePeriod,
    // contribution, keyEvents and a verse for every one of the fifteen heroes
    // all along, and the prompt received none of it.
    // A history event carries a year and a Scripture event carries a
    // reference -- types.ts says so, and the 39 bible-* heroes deliberately
    // have no year. Interpolating e.year regardless put the literal word
    // "undefined" in front of all six of Caleb's events, in the ACCOUNT block
    // the model is told to follow, and threw the chapter-and-verse away.
    const events = (hero.keyEvents ?? [])
      .map((e) => {
        const when = e.year || e.reference;
        return when ? `${when}: ${e.description}` : e.description;
      })
      .join("; ");
    /**
     * WHERE THEY LIVED, not just when. Both are on every hero and only one
     * was being used.
     */
    const when = [hero.timePeriod, hero.place].filter(Boolean).join(", ");
    sourceMaterial = {
      kind: "hero-of-faith",
      label: hero.name,
      passage: when || undefined,
      // The same two fields, now reaching the illustrator as well as the prose.
      era: when || undefined,
      account: [
        hero.description,
        hero.contribution,
        /**
         * THE BIOGRAPHY. 250-350 words, hand-written and hand-checked, and
         * until now read by nothing at all.
         *
         * Every hero story this app has ever produced was written from
         * `description` -- the one-sentence blurb on the card ("Hid Jewish
         * families in her father's watch shop.") -- plus `contribution` and a
         * list of key events. All 80 heroes have carried the long form the
         * whole time; `biography` appeared nowhere in this file.
         *
         * That is the difference between a model working from a caption and a
         * model working from an account. It is the same argument that put the
         * biblical event's `anchor` here rather than its slug: supply the
         * material, do not ask the model to remember the person.
         */
        hero.biography,
        // The events list has no terminator of its own, so without this the
        // account read "...the springs she asks for In their own words:".
        events && `Key events -- ${events}.`.replace(/\.\.$/, "."),
        hero.famousQuote && `In ${hero.name}'s own words: "${hero.famousQuote}"`,
      ]
        .filter(Boolean)
        .join(" "),
      keyVerse: hero.bibleVerse,  // no translation: see note in renderBrief
      cautions: [
        `${hero.name} was a real person who really lived. Do not invent events for ${hero.name} that did not happen, and do not move ${hero.name} to another century or country.`,
        `${hero.name}'s faith is what the story is for. Do not reduce ${hero.name} to a list of achievements.`,
        /**
         * What they got wrong, where the data says it plainly.
         *
         * `complications` is already shown to READERS on the Heroes page, in a
         * box deliberately not hidden behind a tab -- and it reached no prompt,
         * so the story was the one place the app rounded a person off. A
         * caution rather than account text: it is an instruction not to tidy,
         * which is the shape every other line in this array has.
         */
        hero.complications &&
          `Do not tidy this away: ${hero.complications}`,
      ].filter((c): c is string => Boolean(c)),
    };
  }

  // ---- WHO: identity, as a sentence rather than a checklist -----------------
  // A retelling has its own cast. When the form supplied a placeholder name
  // there is no child in this story, and saying there is one hands the model a
  // protagonist to displace Noah with.
  /**
   * Is the character IN the account, or is this a straight retelling?
   *
   * Two modes put them there and they are mutually exclusive: they travel to
   * it, or they were always part of it. Either way they are in the scene, so
   * everything downstream that asks "is anybody here" asks THIS, and only the
   * premise below cares which of the two it was.
   *
   * A placeholder name is never in the scene whatever the mode says: the form
   * writes the literal string "Character" for the historical tab, and
   * "Character travels back in time" is not a sentence anyone meant.
   */
  const placeholder = isPlaceholderName(name);
  const role = characterRoleOf(request);
  const childInScene = role !== "absent" && !placeholder;

  /**
   * The child is not a participant, so the prompt is about the account.
   *
   * THIS USED TO TEST THE NAME, and that is the bug it now fixes. The condition
   * was isPlaceholderName(name) && sourceMaterial, so a retelling requested with
   * a REAL child's name fell through: the brief named her as the subject, the
   * chapter projection told every chapter to keep the story about her, and the
   * model did as it was told and wrote her into the wilderness of Paran.
   *
   * It went unnoticed because the app's own hero stories pass the literal
   * "Character", which took the placeholder branch and looked correct. It
   * surfaced when a child called Esther was given a story about Caleb -- and
   * because her name is itself a major biblical figure, an inserted child read
   * as the app confusing two people in Scripture. It was not: the account was
   * accurate throughout. She had simply been put inside it.
   *
   * Keyed on participation, not on what the name looks like.
   */
  const anonymous = Boolean(sourceMaterial) && !childInScene;
  const who = [name];
  if (age) who.push(`aged ${age}`);
  // WHAT THEY ARE goes in the identity slot, not in colour. "Is a dragon" is a
  // hard fact a story must not contradict, unlike brown fur, and it occupies
  // exactly the slot "a girl" already filled -- so a cast of eight non-humans
  // costs one clause each rather than a share of the colour ration below.
  if (isSet(kind)) who.push(`${article(kind!)} ${kind}${sexTag(details?.sex, kind)}`);
  const identity = anonymous
    ? sourceMaterial!.kind === "hero-of-faith"
      ? `${sourceMaterial!.label}, and the people around them.`
      : `the people in the account of ${sourceMaterial!.label}.`
    // mustBeTrue rides in identity because identity is what the chapter
    // projection reprints with "Keep this consistent." As colour it would be
    // followed by "use these details only where a scene naturally calls for
    // them", which is the wrong thing to say about a wheelchair.
    //
    // Punctuated as two sentences rather than passed to sentence() as two
    // parts: that helper terminates only the LAST part, so a single call
    // produced "Mia, aged 8, a girl Mia uses a wheelchair." -- the same
    // ungrammatical input the companion-animal comment above records a model
    // reacting badly to. Written this way, the no-notes case is character for
    // character the expression it has always been.
    : isSet(details?.mustBeTrue)
      ? `${sentence([who.join(", ")])} ${sentence([details!.mustBeTrue])}`
      : sentence([who.join(", ")]);

  // ---- Colour: usable if it fits, never required ---------------------------
  const colour = anonymous
    ? ""
    : fullColour({
        name, kind, hair, eyes, personality, hobby, favoriteColor, animal,
        category: details?.category, notes: details?.notes,
      });

  // ---- WHAT: the thing to invent around ------------------------------------
  const premise: string[] = [];
  // The theme defaulted to "faith and kindness" whether or not the user chose
  // one, and then sat in the prompt as a peer of the account -- so a Noah story
  // was told to be about the flood AND about faith and kindness, and the vaguer
  // of the two is the easier to satisfy. With a real account in hand the
  // account IS the subject; a theme only appears if the user actually picked one.
  if (isSet(request.theme)) premise.push(`Theme: ${request.theme}.`);
  else if (!sourceMaterial) premise.push("Theme: faith and kindness.");
  // The unresolved slug/uuid lines that used to live here are gone: the event
  // and the hero now arrive as sourceMaterial, with the account attached.
  if (!event && isSet(request.biblicalEvent)) {
    // An unrecognised slug. Say the words rather than the identifier.
    premise.push(`Draw on this biblical event: ${request.biblicalEvent}.`);
  }
  if (!hero && isSet(request.heroOfFaith) && !/^[0-9a-f-]{16,}$/i.test(request.heroOfFaith)) {
    premise.push(`Feature this hero of faith: ${request.heroOfFaith}.`);
  }
  if (isSet(request.biblePassage)) premise.push(`Draw on this passage: ${request.biblePassage}.`);
  let participationAnchor: string | undefined;
  let world: StoryBrief["world"];
  if (childInScene) {
    const p = participationPremise(role, name, Boolean(sourceMaterial), request);
    premise.push(...p.lines);
    /**
     * With no main character, the lines above name only the first of them.
     *
     * Said HERE for the reason the visit counts below are: participationPremise
     * knows one name, and the whole cast matters. Two sentences rather than
     * rewriting those lines per character -- they are long, and eight copies of
     * "X was there, not a visitor" is the character-sheet tour in another form.
     *
     * The quest line answers the question the canon leaves open for a group,
     * and it does it WITHOUT touching the canon, which is capped by a test and
     * written in the singular on purpose: one of them carries the stone, and
     * "the traveller" is read as all of them.
     */
    if (ensemble) {
      premise.push(
        `Where the lines above name one of them, they are true of every one of them.`,
      );
      if (role === "travels") {
        premise.push(
          `They go together. One of them carries the stone and the others take ` +
            `hold when it opens, they arrive and leave in the same moment, and ` +
            `where the world's rules say "the traveller" they mean all of them.`,
        );
      }
    }
    participationAnchor = p.anchor;
    world = p.world;
    /**
     * Who has been before. Attached HERE rather than inside
     * participationPremise, which knows only the lead's name -- the whole cast
     * matters, because a newcomer beside a veteran is the point.
     *
     * Omitted entirely when the caller has no counts, so a brief built without
     * them is the brief that was built before this existed.
     */
    if (world && visits) {
      const familiarity = questFamiliarity(
        characters.map((c) => ({ name: c.name, visits: visits[c.id] ?? 0 })),
      );
      if (familiarity) world = { ...world, familiarity };
    }
  }

  // Scope. Without it, "a story about Corrie ten Boom" gets a life summary --
  // born here, did this, died there -- which is the failure this exists to fix.
  // Placed in premise rather than craft because it is WHAT the story is about,
  // not how it is written, and premise is what the outline is planned from.
  const focus = request.storyFocus;
  /**
   * A whole life, on a quest, is a SHAPE and not a summary.
   *
   * The instruction below covers one episode. Its absence used to cover
   * nothing at all, and that is the case the scope rule was written about --
   * "a story about Corrie ten Boom gets a life summary, born here, did this,
   * died there". A quest about C. S. Lewis with no episode chosen came back as
   * a tour of Oxford in 1931, a BBC microphone in 1941 and the Narnia years.
   *
   * Allowed rather than refused, because the lantern-stone gave a whole life a
   * mechanism it did not have: it wakes and carries them elsewhere in the same
   * account, and the figure meets the same traveller years apart and remembers
   * them (DEVICE.rules, CANON.seenAgain). Three real scenes across a life is
   * that device working, not the failure it used to be. What is refused is the
   * thing in between -- narrating the years to join the scenes up.
   *
   * QUEST ONLY: world is set for "travels" and nothing else, and on an
   * ordinary retelling a whole life has no stone to move through it.
   */
  const wholeLifeQuest = world && (!focus || focus.mode === "whole" || !isSet(focus.text));
  if (wholeLifeQuest && sourceMaterial?.kind === "hero-of-faith") {
    premise.push(
      `This story covers more than one moment of ${sourceMaterial.label}'s ` +
        "life. Choose two or three, far apart, that belong together, and play " +
        "each as a real scene -- somewhere, with someone, something happening. " +
        "Do not narrate the years between those moments: the stone carries the " +
        "traveller across, and the gap is felt rather than explained.",
    );
  }
  if (focus && focus.mode !== "whole" && isSet(focus.text)) {
    premise.push(
      `This story covers ONE episode${focus.reference ? ` (${focus.reference})` : ""}: ${focus.text}`,
    );
    premise.push(
      "Tell that episode properly -- the lead-up, what happened, and what it " +
        "cost. Do not summarise the rest of that life around it, and do not " +
        "open with a birth or close with a death.",
    );
  }
  // Suppressed for a retelling. moralOutcome is chosen at random when the user
  // does not pick one, and "a poor choice should lead to a real consequence, do
  // not soften it into a happy ending" is a direct instruction to change how the
  // account of Noah ends. The account already has an ending; it is not ours to
  // assign. This is the same class of conflict as "invent the events yourself".
  //
  // A cliffhanger is the SECOND case on this line, for the same reason. The
  // user has said the story is not over; moralOutcome would tell it to resolve.
  // Two instructions that contradict, and the model picks one -- which is how
  // "leave it open" produced a tidy ending and looked like the flag doing
  // nothing.
  const ending =
    sourceMaterial || request.cliffhanger
      ? undefined
      : moralOutcomeInstruction(request.moralOutcome);
  if (ending) premise.push(ending);
  if (request.cliffhanger) premise.push(CLIFFHANGER_PREMISE);

  // ---- HOW ------------------------------------------------------------------
  const craft: string[] = [];
  // The AGE, not the slug. "Reading level: early-elementary." asked the model
  // to know what an American school stage implies about a reader, and it got
  // away with it only because every persona also said "children". That word is
  // gone, so this line now carries the whole guard rail on its own.
  craft.push(`Written for a reader ${readingLevelAges(request.readingLevel)}.`);
  if (isSet(request.learningFocus)) craft.push(`Learning focus: ${request.learningFocus}.`);
  const form = storyFormFor(request.storyType);
  if (form.craft) craft.push(form.craft);

  /**
   * With no main character, everybody gets the lead's description -- up to
   * three of them.
   *
   * Blake asked for "no main character" and chose equal-and-full for two or
   * three. The ceiling is the same argument the two-fact ration below is built
   * on: one character is about six facts, and eight at parity is forty-eight,
   * the character-sheet tour at eight times scale. Three is a dozen more facts
   * than today's shape, which a story can carry; beyond that everyone but the
   * first drops back to the ration.
   *
   * Not for a retelling nobody was written into (`anonymous`): there the cast
   * is not in the story at all, and describing them fully would be describing
   * people the reader never meets.
   */
  const shareEverything = ensemble && !anonymous && characters.length <= ENSEMBLE_FULL_DETAIL_MAX;

  // Supporting cast: a name, an identity sentence, and AT MOST TWO FACTS.
  //
  // Not parity with the lead, and the arithmetic is the argument. One character
  // contributes about six facts today; eight at parity is forty-eight, which is
  // the character-sheet tour at eight times scale. Eyes and favourite colour go
  // first because they are pure sheet data with nothing for a scene to do, and
  // the companion animal goes because "give it a name and a personality" eight
  // times is a menagerie, not a cast.
  const cast: BriefCharacter[] = [
    { name, identity, colour, stats: details?.stats, statsEnabled: details?.statsEnabled, skills: details?.skills },
    ...supporting.map((c): BriefCharacter => {
      const who = [c.name];
      if (c.age) who.push(`aged ${c.age}`);
      // The same widening as the lead, and it has to be here too: a supporting
      // dragon read through the old line rendered "Ember, aged 300." -- the
      // hard fact about her silently gone, because `gender` was empty and
      // nothing else was consulted.
      const ckind = characterKind(c);
      if (isSet(ckind)) who.push(`${article(ckind!)} ${ckind}${sexTag(c.sex, ckind)}`);
      const trait = isSet(c.personality)
        ? `a ${c.personality} nature`
        : isSet(c.hair)
          ? `${c.hair} ${coveringNoun(c.category, ckind)}`
          : undefined;
      const likes = isSet(c.hobby) ? `likes ${c.hobby}` : undefined;
      const both = trait && likes ? `${c.name} has ${trait} and ${likes}.` : undefined;
      // Their note fills the slot only when nothing else would. Notes are the
      // lead's field by default, but a supporting character with no
      // personality, hair or hobby renders an empty colour -- the two-fact
      // ration spends nothing on them AND the one thing their owner actually
      // wrote gets dropped. Using it here costs the budget nothing it was not
      // already willing to spend, and it is still capped at one fact.
      const one = trait
        ? `${c.name} has ${trait}.`
        : likes
          ? `${c.name} ${likes}.`
          : isSet(c.notes)
            ? sentence([c.notes])
            : "";
      // mustBeTrue rides along even here, where everything else is rationed.
      //
      // It was lead-only, so the SAME character moved from first to second in
      // the cast lost her wheelchair from all four projections -- and silently,
      // which is the worst way to lose it. The two-fact ration is an argument
      // about COLOUR: six decorative facts times eight characters is a
      // character-sheet tour. This is not colour. It is the one field a parent
      // typed because it must not be got wrong, so it should be the last thing
      // cut at eight characters rather than the first. It is opt-in and capped
      // at 200 characters, so a cast without one pays nothing.
      return {
        name: c.name,
        stats: c.stats,
        statsEnabled: c.statsEnabled,
        skills: c.skills,
        identity: isSet(c.mustBeTrue)
          ? `${sentence([who.join(", ")])} ${sentence([c.mustBeTrue])}`
          : sentence([who.join(", ")]),
        mustHold: isSet(c.mustBeTrue) ? c.mustBeTrue : undefined,
        // The same description the lead gets, when nobody is the lead. No
        // `animal`: the companion is one per story, not one each.
        colour: shareEverything
          ? fullColour({
              name: c.name, kind: ckind, hair: c.hair, eyes: c.eyes,
              personality: c.personality, hobby: c.hobby,
              favoriteColor: c.favoriteColor, category: c.category, notes: c.notes,
            })
          : (both ?? one),
      };
    }),
  ];

  return {
    cast,
    soloRetelling: anonymous,
    ensemble,
    cliffhanger: request.cliffhanger === true,
    premise,
    craft,
    ...(world ? { world } : {}),
    ...(participationAnchor ? { participationAnchor } : {}),
    userInstructions: isSet(request.customPrompt) ? request.customPrompt : undefined,
    continuity:
      continuity &&
      (continuity.canon.length > 0 ||
        continuity.summary ||
        (continuity.world &&
          continuity.world.characters.length +
            continuity.world.facts.length +
            continuity.world.threads.length >
            0))
        ? continuity
        : undefined,
    sourceMaterial,
  };
}

/**
 * What each prompt site needs, which is not the same thing.
 *
 * A chapter needs identity so the character stays the same person; it does not
 * need her hair colour an eighth time. The old code re-injected the entire
 * brief into every chapter prompt as "details which must stay consistent", so
 * on a seven-chapter story the model was told every attribute eight times, each
 * time as a mandatory constant.
 */
export type BriefPurpose = "single" | "outline" | "chapter" | "image";

/**
 * How the stat sheet is written into the prompt.
 *
 * "table" gives the model every number, which is the only form that can answer
 * "who here is strongest" -- eight separate prose clauses cannot. "prose"
 * mentions only the notable ones and is the fallback if numbers turn out to
 * leak into stories. "off" removes the block entirely.
 *
 * An env var rather than a constant because the answer is empirical and we do
 * not have it yet: the risk is that a five-number block is the most list-shaped
 * thing in the brief, and decisions.md §24 measured a model taking up all three
 * "optional" threads it was handed. Switching this costs a restart rather than
 * a deploy, which is what makes an A/B on the dev rig cheap.
 */
export const ABILITY_STYLE = (process.env.CHARACTER_STATS_STYLE ?? "table") as
  | "table"
  | "prose"
  | "off";

const STAT_LABELS: Record<CharacterStat, string> = {
  strength: "Str",
  agility: "Agi",
  constitution: "Con",
  wisdom: "Wis",
  heart: "Hrt",
};

/** How a single notable stat reads, when written out rather than tabulated. */
const HIGH_PHRASE: Record<CharacterStat, string> = {
  strength: "stronger than most",
  agility: "quick on the feet",
  constitution: "able to keep going long after others stop",
  wisdom: "quick to notice and work things out",
  heart: "steady when things are frightening",
};
const LOW_PHRASE: Record<CharacterStat, string> = {
  strength: "not strong",
  agility: "slow and easily out-paced",
  constitution: "tires quickly",
  wisdom: "slow to notice what is going on",
  heart: "easily frightened",
};

/**
 * WHAT EACH OF THEM CAN DO.
 *
 * The fourth force in this brief, after identity (hard), colour (soft) and
 * threads (explicitly optional). This one is CONSULTED, NOT NARRATED: it exists
 * to settle moments the story has already created, and the instruction has to
 * say so, because a model handed a trait writes a scene to display it -- which
 * is the same failure colour needed its own disclaimer for.
 *
 * Two lines are load-bearing and should not be trimmed as padding:
 *
 *   "Never write a number, never name a stat" -- forbids the VOCABULARY, not
 *   just the emphasis. Without it you get "with her great strength, Ember
 *   lifted the beam", which is a game manual, not a bedtime story.
 *
 *   "let it decide AGAINST them" -- without it every stat becomes a triumph,
 *   weakness never costs anybody anything, and the one who cannot lift the beam
 *   stops being the reason somebody else has to. That is usually where the
 *   lesson of the story lives.
 *
 * Renders NOTHING when every character is untouched, so a cast that has never
 * spent a point costs zero tokens and reads exactly as it did before.
 */
function renderAbilities(cast: BriefCharacter[]): string {
  if (ABILITY_STYLE === "off") return "";
  // EVERYONE is in the table, including characters who have never spent a
  // point -- they show the baseline. A cast member missing from it is a
  // character the model cannot place: is Mia stronger than Ember or not? The
  // whole reason for giving numbers rather than prose is that the comparison
  // is answerable, and a partial table is not.
  const sheets = cast
    .filter((c) => c.statsEnabled !== false)
    .map((c) => ({ name: c.name, stats: statsOf(c), skills: notableSkills(c) }));
  // Skills count as "touched" too. Keyed on attributes alone, a character who
  // is ordinary at all five but good at climbing would be suppressed entirely
  // -- and climbing is exactly the thing worth saying about them.
  const touched = sheets.filter(
    (c) => CHARACTER_STATS.some((s) => c.stats[s] !== STAT_BASE) || c.skills.length > 0,
  );
  // Nobody has spent anything, so there is nothing to say and a cast of
  // untouched characters costs no tokens at all.
  if (touched.length === 0) return "";

  /**
   * Skills are named, so they cannot be columns -- and they are the half of
   * this block that says something a number cannot. Prose under the table,
   * only for characters who have any, and only the ones spent on.
   */
  const skillLines = sheets
    .filter((c) => c.skills.length > 0)
    .map((c) => {
      const said = c.skills.map(
        // Graded for a scale that STARTS at 1, not one centred on an ordinary
        // 3. A skill at 1 is somebody who has just taken it up, not somebody
        // bad at it -- "poor at climbing" would be wrong about the commonest
        // case. And the word "skill" never appears in what the model is told:
        // it is the word the leak detector watches for.
        (sk) =>
          `${
            sk.value >= STAT_NOTABLE_HIGH
              ? "very good at"
              : sk.value >= SKILL_COMPETENT
                ? "good at"
                : "a beginner at"
          } ${sk.name}`,
      );
      // "A, B, and C" rather than "A, and B, and C" -- with six skills the
      // repeated "and" reads as a list the model is meant to work through.
      const list =
        said.length > 1 ? `${said.slice(0, -1).join(", ")}, and ${said[said.length - 1]}` : said[0];
      return `  ${c.name} is ${list}.`;
    });

  const guidance =
    "Reference, not content. Never write a number, never name a stat, and never " +
    "call anyone strong or weak. Do not build a scene to show any of it off. It " +
    "is here only for moments the story reaches on its own -- who gets the door " +
    "open, who spots the crack in the wall, who is still going at the end -- and " +
    "it should decide those AGAINST them as readily as for them: the one who " +
    "cannot lift the beam is why somebody else has to.";

  if (ABILITY_STYLE === "prose") {
    const lines = touched.map((c) => {
      const high = CHARACTER_STATS.filter((s) => c.stats[s] >= STAT_NOTABLE_HIGH).map((s) => HIGH_PHRASE[s]);
      const low = CHARACTER_STATS.filter((s) => c.stats[s] <= STAT_NOTABLE_LOW).map((s) => LOW_PHRASE[s]);
      const both = [...high, ...low];
      return both.length ? `  ${c.name} is ${both.join(", and ")}.` : "";
    }).filter(Boolean);
    const said = [...lines, ...skillLines];
    if (!said.length) return "";
    return ["WHAT EACH OF THEM CAN DO", ...said, guidance].join("\n    ");
  }

  // The whole sheet, for everyone, so "who here is strongest" is answerable.
  // The baseline is stated because a bare 7 means nothing: models compare
  // reliably and read absolute numbers badly, so anchor the scale and let them
  // compare.
  const width = Math.max(...sheets.map((c) => c.name.length));
  const header = `  ${"".padEnd(width)}  ${CHARACTER_STATS.map((s) => STAT_LABELS[s]).join("  ")}`;
  const rows = sheets.map(
    (c) =>
      `  ${c.name.padEnd(width)}  ` +
      CHARACTER_STATS.map((s) => String(c.stats[s]).padStart(STAT_LABELS[s].length)).join("  "),
  );
  return [
    "WHAT EACH OF THEM CAN DO",
    `  Scale 1-10. ${STAT_BASE} is ordinary for their age; ${STAT_NOTABLE_HIGH} is notable; 9 is rare.`,
    header,
    ...rows,
    // Named, so they cannot be columns. Under the table, above the guidance
    // that governs both halves.
    ...skillLines,
    guidance,
  ].join("\n    ");
}

/**
 * Is this a retelling with nobody invented to walk through it?
 *
 * One reader of one recorded fact. Both the full brief and the per-chapter
 * prompt ask this, and they MUST agree -- they disagreed before, and the
 * chapter prompt is the one repeated once per chapter, so it is the one the
 * story followed.
 */
/**
 * "Ellie and Lucy", "Ellie, Lucy and Sam" -- for a cast nobody leads.
 *
 * Exported because the note appended to every real-history story names the
 * same people, and two joiners would punctuate the same cast two ways in the
 * same story.
 */
export function nameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function noInventedChild(brief: StoryBrief): boolean {
  return brief.soloRetelling === true;
}

export function renderBrief(brief: StoryBrief, purpose: BriefPurpose): string {
  // Index 0 is the protagonist; every projection below leans on that.
  const lead = brief.cast[0];
  const others = brief.cast.slice(1);
  const otherNames = others.map((c) => c.name);
  /** Everyone, for the shape where nobody is first. */
  const everyone = nameList(brief.cast.map((c) => c.name));

  if (purpose === "image") {
    /**
     * WHEN THIS IS, which the illustrator was never told.
     *
     * The projection carried `sourceMaterial.label` and nothing else, so
     * "a scene from Joseph in Egypt" was all a picture ever knew -- no century,
     * no place, no idea what anyone wore. Blake: the modern age should look
     * like the modern age, and the era they are going to should match where
     * they are going.
     *
     * `passage` is deliberately still left out. It is chapter-and-verse, which
     * is not a place, and putting "Genesis 37; 39-45; 50" in front of an image
     * model invites it to draw the words.
     */
    const era = brief.sourceMaterial?.era ? ` It is set in ${brief.sourceMaterial.era}.` : "";
    /**
     * THE CROSSING OVER DRESSES THEM, which is canon as of this change.
     *
     * A traveller arrives from now. Drawn in their own clothes they are a
     * child in a fleece standing in Bronze Age Canaan, and drawn without a rule
     * they are whatever the model felt like. So the lantern outfits them, and
     * the picture has to know that -- CROSSING_OVER_DRESS says it once, and the
     * prose canon says the same thing so the story and the picture agree.
     */
    const dress = brief.world && brief.sourceMaterial?.era ? ` ${CROSSING_OVER_DRESS}` : "";
    // The stone rides in the pocket, in every quest picture -- the modern
    // opening included, which is why this is gated on world alone and not,
    // like the dress, on there being an era to dress for. See referencePlates.
    const stone = brief.world ? ` ${STONE_IN_PICTURES}` : "";

    // With no lead there is no one face to build the frame around, so the
    // subject is the group -- but the cap does not move: a picture with
    // everyone in it is a crowd whichever shape the story is.
    if (brief.ensemble) {
      const who = `${everyone}${brief.sourceMaterial ? ` -- a scene from ${brief.sourceMaterial.label}` : ""}.`;
      return (
        `${who}${era}${dress}${stone} ${brief.cast.map((c) => c.identity).join(" ")} ` +
        `Draw at most three of them -- a picture with everyone in it is a crowd, not a scene.`
      );
    }
    // The stone rides even with no source to be a scene from: world alone is
    // the fact "this is a quest", and a quest picture with nothing to dress
    // for still has a traveller with a pocket.
    const base = brief.sourceMaterial
      ? `${lead.identity} -- a scene from ${brief.sourceMaterial.label}.${era}${dress}${stone}`
      : `${lead.identity}${stone}`;
    if (others.length === 0) return base;
    // Naming everyone would put eight children in one frame. An illustration
    // is a moment, and a moment has two or three people in it.
    return (
      `${base} Also in the story: ${otherNames.join(", ")}. Draw ${lead.name} and ` +
      `at most two of the others -- a picture with everyone in it is a crowd, not a scene.`
    );
  }

  if (purpose === "chapter") {
    // Identity, plus canon only -- never the summary. The chapter prompt
    // already carries storySoFar and is the second-tightest prompt in the
    // system after finalizeStoryDetails, and the outline has already encoded
    // the narrative history into the plan.
    const facts = brief.continuity?.canon ?? [];
    const canonLine = facts.length
      ? ` These are already true and must not be contradicted: ${facts.join(" ")}`
      : "";
    // The cautions ride along into every chapter and the account does not.
    // Deliberate: the account is already encoded in the outline, but factual
    // drift is a per-chapter failure -- chapter 1 gets Noah right and chapter 5
    // has him rounding up the animals himself. The cautions are the cheapest
    // token-for-token thing in the brief and the only part that keeps working
    // once the outline has been written.
    const source = brief.sourceMaterial;
    const sourceLine = source
      ? ` This is a retelling of ${source.label}${source.passage ? ` (${source.passage})` : ""}; stay faithful to it and invent nothing that contradicts it.` +
        (source.cautions.length ? ` Do not get these wrong: ${source.cautions.join(" ")}` : "")
      : "";
    // NAMES ONLY for the supporting cast -- no ages, no colour. The whole
    // reason this projection exists is that re-injecting attributes per chapter
    // made a story a tour of the character sheet; eight characters is eight
    // times that. The dozen tokens the names cost buy something specific: the
    // outline has already decided who appears where, so chapter 5 naming a
    // child who does not exist, or forgetting one who does, is the failure this
    // prevents.
    // With no main character the same names carry the OPPOSITE instruction:
    // "use them only where the instruction calls for them" is what makes a
    // supporting character, and this projection writes every chapter -- so
    // without this the ensemble brief would say one thing in WHO THIS IS ABOUT
    // and the chapter prompt would quietly rebuild the lead. Caught by reading
    // the rendered brief rather than by any test.
    // AND NOBODY IS WRITTEN OUT. The crowd cap and the rule against announcing
    // an absence are in the full brief, which the outline reads and the chapter
    // writer does not -- so the one prompt that writes actual sentences had
    // nothing stopping it. "Ellie and Lucy were no longer beside her", a page
    // from the end of a four-character quest, is what that costs: to a reader
    // it is indistinguishable from a missing page. Leaving somebody out of a
    // chapter stays free; saying so does not.
    const noExits = " Leave out whoever this part does not need, silently -- never write a character out of the story.";
    const alsoLine = otherNames.length
      ? brief.ensemble
        ? ` This story has no main character: ${everyone} share it equally, the chapter follows whichever of them the instruction is about, and no one of them is the one the reader stays with. Do not add anyone who is not named here.${noExits}`
        : ` Also in this story: ${otherNames.join(", ")} -- use them only where this chapter's instruction calls for them, and do not add anyone who is not named here.${noExits}`
      : "";
    // The ONE exception to names-only. Everything else about a supporting
    // character is decoration that a chapter can do without; a must-be-true is
    // the opposite -- it is what a parent wrote down precisely so that chapter 5
    // does not have her climb the stairs. Guarded, so a cast with none of these
    // renders exactly as it did before.
    const holds = others.map((c) => c.mustHold).filter(Boolean);
    const holdLine = holds.length ? ` These must stay true: ${holds.join(" ")}` : "";
    // THE LINE THIS PROJECTION WAS MISSING.
    //
    // The full brief said "There is no invented child in this story"; this one
    // said "The story is about Esther, aged 8, a girl. Keep this consistent."
    // A medium story is the multi-chapter path, so both were sent -- and the
    // chapter prompt is the one repeated for every chapter. The model kept
    // Esther consistent, as instructed, by putting her in the wilderness of
    // Paran with Caleb.
    //
    // Two prompts in one generation must not contradict each other. They now
    // read the same predicate.
    const soloLine = noInventedChild(brief)
      ? ` ${SOLO_RETELLING_GUARD}`
      : "";
    // The two anchors. Participation sits beside the cast facts it is about;
    // the world sits beside the source, which is the account it frames.
    // Continuity canon stays last. Both empty for every brief that has none.
    const participationLine = brief.participationAnchor ? ` ${brief.participationAnchor}` : "";
    const worldLine = brief.world ? ` ${brief.world.anchor}` : "";
    const about = brief.ensemble
      ? `The story is about ${brief.cast.map((c) => c.identity).join(" ")} Keep this consistent.`
      : `The story is about ${lead.identity} Keep this consistent.`;
    return `${about}${soloLine}${alsoLine}${holdLine}${participationLine}${sourceLine}${worldLine}${canonLine}`;
  }

  const out: string[] = [];

  out.push("WHO THIS IS ABOUT");
  if (others.length > 0) {
    // Said BEFORE the names, so the model reads the whole roll knowing what
    // shape the story is. Said after, it has already decided by the time it is
    // told -- which is why the ensemble line sits in the same place.
    out.push(
      brief.ensemble
        ? `This story has no main character. It belongs to ${everyone} equally: ` +
            `the choices it turns on are theirs together, no one of them is the ` +
            `one the reader follows, and none of them is a helper in somebody ` +
            `else's story.`
        : `This is ${lead.name}'s story. The others are in it with ${lead.name}, but ` +
            `the choices the story turns on are ${lead.name}'s, and the reader stays ` +
            `with ${lead.name}.`,
    );
  }
  out.push(lead.identity);
  if (noInventedChild(brief)) {
    // No invented protagonist was supplied, so say so explicitly. Left silent,
    // a model asked for a children's story reaches for a child to put in it.
    out.push(
      SOLO_RETELLING_GUARD,
    );
  }
  if (lead.colour) out.push(lead.colour);
  if (others.length > 0) {
    out.push(
      brief.ensemble
        ? "AND, EQUALLY, THE REST OF THEM:"
        : `ALSO IN THE STORY -- ${others.length} ${others.length === 1 ? "other" : "others"}, present but not the subject:`,
    );
    for (const c of others) out.push(`  - ${[c.identity, c.colour].filter(Boolean).join(" ")}`);
  }
  // Straight after the names, because that is what it is about. See
  // ONE_PERSON_PRONOUNS.
  if (!brief.soloRetelling) out.push(ONE_PERSON_PRONOUNS);
  if (lead.colour || others.some((c) => c.colour)) {
    // The single most important line in the brief. Without it these details are
    // read as requirements and the story becomes a tour of the character sheet.
    out.push(
      "Use these details only where a scene naturally calls for them. Do not " +
        "introduce them as a list, and do not make appearance or companions the " +
        "subject of what happens.",
    );
  }
  const abilities = renderAbilities(brief.cast);
  if (abilities) out.push(abilities);
  if (others.length > 0) {
    // The multi-character analogue of the line above, and the failure it names
    // is specific: handed N equal entities a model round-robins them, giving
    // each a paragraph and a moment. Granting explicit permission to UNDER-USE
    // people is what stops that -- "some of them may say nothing at all" is
    // doing more work here than any instruction to be selective.
    const n = brief.cast.length;
    out.push(
      `These are ${n} people in one story, not ${n} stories. Do not give them a ` +
        `turn each, do not introduce them one after another, and do not write a ` +
        `scene whose only purpose is that everybody gets a moment. Some of them ` +
        `may say nothing at all -- that is better than a crowd in which nobody ` +
        `is anybody.`,
    );
    out.push(
      "Everyone in this story is named above. Do not rename them, do not merge " +
        // "children" for the same reason as above: a cast may be a dragon and
        // an owl, and "do not add extra children" does not forbid a third owl.
        "two of them into one, and do not add extra characters of your own.",
    );
    if (n >= 4) {
      // THE CAP IS ABOUT CROWDING A SCENE, AND IT WAS READ AS PERMISSION TO
      // DELETE PEOPLE. A four-character quest came back with its last chapter
      // instructed -- by its own outline -- to write "Elijah is waiting nearby,
      // while Ellie and Lucy are no longer beside Esther". Two of the four
      // children vanished a page from the end with no explanation, which to a
      // reader is indistinguishable from a missing page: Blake reported the
      // story as cut off. So the cap now says what it is about and what it is
      // not, in the same breath. Whoever sets out together comes back together;
      // leaving someone out of a scene is silent, and is never an event.
      out.push(
        "Keep no more than three of them in any one scene. The rest are " +
          "elsewhere, and the story does not have to say where. This is about " +
          "how many are in a scene, not about losing anyone: whoever sets out " +
          "together is still together at the end, and the story NEVER writes a " +
          "character out on the page -- no \"X was no longer beside her\", no " +
          "explaining where somebody went. Leave them out of the part and say " +
          "nothing about it.",
      );
    }
    if (brief.sourceMaterial) {
      // Without this, eight modern children reshape the flood.
      out.push(
        `The account comes first. ${brief.ensemble ? everyone : `${lead.name} and the others`} ` +
          `are visitors in it: they can watch, help and be afraid, but nothing ` +
          `they do changes what happens or how it ends.`,
      );
    }
    if (purpose === "outline") {
      // The outline is where per-chapter casting is actually decided, so this
      // is the one place the instruction can be acted on rather than admired.
      out.push(
        "Not every part needs everyone. Decide who is in each part and leave " +
          "the rest out of that part.",
      );
      // ONLY WHERE THE CAP APPLIES, because the leak is the cap being reasoned
      // about out loud. A real outline wrote "Lucy is elsewhere, so no more
      // than three of the named children are present in the scene" into its
      // own chapter instruction, and that instruction is handed verbatim to
      // the model that writes the chapter -- so the rule about the story
      // became a sentence in the story.
      if (n >= 4) {
        out.push(
          "Write what happens, never the casting. An outline that explains " +
            "who is absent and why hands that explanation to the writer of " +
            "that part, who puts it in the story.",
        );
      }
    }
  }

  if (brief.world) {
    // Its own heading, between who and what. Before the account so the frame's
    // opening precedes it; after the cast so the reader of the prompt knows
    // who is standing in the shop. Guarded, and the blank line is inside the
    // guard, so a brief with no world renders byte-for-byte as before.
    out.push("");
    out.push("THE WORLD THIS HAPPENS IN");
    out.push(...brief.world.canon);
    // After the canon, because it is about THIS cast rather than about the
    // world, and last so it is the most recent thing said before the account.
    if (brief.world.familiarity) out.push(brief.world.familiarity);
  }

  out.push("");
  if (brief.sourceMaterial) {
    const src = brief.sourceMaterial;
    const isBible = src.kind === "biblical-event";
    out.push(`WHAT IT IS ABOUT -- this is a RETELLING of ${src.label}${src.passage ? ` (${src.passage})` : ""}`);
    out.push(
      isBible
        ? "This really happened and is recorded in Scripture. Retell it. Do not invent a different version of it, and do not write a modern story that is merely inspired by it."
        : "This is a real person who really lived. Retell what that person actually did.",
    );
    out.push("");
    out.push("THE ACCOUNT -- follow this. It is what happened:");
    out.push(src.account);
    if (src.keyVerse) {
      out.push("");
      // Quoted exactly, and labelled as quoted, so the model reproduces it
      // rather than paraphrasing it into something that sounds like Scripture.
      // Only the biblical-event verses were fetched verbatim from a known
      // public-domain text, so only they carry a translation. The heroes' verses
      // were hand-entered years ago with no translation recorded, and asserting
      // one would be a false citation.
      out.push(
        src.keyVerse.translation
          ? `Key verse, quoted exactly (${src.keyVerse.translation}, public domain) -- reproduce it word for word if you quote it, or leave it out entirely:`
          : `Key verse -- quote it exactly as given here or leave it out entirely; do not paraphrase it:`,
      );
      out.push(`  "${src.keyVerse.text}" -- ${src.keyVerse.reference}`);
    }
    if (src.cautions.length) {
      out.push("");
      out.push("COMMON MISTAKES IN THIS STORY -- do not make them:");
      src.cautions.forEach((c) => out.push(`  - ${c}`));
    }
    if (brief.premise.length) {
      out.push("");
      out.push("Also asked for:");
      out.push(...brief.premise);
    }
    out.push("");
    // Replaces "Invent the events yourself", which was the single most damaging
    // line in the brief for these stories: it told the model to make something
    // up in the same breath as naming a real account.
    out.push(
      "You may choose which moments to dwell on, what people say to each other, " +
        "and how to make it vivid -- but the events, the names, the " +
        "order and the outcome are fixed. Where the account is silent you may " +
        "imagine; where it speaks you may not contradict it.",
    );
    // Found by generating a real Noah story on gpt-oss and checking the facts:
    // it produced "Noah's wife, Miriam" and "Shem, a young man of twenty".
    // Scripture names neither. Inventing a name or an age for a real person
    // reads exactly like a fact to a child, which makes it the most damaging
    // kind of invention this prompt can produce -- and none of the per-event
    // cautions covered it, because it is not specific to any one event.
    out.push(
      "Do NOT invent a name, an age or a number for anyone the account leaves " +
        "unnamed or unspecified. Name each one by relationship instead -- " +
        "\"Noah's wife\", \"his eldest son\" -- and say nothing about how old " +
        "anyone's age.",
    );
  } else {
    out.push("WHAT IT IS ABOUT");
    out.push(...brief.premise);
    out.push("Invent the events yourself. The section above is who the characters are, not what happens to them.");
  }

  out.push("");
  out.push("HOW TO WRITE IT");
  out.push(...brief.craft);
  // Nothing in any prompt previously asked for conflict or consequence, which
  // is most of why stories read as a pleasant sequence of events.
  out.push(
    brief.sourceMaterial
      ? "Let the danger and the cost in the account be felt rather than summarised -- " +
          "but do not add peril that is not there. Avoid a tidy lesson stated by the narrator."
      : "Give the characters a real problem with something at stake, and let " +
          "the choices they make change what happens. Avoid a tidy lesson " +
          "stated by the narrator.",
  );

  if (brief.continuity) {
    out.push("");
    out.push("ALREADY TRUE IN THIS WORLD");
    const world = brief.continuity.world;

    if (brief.continuity.summary) {
      out.push("What has happened so far:");
      out.push(brief.continuity.summary);
    }

    if (world?.characters.length) {
      // Identity, not obligation. A cast list read as a cast call puts all of
      // them on the page, so the permission not to use them is explicit.
      out.push(
        "People who exist in this world. If one of them appears, these are " +
          "their names and who they are -- but none of them has to appear:",
      );
      world.characters.forEach((c) => out.push(`  - ${c}`));
    }

    // ONE list of hard constraints, not two. Pinned canon and extracted facts
    // differ in where they came from and not at all in what the model must do
    // with them, and two headings that both mean "do not contradict" invite it
    // to weigh one above the other. Canon goes first because a human chose it.
    const mustHold = [...brief.continuity.canon, ...(world?.facts ?? [])];
    if (mustHold.length) {
      out.push("Already true. Do not contradict any of this:");
      mustHold.forEach((f, i) => out.push(`  ${i + 1}. ${f}`));
    }

    if (world?.threads.length) {
      // THE tier that makes this work. Everything above constrains; this one
      // explicitly does not, and saying so is the whole mechanism. Without the
      // permission to ignore them, open threads read as a to-do list and the
      // next story becomes a sequel-by-checklist.
      out.push(
        "Threads left open. You MAY pick ONE of these up if it fits the story " +
          "you are writing, or ignore all of them -- they are possibilities, " +
          "not instructions, and a story that services every one of them is a " +
          "list rather than a story:",
      );
      world.threads.forEach((t) => out.push(`  - ${t}`));
    }

    // The single most important line in this block. A summary handed to a
    // model without it becomes the plot of the next story -- and that failure
    // looks like a perfectly valid HTTP 200 story, so nothing catches it but
    // reading one.
    out.push(
      "This is BACKGROUND, not the plot. Do not retell any of it, and do not " +
        "make it the subject of this story. Refer to it only where it naturally " +
        "comes up. This story is a NEW episode in the same world.",
    );
  }

  if (brief.userInstructions) {
    out.push("");
    // Last and unqualified on purpose: this is what the user actually typed,
    // and it should outrank the generated scaffolding above it.
    out.push("WHAT THE USER ASKED FOR SPECIFICALLY -- follow this closely:");
    out.push(brief.userInstructions);
  }

  return out.join("\n    ");
}

/**
 * The opening instruction of the user prompt, honouring Parent Mode.
 *
 * Derived from the request for the same reason as buildSystemPrompt: this used
 * to be read off an optional `ctx.custom` field that a caller had to remember
 * to populate, which is the same trap in a different shape.
 */
export function buildUserInstruction(request: StoryRequest): string {
  if (request.useCustomPrompts && request.customUserPrompt) {
    return request.customUserPrompt;
  }
  const form = storyFormFor(request.storyType);
  return `Please write a complete, faith-based ${form.noun}.`;
}

/**
 * Picks the storyteller persona for the story type, honouring Parent Mode.
 *
 * The Parent Mode prompts are DERIVED here rather than passed in, and the
 * second parameter that used to carry them is gone on purpose.
 *
 * They are a pure function of three request fields, so every caller computed
 * the same expression from data this function already had -- and `undefined`,
 * the wrong answer, was a valid value that compiled silently. That bug was
 * introduced twice in one week in two different layers: openai.ts assembled the
 * prompts and passed them to a parameter that did not exist, and later the
 * enqueue route passed `undefined` outright. Both times Parent Mode silently
 * stopped working with nothing failing.
 *
 * A caller cannot get it wrong now because a caller no longer supplies it.
 */
export function buildSystemPrompt(request: StoryRequest): string {
  if (request.useCustomPrompts && request.customSystemPrompt) {
    return request.customSystemPrompt;
  }
  return `${storytellerPersona(request)} ${audienceLine(request)}`;
}

/**
 * WHO the reader is, said once, and appended to whichever persona was chosen.
 *
 * Every persona used to open "You are a Christian CHILDREN'S storyteller", and
 * that one word was doing two jobs at once: naming the audience, and setting
 * the register. It set the register far harder than anyone intended. It is
 * what made the stories read tame -- a model told it is writing for children
 * rounds every edge off by default, and no amount of instruction downstream
 * gets those edges back, because the persona outranks the brief.
 *
 * So the audience is now stated as a FACT (an age) rather than as a genre, and
 * the register is stated separately and deliberately. The two were tangled;
 * this is the untangling. The age comes from readingLevelAges() -- the one
 * definition -- and is appended in a single place rather than woven into eight
 * persona strings, which is how "children" came to appear twice in three of
 * them.
 *
 * The second half is the licence Blake asked for, and it needs both halves to
 * be safe. "Hard things may happen" without "never dwell on it, never leave
 * them without hope" is not a children's app growing up, it is a different
 * app.
 */
function audienceLine(request: StoryRequest): string {
  return (
    `Your reader is ${readingLevelAges(request.readingLevel)}. Write so a reader that ` +
    "age can follow you, and then trust that reader. Hard things are allowed to happen " +
    "in your stories and are allowed to cost something: grief, fear, a wrong " +
    "that is not put right by the last page. Do not soften an ending that was " +
    "not soft. What you never do is dwell on suffering for its own sake, or " +
    "leave your reader without hope."
  );
}

/**
 * The storyteller, chosen by what the story is made of.
 *
 * Keyed on the DATA, not on a story type. Removing the biblical_narrative
 * story type in Phase A also removed the only thing that had ever selected a
 * retelling persona, which is why biblical stories got worse rather than
 * better. Deriving it from "is there a biblical event on the request" means
 * it cannot be lost again by a change to the storyType enum.
 */
function storytellerPersona(request: StoryRequest): string {
  const retelling = isSet(request.biblicalEvent) || isSet(request.biblePassage);
  // A hero of faith is a real person, so the same "do not invent" discipline
  // applies -- but they are not Scripture, and a persona that says so would be
  // wrong about Corrie ten Boom.
  const trueStory = !retelling && isSet(request.heroOfFaith);
  if (trueStory) {
    return request.storyType === "poem"
      ? "You are a Christian poet who puts the lives of real Christians into verse. You are faithful to what each of them really did -- you never invent events for a real person. You write in verse -- rhythmic, rhyming lines -- never in prose paragraphs."
      : "You are a Christian storyteller who tells the true stories of real Christians. You are faithful to what actually happened -- the events, the dates, the places and the people. Where the record is silent you may imagine a scene; you never invent events for a real person.";
  }

  switch (request.storyType) {
    case "poem":
      return retelling
        ? "You are a Christian poet who puts real Bible accounts into verse. You are faithful to what Scripture actually records -- you never invent events, and you never change how an account ends. You write in verse -- rhythmic, rhyming lines -- never in prose paragraphs."
        : "You are a Christian poet. You write in verse -- rhythmic, rhyming lines -- never in prose paragraphs.";
    case "moral":
      return retelling
        ? "You are a Christian storyteller who retells real Bible accounts accurately. You are faithful to what Scripture records -- the events, the names, the order and the outcome. You let the lesson come out of what actually happened rather than adding one."
        : "You are a Christian storyteller working towards a single clear moral, and you let it be earned rather than announced -- it comes out of what the character chooses and what that choice costs.";
    default:
      return retelling
        ? "You are a Christian storyteller who retells real Bible accounts accurately. You are faithful to what Scripture records -- the events, the names, the order and the outcome -- and you say so plainly rather than inventing a version that is easier to tell. Where Scripture is silent you may imagine; where it speaks you follow it."
        : "You are a Christian storyteller. You write faith-based stories that have real weight to them: something is genuinely at stake, the choices are genuinely hard, and the moral is what the story turns out to mean rather than a lesson pinned to the end of it.";
  }
}

/**
 * The brief is FROZEN onto story_jobs.brief at enqueue, which is a text column.
 *
 * It is stored as JSON rather than as rendered prose because the worker needs
 * the STRUCTURE: renderBrief() emits a different projection per prompt site,
 * and a chapter prompt must be able to ask for identity alone. Freezing the
 * rendered text would freeze one projection and lose the rest.
 */
export function serialiseBrief(brief: StoryBrief): string {
  return JSON.stringify(brief);
}

/**
 * Parse a frozen brief, tolerating the plain-text briefs written before the
 * brief became structured. Those jobs are in flight across this deploy and
 * would otherwise fail at JSON.parse -- so an unparseable brief is treated as
 * legacy premise text rather than as an error.
 */
export function deserialiseBrief(raw: string): StoryBrief {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      if (Array.isArray(parsed.cast)) {
        // soloRetelling arrived after some briefs were frozen. For those, fall
        // back to what the old code did -- an empty lead colour alongside
        // source material meant the child had been anonymised -- rather than
        // defaulting to false, which would put the invented-child guard back to
        // silent for every job already queued when this deployed.
        if (typeof parsed.soloRetelling !== "boolean") {
          parsed.soloRetelling =
            Boolean(parsed.sourceMaterial) && !parsed.cast[0]?.colour;
        }
        // Same treatment, same reason. A brief frozen before `cliffhanger` was
        // a field still SAYS so in its premise, and defaulting to false would
        // tell the last chapter of an in-flight "leave it open" story to bring
        // everyone home -- the exact contradiction this field exists to stop.
        if (typeof parsed.cliffhanger !== "boolean") {
          parsed.cliffhanger =
            Array.isArray(parsed.premise) && parsed.premise.includes(CLIFFHANGER_PREMISE);
        }
        return parsed as StoryBrief;
      }
      // A brief frozen before the cast became plural. These are IN FLIGHT
      // ACROSS EVERY DEPLOY -- story_jobs.brief is frozen text written at
      // enqueue and never rewritten -- so a brief written five minutes before
      // this shipped still has to render. The upgrade lives here because this
      // is already the one function that knows about old brief formats.
      //
      // Note what is NOT done: renderBrief has no defensive `?? []` on the
      // cast. A missing cast there would render a WHO section with nobody in
      // it and produce a valid story about no one -- failing loudly at the
      // seam is better than a silent story about nobody.
      if ("identity" in parsed) {
        const identity = String(parsed.identity ?? "");
        return {
          ...parsed,
          soloRetelling:
            Boolean(parsed.sourceMaterial) &&
            !(typeof parsed.colour === "string" && parsed.colour),
          cast: [
            {
              // The identity sentence is "Mia, aged 8, a girl." -- the name is
              // everything before the first comma.
              name: identity.split(",")[0].trim() || "the main character",
              identity,
              colour: typeof parsed.colour === "string" ? parsed.colour : "",
            },
          ],
          // Absent on every brief frozen before this shipped, and false is what
          // those stories meant: one of them was the protagonist.
          ensemble: parsed.ensemble === true,
          cliffhanger:
            Array.isArray(parsed.premise) && parsed.premise.includes(CLIFFHANGER_PREMISE),
        } as StoryBrief;
      }
    }
  } catch {
    // fall through
  }
  return {
    cast: [{ name: "the main character", identity: "the main character", colour: "" }],
    // An unparseable brief carries no source material, so there is no retelling
    // for an invented child to be absent from.
    soloRetelling: false,
    // One character, so the question does not arise.
    ensemble: false,
    // Legacy premise text, with no structure to read the flag out of.
    cliffhanger: false,
    premise: [raw],
    craft: [],
  };
}

/**
 * Did the stat sheet leak into the story?
 *
 * The block above tells the model never to write a number, name a stat, or call
 * anyone strong or weak. Whether it obeys is an empirical question, and the one
 * thing we know for certain is that obedience differs by model: decisions.md
 * §24 measured gpt-oss:20b taking up all three "optional" threads it was handed
 * while gpt-5.6-luna left the loaded one alone.
 *
 * So rather than assume, count. This does not fail a story -- a leak is a
 * quality problem, not a broken one, and failing a finished story over a
 * stray "strong" would be worse than the leak. It logs, so that "the stat block
 * is too finicky" becomes a thing we know rather than a thing we suspect, and
 * CHARACTER_STATS_STYLE can be switched to prose on evidence.
 *
 * Deliberately narrow. "strong" appears in ordinary prose all the time, so this
 * looks for the sheet's OWN vocabulary -- the stat names and the scale -- which
 * is the shape a leak actually takes.
 */
const LEAK_PATTERNS: ReadonlyArray<[string, RegExp]> = [
  // Built FROM the list rather than restating it, so adding an attribute
  // cannot leave the detector checking four of five.
  [
    "stat name",
    new RegExp(`\\b(${CHARACTER_STATS.join("|")})\\s+(?:of\\s+)?(?:is\\s+)?\\d`, "gi"),
  ],
  ["scale", /\b\d\s*(?:\/|out of)\s*10\b/gi],
  ["sheet word", /\b(stat|stats|statistic|attribute|attributes|skill|skills|ability score|character sheet)\b/gi],
  // No \b before the +: it is not a word character, so \b\+ can only match
  // after one, and "gained +1" has a space there. The pattern would have been
  // dead in exactly the case it was written for.
  ["level talk", /(\blevel \d|\bpoints? in\b|\+\d\b)/gi],
];

/**
 * Did a SKILL name get announced, rather than shown?
 *
 * Separate from LEAK_PATTERNS and deliberately not a regex: skill names are
 * user-authored free text, and compiling a pattern out of them is an escaping
 * bug and a denial-of-service in one. A plain case-insensitive scan is neither,
 * and it is looking for the giveaway phrasing rather than the word itself --
 * "she went climbing" is the feature working; "her climbing skill" is not.
 */
export function skillLeakage(story: string, skills: string[]): string[] {
  const text = story.toLowerCase();
  return skills
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 2)
    .filter((s) => text.includes(`${s} skill`) || text.includes(`skill at ${s}`) || text.includes(`${s} level`))
    .map((s) => `skill named: ${s}`);
}

export function statLeakage(story: string): string[] {
  const found: string[] = [];
  for (const [label, re] of LEAK_PATTERNS) {
    const hits = story.match(re);
    if (hits?.length) found.push(`${label}: ${[...new Set(hits)].slice(0, 5).join(", ")}`);
  }
  return found;
}
