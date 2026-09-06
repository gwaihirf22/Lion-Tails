import OpenAI from "openai";
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
  "gpt-4o-mini": {
    tier: "economy",
    provider: "openai",
    kinds: ["chat", "vision"],
    label: "GPT-4o mini",
  },
  "gpt-4o": {
    tier: "premium",
    provider: "openai",
    kinds: ["chat", "vision"],
    label: "GPT-4o",
  },
  "dall-e-3": {
    tier: "premium",
    provider: "openai",
    kinds: ["image"],
    label: "DALL-E 3",
  },
};

const DEFAULTS: Record<ModelKind, string> = {
  chat: "gpt-4o-mini",
  vision: "gpt-4o-mini",
  image: "dall-e-3",
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
  return resolved.usingOwnKey || resolved.isAdmin ? 3 : 1;
}

export function isModelAllowedFor(
  model: string,
  kind: ModelKind,
  opts: { isAdmin: boolean; hasOwnKey: boolean },
): boolean {
  const spec = MODEL_CATALOG[model];
  if (!spec) return false;
  if (!spec.kinds.includes(kind)) return false;
  if (spec.tier === "premium") return opts.isAdmin || opts.hasOwnKey;
  return true;
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
): Promise<ResolvedModel | null> {
  const [user, ownKey] = await Promise.all([
    storage.getUser(userId).catch(() => undefined),
    storage.getUserOpenAIKey(userId).catch(() => null),
  ]);

  const isAdmin = Boolean(user?.isAdmin);
  const hasOwnKey = Boolean(ownKey);

  let requested = DEFAULTS[kind];
  if (kind === "chat") {
    const stored = await storage.getUserOpenAIModel(userId).catch(() => null);
    if (stored) requested = stored;
  }

  let model = requested;
  let downgradedFrom: string | undefined;

  if (!isModelAllowedFor(model, kind, { isAdmin, hasOwnKey })) {
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
    if (!isModelAllowedFor(model, kind, { isAdmin, hasOwnKey })) {
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

  // Premium on the owner's key is only ever reached by an admin: a non-admin
  // without their own key was downgraded above.
  const apiKey = ownKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OpenAI API key not found");
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
