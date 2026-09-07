import type { StoryRequest, Character } from "@shared/schema";
import { storage } from "../storage";

export type CustomPrompts = {
  systemPrompt?: string;
  userPrompt?: string;
};

/**
 * Resolves the saved character a request refers to, if any.
 *
 * Scoped to the requesting user on purpose: getCharacterById() takes only an
 * id and Character carries no userId, so looking one up by id alone would let
 * any user generate a story starring another user's character.
 * getAllCharacters(userId) is user-scoped, so we filter within that set.
 *
 * Returns undefined rather than throwing on any failure -- story generation
 * must still work when the database is unavailable and storage has fallen back
 * to memory.
 */
export async function resolveStoryCharacter(
  request: StoryRequest,
  userId: number,
): Promise<Character | undefined> {
  if (!request.characterId) return undefined;

  try {
    const characters = await storage.getAllCharacters(userId);
    const match = characters.find((c) => c.id === request.characterId);
    if (!match) {
      console.warn(
        `Character ${request.characterId} not found for user ${userId}; falling back to the details on the request.`,
      );
    }
    return match;
  } catch (error) {
    console.error("Could not load character details for story generation:", error);
    return undefined;
  }
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
export type StoryBrief = {
  /** Identity that must stay consistent across chapters. Always included. */
  identity: string;
  /** Appearance, hobbies, companions. Colour, not requirements. */
  colour: string;
  /** What the story is about -- the thing to actually invent around. */
  premise: string[];
  /** Constraints on how it is written. */
  craft: string[];
  /** Free-text steering from the user. Deliberately last and unqualified. */
  userInstructions?: string;
  /** Universe continuity: what is already true. Never the plot of this story. */
  continuity?: { canon: string[]; summary?: string };
};

export function buildStoryBrief(
  request: StoryRequest,
  character?: Character,
  continuity?: { canon: string[]; summary?: string },
): StoryBrief {
  const details = character;
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

  // ---- WHO: identity, as a sentence rather than a checklist -----------------
  const who = [name];
  if (age) who.push(`aged ${age}`);
  if (isSet(gender)) who.push(`a ${gender}`);
  const identity = sentence([who.join(", ")]);

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
  const colour = colourParts.join(" ");

  // ---- WHAT: the thing to invent around ------------------------------------
  const premise: string[] = [];
  premise.push(`Theme: ${request.theme || "faith and kindness"}.`);
  if (isSet(request.biblicalEvent)) premise.push(`Draw on this biblical event: ${request.biblicalEvent}.`);
  if (isSet(request.heroOfFaith)) premise.push(`Feature this hero of faith: ${request.heroOfFaith}.`);
  if (isSet(request.biblePassage)) premise.push(`Draw on this passage: ${request.biblePassage}.`);
  if (request.useTimeTravel) {
    premise.push(`${name} travels back in time and witnesses this first-hand.`);
  }
  const ending = moralOutcomeInstruction(request.moralOutcome);
  if (ending) premise.push(ending);

  // ---- HOW ------------------------------------------------------------------
  const craft: string[] = [];
  craft.push(`Reading level: ${request.readingLevel || "early-elementary"}.`);
  if (isSet(request.learningFocus)) craft.push(`Learning focus: ${request.learningFocus}.`);
  const form = storyFormFor(request.storyType);
  if (form.craft) craft.push(form.craft);

  return {
    identity,
    colour,
    premise,
    craft,
    userInstructions: isSet(request.customPrompt) ? request.customPrompt : undefined,
    continuity:
      continuity && (continuity.canon.length > 0 || continuity.summary)
        ? continuity
        : undefined,
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
  if (purpose === "image") {
    return brief.identity;
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
    return `The story is about ${brief.identity} Keep this consistent.${canonLine}`;
  }

  const out: string[] = [];

  out.push("WHO THIS IS ABOUT");
  out.push(brief.identity);
  if (brief.colour) {
    out.push(brief.colour);
    // The single most important line in the brief. Without it these details are
    // read as requirements and the story becomes a tour of the character sheet.
    out.push(
      "Use these details only where a scene naturally calls for them. Do not " +
        "introduce them as a list, and do not make appearance or companions the " +
        "subject of what happens.",
    );
  }

  out.push("");
  out.push("WHAT IT IS ABOUT");
  out.push(...brief.premise);
  out.push("Invent the events yourself. The section above is who they are, not what happens to them.");

  out.push("");
  out.push("HOW TO WRITE IT");
  out.push(...brief.craft);
  // Nothing in any prompt previously asked for conflict or consequence, which
  // is most of why stories read as a pleasant sequence of events.
  out.push(
    "Give them a real problem with something at stake, and let their choices " +
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

  switch (request.storyType) {
    case "poem":
      return "You are a Christian children's poet. You write in verse -- rhythmic, rhyming lines -- never in prose paragraphs.";
    case "moral":
      return "You are a Christian children's storyteller focused on a single clear moral lesson, illustrated through the character's choices.";
    default:
      return "You are a Christian children's storyteller who writes warm, faith-based stories with a clear moral.";
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
    if (parsed && typeof parsed === "object" && "identity" in parsed) {
      return parsed as StoryBrief;
    }
  } catch {
    // fall through
  }
  return { identity: "the main character", colour: "", premise: [raw], craft: [] };
}
