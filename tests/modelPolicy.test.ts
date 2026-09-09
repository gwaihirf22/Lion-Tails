import { describe, it, expect } from "vitest";
import {
  MODEL_CATALOG,
  DEFAULTS,
  isModelAllowedFor,
  tokenLimitFor,
  temperatureFor,
  listSelectableModels,
  hasUnlimitedUse,
  avatarsRemaining,
  MAX_FREE_AVATARS,
} from "../server/lib/modelPolicy";

/**
 * modelPolicy is the only place a model, a base URL or a key is chosen, and
 * every case here is a failure that happened.
 */

describe("request shape per model", () => {
  // gpt-5.6-luna is the economy DEFAULT: every free-tier generation goes
  // through it. Sending max_tokens returned 400 Unsupported parameter, and
  // fixing that revealed a second 400 on temperature. Both would break story
  // generation for every user without their own key.
  it("sends max_completion_tokens to the GPT-5.6 generation", () => {
    expect(tokenLimitFor("gpt-5.6-luna", 2000)).toEqual({ max_completion_tokens: 2000 });
    expect(tokenLimitFor("gpt-5.6-terra", 2000)).toEqual({ max_completion_tokens: 2000 });
    expect(tokenLimitFor("gpt-6-astra", 2000)).toEqual({ max_completion_tokens: 2000 });
  });

  it("still sends max_tokens to the models that require it", () => {
    expect(tokenLimitFor("gpt-4o-mini", 2000)).toEqual({ max_tokens: 2000 });
    expect(tokenLimitFor("gpt-oss:20b", 2000)).toEqual({ max_tokens: 2000 });
  });

  it("falls back to max_tokens for a model not in the catalogue", () => {
    expect(tokenLimitFor("something-nobody-added-yet", 10)).toEqual({ max_tokens: 10 });
  });

  it("omits temperature entirely on fixed-sampling models", () => {
    // Not "sends the default" -- sending temperature: 1 explicitly is still a
    // 400 on these, so the key has to be absent from the object.
    expect(temperatureFor("gpt-5.6-luna", 0.8)).toEqual({});
    expect(Object.keys(temperatureFor("gpt-6-astra", 1))).toHaveLength(0);
  });

  it("still sends temperature where it is supported", () => {
    expect(temperatureFor("gpt-4o-mini", 0.8)).toEqual({ temperature: 0.8 });
  });

  it("every catalogue entry declaring fixedTemperature also declares its token param", () => {
    // The two go together on this generation of models; one without the other
    // is how the second 400 was discovered after fixing the first.
    for (const [name, spec] of Object.entries(MODEL_CATALOG)) {
      if (spec.fixedTemperature) {
        expect(spec.tokenParam, `${name} sets fixedTemperature but no tokenParam`).toBe(
          "max_completion_tokens",
        );
      }
    }
  });
});

describe("entitlement", () => {
  it("lets anyone use local and economy models", () => {
    const anon = { isAdmin: false, hasOwnKey: false };
    expect(isModelAllowedFor("gpt-oss:20b", "chat", anon)).toBe(true);
    expect(isModelAllowedFor("gpt-5.6-luna", "chat", anon)).toBe(true);
  });

  it("refuses premium models to a user with neither admin nor their own key", () => {
    const anon = { isAdmin: false, hasOwnKey: false };
    expect(isModelAllowedFor("gpt-6-astra", "chat", anon)).toBe(false);
    expect(isModelAllowedFor("gpt-image-2", "image", anon)).toBe(false);
  });

  it("allows premium on the user's own key, without needing a role", () => {
    // The rule is about who pays, not about who someone is.
    expect(isModelAllowedFor("gpt-6-astra", "chat", { isAdmin: false, hasOwnKey: true })).toBe(true);
    expect(isModelAllowedFor("gpt-6-astra", "chat", { isAdmin: true, hasOwnKey: false })).toBe(true);
  });

  it("keeps chat and image allowlists separate", () => {
    const admin = { isAdmin: true, hasOwnKey: true };
    // An image model must not be reachable as a chat model, or vice versa,
    // however entitled the caller is.
    expect(isModelAllowedFor("gpt-image-2", "chat", admin)).toBe(false);
    expect(isModelAllowedFor("gpt-5.6-luna", "image", admin)).toBe(false);
  });

  it("refuses a model that is not in the catalogue at all", () => {
    expect(isModelAllowedFor("gpt-4o-mini-but-typoed", "chat", { isAdmin: true, hasOwnKey: true })).toBe(
      false,
    );
  });

  it("marks every entry in the settings list with the same answer the server will give", () => {
    // listSelectableModels returns premium entries too, flagged allowed:false,
    // so the UI can show them greyed out with the reason. That is the point:
    // the settings page used to carry its OWN hardcoded list, four entries of
    // which the server then answered with a 403. The invariant is that the
    // flag never disagrees with the guard the request will actually hit.
    for (const opts of [
      { isAdmin: false, hasOwnKey: false },
      { isAdmin: false, hasOwnKey: true },
      { isAdmin: true, hasOwnKey: false },
    ]) {
      for (const m of listSelectableModels(opts)) {
        expect(m.allowed, `${m.id} for ${JSON.stringify(opts)}`).toBe(
          isModelAllowedFor(m.id, "chat", opts),
        );
      }
    }
  });

  it("offers an unentitled user at least one model they can actually use", () => {
    const usable = listSelectableModels({ isAdmin: false, hasOwnKey: false }).filter(
      (m) => m.allowed,
    );
    expect(usable.length).toBeGreaterThan(0);
  });
});

