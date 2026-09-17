/**
 * One sentence an admin should read, wherever it came from.
 *
 * There are two producers now -- `buildWarnings()` in costReport.ts, about
 * money and prices, and `abuseWarnings()` in abuseWatch.ts, about accounts --
 * and two screens that render them. It lived in costReport.ts with the client
 * carrying its own hand-typed copy, which is the parallel definition this repo
 * keeps producing bugs from; a third copy for the accounts page is exactly the
 * moment to stop.
 *
 * `level` is the whole vocabulary: **action** is something to decide, **watch**
 * is something true that may or may not matter. Nothing is a warning because it
 * is merely empty.
 */
export type Warning = {
  level: "action" | "watch";
  code: string;
  message: string;
};

/**
 * Things to decide before things to notice, and otherwise the order they were
 * found in -- which is the producer's own order, and each producer sorts its
 * own findings by size before handing them over.
 */
export function mostUrgentFirst<T extends Warning>(warnings: T[]): T[] {
  return [...warnings].sort((a, b) => rank(a.level) - rank(b.level));
}

const rank = (level: Warning["level"]) => (level === "action" ? 0 : 1);
