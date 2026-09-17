import { describe, it, expect } from "vitest";
import {
  makePassphrase,
  passphraseBits,
  PASSPHRASE_WORDS,
  PASSPHRASE_WORD_COUNT,
} from "../shared/passphrase";

/**
 * The password an admin never chooses.
 *
 * An admin creating an account for somebody cannot be asked to invent their
 * password: it would be short, it would be reused, and it would travel through
 * a chat message. The server mints it instead and shows it once, so there is
 * no weak-password path to test -- only that what it mints is worth having.
 */
describe("makePassphrase", () => {
  /** A counter, so the assembly is tested rather than the randomness. */
  const counting = () => {
    let n = 0;
    return (bound: number) => n++ % bound;
  };

  it("is four words and two digits, joined so it can be read aloud", () => {
    const phrase = makePassphrase(counting());
    const parts = phrase.split("-");
    expect(parts).toHaveLength(PASSPHRASE_WORD_COUNT + 1);
    for (const word of parts.slice(0, PASSPHRASE_WORD_COUNT)) {
      expect(PASSPHRASE_WORDS).toContain(word);
    }
    expect(parts[parts.length - 1]).toMatch(/^\d{2}$/);
  });

  it("uses every value the source gives it", () => {
    // A generator that quietly ignored its source would look random and be
    // worth nothing. Two different sources must give two different phrases.
    const a = makePassphrase(() => 0);
    const b = makePassphrase(() => 1);
    expect(a).not.toBe(b);
  });

  it("never contains a character that survives a phone call badly", () => {
    const phrase = makePassphrase(counting());
    expect(phrase).toMatch(/^[a-z0-9-]+$/);
  });

  it("is long enough to be worth typing", () => {
    // Short enough to read out, long enough that the rate limit in front of
    // the login form is doing the easy half of the work.
    expect(passphraseBits()).toBeGreaterThan(30);
  });
});

describe("the word list", () => {
  it("has no duplicates", () => {
    expect(new Set(PASSPHRASE_WORDS).size).toBe(PASSPHRASE_WORDS.length);
  });

  it("is all lower-case letters", () => {
    for (const word of PASSPHRASE_WORDS) expect(word).toMatch(/^[a-z]+$/);
  });

  it("is big enough for the entropy the comment claims", () => {
    expect(PASSPHRASE_WORDS.length).toBeGreaterThanOrEqual(64);
  });
});
