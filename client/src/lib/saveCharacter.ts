import { apiRequest } from "@/lib/queryClient";
import { type Character } from "@shared/schema";
import { type CharacterFormValues } from "@/components/CharacterForm";

/**
 * Where a character save goes, in one place.
 *
 * There are four endpoints -- create or update, strict or Parent Mode -- and
 * two screens that save characters. Four times two is how a codebase ends up
 * with one screen that can make a space whale and one that cannot.
 *
 * `custom` comes from the form, which knows whether a value was chosen from the
 * catalogue or typed. It is not a claim of permission: the /custom routes carry
 * requireParentMode, so a caller that sets it without an unlocked session gets
 * a 403 rather than a way round the list.
 */
export function saveCharacter(
  values: CharacterFormValues,
  custom: boolean,
  id?: string,
): Promise<Character> {
  const path = id
    ? `/api/characters/${id}${custom ? "/custom" : ""}`
    : `/api/characters${custom ? "/custom" : ""}`;

  return apiRequest(id ? "PUT" : "POST", path, values).then((r) => r.json());
}
