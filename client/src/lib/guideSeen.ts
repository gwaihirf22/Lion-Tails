/**
 * Whether this person has been shown the guide, as far as this browser knows.
 *
 * The truth lives on the account (`user_settings.guide_seen_at`), because Blake
 * asked for once per account rather than once per device. This is the mirror
 * that stops the guide flashing open for a second while that query is in
 * flight -- the same trick, and the same key shape, as the reading prefs
 * (`liontails.reader.prefs.v1:<userId>`).
 *
 * Pure, so the version comparison is testable and the try/catch around
 * localStorage stays one line. Storage can be blocked entirely (a private
 * window, a locked-down tablet), and a blocked mirror must mean "ask the
 * server", never "never show it" or "show it every time".
 */

export const guideSeenKey = (userId: number | null | undefined) =>
  `liontails.guide.seen.v1:${userId ?? "anon"}`;

export type GuideSeen = { version: number; seenAt: string };

/**
 * Has the guide been seen, at this version or later?
 *
 * `raw` is whatever came out of localStorage: a string, null, or nonsense
 * written by an older build. Anything unreadable counts as not seen, which
 * costs one welcome and never hides it.
 */
export function seenGuide(raw: string | null | undefined, version: number): boolean {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as Partial<GuideSeen>;
    return typeof parsed?.version === "number" && parsed.version >= version;
  } catch {
    return false;
  }
}

export function guideSeenValue(version: number, at = new Date()): string {
  return JSON.stringify({ version, seenAt: at.toISOString() } satisfies GuideSeen);
}

/** Both sides wrapped, because a blocked store throws on read AND on write. */
export function readGuideSeen(userId: number | null | undefined, version: number): boolean {
  try {
    return seenGuide(localStorage.getItem(guideSeenKey(userId)), version);
  } catch {
    return false;
  }
}

export function writeGuideSeen(userId: number | null | undefined, version: number): void {
  try {
    localStorage.setItem(guideSeenKey(userId), guideSeenValue(version));
  } catch {
    // A browser that cannot remember is a browser that gets asked again. Fine.
  }
}
