/**
 * What an `account_events` row can say, in one place.
 *
 * Shared because the server writes these strings and the admin page reads them
 * back as words on a screen: a kind spelled one way in the recorder and another
 * in the label is a count that silently reads zero. The tuple is the
 * definition; `Record` types over it make a missing label a compile error,
 * which is the reading-levels pattern (`READING_LEVEL_LABELS`).
 */

export const ACCOUNT_EVENT_KINDS = ["refusal"] as const;
export type AccountEventKind = (typeof ACCOUNT_EVENT_KINDS)[number];

/**
 * Which thing the model refused to make. NOT what was asked for -- see the
 * table's own comment: there is no content column and this is not one.
 */
export const REFUSAL_SOURCES = ["story", "picture", "portrait"] as const;
export type RefusalSource = (typeof REFUSAL_SOURCES)[number];

export const REFUSAL_SOURCE_LABELS: Record<RefusalSource, string> = {
  story: "a story",
  picture: "a picture in a story",
  portrait: "a character portrait",
};

/** A sentence for the admin page, so the page does not build one itself. */
export function refusalLabel(detail: string | null): string {
  const known = REFUSAL_SOURCES.find((s) => s === detail);
  return known ? REFUSAL_SOURCE_LABELS[known] : "something";
}
