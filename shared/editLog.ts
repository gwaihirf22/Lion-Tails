import { z } from "zod";

/**
 * What a parent changed by hand, and when.
 *
 * Stories and universes are written by a model; when a parent edits one, the
 * reader is told -- under the title, and in a history beside the AI's own
 * record -- so a story is never passed off as all the AI's, or all a
 * person's. One type and one label for every place that says it: the card
 * chip, the reader line, the universe line, both accordions.
 *
 * No before/after. An entry records that a change happened, by whom (always
 * "a parent" -- reader-visible provenance is for everyone, so never a name)
 * and which parts; the previous text is not kept.
 */
export const editLogEntrySchema = z.object({
  /** ISO timestamp. */
  at: z.string(),
  by: z.literal("parent"),
  /** Which fields: "title" | "content" for a story, "name" | "summary" for a universe. */
  changed: z.array(z.string()),
});

export type EditLogEntry = z.infer<typeof editLogEntrySchema>;

export const EDITED_BY_PARENT = "Edited by a parent";

/** The most recent entry's time, or undefined for a record nobody has edited. */
export function lastEditedAt(log: EditLogEntry[] | null | undefined): string | undefined {
  if (!log || log.length === 0) return undefined;
  return log.reduce((latest, e) => (e.at > latest ? e.at : latest), log[0].at);
}
