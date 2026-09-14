import { describe, expect, it } from "vitest";
import { buildWarnings, MIN_SAMPLES, suggestPrices, summarisePictures, summariseStories } from "../server/lib/costReport";

const story = (length: string, model: string, micros: number, quest = false, digging = false) => ({ length, model, micros, quest, digging });

describe("summarising measured costs", () => {
  it("groups stories by length and model, in length order", () => {
    const { items, splits } = summariseStories([
      story("long", "gpt-5.6-luna", 9_000),
      story("short", "gpt-5.6-luna", 3_000),
      story("short", "gpt-5.6-luna", 4_000, true),
    ]);
    expect(items.map((g) => g.item)).toEqual(["story:short:gpt-5.6-luna", "story:long:gpt-5.6-luna"]);
    expect(items[0]).toMatchObject({ n: 2, p75Micros: 4_000, enough: false });
    expect(splits.map((g) => g.item)).toContain("story:short:gpt-5.6-luna:quest");
  });

  it("only suggests a price once there are enough samples", () => {
    const few = summariseStories(Array.from({ length: MIN_SAMPLES - 1 }, () => story("short", "m", 30_000))).items;
    expect(suggestPrices(few, 20)).toEqual([]);
    const enough = summariseStories([10_000, 20_000, 30_000, 40_000, 50_000].map((m) => story("short", "m", m))).items;
    // p75 of five is the 4th: 40_000 micros = 4c, +20% = 4.8c -> 5c
    expect(suggestPrices(enough, 20)).toEqual([
      { item: "story:short:m", label: "short story, m", priceCents: 5, basisMicros: 40_000, samples: 5 },
    ]);
  });

  it("groups pictures by what they were for", () => {
    const g = summarisePictures([
      { purpose: "cover", model: "gpt-image-2", size: "1536x1024", micros: 200_000 },
      { purpose: "passage-picture", model: "gpt-image-2", size: "1024x1024", micros: 120_000 },
    ]);
    expect(g.map((x) => x.item)).toEqual(["picture:cover:gpt-image-2", "picture:passage-picture:gpt-image-2"]);
  });
});

describe("what the admin is warned about", () => {
  const base = {
    pendingProposals: [],
    unpricedModels: [],
    unpricedCalls: 0,
    published: [],
    measured: [],
    watch: { lastRunAt: "2026-09-14T00:00:00Z", litellm: { ok: true }, page: { ok: true } },
    billCheckEnabled: true,
    now: new Date("2026-09-14T12:00:00Z"),
  };

  it("says nothing when there is nothing to say", () => {
    expect(buildWarnings(base)).toEqual([]);
  });

  it("puts a price proposal first, as something to decide", () => {
    const w = buildWarnings({ ...base, billCheckEnabled: false, pendingProposals: [{ id: 3, changes: 2, conflicts: 1 }] });
    expect(w[0]).toMatchObject({ level: "action", code: "price-proposal" });
    expect(w[0].message).toContain("disagree on 1");
  });

  it("flags a published price that has fallen below cost", () => {
    const measured = summariseStories([1, 2, 3, 4, 5].map(() => story("short", "m", 60_000))).items;
    const w = buildWarnings({ ...base, measured, published: [{ item: "story:short:m", priceCents: 5 }] });
    expect(w.map((x) => x.code)).toEqual(["below-cost"]);
  });

  it("reports a feed that could not be read, and a check that never ran", () => {
    const w = buildWarnings({ ...base, watch: { litellm: { ok: false, error: "404 Not Found" } } });
    expect(w.map((x) => x.code)).toEqual(expect.arrayContaining(["feed-problem", "never-checked"]));
  });

  it("reports the bill disagreeing with the ledger, and a rate OpenAI charged differently", () => {
    const w = buildWarnings({
      ...base,
      bill: {
        ok: true,
        projectId: "proj_1",
        unmapped: [],
        rates: [{ model: "gpt-5.6-luna", unit: "output_text", charged: 1.6, approved: 1.2, off: true }],
        window: { from: "2026-09-10T00:00:00.000Z", billedUsd: 10, listValueUsd: 10, ledgerUsd: 7, drift: 0.3, off: true },
      },
    });
    expect(w.map((x) => x.code)).toEqual(["charged-differently", "bill-drift"]);
    expect(w.every((x) => x.level === "action")).toBe(true);
  });
});
