import type { SavedStory } from "@shared/schema";
import { isTimekeeperStory } from "@shared/quests";

/**
 * The folders on My Stories: ONE table for the strip, the counts and the
 * contents.
 *
 * There used to be two copies of this -- a switch for the content and a
 * separate filter per trigger for its count -- and a tab the switch had not
 * heard of silently showed the temporary list. One row per folder, and the
 * count is `stories.filter(folder.filter).length`, the same predicate the
 * panel renders.
 *
 * Class names are written out IN FULL, never built from `value`. Tailwind's
 * scanner only sees string literals; ci.yml records the colour picker that
 * did nothing for months because its class was interpolated. The tints are
 * the character sheet's own tokens -- all six already pass the contrast test
 * in every palette, so borrowing four adds nothing to theme.css and nothing
 * to the gate. tests/theme.test.ts checks every literal here names a real
 * token.
 */
export type StoryFolder = {
  value: "all" | "timekeeper" | "favorites" | "universes";
  label: string;
  /** The closed-folder surface. */
  tint: string;
  /** The open folder's top edge, in the same colour. */
  edge: string;
  /** Which stories; undefined for the folder that lists universes instead. */
  filter?: (story: SavedStory) => boolean;
};

export const STORY_FOLDERS: readonly StoryFolder[] = [
  { value: "all", label: "All Stories", tint: "bg-tab-basics", edge: "border-t-tab-basics", filter: () => true },
  // The lantern's gold.
  { value: "timekeeper", label: "Timekeeper", tint: "bg-tab-virtues", edge: "border-t-tab-virtues", filter: isTimekeeperStory },
  { value: "favorites", label: "Favorites", tint: "bg-tab-personality", edge: "border-t-tab-personality", filter: (s) => Boolean(s.isFavorite) },
  { value: "universes", label: "Universes", tint: "bg-tab-appearance", edge: "border-t-tab-appearance" },
];

export type StoryFolderValue = StoryFolder["value"];

export function storyFolder(value: string): StoryFolder {
  return STORY_FOLDERS.find((f) => f.value === value) ?? STORY_FOLDERS[0];
}
