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
 * Renders everything the user actually chose into a prompt fragment.
 * See docs/decisions.md §4.
 *
 * storyRequestSchema declares 22 fields and the form collects them, but the
 * generator previously destructured only childName, theme, readingLevel and
 * storyLength -- so a chosen character, hero of faith, biblical event, animal
 * companion, learning focus and custom instructions were all silently
 * discarded. That is why generated stories did not reflect the form.
 *
 * Built in one place and shared by every prompt site, so the set of fields
 * cannot drift between them the way the duplicated destructures did.
 */
export function buildStoryBrief(
  request: StoryRequest,
  character?: Character,
): string {
  const details = character;
  const d = request.characterDetails;

  const name = details?.name || request.childName || "A child";
  const gender = details?.gender || request.gender;
  const age = details?.age ?? d?.age;
  const hair = details?.hair || d?.hair;
  const eyes = details?.eyes || d?.eyes;
  const favoriteColor = details?.favoriteColor || d?.favoriteColor;
  const specialPower = details?.specialPower || d?.specialPower;
  const hobby = details?.hobby || d?.hobby;
  const personality = details?.personality || d?.personality;
  const favoriteAnimal = details?.favoriteAnimal || d?.favoriteAnimal;

  const animal =
    request.useAnimal === false
      ? undefined
      : request.animal || favoriteAnimal;

  const lines: string[] = [];
  const add = (label: string, value: unknown) => {
    if (value === undefined || value === null || value === "") return;
    lines.push(`- ${label}: ${value}`);
  };

  if (request.storyType !== "biblical_narrative") {
    add("Main character", name);
    add("Gender", gender);
    add("Age", age);
    add("Hair", hair);
    add("Eyes", eyes);
    add("Favourite colour", favoriteColor);
    add("Special ability", specialPower);
    add("Hobby", hobby);
    add("Personality", personality);
    add("Animal companion", animal);
  }

  add("Theme", request.theme || "Faith and kindness");
  add("Biblical event", request.biblicalEvent);
  add("Hero of faith to feature", request.heroOfFaith);
  add("Bible passage to draw on", request.biblePassage);
  add("Reading level", request.readingLevel || "early-elementary");
  add("Learning focus", request.learningFocus);

  if (request.useTimeTravel) {
    add(
      "Time travel",
      "The character travels back in time to witness this event first-hand",
    );
  }
  if (request.storyType === "biblical_narrative" && request.historicalAccuracy !== false) {
    add("Historical accuracy", "Keep the retelling faithful to the biblical account");
  }
  if (request.customPrompt) {
    add("Extra instructions from the parent", request.customPrompt);
  }

  return lines.join("\n    ");
}

/** Picks the storyteller persona for the story type, honouring Parent Mode. */
export function buildSystemPrompt(
  request: StoryRequest,
  custom?: CustomPrompts,
): string {
  if (request.useCustomPrompts && custom?.systemPrompt) {
    return custom.systemPrompt;
  }

  switch (request.storyType) {
    case "biblical_narrative":
      return "You are a biblical storyteller who retells Bible stories with historical accuracy and age-appropriate language for children.";
    case "poem":
      return "You are a Christian children's poet who writes rhythmic, rhyming verse with a clear moral.";
    case "moral":
      return "You are a Christian children's storyteller focused on a single clear moral lesson, illustrated through the character's choices.";
    default:
      return "You are a Christian children's storyteller who writes warm, faith-based stories with a clear moral.";
  }
}
