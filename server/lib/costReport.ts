/**
 * What things cost, summarised, and what the admin panel should be warned
 * about. Pure: costStats.ts reads the rows, this decides what they mean.
 */
import { percentile, sellingAtALoss, suggestedPriceCents } from "./costMath";

/** Fewer measured samples than this and a cost is "not enough yet", not a number to price on. */
export const MIN_SAMPLES = 5;

export type StorySample = {
  length: string;
  model: string;
  quest: boolean;
  digging: boolean;
  /** Everything the story's own calls cost, retries and extraction included; not its cover. */
  micros: number;
};
export type PictureSample = { purpose: string; model: string; size: string; micros: number };

export type CostGroup = {
  item: string;
  label: string;
  n: number;
  medianMicros?: number;
  p75Micros?: number;
  maxMicros?: number;
  enough: boolean;
};

function group(item: string, label: string, values: number[]): CostGroup {
  return {
    item,
    label,
    n: values.length,
    medianMicros: percentile(values, 0.5),
    p75Micros: percentile(values, 0.75),
    maxMicros: values.length ? Math.max(...values) : undefined,
    enough: values.length >= MIN_SAMPLES,
  };
}

const LENGTH_ORDER = ["very-short", "short", "medium", "long", "extended", "epic"];

/**
 * Stories by length and model -- the price-list items -- plus the two splits
 * that genuinely change what a story costs, shown beside them for reading
 * rather than priced separately: a quest, and a story with digging deeper.
 */
export function summariseStories(samples: StorySample[]): { items: CostGroup[]; splits: CostGroup[] } {
  const by = new Map<string, number[]>();
  const splits = new Map<string, number[]>();
  for (const s of samples) {
    const key = `story:${s.length}:${s.model}`;
    by.set(key, [...(by.get(key) ?? []), s.micros]);
    const split = `${key}:${s.quest ? "quest" : "ordinary"}${s.digging ? "+digging" : ""}`;
    splits.set(split, [...(splits.get(split) ?? []), s.micros]);
  }
  const sortKey = (k: string) => {
    const [, length, model] = k.split(":");
    return `${String(LENGTH_ORDER.indexOf(length)).padStart(2, "0")}:${model}:${k}`;
  };
  const label = (k: string) => {
    const [, length, model, kind] = k.split(":");
    return `${length} story, ${model}${kind ? ` (${kind.replace("+", " + ")})` : ""}`;
  };
  return {
    items: Array.from(by.keys()).sort((a, b) => sortKey(a).localeCompare(sortKey(b))).map((k) => group(k, label(k), by.get(k)!)),
    splits: Array.from(splits.keys()).sort((a, b) => sortKey(a).localeCompare(sortKey(b))).map((k) => group(k, label(k), splits.get(k)!)),
  };
}

/**
 * A picture's price-list key. One definition: the reader's dialog needs the
 * price of a picture, and a second spelling of this format somewhere else is
 * how a price silently reads as "not published yet" for ever.
 */
export function pictureItemKey(purpose: string, model: string): string {
  return `picture:${purpose}:${model}`;
}

export function summarisePictures(samples: PictureSample[]): CostGroup[] {
  const by = new Map<string, number[]>();
  for (const s of samples) {
    const key = pictureItemKey(s.purpose, s.model);
    by.set(key, [...(by.get(key) ?? []), s.micros]);
  }
  return Array.from(by.keys()).sort().map((k) => {
    const [, purpose, model] = k.split(":");
    return group(k, `${purpose.replace("-", " ")}, ${model}`, by.get(k)!);
  });
}

export type Suggestion = { item: string; label: string; priceCents: number; basisMicros: number; samples: number };

/** A price for every item with enough samples: p75 plus margin, rounded up. */
export function suggestPrices(groups: CostGroup[], marginPct: number): Suggestion[] {
  return groups
    .filter((g) => g.enough && g.p75Micros !== undefined)
    .map((g) => ({
      item: g.item,
      label: g.label,
      priceCents: suggestedPriceCents(g.p75Micros!, marginPct),
      basisMicros: g.p75Micros!,
      samples: g.n,
    }));
}

/**
 * What one picture costs on the published list, cents, or null.
 *
 * A PICTURE IS TWO PAID CALLS: the image itself, and the sentence describing
 * the moment, which is its own row on the list (`picture:passage-scene:…`).
 * Summed here rather than in the browser, because which models those rows name
 * depends on the account, and the key format belongs to this file.
 *
 * Null when the IMAGE row is not published -- that is the price of a picture,
 * and without it there is no number worth showing. A missing scene row adds
 * nothing rather than refusing: the total is already given to the reader as
 * "about".
 */
export function pictureListPrice(
  items: ReadonlyArray<{ item: string; priceCents: number }>,
  models: {
    imageModel: string;
    /**
     * In preference order. Every kind of picture is its own row and each needs
     * its own five samples, so a reader asking what "a picture" costs is
     * answered by the first kind that has a price -- they are the same model
     * drawing the same size, and the answer is given as "about".
     */
    imagePurposes: readonly string[];
    sceneModel?: string;
  },
): number | null {
  const priceOf = (key: string) => items.find((i) => i.item === key)?.priceCents;
  const image = models.imagePurposes
    .map((purpose) => priceOf(pictureItemKey(purpose, models.imageModel)))
    .find((cents) => cents !== undefined);
  if (image === undefined) return null;
  const scene = models.sceneModel ? priceOf(pictureItemKey("passage-scene", models.sceneModel)) : undefined;
  return image + (scene ?? 0);
}

