import { describe, it, expect } from "vitest";
import { pictureCreditsFor } from "../server/lib/modelPolicy";
import { notEnoughCreditsMessage } from "../server/lib/openai";
import { PICTURE_CREDITS, PICTURE_TIERS, FREE_STORIES } from "../shared/schema";

/**
 * WHAT A PICTURE COSTS THE READER.
 *
 * Pictures used to be gated: an admin or an account on its own key could draw
 * and nobody else could, at any price. They are bought now, from the same
 * bucket a story spends, so the price IS the limit -- which makes these
 * numbers the thing standing between a child pressing a button and the
 * owner's OpenAI bill.
 */
describe("pictureCreditsFor", () => {
  const free = { isAdmin: false, hasOwnKey: false };

  it("charges a free account by tier", () => {
    expect(pictureCreditsFor("none", free)).toBe(0);
    expect(pictureCreditsFor("medium", free)).toBe(1);
    expect(pictureCreditsFor("high", free)).toBe(3);
    expect(pictureCreditsFor("xhigh", free)).toBe(6);
  });

  it("charges nobody who pays their own way, at any tier", () => {
    for (const entitled of [
      { isAdmin: true, hasOwnKey: false },
      { isAdmin: false, hasOwnKey: true },
      { isAdmin: true, hasOwnKey: true },
    ]) {
      for (const tier of PICTURE_TIERS) {
        expect(pictureCreditsFor(tier, entitled)).toBe(0);
      }
    }
  });

  it("never charges nothing for a tier that draws", () => {
    // A missing price must not become a free picture on the owner's key --
    // the rule storyCreditsFor already states for an unpriced model.
    for (const tier of PICTURE_TIERS.filter((t) => t !== "none")) {
      expect(pictureCreditsFor(tier, free)).toBeGreaterThan(0);
    }
  });

  it("prices a picture under a month's top-up, so one is never unbuyable", () => {
    for (const tier of PICTURE_TIERS) {
      expect(PICTURE_CREDITS[tier]).toBeLessThanOrEqual(FREE_STORIES);
    }
  });
});

/**
 * The refusal is the only place a reader learns what went wrong, and
 * decisions.md 16 is the rule it has to keep: never offer a remedy the system
 * will not actually attempt.
 */
describe("what a refusal says when the credits run out", () => {
  const nextTopUp = new Date("2026-10-01T00:00:00Z");

  it("names the story and its picture separately", () => {
    const message = notEnoughCreditsMessage(
      "gpt-5.6-luna",
      7,
      { remaining: 2, nextTopUp },
      { credits: 6, tier: "xhigh" },
    );
    expect(message).toMatch(/1 credit for the story/);
    expect(message).toMatch(/6 credits for its picture/);
  });

  it("offers a cheaper picture when one would actually fit", () => {
    // 1 for the story + 6 for the picture, with 4 left: detailed (3) fits.
    const message = notEnoughCreditsMessage(
      "gpt-5.6-luna",
      7,
      { remaining: 4, nextTopUp },
      { credits: 6, tier: "xhigh" },
    );
    expect(message).toMatch(/detailed pictures/i);
    expect(message).toMatch(/3 credits a picture/);
  });

  it("offers no picture at all when nothing dearer fits", () => {
    // 1 + 6 with 1 left: only "no picture" leaves the story affordable.
    const message = notEnoughCreditsMessage(
      "gpt-5.6-luna",
      7,
      { remaining: 1, nextTopUp },
      { credits: 6, tier: "xhigh" },
    );
    expect(message).toMatch(/no picture/i);
  });

  it("says nothing about pictures when the picture is not the problem", () => {
    const message = notEnoughCreditsMessage("gpt-5.6-luna", 1, { remaining: 0, nextTopUp });
    expect(message).not.toMatch(/picture/i);
    expect(message).toMatch(/used all your credits/i);
  });

  it("always offers the top-up, with its date", () => {
    for (const remaining of [0, 1, 4]) {
      const message = notEnoughCreditsMessage(
        "gpt-5.6-luna",
        7,
        { remaining, nextTopUp },
        { credits: 6, tier: "xhigh" },
      );
      expect(message).toMatch(/1 October/);
    }
  });
});
