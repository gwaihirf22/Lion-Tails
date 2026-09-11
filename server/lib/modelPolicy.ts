import { MAX_AVATARS } from "@shared/schema";
import OpenAI from "openai";
import { StoryGenerationError } from "./storyErrors";
import { storage } from "../storage";

/**
 * Decides which model a request may use, and whose credentials pay for it.
 *
 * See docs/decisions.md §2 before changing the gate or adding a model list.
 *
 * The hardcoded gpt-4o was deliberate cost control, not an oversight: honouring
 * the stored per-user model without a gate would let any registered user pick
 * an expensive model and spend the server owner's OpenAI credits, because
 * getOpenAIClient() falls back to process.env.OPENAI_API_KEY whenever the user
 * has not supplied their own.
 *
 * The gate is therefore about who pays rather than about roles:
 *
 *   local    free, runs on the self-hosted Ollama    anyone
 *   economy  cheap, on the server owner's key        anyone
 *   premium  expensive                               admins, or any user who
 *                                                    supplied their OWN key
 *
 * That last rule needs no role check and extends to future users unchanged.
 *
 * IMPORTANT: authorisation is resolved at USE, not only at SET. A stored model
 * can become unauthorised after the fact -- the catalog tightens, or a user
 * selects a premium model with their own key and then calls
 * DELETE /api/settings/openai-key. The stored preference is treated as a
 * request, never as a permission.
 */

export type ModelTier = "local" | "economy" | "premium";
export type ModelKind = "chat" | "vision" | "image";
export type ModelProvider = "openai" | "ollama";

type ModelSpec = {
  tier: ModelTier;
  provider: ModelProvider;
  kinds: ModelKind[];
  label: string;
  /** Shown in the UI. Local models are for exercising the pipeline, not quality. */
  warning?: string;
  /**
   * Which parameter this model accepts for the output ceiling.
   *
   * OpenAI's newer models REJECT max_tokens outright:
   *   400 Unsupported parameter: 'max_tokens' is not supported with this
   *       model. Use 'max_completion_tokens' instead.
   * gpt-4o and gpt-4o-mini still take max_tokens, and Ollama's OpenAI-
   * compatible endpoint takes max_tokens only. So this cannot be a global
   * switch -- it is a property of the model, which is what the catalogue is
   * for. Defaults to max_tokens; new OpenAI models must say otherwise.
   */
  tokenParam?: "max_tokens" | "max_completion_tokens";
  /**
   * Whether this model accepts a temperature other than the default.
   *
   * The GPT-5 generation rejects one:
   *   400 Unsupported value: 'temperature' does not support 0.7 with this
   *       model. Only the default (1) value is supported.
   * Sampling is fixed on those models, so the right move is to omit the
   * parameter rather than send a value that will be refused. Defaults to true.
   */
  fixedTemperature?: boolean;
  /**
   * Whether this IMAGE model accepts `input_fidelity`, the parameter that asks
   * an edit to match the faces in its reference images rather than only their
   * style. It defaults to "low" where it exists at all.
   *
   * The SDK's own doc comment says "gpt-image-1 and gpt-image-1.5 and later
   * models". That is wrong about the model this app actually runs:
   *   400 The model 'gpt-image-2' does not support the 'input_fidelity'
   *       parameter.
   * Found by sending it -- and caught only because the story illustration
   * falls back to a plain generate, which silently threw the reference images
   * away and drew a different child. Defaults to false, so a new image model
   * has to say it takes this rather than being assumed to.
   */
  inputFidelity?: boolean;
};

