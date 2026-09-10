import { useQuery } from "@tanstack/react-query";
import type { HeroOfFaith, Character } from "@shared/schema";
import type { ChipSources } from "@/lib/storyChips";

/**
 * The three lists storyChips() resolves ids against, from the query cache.
 *
 * The same keys HeroPicker, SourcePicker and CharacterPicker already use, so a
 * page that lists stories costs no request that the app has not already
 * made -- and the card itself never fetches.
 */
export function useChipSources(): ChipSources {
  const { data: heroes = [] } = useQuery<HeroOfFaith[]>({ queryKey: ["/api/heroes"] });
  const { data: events = [] } = useQuery<{ id: string; label: string }[]>({
    queryKey: ["/api/biblical-events"],
  });
  const { data: characters = [] } = useQuery<Character[]>({ queryKey: ["/api/characters"] });
  return { heroes, events, characters };
}
