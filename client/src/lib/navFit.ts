/**
 * How many nav links fit in the bar, measured rather than guessed.
 *
 * The header used to pick a count from window.innerWidth breakpoints. That
 * cannot know the three things that decide whether a link fits: the Tailwind
 * container snaps narrower at 1024/1280 (so a WIDER window can have LESS room),
 * the username is as long as the account's, and the "story being written" pill
 * appears beside the brand. At 910-1020px with "paulblake" signed in, Home
 * butted straight into the wordmark.
 *
 * `widths` are the natural widths of every link, in order. `more` is the
 * "More" trigger, which is only paid for when something overflows into it.
 * `gap` is the spacing between list items. Returns how many to show inline.
 */
export function fitNavItems(
  widths: readonly number[],
  more: number,
  gap: number,
  available: number,
): number {
  const row = (n: number, withMore: boolean) => {
    const parts = widths.slice(0, n).concat(withMore ? [more] : []);
    if (parts.length === 0) return 0;
    return parts.reduce((a, b) => a + b, 0) + gap * (parts.length - 1);
  };

  if (row(widths.length, false) <= available) return widths.length;
  for (let n = widths.length - 1; n > 0; n--) {
    if (row(n, true) <= available) return n;
  }
  // Nothing fits beside "More": everything goes in the menu. Never negative,
  // never a partial link clipped at the edge.
  return 0;
}