describe("defaults", () => {
  it("names models that exist and support the kind they default for", () => {
    for (const [kind, model] of Object.entries(DEFAULTS)) {
      const spec = MODEL_CATALOG[model];
      expect(spec, `DEFAULTS.${kind} names "${model}", which is not in the catalogue`).toBeDefined();
      expect(spec.kinds).toContain(kind);
    }
  });

  it("does not default any kind to a premium model", () => {
    // storage and routes each hardcoded gpt-4o -- a premium model -- as "the
    // newest model", so the settings page showed a model the user could not use.
    expect(MODEL_CATALOG[DEFAULTS.chat].tier).not.toBe("premium");
    expect(MODEL_CATALOG[DEFAULTS.vision].tier).not.toBe("premium");
  });

  it("has no reference to dall-e-3, which was shut down on 2026-05-12", () => {
    // It stayed as the image default for four months after shutdown, failing
    // every illustration silently because the error is caught and swallowed.
    expect(MODEL_CATALOG["dall-e-3"]).toBeUndefined();
    expect(Object.values(DEFAULTS)).not.toContain("dall-e-3");
  });
});

/**
 * The entitlement predicate, and the allowance built on it.
 *
 * "Own key or admin" existed three times before this -- the premium gate, the
 * concurrency gate and shouldChargeQuota -- and the avatar cap would have been
 * a fourth. These assert the one function behaves for every combination, and
 * that the two live callers still answer what they used to.
 */
describe("who pays for their own use", () => {
  const cases: Array<[boolean, boolean, boolean]> = [
    // isAdmin, hasOwnKey, expected
    [false, false, false],
    [false, true, true],
    [true, false, true],
    [true, true, true],
  ];

  it("is admin OR own key, for every combination", () => {
    for (const [isAdmin, hasOwnKey, expected] of cases) {
      expect(hasUnlimitedUse({ isAdmin, hasOwnKey })).toBe(expected);
    }
  });

  it("still gates premium models exactly as before", () => {
    for (const [isAdmin, hasOwnKey, expected] of cases) {
      expect(isModelAllowedFor("gpt-image-2", "image", { isAdmin, hasOwnKey })).toBe(expected);
    }
    // And a free tier stays free for everyone -- the extraction must not have
    // widened the gate to cover models it never covered.
    expect(isModelAllowedFor("gpt-oss:20b", "chat", { isAdmin: false, hasOwnKey: false })).toBe(true);
  });
});

describe("the free avatar allowance", () => {
  const free = { isAdmin: false, hasOwnKey: false };

  it("gives a free account exactly MAX_FREE_AVATARS, once, ever", () => {
    expect(avatarsRemaining(0, free)).toBe(MAX_FREE_AVATARS);
    expect(avatarsRemaining(MAX_FREE_AVATARS - 1, free)).toBe(1);
    expect(avatarsRemaining(MAX_FREE_AVATARS, free)).toBe(0);
  });

  it("never goes negative, however the count got there", () => {
    // A count above the cap is reachable: the cap can be lowered, and an
    // account can have been unlimited when it spent them. Reporting -3 would
    // put a negative number in front of a child.
    expect(avatarsRemaining(MAX_FREE_AVATARS + 3, free)).toBe(0);
    expect(avatarsRemaining(-5, free)).toBe(MAX_FREE_AVATARS);
  });

  it("does not cap anyone who is paying for it", () => {
    expect(avatarsRemaining(999, { isAdmin: true, hasOwnKey: false })).toBe(Infinity);
    expect(avatarsRemaining(999, { isAdmin: false, hasOwnKey: true })).toBe(Infinity);
  });

  it("counts generations, which is what makes the cap unfarmable", () => {
    // The property, stated as a test so the reasoning survives: the allowance
    // depends ONLY on how many were generated. Nothing about how many the user
    // currently has can give one back, so delete-and-regenerate cannot mint
    // free images at the owner's expense.
    expect(avatarsRemaining(8, free)).toBe(0);
    expect(avatarsRemaining(8, free)).toBe(0);
  });
});
