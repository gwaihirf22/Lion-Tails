import { describe, it, expect } from "vitest";
import { fitNavItems } from "../client/src/lib/navFit";

// Home, Create Story, My Stories, Characters -- roughly their real widths.
const widths = [66, 118, 108, 100];
const more = 76;
const gap = 4;

describe("fitNavItems", () => {
  it("shows everything, with no More, when it all fits", () => {
    const all = 66 + 118 + 108 + 100 + 3 * gap;
    expect(fitNavItems(widths, more, gap, all)).toBe(4);
  });

  it("reserves room for More as soon as anything overflows", () => {
    const all = 66 + 118 + 108 + 100 + 3 * gap;
    const threeAndMore = 66 + 118 + 108 + more + 3 * gap;
    expect(fitNavItems(widths, more, gap, all - 1)).toBe(3);
    expect(fitNavItems(widths, more, gap, threeAndMore)).toBe(3);
    expect(fitNavItems(widths, more, gap, threeAndMore - 1)).toBe(2);
  });

  it("drops two links when More is wider than the one it replaces", () => {
    // Four links fit exactly with a narrow last one; one pixel less, and three
    // links + a wider More do not fit either.
    const narrow = [66, 118, 108, 60];
    const all = 66 + 118 + 108 + 60 + 3 * gap;
    expect(fitNavItems(narrow, more, gap, all - 1)).toBe(2);
  });

  it("never returns a count whose row is wider than the space", () => {
    for (let available = 0; available < 500; available++) {
      const n = fitNavItems(widths, more, gap, available);
      const parts = widths.slice(0, n).concat(n < widths.length ? [more] : []);
      const used = parts.reduce((a, b) => a + b, 0) + gap * Math.max(0, parts.length - 1);
      if (n > 0) expect(used).toBeLessThanOrEqual(available);
    }
  });

  it("puts everything in More when not even one link fits beside it", () => {
    expect(fitNavItems(widths, more, gap, 100)).toBe(0);
    expect(fitNavItems(widths, more, gap, -20)).toBe(0);
  });

  it("is monotonic: more room never shows fewer links", () => {
    let last = 0;
    for (let available = 0; available < 500; available++) {
      const n = fitNavItems(widths, more, gap, available);
      expect(n).toBeGreaterThanOrEqual(last);
      last = n;
    }
  });
});