export const MODEL_CATALOG: Record<string, ModelSpec> = {
  "gpt-oss:20b": {
    tier: "local",
    provider: "ollama",
    kinds: ["chat"],
    label: "Local — gpt-oss 20B",
    warning:
      "Runs on this server for free. Expect noticeably lower quality and frequent hallucinations.",
  },
  "nemotron-3-nano:4b": {
    tier: "local",
    provider: "ollama",
    kinds: ["chat"],
    label: "Local — Nemotron Nano 4B",
    warning:
      "Runs on this server for free. Very small model — expect poor story quality; useful for testing.",
  },
  // Kept selectable rather than removed. It is not deprecated, it is the
  // cheapest option, and thousands of existing stories were written with it --
  // a user_settings row still naming it must keep resolving.
  "gpt-4o-mini": {
    tier: "economy",
    provider: "openai",
    kinds: ["chat", "vision"],
    label: "GPT-4o mini — cheapest",
  },
  "gpt-4o": {
    tier: "premium",
    provider: "openai",
    kinds: ["chat", "vision"],
    label: "GPT-4o",
  },
  // Current generation. Premium, so they need an admin account or the user's
  // own key -- nobody spends the owner's money on a flagship by accident.
  // The owner-funded tier. About twice gpt-4o-mini's output cost -- still
  // under a third of a cent for a 1500-word story -- for a current-generation
  // model. Vision confirmed against OpenAI's model page, not assumed, because
  // image analysis resolves through the same catalogue.
  "gpt-5.6-luna": {
    tier: "economy",
    provider: "openai",
    kinds: ["chat", "vision"],
    label: "GPT-5.6 Luna — fast and cheap",
    tokenParam: "max_completion_tokens",
    fixedTemperature: true,
  },
  "gpt-5.6-terra": {
    tier: "premium",
    provider: "openai",
    kinds: ["chat", "vision"],
    label: "GPT-5.6 Terra — balanced",
    warning: "Stronger reasoning than Luna at roughly ten times the cost per story.",
    tokenParam: "max_completion_tokens",
    fixedTemperature: true,
  },
  "gpt-6-astra": {
    tier: "premium",
    provider: "openai",
    kinds: ["chat", "vision"],
    label: "GPT-6 Astra — best quality",
    warning:
      "The most capable model available, and by far the most expensive: around fifty times Luna's price per story.",
    tokenParam: "max_completion_tokens",
    fixedTemperature: true,
  },
  // dall-e-3 was SHUT DOWN on 2026-05-12, not merely deprecated. It sat here as
  // the image default for four months afterwards, so every illustration attempt
  // by an entitled user failed -- silently, because generateStoryImage catches
  // and returns undefined so a story is never lost over a missing picture.
  // Nothing surfaced it: the reader simply showed the stock lion.
  "gpt-image-2": {
    tier: "premium",
    provider: "openai",
    kinds: ["image"],
    label: "GPT Image 2",
    // Refuses input_fidelity outright; the reference images still work, and
    // the prompt is what has to carry "match these faces".
    inputFidelity: false,
  },
};

/**
 * The model used when a user has not chosen one.
 *
 * Exported so storage and the routes can stop naming models of their own.
 * They each hardcoded 'gpt-4o' -- a PREMIUM model -- with the comment "Default
 * to the newest model". resolveModel() downgrades at use, so nobody was billed
 * for it, but the settings page showed "GPT-4o" selected for users who were
 * actually generating on the economy tier.
 */
export const DEFAULTS: Record<ModelKind, string> = {
  chat: "gpt-5.6-luna",
  vision: "gpt-5.6-luna",
  image: "gpt-image-2",
};

/** Container name, not an IP: the Ollama container's address is not stable. */
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://ollama:11434/v1";

export type ResolvedModel = {
  model: string;
  provider: ModelProvider;
  tier: ModelTier;
  baseURL?: string;
  apiKey: string;
  /** Set when the stored preference was not permitted and was downgraded. */
  downgradedFrom?: string;
  usingOwnKey: boolean;
  /**
   * Already computed inside resolveModel and previously thrown away. Surfaced
   * so concurrencyLimitFor() can reuse the existing premium gate rather than
   * introducing a second notion of who is entitled to what.
   */
  isAdmin: boolean;
};

/**
 * Who gets things without the owner paying for them.
 *
 * Own key or admin. This was written out three times -- the premium gate in
 * isModelAllowedFor, the concurrency gate below, and shouldChargeQuota in
 * storyWorker -- and the second of those carried a comment saying it was
 * "verbatim the premium gate ... a second definition of entitled is how this
 * codebase produced six model lists and four schema sources". It was right,
 * and the avatar allowance would have made it a fifth. So it is one function
 * now, and the callers name their fields differently on purpose: resolveModel
 * calls it usingOwnKey, the request path calls it hasOwnKey, and they are the
 * same fact.
 */
export function hasUnlimitedUse(opts: { isAdmin: boolean; hasOwnKey: boolean }): boolean {
  return opts.isAdmin || opts.hasOwnKey;
}

