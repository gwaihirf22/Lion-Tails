import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  combineFeeds,
  diffPrices,
  drift,
  parseLineItem,
  readBill,
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
  // Shaped exactly like rows from a real bill (2026-09-14); ids removed.
  const row = (line_item: string, value: number, quantity: number) => ({
    line_item, amount: { currency: "usd", value }, quantity, quantity_unit: "tokens",
  });
  const approved = {
    "gpt-5.6-luna": { input_text: 0.2, input_cached: 0.02, input_cache_write: 0.25, output_text: 1.2 },
    "gpt-image-2": { input_text: 5, input_cached: 1.25, input_image: 8, input_image_cached: 2, output_image: 30 },
  };

  it("reads the real line-item names: snapshots, modality, token types in words", () => {
    expect(parseLineItem("gpt-5.6-luna, cache writes")).toEqual({ model: "gpt-5.6-luna", unit: "input_cache_write" });
    expect(parseLineItem("gpt-5.6-luna, cached input")).toEqual({ model: "gpt-5.6-luna", unit: "input_cached" });
    expect(parseLineItem("gpt-5.6-luna, output")).toEqual({ model: "gpt-5.6-luna", unit: "output_text" });
    expect(parseLineItem("gpt-image-2-2026-04-21 image, output")).toEqual({ model: "gpt-image-2", unit: "output_image" });
    expect(parseLineItem("gpt-image-2-2026-04-21 image, cached input")).toEqual({ model: "gpt-image-2", unit: "input_image_cached" });
    expect(parseLineItem("gpt-image-2-2026-04-21 text, input")).toEqual({ model: "gpt-image-2", unit: "input_text" });
    expect(parseLineItem("gpt-4o-mini-2024-07-18, input")).toEqual({ model: "gpt-4o-mini", unit: "input_text" });
    expect(parseLineItem("web search tool calls")).toBeUndefined();
  });

  it("takes the charged rate from paid rows only -- free rows are not a discount", () => {
    const bill = readBill(
      [
        // The real bill's pattern: a free day beside a day at list price.
        row("gpt-5.6-luna, output", 0, 19_287),
        row("gpt-5.6-luna, output", 0.00915, 7_625),
        row("gpt-5.6-luna, cache writes", 0.00116775, 4_671),
        row("gpt-image-2-2026-04-21 image, output", 0.16545, 5_515),
        row("gpt-5.6-luna, cached input", 0, 0),
      ],
      approved,
    );
    const rate = (model: string, unit: string) => bill.prices.find((x) => x.model === model && x.unit === unit)?.usdPerMillion;
    expect(rate("gpt-5.6-luna", "output_text")).toBe(1.2);
    expect(rate("gpt-5.6-luna", "input_cache_write")).toBe(0.25);
    expect(rate("gpt-image-2", "output_image")).toBe(30);
    expect(bill.billedUsd).toBeCloseTo(0.00915 + 0.00116775 + 0.16545, 8);
    // The free 19,287 output tokens, at list price.
    expect(bill.freeValueUsd).toBeCloseTo(0.0231444, 6);
    expect(bill.listValueUsd).toBeCloseTo(bill.billedUsd + bill.freeValueUsd, 8);
    // A zero-quantity row is neither unmapped nor a price.
    expect(bill.unmapped).toEqual([]);
  });

  it("names usage it cannot read or has no price for, rather than dropping it", () => {
    const bill = readBill(
      [row("chat-latest, input", 0.005, 1_000), { line_item: "web search tool calls", amount: { value: 1 }, quantity: 10, quantity_unit: "calls" }],
      approved,
    );
    expect(bill.unpriced).toEqual(["chat-latest input text"]);
    expect(bill.unmapped).toEqual(["web search tool calls (calls)"]);
  });

  it("measures drift against the larger amount", () => {
    expect(drift(100, 95)).toBeCloseTo(0.05);
    expect(drift(0, 0)).toBe(0);
  });
});