export type Warning = { level: "action" | "watch"; code: string; message: string };

/**
 * Everything the admin should hear about, most urgent first.
 *
 * "action" is something to decide (approve a price, fix a price below cost);
 * "watch" is something true that may or may not matter (a feed disagreed, the
 * bill check is off). Nothing is a warning because it is merely empty.
 */
export function buildWarnings(input: {
  pendingProposals: Array<{ id: number; changes: number; conflicts: number }>;
  unpricedModels: string[];
  unpricedCalls: number;
  published: Array<{ item: string; priceCents: number }>;
  measured: CostGroup[];
  watch?: { litellm?: { ok: boolean; error?: string; problems?: string[] }; page?: { ok: boolean; error?: string; problems?: string[] }; lastRunAt?: string };
  bill?: { ok: boolean; error?: string; rates: Array<{ model: string; unit: string; charged: number; approved?: number; off: boolean }>; unmapped: string[]; unpriced?: string[]; window?: { from: string; billedUsd: number; listValueUsd?: number; freeValueUsd?: number; ledgerUsd: number; drift: number; off: boolean }; projectId?: string };
  billCheckEnabled: boolean;
  now?: Date;
}): Warning[] {
  const out: Warning[] = [];
  for (const p of input.pendingProposals) {
    out.push({
      level: "action",
      code: "price-proposal",
      message: `Prices changed: proposal #${p.id} has ${p.changes} change${p.changes === 1 ? "" : "s"}` +
        `${p.conflicts ? `, and the two feeds disagree on ${p.conflicts}` : ""}. Approve or dismiss it.`,
    });
  }
  const measured = new Map(input.measured.map((g) => [g.item, g]));
  for (const item of input.published) {
    const g = measured.get(item.item);
    if (g?.enough && g.p75Micros !== undefined && sellingAtALoss(item.priceCents, g.p75Micros)) {
      out.push({
        level: "action",
        code: "below-cost",
        message: `${g.label} is published at ${item.priceCents}¢ but now costs about ${(g.p75Micros / 10_000).toFixed(2)}¢ to make.`,
      });
    }
  }
  if (input.bill?.ok) {
    for (const r of input.bill.rates.filter((x) => x.off)) {
      out.push({
        level: "action",
        code: "charged-differently",
        message: `OpenAI charged $${r.charged}/M for ${r.model} ${r.unit.replace(/_/g, " ")} on paid usage; the approved price is $${r.approved}/M. ` +
          "Either the price changed, or part of a day's usage was free.",
      });
    }
    if (input.bill.window?.off) {
      const w = input.bill.window;
      out.push({
        level: input.bill.projectId ? "action" : "watch",
        code: "bill-drift",
        message: `Since ${w.from.slice(0, 10)} the bill came to $${(w.listValueUsd ?? w.billedUsd).toFixed(2)} at list price, the ledger recorded $${w.ledgerUsd.toFixed(2)} ` +
          `(${Math.round(w.drift * 100)}% apart) -- so a paid call may be going unrecorded` +
          (input.bill.projectId ? "." : " -- for the whole organisation, so other use of the key counts too."),
      });
    }
    if (input.bill.unmapped.length) {
      out.push({ level: "watch", code: "unmapped-line-items", message: `The bill has line items this app does not map: ${input.bill.unmapped.join("; ")}.` });
    }
  } else if (input.bill && !input.bill.ok) {
    out.push({ level: "watch", code: "bill-check-failed", message: `The bill check could not run: ${input.bill.error ?? "unknown error"}.` });
  }
  for (const model of input.unpricedModels) {
    out.push({ level: "action", code: "unpriced-model", message: `${model} is in the catalogue with no approved price.` });
  }
  if (input.unpricedCalls > 0) {
    out.push({ level: "watch", code: "unpriced-calls", message: `${input.unpricedCalls} recorded call${input.unpricedCalls === 1 ? " has" : "s have"} no cost, because no price was approved when they ran.` });
  }
  for (const [name, s] of [["LiteLLM's price file", input.watch?.litellm], ["OpenAI's pricing page", input.watch?.page]] as const) {
    if (s && !s.ok) {
      out.push({ level: "watch", code: "feed-problem", message: `${name}: ${s.error ?? s.problems?.join(" ") ?? "could not be read"}.` });
    }
  }
  const now = input.now ?? new Date();
  if (!input.watch?.lastRunAt) {
    out.push({ level: "watch", code: "never-checked", message: "Prices have not been checked yet. Use Check now." });
  } else if (now.getTime() - new Date(input.watch.lastRunAt).getTime() > 3 * 24 * 60 * 60 * 1000) {
    out.push({ level: "watch", code: "stale-check", message: `Prices were last checked ${input.watch.lastRunAt.slice(0, 10)}.` });
  }
  if (!input.billCheckEnabled) {
    out.push({ level: "watch", code: "bill-check-off", message: "The bill check is off: set COSTS_ADMIN_KEY_FILE (or COSTS_ADMIN_KEY) to compare against what OpenAI actually charged." });
  }
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === "action" ? -1 : 1));
}