/**
 * Free avatar generations, for the lifetime of an account.
 *
 * LIFETIME, never "live characters". The cost is in generating the image, so a
 * cap on how many a user currently HAS is farmable: delete a character,
 * generate another, repeat, and the owner pays every time. Counting
 * generations makes the number mean what it says.
 *
 * This is a NEW owner-billed path. decisions.md 16 records the rule that there
 * is no automatic fallback to a paid model, because it spends the owner's
 * credits unasked -- and gpt-image-2 is premium, so without a cap a free
 * account would do exactly that on every character it made. The cap is the
 * feature, not a detail, which is why it is enforced where the spend happens
 * rather than only shown in the UI.
 */
export const MAX_FREE_AVATARS = 8;

/**
 * How many more avatars this user may generate. Infinity when they pay.
 *
 * Takes the count rather than reading it, so the caller does its database work
 * inside whatever transaction it already holds -- and so this stays testable
 * without one.
 */
/**
 * How many pictures ONE CHARACTER may keep at once.
 *
 * Not the same question as avatarsRemaining, which is about money: that counts
 * generations for the lifetime of an account, this bounds what a single
 * character holds. Deleting frees a slot here and refunds nothing there, which
 * is what stops delete-and-regenerate being a free image.
 *
 * One without your own key. A capped account gets eight generations in total,
 * so letting each character hoard five of them would spend the whole allowance
 * on two characters. With a key you are paying, and may keep the lot.
 *
 * The fourth caller of hasUnlimitedUse, and the last: "own key or admin" is
 * written once in this file and nowhere else.
 */
export function avatarCapFor(opts: { isAdmin: boolean; hasOwnKey: boolean }): number {
  return hasUnlimitedUse(opts) ? MAX_AVATARS : 1;
}

export function avatarsRemaining(
  used: number,
  opts: { isAdmin: boolean; hasOwnKey: boolean },
): number {
  if (hasUnlimitedUse(opts)) return Infinity;
  return Math.max(0, MAX_FREE_AVATARS - Math.max(0, used));
}

/**
 * How many generations this user may have in flight at once.
 *
 * One, unless they are paying for it themselves AND using OpenAI. Local
 * generations are always limited to one because Ollama serialises anyway --
 * allowing two would not make either finish sooner, it would make both slower
 * and the queue less predictable.
 *
 * The predicate is verbatim the premium gate in isModelAllowedFor: own key or
 * admin. That is deliberate. A second definition of "entitled" is how this
 * codebase produced six model lists and four schema sources.
 */
export function concurrencyLimitFor(resolved: ResolvedModel): number {
  if (resolved.provider !== "openai") return 1;
  return hasUnlimitedUse({ isAdmin: resolved.isAdmin, hasOwnKey: resolved.usingOwnKey }) ? 3 : 1;
}

export function isModelAllowedFor(
  model: string,
  kind: ModelKind,
  opts: { isAdmin: boolean; hasOwnKey: boolean },
): boolean {
  const spec = MODEL_CATALOG[model];
  if (!spec) return false;
  if (!spec.kinds.includes(kind)) return false;
  if (spec.tier === "premium") return hasUnlimitedUse(opts);
  return true;
}

/**
 * The output-ceiling parameter for a model, spread into a chat request.
 *
 * One helper rather than eight call sites each remembering which name to use.
 * An unknown model falls back to max_tokens, which is what every model this
 * app has ever called accepted before the GPT-5 generation.
 */
export function tokenLimitFor(model: string, limit: number): Record<string, number> {
  const param = MODEL_CATALOG[model]?.tokenParam ?? "max_tokens";
  return { [param]: limit };
}

/**
 * The temperature parameter for a model, spread into a chat request.
 *
 * Returns nothing at all for a model with fixed sampling -- sending the
 * default explicitly is still an error on those, so it has to be absent.
 */
export function temperatureFor(model: string, temperature: number): Record<string, number> {
  return MODEL_CATALOG[model]?.fixedTemperature ? {} : { temperature };
}

/**
 * The face-matching parameter for an image model, spread into an edit request.
 *
 * Returns nothing at all for a model that refuses it, exactly as
 * temperatureFor does -- sending it to gpt-image-2 is a 400, and a 400 here
 * means the reference images are dropped and the picture is of somebody else.
 * Request shape is a property of the model and belongs in the catalogue.
 */
export function inputFidelityFor(model: string, level: "high" | "low" = "high"): Record<string, string> {
  return MODEL_CATALOG[model]?.inputFidelity ? { input_fidelity: level } : {};
}

