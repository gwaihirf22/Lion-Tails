import type { StoryRequest } from "@shared/schema";
import { furtherReadingFor, type Resource } from "@shared/furtherReading";
import { getBiblicalEvent } from "../data/biblicalEvents";
import { resolveHeroOfFaith } from "./storyBrief";

/**
 * A saved story's Further reading, from the request it was written from.
 *
 * The same two lookups the brief was built with -- resolveHeroOfFaith and
 * getBiblicalEvent -- so the sources are the account the story was checked
 * against, not a second guess at it. Never throws: a story without its reading
 * list is a story, and one that fails to load over it is not.
 */
export async function furtherReadingForRequest(request: StoryRequest | undefined): Promise<Resource[]> {
  try {
    if (!request) return furtherReadingFor({});
    const hero = await resolveHeroOfFaith(request);
    const event = getBiblicalEvent(request.biblicalEvent);
    return furtherReadingFor({ hero, event, biblePassage: request.biblePassage });
  } catch (error) {
    console.error("[furtherReading] could not build a story's reading list:", error);
    return furtherReadingFor({});
  }
}
