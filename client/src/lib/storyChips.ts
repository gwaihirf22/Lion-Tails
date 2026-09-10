import type { SavedStory } from "@shared/schema";
import { characterIdsOf, characterRoleOf } from "@shared/schema";
import { EDITED_BY_PARENT } from "@shared/editLog";
import { ROLE_OPTIONS } from "@/lib/characterRole";

/**
 * What a story card says about a story, from what the story actually has.
 *
 * The old "Story details" row read childName, gender, animal and theme off
 * the request -- and a modern request carries none of them: characters are
 * ids, a retelling has no theme. Every card printed a label over nothing.
 *
 * A PURE function over the story and three lists the page already has
 * cached (heroes, events, the user's characters), so the card never fetches
 * and a test can say exactly what a given story shows. Empty means the row
 * is not rendered at all.
 *
 * Names come from where they are defined: the role label is
 * ROLE_OPTIONS' (the form's own words, never a second spelling), the role
 * itself is read through characterRoleOf(), the cast through
 * characterIdsOf(), and a hero resolves by `heroId` before `heroOfFaith` --
 * the latter historically held a name, not an id.
 */
export type ChipSources = {
  heroes: ReadonlyArray<{ id: string; name: string }>;
  events: ReadonlyArray<{ id: string; label: string }>;
  characters: ReadonlyArray<{ id: string; name: string }>;
};

const LENGTH_LABEL: Record<string, string> = {
  "very-short": "Very short",
  short: "Short",
  medium: "Medium",
  long: "Long",
  extended: "Extended",
};

export function storyChips(story: SavedStory, sources: ChipSources): string[] {
  const chips: string[] = [];
  const request = story.request;

  // The source: a person, an event, or a passage -- one of them, by the same
  // precedence the server settles them with.
  const heroId = request.heroId ?? request.heroOfFaith;
  const hero = heroId ? sources.heroes.find((h) => h.id === heroId) : undefined;
  const event = request.biblicalEvent
    ? sources.events.find((e) => e.id === request.biblicalEvent)
    : undefined;
  if (event) chips.push(event.label);
  else if (hero) chips.push(hero.name);
  else if (request.biblePassage?.trim()) chips.push(request.biblePassage.trim());

  // The cast, by name. An id that no longer resolves is left out rather than
  // shown as an id.
  for (const id of characterIdsOf(request)) {
    const c = sources.characters.find((x) => x.id === id);
    if (c) chips.push(c.name);
  }

  const role = characterRoleOf(request);
  if (role !== "absent") chips.push(ROLE_OPTIONS[role].label);

  const length = request.storyLength ? LENGTH_LABEL[request.storyLength] : undefined;
  if (length) chips.push(length);

  if (story.editLog && story.editLog.length > 0) chips.push(EDITED_BY_PARENT);

  return chips;
}
