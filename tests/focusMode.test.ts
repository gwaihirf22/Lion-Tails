import { describe, it, expect } from "vitest";
import { pointerReveals, foldScroll } from "../client/src/components/reader/useFocusMode";

/**
 * What is allowed to interrupt focus mode.
 *
 * The first version revealed the toolbar on any pointer movement and any tap,
 * which meant a hand resting on a trackpad or a finger anywhere near the
 * screen kept bringing the chrome back. The fade worked; the feature did not.
 *
 * These are the rules, written down so the permissive version cannot come
 * back by accident.
 */

const move = (clientY: number, pointerType = "mouse") => ({ pointerType, clientY });
const fresh = { needsExit: false };

describe("pointer", () => {
  it("does not reveal on mouse movement across the page", () => {
    // The complaint, exactly.
    expect(pointerReveals(move(300), fresh)).toBe(false);
    expect(pointerReveals(move(120), fresh)).toBe(false);
  });

  it("reveals when the mouse reaches the strip where the toolbar is", () => {
    expect(pointerReveals(move(10), fresh)).toBe(true);
    expect(pointerReveals(move(79), fresh)).toBe(true);
  });

  it("ignores touch entirely, including a touch inside the strip", () => {
    // A finger travelling past the top of the screen is not a request for the
    // toolbar, and a tap is how you turn a page.
    expect(pointerReveals(move(10, "touch"), fresh)).toBe(false);
    expect(pointerReveals(move(300, "touch"), fresh)).toBe(false);
    expect(pointerReveals(move(10, "pen"), fresh)).toBe(false);
  });

  it("stays quiet until the pointer has left the strip once", () => {
    // The Focus button is IN the strip, so the cursor is sitting in the reveal
    // zone the instant focus mode is armed. Without this, pressing Focus would
    // undo itself.
    expect(pointerReveals(move(10), { needsExit: true })).toBe(false);
  });
});

describe("scroll", () => {
  const run = (deltas: number[]) => {
    let state = 0;
    let reveals = 0;
    for (const d of deltas) {
      const r = foldScroll(state, d);
      state = r.run;
      if (r.reveals) reveals++;
    }
    return { state, reveals };
  };

  it("never reveals while scrolling down", () => {
    // Scrolling down IS reading. This is the one the original hook got right
    // and it must survive the rewrite.
    expect(run([50, 120, 300, 40, 900]).reveals).toBe(0);
  });

  it("reveals on a deliberate scroll up", () => {
    expect(run([-60]).reveals).toBe(1);
  });

  it("ignores a small upward nudge", () => {
    // Momentum, rubber-banding at the top of the document, and the one-pixel
    // correction after a tap all produce small upward deltas.
    expect(run([-5, -10, -8]).reveals).toBe(0);
  });

  it("accumulates a slow deliberate scroll up", () => {
    expect(run([-15, -15, -15]).reveals).toBe(1);
  });

  it("resets the run on any downward movement", () => {
    // Reading down, glancing back up a little, reading on again must not add
    // up to a reveal across the whole session.
    expect(run([-20, 30, -20, 30, -20]).reveals).toBe(0);
  });

  it("does not fire twice for one continuous upward scroll", () => {
    // The run resets after firing, so a long flick up reveals once and then
    // needs another threshold's worth to fire again.
    expect(run([-50]).reveals).toBe(1);
    expect(run([-50, -10]).reveals).toBe(1);
  });
});
