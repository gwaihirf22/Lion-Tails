import { describe, it, expect } from "vitest";
import {
  FREE_STORIES,
  FREE_STORIES_PER_MONTH,
  storyAllowance,
} from "../shared/schema";

/**
 * The free story allowance.
 *
 * None of this was testable before: the rule lived as five restatements of 50
 * and 10 across two server modules, two endpoints and two screens, with four
 * different meanings of "a month". These assert the rule ONCE, which is the
 * whole point of the function existing.
 */
const at = (y: number, m: number, d = 15) => new Date(y, m - 1, d);

describe("what a new account may spend", () => {
  it("starts with the full allowance", () => {
    expect(storyAllowance(undefined, at(2026, 9))).toMatchObject({
      used: 0,
      remaining: FREE_STORIES,
      total: FREE_STORIES,
    });
    expect(storyAllowance(null, at(2026, 9)).remaining).toBe(FREE_STORIES);
  });

  it("owes nothing when nothing has ever been charged", () => {
    // No reset date means no story was ever charged, so there is no elapsed
    // month to forgive -- otherwise a brand-new account would appear to be
    // owed every month since the epoch.
    expect(storyAllowance({ count: 0, lastResetDate: null }, at(2026, 9)).monthsOwed).toBe(0);
  });
});

describe("the monthly top-up", () => {
  const heavy = { count: 45, lastResetDate: at(2026, 1) };

  it("gives back ten a month, not a full refill", () => {
    // The distinction that matters: a refill would put this user back to 50.
    expect(storyAllowance(heavy, at(2026, 1)).remaining).toBe(5);
    expect(storyAllowance(heavy, at(2026, 2)).remaining).toBe(15);
    expect(storyAllowance(heavy, at(2026, 3)).remaining).toBe(25);
  });

  it("stops at the ceiling and stays there", () => {
    const light = { count: 3, lastResetDate: at(2026, 1) };
    expect(storyAllowance(light, at(2026, 2)).remaining).toBe(FREE_STORIES);
    // A year later it is still fifty. Nothing banks up.
    expect(storyAllowance(light, at(2027, 1)).remaining).toBe(FREE_STORIES);
    expect(storyAllowance(light, at(2027, 1)).remaining).not.toBeGreaterThan(FREE_STORIES);
  });

  it("counts calendar months, including across a year boundary", () => {
    const u = { count: 30, lastResetDate: at(2025, 11) };
    // Nov -> Feb is three months, not "about ninety days".
    expect(storyAllowance(u, at(2026, 2)).monthsOwed).toBe(3);
    expect(storyAllowance(u, at(2026, 2)).used).toBe(0);
  });

  it("never runs backwards if the clock does", () => {
    const u = { count: 20, lastResetDate: at(2026, 9) };
    expect(storyAllowance(u, at(2026, 7)).monthsOwed).toBe(0);
    expect(storyAllowance(u, at(2026, 7)).used).toBe(20);
  });
});

describe("numbers that must never appear", () => {
  it("never reports more than the ceiling", () => {
    const u = { count: 0, lastResetDate: at(2020, 1) };
    expect(storyAllowance(u, at(2026, 9)).remaining).toBe(FREE_STORIES);
  });

  it("never reports a negative, whatever the row says", () => {
    // A row can carry a count above the ceiling: an admin generated freely, or
    // the ceiling was lowered from 60 to 50 -- which is exactly what happened.
    const over = { count: 200, lastResetDate: null };
    expect(storyAllowance(over, at(2026, 9)).remaining).toBe(0);
    expect(storyAllowance({ count: -5 }, at(2026, 9)).used).toBe(0);
  });
});

describe("idempotence", () => {
  it("does not owe the same month twice", () => {
    // The failure mode of the code this replaces: the reset had no guard, so
    // two calls both fired and each pushed the date forward again. Applying
    // what is owed and asking again must find nothing owed.
    const before = { count: 45, lastResetDate: at(2026, 1, 1) };
    const first = storyAllowance(before, at(2026, 3));
    expect(first.monthsOwed).toBe(2);

    const after = { count: first.toppedUpCount, lastResetDate: at(2026, 3, 1) };
    const second = storyAllowance(after, at(2026, 3));
    expect(second.monthsOwed).toBe(0);
    expect(second.used).toBe(first.used);
    expect(second.remaining).toBe(first.remaining);
  });
});

describe("when the next top-up lands", () => {
  it("is the first of a month, never the 31st rolling over", () => {
    // setMonth(+1) then setDate(1) gave 1 MARCH from 31 January, because the
    // intermediate date overflowed before the day was pinned.
    const u = { count: 10, lastResetDate: new Date(2026, 0, 31) };
    const next = storyAllowance(u, new Date(2026, 0, 31)).nextTopUp;
    expect(next.getDate()).toBe(1);
    expect(next.getMonth()).toBe(1); // February, not March
    expect(next.getFullYear()).toBe(2026);
  });

  it("is always in the future", () => {
    const now = at(2026, 6, 20);
    expect(storyAllowance({ count: 5, lastResetDate: at(2026, 6, 1) }, now).nextTopUp.getTime())
      .toBeGreaterThan(now.getTime());
    expect(storyAllowance({ count: 5, lastResetDate: at(2025, 1, 1) }, now).nextTopUp.getTime())
      .toBeGreaterThan(now.getTime());
  });
});

describe("the constants themselves", () => {
  it("are the only numbers, and the monthly one is smaller than the ceiling", () => {
    // If the month ever exceeded the ceiling the cap would be meaningless.
    expect(FREE_STORIES_PER_MONTH).toBeLessThan(FREE_STORIES);
    expect(FREE_STORIES_PER_MONTH).toBeGreaterThan(0);
  });
});
