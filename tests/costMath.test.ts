import { describe, expect, it } from "vitest";
import {
  costMicros,
  emptyBreakdown,
  parsePrice,
  percentile,
  sellingAtALoss,
  suggestedPriceCents,
  usageBreakdown,
} from "../server/lib/costMath";

describe("usageBreakdown", () => {
  it("reads Chat Completions usage, pricing cached and cache-write input separately", () => {
    const u = usageBreakdown(
      {
        prompt_tokens: 10_000,
        completion_tokens: 3_000,
        prompt_tokens_details: { cached_tokens: 4_000, cache_write_tokens: 1_000 },
        completion_tokens_details: { reasoning_tokens: 1_200 },
      },
      "text",
    );
    expect(u.input_text).toBe(5_000);
    expect(u.input_cached).toBe(4_000);
    expect(u.input_cache_write).toBe(1_000);
    // Reasoning is billed as output and is ALREADY in completion_tokens.
    expect(u.output_text).toBe(3_000);
    expect(u.reasoning).toBe(1_200);
  });

  it("reads Responses API usage the same way", () => {
    const u = usageBreakdown(
      { input_tokens: 800, output_tokens: 200, input_tokens_details: { cached_tokens: 300 }, output_tokens_details: { reasoning_tokens: 50 } },
      "text",
    );
    expect(u).toMatchObject({ input_text: 500, input_cached: 300, output_text: 200, reasoning: 50 });
  });

  it("reads Images API usage: text and image input, image output", () => {
    const u = usageBreakdown(
      {
        input_tokens: 2_300,
        output_tokens: 6_240,
        input_tokens_details: { text_tokens: 300, image_tokens: 2_000 },
        output_tokens_details: { image_tokens: 6_240 },
      },
      "image",
    );
    expect(u).toMatchObject({ input_text: 300, input_image: 2_000, output_image: 6_240, output_text: 0 });
  });

  it("treats an image call with no output details as image output", () => {
    expect(usageBreakdown({ input_tokens: 50, output_tokens: 4_000 }, "image").output_image).toBe(4_000);
  });

  it("returns zeros for anything it cannot read, and never throws", () => {
    for (const bad of [undefined, null, "x", 3, { prompt_tokens: "lots" }, { input_tokens: -5 }]) {
      expect(usageBreakdown(bad, "text")).toEqual(emptyBreakdown());
    }
  });
});

describe("costMicros", () => {
  const luna = { input_text: 0.4, input_cached: 0.04, input_cache_write: 0.5, output_text: 1.6 };

  it("is tokens times dollars-per-million, in micros", () => {
    const u = { ...emptyBreakdown(), input_text: 5_000, input_cached: 4_000, input_cache_write: 1_000, output_text: 3_000 };
    // 5000*0.4 + 4000*0.04 + 1000*0.5 + 3000*1.6 = 2000 + 160 + 500 + 4800
    expect(costMicros(u, luna)).toBe(7_460);
  });

  it("prices a picture by its image tokens", () => {
    const image = { input_text: 5, input_image: 8, input_image_cached: 2, output_image: 30 };
    const u = { ...emptyBreakdown(), input_text: 300, input_image: 2_000, output_image: 6_240 };
    // 300*5 + 2000*8 + 6240*30 = 1500 + 16000 + 187200
    expect(costMicros(u, image)).toBe(204_700);
  });

  it("is null, never zero, when a used unit has no price", () => {
    const u = { ...emptyBreakdown(), input_text: 10, output_image: 10 };
    expect(costMicros(u, luna)).toBeNull();
    expect(costMicros(u, undefined)).toBeNull();
    // An unused unit with no price is fine.
    expect(costMicros({ ...emptyBreakdown(), input_text: 10 }, luna)).toBe(4);
  });
});

describe("prices for people", () => {
  it("rounds up to a whole cent, so rounding never sells below cost", () => {
    // $0.0301 at 20% = $0.03612 -> 4c
    expect(suggestedPriceCents(30_100, 20)).toBe(4);
    // Exactly 3c with no margin stays 3c.
    expect(suggestedPriceCents(30_000, 0)).toBe(3);
    // Never free.
    expect(suggestedPriceCents(1, 20)).toBe(1);
  });

  it("flags a published price below what the item now costs", () => {
    expect(sellingAtALoss(3, 30_001)).toBe(true);
    expect(sellingAtALoss(3, 30_000)).toBe(false);
  });

  it("takes a nearest-rank percentile", () => {
    expect(percentile([4, 1, 3, 2], 0.75)).toBe(3);
    expect(percentile([10], 0.75)).toBe(10);
    expect(percentile([], 0.75)).toBeUndefined();
  });

  it("reads a stored numeric price", () => {
    expect(parsePrice("0.150000")).toBe(0.15);
    expect(parsePrice("nope")).toBeUndefined();
    expect(parsePrice(-1)).toBeUndefined();
  });
});
