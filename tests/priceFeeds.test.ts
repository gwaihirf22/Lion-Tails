import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  combineFeeds,
  diffPrices,
  drift,
  impliedPrices,
  parseLiteLLM,
  parsePricingMd,
  proposedSheets,
  sheetsFingerprint,
} from "../server/lib/priceFeeds";

// Real copies of both feeds, saved 2026-09-14 (LiteLLM trimmed to our models).
const litellmJson = JSON.parse(
  readFileSync(path.resolve(__dirname, "fixtures/prices/litellm-2026-09-14.json"), "utf8"),
);
const pricingMd = readFileSync(path.resolve(__dirname, "fixtures/prices/openai-pricing-2026-09-14.md"), "utf8");

const models = ["gpt-4o-mini", "gpt-4o", "gpt-5.6-luna", "gpt-5.6-terra", "gpt-6-astra", "gpt-image-2"];
const kinds: Record<string, "text" | "image"> = Object.fromEntries(
  models.map((m) => [m, m.startsWith("gpt-image") ? "image" : "text"]),
);

describe("the real feeds, as saved", () => {
  const lite = parseLiteLLM(litellmJson, models, kinds);
  const page = parsePricingMd(pricingMd, models, kinds);

  it("LiteLLM prices every catalogue model, per million", () => {
    expect(lite.missing).toEqual([]);
    expect(lite.problems).toEqual([]);
    expect(lite.sheets["gpt-5.6-luna"]).toMatchObject({
      input_text: 0.2, input_cached: 0.02, input_cache_write: 0.25, output_text: 1.2,
    });
    expect(lite.sheets["gpt-image-2"]).toMatchObject({ input_text: 5, input_image: 8, output_image: 30 });
  });

  it("OpenAI's page prices the same models, Standard tier only", () => {
    expect(page.problems).toEqual([]);
    expect(page.missing).toEqual([]);
    expect(page.sheets["gpt-6-astra"]).toMatchObject({ input_text: 10, input_cached: 1, input_cache_write: 12.5, output_text: 50 });
    // Not the Batch table's $1.00/$6.00.
    expect(page.sheets["gpt-5.6-terra"]).toMatchObject({ input_text: 2, output_text: 12 });
    expect(page.sheets["gpt-image-2"]).toMatchObject({
      input_image: 8, input_image_cached: 2, output_image: 30, input_text: 5, input_cached: 1.25,
    });
  });

  it("the two agree, and the page fills what LiteLLM lacks", () => {
    const { sheets, conflicts } = combineFeeds(lite, page, models);
    expect(conflicts).toEqual([]);
    // Cached image input is on the page and not in LiteLLM.
    expect(sheets["gpt-image-2"].input_image_cached).toBe(2);
  });
});

describe("a price change becomes a proposal", () => {
  const lite = parseLiteLLM(litellmJson, models, kinds);
  const page = parsePricingMd(pricingMd, models, kinds);
  const today = combineFeeds(lite, page, models).sheets;

  it("finds nothing when nothing changed", () => {
    expect(diffPrices(today, today, models)).toEqual([]);
  });

  it("finds the one changed price -- the check can fail", () => {
    const raised = structuredClone(litellmJson);
    raised["gpt-5.6-luna"].output_cost_per_token = 0.0000016;
    const pageRaised = pricingMd.replace("| gpt-5.6-luna | $0.20 | $0.02 | $0.25 | $1.20 |", "| gpt-5.6-luna | $0.20 | $0.02 | $0.25 | $1.60 |");
    const next = combineFeeds(parseLiteLLM(raised, models, kinds), parsePricingMd(pageRaised, models, kinds), models).sheets;
    expect(diffPrices(today, next, models)).toEqual([{ model: "gpt-5.6-luna", unit: "output_text", from: 1.2, to: 1.6 }]);
  });

  it("shows a disagreement between the feeds instead of picking silently", () => {
    const pageRaised = pricingMd.replace("| gpt-5.6-luna | $0.20 | $0.02 | $0.25 | $1.20 |", "| gpt-5.6-luna | $0.20 | $0.02 | $0.25 | $1.60 |");
    const { sheets, conflicts } = combineFeeds(lite, parsePricingMd(pageRaised, models, kinds), models);
    expect(conflicts).toEqual([{ model: "gpt-5.6-luna", unit: "output_text", litellm: 1.2, page: 1.6 }]);
    expect(sheets["gpt-5.6-luna"].output_text).toBe(1.6); // OpenAI's own page wins
  });

  it("proposes every model when nothing is approved yet", () => {
    expect(diffPrices({}, today, models).length).toBeGreaterThan(20);
  });

  it("keeps a price a feed stopped listing, rather than making it free", () => {
    const current = { "gpt-image-2": { output_image: 30, input_image_cached: 2 } };
    const incoming = { "gpt-image-2": { output_image: 30 } };
    expect(diffPrices(current, incoming, ["gpt-image-2"])).toEqual([{ model: "gpt-image-2", unit: "input_image_cached", from: 2 }]);
    expect(proposedSheets(current, incoming, ["gpt-image-2"])["gpt-image-2"].input_image_cached).toBe(2);
  });

  it("fingerprints a row set independent of key order", () => {
    expect(sheetsFingerprint({ b: { output_text: 1 }, a: { input_text: 2 } })).toBe(
      sheetsFingerprint({ a: { input_text: 2 }, b: { output_text: 1 } }),
    );
  });
});

describe("a feed that changed shape says so", () => {
  it("LiteLLM that is not an object", () => {
    const r = parseLiteLLM("oops", models, kinds);
    expect(r.problems.length).toBe(1);
    expect(r.missing).toEqual(models);
  });

  it("a pricing page with no tables", () => {
    const r = parsePricingMd("# Pricing\n\nSee our new calculator.", models, kinds);
    expect(r.problems).toHaveLength(2);
    expect(r.missing).toEqual(models);
  });

  it("a model missing from a feed", () => {
    const r = parseLiteLLM({}, ["gpt-5.6-luna"], { "gpt-5.6-luna": "text" });
    expect(r.missing).toEqual(["gpt-5.6-luna"]);
  });
});

describe("what OpenAI actually charged", () => {
  it("divides amount by quantity, per model and unit", () => {
    const { prices, unmapped } = impliedPrices([
      { line_item: "gpt-5.6-luna, input_tokens", amount: { value: 0.4 }, quantity: 2_000_000, quantity_unit: "tokens" },
      { line_item: "gpt-5.6-luna, output_tokens", amount: { value: 1.2 }, quantity: 1_000, quantity_unit: "1000_tokens" },
      { line_item: "gpt-image-2, output_image_tokens", amount: { value: 3 }, quantity: 100_000, quantity_unit: "tokens" },
      { line_item: "web search tool calls", amount: { value: 1 }, quantity: 10, quantity_unit: "calls" },
    ]);
    expect(prices).toEqual(
      expect.arrayContaining([
        { model: "gpt-5.6-luna", unit: "input_text", usdPerMillion: 0.2, amountUsd: 0.4 },
        { model: "gpt-5.6-luna", unit: "output_text", usdPerMillion: 1.2, amountUsd: 1.2 },
        { model: "gpt-image-2", unit: "output_image", usdPerMillion: 30, amountUsd: 3 },
      ]),
    );
    expect(unmapped).toEqual(["web search tool calls (calls)"]);
  });

  it("measures drift against the larger amount", () => {
    expect(drift(100, 95)).toBeCloseTo(0.05);
    expect(drift(0, 0)).toBe(0);
  });
});
