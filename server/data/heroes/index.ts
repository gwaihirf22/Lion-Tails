import type { HeroOfFaith } from "@shared/schema";
import { HERO_GROUPS, BIBLE_GROUPS } from "@shared/schema";
import { toHero, type RawHero } from "./types";
import { earlyChurch } from "./earlyChurch";
import { medieval } from "./medieval";
import { reformers } from "./reformers";
import { puritans } from "./puritans";
import { awakening } from "./awakening";
import { missionaries } from "./missionaries";
import { modern } from "./modern";

/**
 * Everyone, in one list.
 *
 * Split by era across files because seventy full profiles in one module is
 * unreadable and unmergeable. The order here is chronological, and the page
 * groups by era rather than relying on it.
 */
const ALL: RawHero[] = [...earlyChurch, ...medieval, ...reformers, ...puritans, ...awakening, ...missionaries, ...modern];

/**
 * Duplicate slugs would make the seed's upsert silently drop a person, so this
 * fails loudly at import rather than at 3am in production.
 */
const seen = new Set<string>();
for (const h of ALL) {
  if (seen.has(h.id)) throw new Error(`Duplicate hero id: ${h.id}`);
  seen.add(h.id);
  const valid: readonly string[] =
    h.collection === "biblical" ? BIBLE_GROUPS : HERO_GROUPS;
  if (!valid.includes(h.group)) {
    throw new Error(`Unknown group for ${h.id}: ${h.group} (collection: ${h.collection ?? "historical"})`);
  }
}

const order = new Map(HERO_GROUPS.map((g, i) => [g, i]));

export const heroesOfFaithData: HeroOfFaith[] = ALL.map(toHero).sort((a, b) => {
  const g = (order.get(a.group as never) ?? 99) - (order.get(b.group as never) ?? 99);
  if (g !== 0) return g;
  // Within an era, oldest first. birthYear can be "c. 296", so pull the digits.
  const year = (h: HeroOfFaith) => parseInt((h.birthYear ?? h.timePeriod ?? "").replace(/\D+/g, "").slice(0, 4) || "9999", 10);
  return year(a) - year(b);
});

/** How many profiles are still short, so progress is visible rather than assumed. */
export const heroesWithoutBiography = ALL.filter((h) => !h.biography).map((h) => h.id);

export { HERO_GROUPS };
