import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import {
  DEFAULTS,
  MODEL_CATALOG,
  qualityFor,
  listSelectablePictureModels,
} from "../server/lib/modelPolicy";
import { portraitTier } from "../server/lib/avatar";
import { PICTURE_TIERS, PICTURE_TIER_LABELS, PICTURE_CREDITS, type PictureTier } from "../shared/schema";

/**
 * QUALITY IS A PROPERTY OF THE MODEL, and it is money.
 *
 * Nothing sent a quality until 2026-09-16, so the API chose one: measured on
 * the same afternoon it spent 439 output tokens on one picture and 7,024 on
 * another -- $0.013 against $0.21 -- and the ledger recorded "auto" for both.
 * These tests are about the two ways that can come back: a tier that reaches
 * a model whose word for it means something else, and a call site that
 * forgets to send one at all.
 */
describe("qualityFor", () => {
  it("sends nothing at all for a model with no tier map", () => {
    // gpt-image-2's "high" measured 7,024 output tokens where 2.5's spends
    // 1,756. The words are not equivalent, so the map is deliberately absent
    // and the model keeps exactly the behaviour it had.
    for (const tier of PICTURE_TIERS) {
      expect(qualityFor("gpt-image-2", tier)).toEqual({});
    }
  });

  it("names the tier for a model that has one", () => {
    expect(qualityFor("gpt-image-2.5-flare", "medium")).toEqual({ quality: "medium" });
    expect(qualityFor("gpt-image-2.5-flare", "xhigh")).toEqual({ quality: "xhigh" });
    expect(qualityFor("gpt-image-2.5-sunburst", "high")).toEqual({ quality: "high" });
  });

  it("sends nothing for a tier that draws no picture", () => {
    expect(qualityFor("gpt-image-2.5-flare", "none")).toEqual({});
  });

  it("can never ask for max, at any tier, on any model", () => {
    // 7,024 tokens a picture -- sixteen times standard, for a difference
    // nobody could see in testing. It is in no map, so it cannot be sent.
    for (const model of Object.keys(MODEL_CATALOG)) {
      for (const tier of PICTURE_TIERS) {
        expect(qualityFor(model, tier).quality).not.toBe("max");
      }
    }
  });

  it("is unknown-model safe", () => {
    expect(qualityFor("gpt-image-9-imaginary", "high")).toEqual({});
  });
});

describe("the picture catalogue", () => {
  it("offers only image models, and never a legacy one", () => {
    const offered = listSelectablePictureModels({ isAdmin: false, hasOwnKey: false });
    expect(offered.length).toBeGreaterThan(0);
    for (const m of offered) {
      expect(MODEL_CATALOG[m.id].kinds).toContain("image");
      expect(MODEL_CATALOG[m.id].legacy).toBeFalsy();
    }
    expect(offered.map((m) => m.id)).not.toContain("gpt-image-2");
  });

  it("draws by default on a model that prices every tier", () => {
    const spec = MODEL_CATALOG[DEFAULTS.image];
    expect(spec.kinds).toContain("image");
    expect(spec.legacy).toBeFalsy();
    for (const tier of PICTURE_TIERS.filter((t) => t !== "none")) {
      expect(spec.quality?.[tier], `${DEFAULTS.image} has no ${tier}`).toBeTruthy();
    }
  });

  it("has words and a price for every tier", () => {
    for (const tier of PICTURE_TIERS) {
      expect(PICTURE_TIER_LABELS[tier].label.length).toBeGreaterThan(0);
      expect(PICTURE_TIER_LABELS[tier].description.length).toBeGreaterThan(0);
      expect(PICTURE_CREDITS[tier]).toBeGreaterThanOrEqual(0);
    }
    expect(PICTURE_CREDITS.none).toBe(0);
  });

  it("prices the tiers in the order they are offered", () => {
    const prices = PICTURE_TIERS.map((t) => PICTURE_CREDITS[t]);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
  });
});

/**
 * THE GREP GATE, built like tests/modelCallsLedger.test.ts: a rule about
 * every call site is only true if nothing can add a sixth one that forgets.
 */
describe("every image call asks for a quality", () => {
  const serverDir = path.resolve(__dirname, "..", "server");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ts")) files.push(full);
    }
  };
  walk(serverDir);

  const IMAGE_CALL = /\.images\.(edit|generate)\(/;
  const callers = files.filter((f) => IMAGE_CALL.test(fs.readFileSync(f, "utf8")));

  it("guards the guard: there are image call sites to check", () => {
    expect(callers.length).toBeGreaterThanOrEqual(2);
  });

  it("spreads qualityFor rather than naming a tier in the request", () => {
    for (const file of callers) {
      const src = fs.readFileSync(file, "utf8");
      // openai-vision.ts is deliberately outside the shared policy
      // (decisions.md 2) and draws nothing a reader pays for.
      if (file.endsWith("openai-vision.ts")) continue;
      expect(src, `${path.basename(file)} calls images.* without qualityFor`).toMatch(/qualityFor\(/);
      expect(src, `${path.basename(file)} names a quality literally`).not.toMatch(
        /quality:\s*"(low|medium|high|xhigh|max|auto)"/,
      );
    }
  });
});

/**
 * The eight free portraits are paid for by a cap rather than by credits, so
 * the tier they are drawn at is the one place a setting must not be obeyed
 * to the letter: "finest" would hand the owner eight of the dearest pictures.
 */
describe("portraitTier", () => {
  const dearer = (a: PictureTier, b: PictureTier) => PICTURE_CREDITS[a] > PICTURE_CREDITS[b];

  it("holds a free account at the ceiling", () => {
    expect(portraitTier("xhigh", false)).toBe("high");
    expect(dearer(portraitTier("xhigh", false), "high")).toBe(false);
  });

  it("leaves a cheaper choice alone", () => {
    expect(portraitTier("medium", false)).toBe("medium");
    expect(portraitTier("high", false)).toBe("high");
  });

  it("gives an account paying its own way whatever it chose", () => {
    expect(portraitTier("xhigh", true)).toBe("xhigh");
  });

  it("still draws a face when story pictures are turned off", () => {
    // "none" is a choice about covers, to save credits. Somebody asking for a
    // portrait has not asked for a character with no face.
    expect(portraitTier("none", false)).toBe("medium");
    expect(portraitTier("none", true)).toBe("medium");
  });
});
