import {
  characterIdsOf,
  MAX_STORY_CHARACTERS,
  type StoryRequest,
  type Character,
  type HeroOfFaith,
} from "@shared/schema";
import { storage } from "../storage";
import { getBiblicalEvent } from "../data/biblicalEvents";

export type CustomPrompts = {
  systemPrompt?: string;
  userPrompt?: string;
};

/**
 * Resolves the saved characters a request refers to, in the requested order.
 *
 * ONE user-scoped read, then an index. The tempting implementation -- a loop of
 * getCharacterById(id) -- is the vulnerability this function was written to
 * avoid: that lookup takes only an id, Character carries no userId, and so an
 * id-only fetch would let any user generate a story starring another user's
 * character. Going plural makes that mistake N times easier to commit and no
 * less severe, so ownership comes from getAllCharacters(userId) and the request
 * supplies nothing but the ORDER.
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
const PLACEHOLDER_NAMES = new Set(["biblical character", "character", "a child", "child"]);
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
      return "End with the character understanding something they did not understand at the start. The change in them is the ending.";
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
  /** Appearance, hobbies, companions. Colour, not requirements. */
  colour: string;
};

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
  /** What the story is about -- the thing to actually invent around. */
  premise: string[];
  /** Constraints on how it is written. */
  craft: string[];
  /** Free-text steering from the user. Deliberately last and unqualified. */
  userInstructions?: string;
  /** Universe continuity: what is already true. Never the plot of this story. */
  continuity?: { canon: string[]; summary?: string };
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
  continuity?: { canon: string[]; summary?: string },
  hero?: HeroOfFaith,
): StoryBrief {
  // The LEAD. Everything below this line that builds identity and colour is
  // unchanged from the single-character version, deliberately: a request with
  // one character or none must render byte-identically, and
  // tests/storyBrief.test.ts asserts exactly that against captured strings.
  const details = characters[0];
  const supporting = characters.slice(1);
  const d = request.characterDetails;

  const name = details?.name || request.childName || "A child";
  const gender = details?.gender || request.gender;
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
      account: event.anchor,
      keyVerse: { ...event.keyVerse, translation: "World English Bible" },
      cautions: event.cautions,
    };
  } else if (hero) {
    // A hero of faith is a real person, so the same rule applies: supply the
    // biography rather than the name. heroesOfFaith.ts has carried timePeriod,
    // contribution, keyEvents and a verse for every one of the fifteen heroes
    // all along, and the prompt received none of it.
    const events = (hero.keyEvents ?? [])
      .map((e) => `${e.year}: ${e.description}`)
      .join("; ");
    sourceMaterial = {
      kind: "hero-of-faith",
      label: hero.name,
      passage: hero.timePeriod || undefined,
      account: [
        hero.description,
        hero.contribution,
        events && `Key events -- ${events}`,
        hero.famousQuote && `In their own words: "${hero.famousQuote}"`,
      ]
        .filter(Boolean)
        .join(" "),
      keyVerse: hero.bibleVerse,  // no translation: see note in renderBrief
      cautions: [
        `${hero.name} was a real person who really lived. Do not invent events for them that did not happen, and do not move them to another century or country.`,
        "Their faith is what the story is for. Do not reduce them to a list of achievements.",
      ],
    };
  }

  // ---- WHO: identity, as a sentence rather than a checklist -----------------
  // A retelling has its own cast. When the form supplied a placeholder name
  // there is no child in this story, and saying there is one hands the model a
  // protagonist to displace Noah with.
  const anonymous = isPlaceholderName(name) && Boolean(sourceMaterial);
  const who = [name];
  if (age) who.push(`aged ${age}`);
  if (isSet(gender)) who.push(`a ${gender}`);
  const identity = anonymous
    ? sourceMaterial!.kind === "hero-of-faith"
      ? `${sourceMaterial!.label}, and the people around them.`
      : `the people in the account of ${sourceMaterial!.label}.`
    : sentence([who.join(", ")]);

  // ---- Colour: usable if it fits, never required ---------------------------
  const traits: string[] = [];
  if (isSet(hair)) traits.push(`${hair} hair`);
  if (isSet(eyes)) traits.push(`${eyes} eyes`);
  if (isSet(personality)) traits.push(`a ${personality} nature`);
  const colourParts: string[] = [];
  if (traits.length) colourParts.push(`${name} has ${traits.join(", ")}.`);
  if (isSet(hobby)) colourParts.push(`${name} likes ${hobby}.`);
  if (isSet(favoriteColor)) colourParts.push(`Favourite colour: ${favoriteColor}.`);
  if (animal) {
    // Article matters more than it looks. "There is rabbit in Mia's life" is
    // ungrammatical, and a model handed ungrammatical input stopped naming the
    // animal and repeated the bare noun instead -- the previous prompt produced
    // a companion called Benny, this one produced "the rabbit" fifteen times.
    const article = /^[aeiou]/i.test(animal) ? "an" : "a";
    colourParts.push(
      `${name} has ${article} ${animal} as a companion; give it a name and a personality.`,
    );
  }
  const colour = anonymous ? "" : colourParts.join(" ");

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
  if (request.useTimeTravel && !anonymous) {
    premise.push(`${name} travels back in time and witnesses this first-hand.`);
  }

  // Scope. Without it, "a story about Corrie ten Boom" gets a life summary --
  // born here, did this, died there -- which is the failure this exists to fix.
  // Placed in premise rather than craft because it is WHAT the story is about,
  // not how it is written, and premise is what the outline is planned from.
  const focus = request.storyFocus;
  if (focus && focus.mode !== "whole" && isSet(focus.text)) {
    premise.push(
      `This story covers ONE episode${focus.reference ? ` (${focus.reference})` : ""}: ${focus.text}`,
    );
    premise.push(
      "Tell that episode properly -- the lead-up, what happened, and what it " +
        "cost. Do not summarise the rest of their life around it, and do not " +
        "open with where they were born or close with how they died.",
    );
  }
  // Suppressed for a retelling. moralOutcome is chosen at random when the user
  // does not pick one, and "a poor choice should lead to a real consequence, do
  // not soften it into a happy ending" is a direct instruction to change how the
  // account of Noah ends. The account already has an ending; it is not ours to
  // assign. This is the same class of conflict as "invent the events yourself".
  const ending = sourceMaterial
    ? undefined
    : moralOutcomeInstruction(request.moralOutcome);
  if (ending) premise.push(ending);

  // ---- HOW ------------------------------------------------------------------
  const craft: string[] = [];
  craft.push(`Reading level: ${request.readingLevel || "early-elementary"}.`);
  if (isSet(request.learningFocus)) craft.push(`Learning focus: ${request.learningFocus}.`);
  const form = storyFormFor(request.storyType);
  if (form.craft) craft.push(form.craft);

  // Supporting cast: a name, an identity sentence, and AT MOST TWO FACTS.
  //
  // Not parity with the lead, and the arithmetic is the argument. One character
  // contributes about six facts today; eight at parity is forty-eight, which is
  // the character-sheet tour at eight times scale. Eyes and favourite colour go
  // first because they are pure sheet data with nothing for a scene to do, and
  // the companion animal goes because "give it a name and a personality" eight
  // times is a menagerie, not a cast.
  const cast: BriefCharacter[] = [
    { name, identity, colour },
    ...supporting.map((c): BriefCharacter => {
      const who = [c.name];
      if (c.age) who.push(`aged ${c.age}`);
      if (isSet(c.gender)) who.push(`a ${c.gender}`);
      const trait = isSet(c.personality)
        ? `a ${c.personality} nature`
        : isSet(c.hair)
          ? `${c.hair} hair`
          : undefined;
      const likes = isSet(c.hobby) ? `likes ${c.hobby}` : undefined;
      const both = trait && likes ? `${c.name} has ${trait} and ${likes}.` : undefined;
      const one = trait ? `${c.name} has ${trait}.` : likes ? `${c.name} ${likes}.` : "";
      return { name: c.name, identity: sentence([who.join(", ")]), colour: both ?? one };
    }),
  ];

  return {
    cast,
    premise,
    craft,
    userInstructions: isSet(request.customPrompt) ? request.customPrompt : undefined,
    continuity:
      continuity && (continuity.canon.length > 0 || continuity.summary)
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

export function renderBrief(brief: StoryBrief, purpose: BriefPurpose): string {
  // Index 0 is the protagonist; every projection below leans on that.
  const lead = brief.cast[0];
  const others = brief.cast.slice(1);
  const otherNames = others.map((c) => c.name);

  if (purpose === "image") {
    const base = brief.sourceMaterial
      ? `${lead.identity} -- a scene from ${brief.sourceMaterial.label}.`
      : lead.identity;
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
    const alsoLine = otherNames.length
      ? ` Also in this story: ${otherNames.join(", ")} -- use them only where this chapter's instruction calls for them, and do not add anyone who is not named here.`
      : "";
    return `The story is about ${lead.identity} Keep this consistent.${alsoLine}${sourceLine}${canonLine}`;
  }

  const out: string[] = [];

  out.push("WHO THIS IS ABOUT");
  if (others.length > 0) {
    // Said BEFORE the names, so the model reads the whole roll knowing which
    // one it is following. Said after, it has already given everyone equal
    // weight by the time it is told not to.
    out.push(
      `This is ${lead.name}'s story. The others are in it with ${lead.name}, but ` +
        `the choices the story turns on are ${lead.name}'s, and the reader stays ` +
        `with ${lead.name}.`,
    );
  }
  out.push(lead.identity);
  if (brief.sourceMaterial && !lead.colour) {
    // No invented protagonist was supplied, so say so explicitly. Left silent,
    // a model asked for a children's story reaches for a child to put in it.
    out.push(
      "There is no invented child in this story. Do not add a modern character, " +
        "a narrator-child, or a framing device where someone is told the story.",
    );
  }
  if (lead.colour) out.push(lead.colour);
  if (others.length > 0) {
    out.push(
      `ALSO IN THE STORY -- ${others.length} ${others.length === 1 ? "other" : "others"}, present but not the subject:`,
    );
    for (const c of others) out.push(`  - ${[c.identity, c.colour].filter(Boolean).join(" ")}`);
  }
  if (lead.colour || others.some((c) => c.colour)) {
    // The single most important line in the brief. Without it these details are
    // read as requirements and the story becomes a tour of the character sheet.
    out.push(
      "Use these details only where a scene naturally calls for them. Do not " +
        "introduce them as a list, and do not make appearance or companions the " +
        "subject of what happens.",
    );
  }
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
        "two of them into one, and do not add extra children of your own.",
    );
    if (n >= 4) {
      out.push(
        "Keep no more than three of them in any one scene. The rest are " +
          "elsewhere, and the story does not have to say where.",
      );
    }
    if (brief.sourceMaterial) {
      // Without this, eight modern children reshape the flood.
      out.push(
        `The account comes first. ${lead.name} and the others are visitors in ` +
          `it: they can watch, help and be afraid, but nothing they do changes ` +
          `what happens or how it ends.`,
      );
    }
    if (purpose === "outline") {
      // The outline is where per-chapter casting is actually decided, so this
      // is the one place the instruction can be acted on rather than admired.
      out.push(
        "Not every part needs everyone. Decide who is in each part and leave " +
          "the rest out of that part.",
      );
    }
  }

  out.push("");
  if (brief.sourceMaterial) {
    const src = brief.sourceMaterial;
    const isBible = src.kind === "biblical-event";
    out.push(`WHAT IT IS ABOUT -- this is a RETELLING of ${src.label}${src.passage ? ` (${src.passage})` : ""}`);
    out.push(
      isBible
        ? "This really happened and is recorded in Scripture. Retell it. Do not invent a different version of it, and do not write a modern story that is merely inspired by it."
        : "This is a real person who really lived. Retell what they actually did.",
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
        "and how to make it vivid for a child -- but the events, the names, the " +
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
        "unnamed or unspecified. Refer to them by their relationship instead -- " +
        "\"Noah's wife\", \"his eldest son\" -- and say nothing about how old " +
        "they were.",
    );
  } else {
    out.push("WHAT IT IS ABOUT");
    out.push(...brief.premise);
    out.push("Invent the events yourself. The section above is who they are, not what happens to them.");
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
      : "Give them a real problem with something at stake, and let their choices " +
          "change what happens. Avoid a tidy lesson stated by the narrator.",
  );

  if (brief.continuity) {
    out.push("");
    out.push("ALREADY TRUE IN THIS WORLD");
    if (brief.continuity.canon.length) {
      out.push("Facts that must not be contradicted:");
      brief.continuity.canon.forEach((c, i) => out.push(`  ${i + 1}. ${c}`));
    }
    if (brief.continuity.summary) {
      out.push("What has happened so far:");
      out.push(brief.continuity.summary);
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
  return `Please write a complete, faith-based children's ${form.noun}.`;
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

  // Keyed on the DATA, not on a story type. Removing the biblical_narrative
  // story type in Phase A also removed the only thing that had ever selected a
  // retelling persona, which is why biblical stories got worse rather than
  // better. Deriving it from "is there a biblical event on the request" means
  // it cannot be lost again by a change to the storyType enum.
  const retelling = isSet(request.biblicalEvent) || isSet(request.biblePassage);
  // A hero of faith is a real person, so the same "do not invent" discipline
  // applies -- but they are not Scripture, and a persona that says so would be
  // wrong about Corrie ten Boom.
  const trueStory = !retelling && isSet(request.heroOfFaith);
  if (trueStory && !(request.useCustomPrompts && request.customSystemPrompt)) {
    return request.storyType === "poem"
      ? "You are a Christian children's poet who puts the lives of real Christians into verse. You are faithful to what they actually did -- you never invent events for a real person. You write in verse -- rhythmic, rhyming lines -- never in prose paragraphs."
      : "You are a Christian children's storyteller who tells the true stories of real Christians for children. You are faithful to what actually happened -- the events, the dates, the places and the people. Where the record is silent you may imagine a scene; you never invent events for a real person.";
  }

  switch (request.storyType) {
    case "poem":
      return retelling
        ? "You are a Christian children's poet who puts real Bible accounts into verse. You are faithful to what Scripture actually records -- you never invent events, and you never change how an account ends. You write in verse -- rhythmic, rhyming lines -- never in prose paragraphs."
        : "You are a Christian children's poet. You write in verse -- rhythmic, rhyming lines -- never in prose paragraphs.";
    case "moral":
      return retelling
        ? "You are a Christian children's storyteller who retells real Bible accounts accurately for children. You are faithful to what Scripture records -- the events, the names, the order and the outcome. You let the lesson come out of what actually happened rather than adding one."
        : "You are a Christian children's storyteller focused on a single clear moral lesson, illustrated through the character's choices.";
    default:
      return retelling
        ? "You are a Christian children's storyteller who retells real Bible accounts accurately for children. You are faithful to what Scripture records -- the events, the names, the order and the outcome -- and you say so plainly rather than inventing a version that is easier to tell. Where Scripture is silent you may imagine; where it speaks you follow it."
        : "You are a Christian children's storyteller who writes warm, faith-based stories with a clear moral.";
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
      if (Array.isArray(parsed.cast)) return parsed as StoryBrief;
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
          cast: [
            {
              // The identity sentence is "Mia, aged 8, a girl." -- the name is
              // everything before the first comma.
              name: identity.split(",")[0].trim() || "the main character",
              identity,
              colour: typeof parsed.colour === "string" ? parsed.colour : "",
            },
          ],
        } as StoryBrief;
      }
    }
  } catch {
    // fall through
  }
  return {
    cast: [{ name: "the main character", identity: "the main character", colour: "" }],
    premise: [raw],
    craft: [],
  };
}
