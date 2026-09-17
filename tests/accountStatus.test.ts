import { describe, it, expect } from "vitest";
import {
  ACCOUNT_SUSPENDED_MESSAGE,
  isBanned,
  mayChangeAccount,
} from "../shared/accountStatus";

/**
 * A ban is read in four places -- the sign-in check, every request on a live
 * session, the public share link, and the admin page -- so the rule is one
 * predicate and the words are one string. These are the tests for both.
 */
describe("isBanned", () => {
  it("is the presence of a date, and nothing else", () => {
    expect(isBanned({ bannedAt: new Date("2026-09-17") })).toBe(true);
    expect(isBanned({ bannedAt: "2026-09-17T00:00:00Z" })).toBe(true);
    expect(isBanned({ bannedAt: null })).toBe(false);
    expect(isBanned({})).toBe(false);
    expect(isBanned(undefined)).toBe(false);
    expect(isBanned(null)).toBe(false);
  });
});

describe("what a banned person is told", () => {
  it("says nothing was deleted, and how to argue", () => {
    // They are locked out, not erased, and the sentence has to carry both --
    // otherwise the first thing they assume is that their stories are gone.
    expect(ACCOUNT_SUSPENDED_MESSAGE).toMatch(/suspended/i);
    expect(ACCOUNT_SUSPENDED_MESSAGE).toMatch(/nothing has been deleted/i);
    expect(ACCOUNT_SUSPENDED_MESSAGE).toMatch(/mistake/i);
  });

  it("never says why", () => {
    // The reason is for the owner's page. A sign-in form is not the place to
    // have that argument, and the reason is often about somebody else.
    // Word boundaries, or "suspended" matches "spend" and this test fails on
    // the very word it is checking around.
    expect(ACCOUNT_SUSPENDED_MESSAGE).not.toMatch(/\b(spending|abuse|refused|limit)\b/i);
  });
});

/**
 * THE TWO WAYS TO LOCK YOURSELF OUT OF YOUR OWN APP.
 *
 * There is no second admin path: is_admin is set by hand-written SQL against
 * production, so an app with no admin left is an app that needs a database
 * console to recover. Both rules exist to make that unreachable by clicking.
 */
describe("mayChangeAccount", () => {
  const other = { id: 2, isAdmin: false };
  const otherAdmin = { id: 2, isAdmin: true };

  it("lets an admin act on somebody else", () => {
    expect(mayChangeAccount(1, other, 1)).toEqual({ ok: true });
    expect(mayChangeAccount(1, otherAdmin, 2)).toEqual({ ok: true });
  });

  it("refuses to let anyone ban or demote themselves", () => {
    const out = mayChangeAccount(1, { id: 1, isAdmin: true }, 5);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toMatch(/your own account/i);
  });

  it("refuses to remove the last admin", () => {
    const out = mayChangeAccount(1, otherAdmin, 1);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toMatch(/last admin/i);
  });

  it("checks self before the count, so the last admin cannot self-ban either", () => {
    const out = mayChangeAccount(1, { id: 1, isAdmin: true }, 1);
    expect(out.ok).toBe(false);
  });
});
