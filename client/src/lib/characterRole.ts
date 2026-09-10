import type { CharacterRole } from "@shared/schema";

/**
 * The three answers to "how is your character in this account", in words.
 *
 * ONE definition, read by the story form's radio AND by the Parent-Mode prompt
 * preview. They used to be two: the radio said "They travel there" and the
 * preview said "they travel to it", which is exactly the drift the form's own
 * comment forbade. A user who reads two different descriptions of the same
 * choice has been told the app does not know either.
 *
 * The keys are the request's `characterRole` values and are FROZEN into
 * story_jobs.request -- the label is the only thing here that may be renamed.
 */
export const ROLE_OPTIONS: Record<CharacterRole, { label: string; description: string }> = {
  absent: {
    label: "Not in the story",
    description:
      "A straight retelling of what actually happened. Your character is not written into it.",
  },
  travels: {
    label: "A Quest with the Timekeeper",
    description:
      "Your character starts here and now. The Timekeeper's lantern takes them into the story, and they come back changed. It opens before the journey and returns to the present after it.",
  },
  alongside: {
    label: "They were always there",
    description:
      "Your character belongs to that time and place, and always did. No journey. They help, and they ask the hard questions — but everything still happens exactly as it really did.",
  },
};
