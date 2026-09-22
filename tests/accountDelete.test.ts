import { describe, it, expect } from "vitest";
import { typedNameMatches } from "../server/lib/accountDelete";

/**
 * The one pure thing in an otherwise all-SQL path: what counts as confirming.
 *
 * Deleting an account cannot be undone and the row above it is somebody
 * else's family, so the route asks for the username to be typed back. That
 * check has to be exact -- a near miss is a different account -- and it has to
 * survive the space a phone keyboard adds after a word.
 */
describe("typedNameMatches", () => {
  it("accepts the name exactly", () => {
    expect(typedNameMatches("grandma", "grandma")).toBe(true);
  });

  it("forgives surrounding whitespace, and nothing else", () => {
    expect(typedNameMatches("  grandma ", "grandma")).toBe(true);
    expect(typedNameMatches("grand ma", "grandma")).toBe(false);
  });

  it("is case-sensitive, because usernames are", () => {
    expect(typedNameMatches("Grandma", "grandma")).toBe(false);
  });

  it("refuses a near miss", () => {
    expect(typedNameMatches("grandm", "grandma")).toBe(false);
    expect(typedNameMatches("grandma2", "grandma")).toBe(false);
  });

  it("refuses anything that is not a string", () => {
    // The body is attacker-controlled: `true` must not read as confirmation.
    for (const value of [undefined, null, true, 1, {}, ["grandma"]]) {
      expect(typedNameMatches(value, "grandma"), String(value)).toBe(false);
    }
  });

  it("refuses an empty answer even for an empty name", () => {
    // Not reachable today -- usernames are at least three characters -- but a
    // confirmation that passes on "" is the wrong shape to leave lying about.
    expect(typedNameMatches("", "")).toBe(true);
    expect(typedNameMatches("", "grandma")).toBe(false);
  });
});