/** Models a given user may select, for the settings UI. */
export function listSelectableModels(opts: { isAdmin: boolean; hasOwnKey: boolean }) {
  return Object.entries(MODEL_CATALOG)
    .filter(([, spec]) => spec.kinds.includes("chat"))
    .map(([id, spec]) => ({
      id,
      label: spec.label,
      tier: spec.tier,
      warning: spec.warning,
      allowed: isModelAllowedFor(id, "chat", opts),
    }));
}

/**
 * The single place where the model, the base URL and the API key are decided.
 * Returns null for image generation the user is not entitled to, so the caller
 * can skip illustration rather than fail the whole story.
 */
export async function resolveModel(
  userId: number,
  kind: ModelKind = "chat",
  opts: { grantedByAllowance?: boolean } = {},
): Promise<ResolvedModel | null> {
  const [user, ownKey] = await Promise.all([
    storage.getUser(userId).catch(() => undefined),
    storage.getUserOpenAIKey(userId).catch(() => null),
  ]);

  const isAdmin = Boolean(user?.isAdmin);
  const hasOwnKey = Boolean(ownKey);

  /**
   * Entitlement for THIS call, which is not always the account's entitlement.
   *
   * grantedByAllowance is how a free account reaches a premium image model: it
   * has already spent one of its MAX_FREE_AVATARS, so the generation is paid
   * for by a cap rather than by the account. Nothing else may pass it.
   *
   * It is deliberately not a property of the user. Making it one would create
   * a fourth entitlement state and, worse, a durable one -- this is true of a
   * single request that has already been counted, and false a moment later.
   * The caller must charge FIRST and pass the result of having charged; see
   * chargeAvatarGeneration, which is the only thing that can make this true.
   */
  const entitled = {
    isAdmin: isAdmin || Boolean(opts.grantedByAllowance),
    hasOwnKey,
  };

  let requested = DEFAULTS[kind];
  if (kind === "chat") {
    const stored = await storage.getUserOpenAIModel(userId).catch(() => null);
    if (stored) requested = stored;
  }

  let model = requested;
  let downgradedFrom: string | undefined;

  if (!isModelAllowedFor(model, kind, entitled)) {
    const fallback = DEFAULTS[kind];
    if (model !== fallback) {
      console.warn(
        `Model '${model}' is not permitted for user ${userId} (${kind}); using '${fallback}'. ` +
          `Supply your own OpenAI API key to use premium models.`,
      );
      downgradedFrom = model;
    }
    model = fallback;

    // The fallback itself may be premium (image generation has no cheap tier).
    if (!isModelAllowedFor(model, kind, entitled)) {
      return null;
    }
  }

  const spec = MODEL_CATALOG[model];

  if (spec.provider === "ollama") {
    return {
      model,
      provider: "ollama",
      tier: spec.tier,
      baseURL: OLLAMA_BASE_URL,
      // The SDK requires a non-empty key; Ollama ignores it.
      apiKey: "ollama",
      downgradedFrom,
      usingOwnKey: false,
      isAdmin,
    };
  }

  // Premium on the owner's key is reached by an admin, or by a caller that has
  // already spent one of a capped allowance. A non-admin without their own key
  // and without such a grant was downgraded above.
  const apiKey = ownKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Typed, so the route answers 503 with something the user can act on
    // rather than a blanket 500 reading "Failed to start story generation".
    // This is a SERVER configuration problem -- OPENAI_API_KEY is unset -- not
    // anything the user did, and the remedy that always works is the local
    // tier, which needs no key at all.
    throw new StoryGenerationError(
      "no_model_available",
      `${model} needs an OpenAI API key, and this server has none configured. ` +
        "Choose one of the local models in Settings -- they are free and need no key -- " +
        "or add your own OpenAI API key there.",
    );
  }

  return {
    model,
    provider: "openai",
    tier: spec.tier,
    apiKey,
    downgradedFrom,
    usingOwnKey: Boolean(ownKey),
    isAdmin,
  };
}

/** Builds a client bound to the resolved provider. */
export function createClient(resolved: ResolvedModel): OpenAI {
  return new OpenAI({
    apiKey: resolved.apiKey,
    ...(resolved.baseURL ? { baseURL: resolved.baseURL } : {}),
  });
}
