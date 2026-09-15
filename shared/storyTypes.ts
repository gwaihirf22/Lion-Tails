import type { CharacterRole, StoryRequest } from "./schema";

export type StoryType = StoryRequest["storyType"];

/**
 * The Story Type choices, in words -- one definition, like ROLE_OPTIONS.
 *
 * The keys are the request's `storyType` values and are frozen into
 * story_jobs.request; only the words may change.
 */
export const STORY_TYPE_OPTIONS: Record<StoryType, { label: string; description: string }> = {
  regular: {
    label: "Regular Story",
    description:
      "Anything you can imagine. The only kind that can visit the Timekeeper or a real event.",
  },
  poem: {
    label: "Poem",
    description: "Your idea, told in verse.",
  },
  moral: {
    label: "Moral Story",
    description: "Built around one choice worth talking about.",
  },
};

/**
 * Poems and moral stories are the free modes: your own ideas, nothing set in
 * a real account. Only a regular story may take a quest or be set alongside
 * somebody who really lived.
 *
 * Refused, not blended. A poem never reaches the chaptered path, so a poem
 * quest silently lost the whole quest shape; a moral story's "one clear
 * moral" fought the account prompts' "let the lesson come out of what
 * happened". Read the role through characterRoleOf() so legacy requests
 * (useTimeTravel, "meets") are judged the same way.
 */
export function storyTypeFitsRole(storyType: StoryType | undefined, role: CharacterRole): boolean {
  return role === "absent" || (storyType ?? "regular") === "regular";
}

export const STORY_TYPE_ROLE_MESSAGE =
  "Poems and moral stories are for your own ideas. A quest, or a story set somewhere real, is a regular story.";
