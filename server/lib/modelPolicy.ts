import {
  DEFAULT_PICTURE_TIER,
  MAX_AVATARS,
  PICTURE_CREDITS,
  PICTURE_TIERS,
  type PictureTier,
  type PicturePrefs,
} from "@shared/schema";
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
  /**
   * What one story on this model costs an account the owner pays for, in
   * credits -- and, by being present, the permission to use it at all.
   *
   * Blake: Terra on the free tier "will take 3 credits instead of just 1".
   * A price per MODEL rather than per story, because the models genuinely
   * cost different amounts: the catalogue puts Terra at roughly ten times
   * Luna per story, and a flat 1 would make the better model a free upgrade
   * paid for entirely by the owner.
   *
   * ABSENT ON A PREMIUM MODEL MEANS A FREE ACCOUNT MAY NOT USE IT. That is
   * GPT-6 Astra and GPT-4o, on purpose: Blake chose not to offer GPT-6 to free
   * accounts at any price. Absent on a local model means it is never charged,
   * because Ollama costs electricity, not credits.
   *
   * Nobody paying for their own use is charged whatever this says --
   * storyCreditsFor() asks hasUnlimitedUse() first.
   */
  storyCredits?: number;
  /**
   * What this IMAGE model calls each of the app's picture tiers.
   *
   * The names are NOT equivalent between models, which is the whole reason
   * this is a map and not a pass-through: gpt-image-2 answered "high" with
   * 7,024 output tokens where gpt-image-2.5 answers it with 1,756 -- the same
   * word, four times the money. A tier missing from the map is not offered on
   * that model, and a model with no map at all is sent no quality parameter,
   * which is exactly what every picture did before this existed.
   *
   * "max" is deliberately in no map: it costs 16x medium for a picture nobody
   * could tell apart in testing.
   */
  quality?: Partial<Record<PictureTier, string>>;
  /**
   * Still callable, still priced, but never offered to anyone new. Rows that
   * already name it keep working; listSelectablePictureModels() hides it.
   */
  legacy?: boolean;
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
    storyCredits: 1,
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
    storyCredits: 1,
  },
  "gpt-5.6-terra": {
    tier: "premium",
    provider: "openai",
    kinds: ["chat", "vision"],
    label: "GPT-5.6 Terra — balanced",
    warning: "Stronger reasoning than Luna at roughly ten times the cost per story.",
    tokenParam: "max_completion_tokens",
    fixedTemperature: true,
    // Premium, and the one premium model a free account may choose. Three
    // credits is Blake's price, not a cost-recovery figure: at roughly ten times
    // Luna per story it still costs the owner more per credit than Luna does.
    // Measured on the 2026-09-13 baseline, where it was the clear quality step
    // over Luna for about a fifth of GPT-6's price.
    storyCredits: 3,
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
    /**
     * NO QUALITY MAP, ON PURPOSE. Its tiers are not the 2.5 tiers: measured
     * 2026-09-16, "high" here spent 7,024 output tokens and "high" on 2.5
     * spent 1,756. Mapping the word across would sell a 6-credit picture for
     * 3. With no map it is sent no quality at all and behaves exactly as it
     * did, which is what any story row still naming it needs.
     */
    legacy: true,
  },
  /**
   * The picture engine, from 2026-09-16. Same published rates as gpt-image-2
   * ($8/M image in, $30/M image out), a third of the cost at a fixed tier
   * because the tier is fixed at all, and about five times faster on a scene
   * with several reference images. Likeness held in testing; the period
   * dressing rule had to be sharpened for it (referencePlates.ts).
   */
  "gpt-image-2.5-flare": {
    tier: "premium",
    provider: "openai",
    kinds: ["image"],
    label: "Flare",
    // Deprecated on the 2.5 models, and we never sent it anyway.
    inputFidelity: false,
    quality: { medium: "medium", high: "high", xhigh: "xhigh" },
  },
  "gpt-image-2.5-sunburst": {
    tier: "premium",
    provider: "openai",
    kinds: ["image"],
    label: "Sunburst",
    warning:
      "Slower to draw, and holds more closely to the pictures it is given. The same price as Flare.",
    inputFidelity: false,
    quality: { medium: "medium", high: "high", xhigh: "xhigh" },
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
  image: "gpt-image-2.5-flare",
};

/**
 * The story model for someone paying for their own use.
 *
 * Blake, after the 2026-09-13 baseline: Terra "will become the standard" for
 * the paid tier -- quality over cost. The app has no paid plan, so the paid
 * tier is exactly the accounts that are never charged: an admin, or anyone on
 * their own OpenAI key.
 *
 * DEFAULTS.chat stays Luna and stays the FLOOR. It is what resolveModel falls
 * back to when a stored choice is not permitted, and a premium floor would
 * return null for every free account -- no story at all. So the paid default
 * is a second, separate answer rather than a change to the first.
 */
export const PAID_DEFAULT_CHAT = "gpt-5.6-terra";

/** Which story model an account gets when it has not chosen one. */
export function defaultChatModelFor(opts: { isAdmin: boolean; hasOwnKey: boolean }): string {
  return hasUnlimitedUse(opts) ? PAID_DEFAULT_CHAT : DEFAULTS.chat;
}

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
  if (spec.tier === "premium") {
    // A PRICED premium model is open to a free account for STORIES, and only
    // for stories: credits are a story allowance, so they buy nothing in
    // vision or image, where the gate is exactly what it was.
    return hasUnlimitedUse(opts) || (kind === "chat" && spec.storyCredits !== undefined);
  }
  return true;
}

/**
 * "GPT-5.6 Terra", from "GPT-5.6 Terra — balanced": the name without the pitch,
 * for sentences. The picker shows the whole label; a price or a refusal names
 * the model.
 */
export function modelName(model: string): string {
  return (MODEL_CATALOG[model]?.label ?? model).split(" — ")[0];
}

/**
 * What one story on this model costs this account, in credits.
 *
 * Zero means "not charged", for three separate reasons that all end the same
 * way: the account pays for its own use, the model runs locally, or the model
 * is not in the catalogue at all (resolveModel never runs one of those).
 *
 * The one place a price is read. The enqueue check, the charge when a story
 * finishes, and the price shown beside each model all call this, so a change to
 * a price cannot make the three disagree -- the failure this codebase names
 * most often, and the one that turns "3 credits" on screen into 1 on the bill.
 */
export function storyCreditsFor(model: string, opts: { isAdmin: boolean; hasOwnKey: boolean }): number {
  const spec = MODEL_CATALOG[model];
  if (!spec || spec.provider !== "openai") return 0;
  if (hasUnlimitedUse(opts)) return 0;
  // A free account can only have resolved to a priced model -- an unpriced
  // premium one is refused by isModelAllowedFor and downgraded. 1 is the
  // defensive answer for an economy model someone forgot to price, and it is
  // never 0: a missing price must not become a free story on the owner's key.
  return spec.storyCredits ?? 1;
}

/**
 * The most a free account's eight portraits may be drawn at.
 *
 * Those are paid for by a cap rather than by credits (MAX_FREE_AVATARS), so
 * without this a new account could set "Finest" and hand the owner eight
 * pictures at 6 credits apiece for nothing. Their stories still draw at
 * whatever they chose; it is only the free portraits that are held here.
 */
export const FREE_PORTRAIT_CEILING: PictureTier = "high";

/** Credits ONE picture costs this account. Zero when nobody is charged. */
export function pictureCreditsFor(
  tier: PictureTier,
  opts: { isAdmin: boolean; hasOwnKey: boolean },
): number {
  if (hasUnlimitedUse(opts)) return 0;
  return PICTURE_CREDITS[tier] ?? PICTURE_CREDITS[DEFAULT_PICTURE_TIER];
}

/**
 * The quality parameter for an image model, spread into a request.
 *
 * The same shape as inputFidelityFor and for the same reason: request shape is
 * a property of the model. A model with no map -- gpt-image-2 -- is sent
 * nothing and keeps the behaviour it had before tiers existed.
 */
export function qualityFor(model: string, tier: PictureTier): Record<string, string> {
  const named = MODEL_CATALOG[model]?.quality?.[tier];
  return named ? { quality: named } : {};
}

/** Image models a user may choose between, for the settings UI. */
export function listSelectablePictureModels(opts: { isAdmin: boolean; hasOwnKey: boolean }) {
  return Object.entries(MODEL_CATALOG)
    .filter(([, spec]) => spec.kinds.includes("image") && !spec.legacy)
    .map(([id, spec]) => ({
      id,
      label: spec.label,
      warning: spec.warning,
      isDefault: id === DEFAULTS.image,
    }));
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
      /**
       * Credits a story costs THIS account, or null when it is not charged.
       * Null rather than 0 so the picker can tell "free for you" from "this
       * model costs nothing" -- the screen says nothing about credits to
       * someone on their own key.
       */
      credits: isModelAllowedFor(id, "chat", opts) ? storyCreditsFor(id, opts) || null : null,
      isDefault: id === defaultChatModelFor(opts),
    }));
}

/**
 * Is a premium model on the owner's key paid for, on THIS call?
 *
 * A free account reaches Terra by spending credits, and credits are charged
 * for a story -- nothing else. Chord generation, a universe summary, a world
 * extraction all resolve "chat" too and charge nothing, so without this a
 * free account that picked Terra would run every one of them at ten times
 * Luna's price for free, and chords can be asked for as often as you like.
 * Those calls fall back to DEFAULTS.chat instead: the same model they ran on
 * before Terra had a price.
 *
 * Only the story's own callers pass forStory, and forgetting to pass it fails
 * cheap -- Luna, never an unpaid Terra.
 */
export function paidFor(
  model: string,
  kind: ModelKind,
  opts: { isAdmin: boolean; hasOwnKey: boolean },
  call: { forStory?: boolean },
): boolean {
  if (hasUnlimitedUse(opts)) return true;
  if (MODEL_CATALOG[model]?.tier !== "premium") return true;
  return kind === "chat" && Boolean(call.forStory);
}

/**
 * The single place where the model, the base URL and the API key are decided.
 * Returns null for image generation the user is not entitled to, so the caller
 * can skip illustration rather than fail the whole story.
 */
export async function resolveModel(
  userId: number,
  kind: ModelKind = "chat",
  opts: { grantedByAllowance?: boolean; forStory?: boolean; model?: string } = {},
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

  // Terra for someone paying for their own use, Luna for everyone else -- only
  // until they choose. A stored choice always wins, so an account that picked
  // Luna in Settings keeps Luna; nobody is moved onto a more expensive model
  // they did not ask for.
  let requested = kind === "chat" ? defaultChatModelFor(entitled) : DEFAULTS[kind];
  /**
   * A model the CALLER has already chosen -- pictureChoiceFor's answer, which
   * it read from this account's settings and priced. Still only a request:
   * it goes through the same gate below as a stored chat model, so asking for
   * something this account may not run is a downgrade, never a permission.
   */
  if (opts.model) requested = opts.model;
  if (kind === "chat") {
    const stored = await storage.getUserOpenAIModel(userId).catch(() => null);
    if (stored) requested = stored;
  }

  let model = requested;
  let downgradedFrom: string | undefined;

  if (!isModelAllowedFor(model, kind, entitled) || !paidFor(model, kind, entitled, opts)) {
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

/**
 * WHICH MODEL DRAWS THIS ACCOUNT'S PICTURES, AT WHAT TIER, AND FOR WHAT.
 *
 * The one reader of user_settings.image_model / image_quality. Everything a
 * picture needs to know is decided here and nowhere else -- the model to ask,
 * the tier to send, the credits to charge -- so the price charged and the
 * quality requested cannot come apart.
 *
 * VALIDATED AT USE, not only when it was set (decisions.md 2). A stored model
 * that has been retired, or one that is not an image model at all, falls back
 * to the catalogue default the same way a stored chat model does; a tier that
 * is no longer offered falls back to DEFAULT_PICTURE_TIER. A setting from a
 * year ago must never be able to spend money at a price this file no longer
 * has words for.
 */
export async function pictureChoiceFor(userId: number): Promise<{
  model: string;
  tier: PictureTier;
  /** Credits this account is charged for one picture. 0 when unlimited. */
  credits: number;
  /** True when nobody is charged: an admin, or an account on its own key. */
  unlimited: boolean;
}> {
  const [user, ownKey, prefs] = await Promise.all([
    storage.getUser(userId).catch(() => undefined),
    storage.getUserOpenAIKey(userId).catch(() => null),
    storage.getUserPicturePrefs(userId).catch(() => ({}) as Partial<PicturePrefs>),
  ]);
  const entitled = { isAdmin: Boolean(user?.isAdmin), hasOwnKey: Boolean(ownKey) };

  const storedModel = prefs?.model;
  const spec = storedModel ? MODEL_CATALOG[storedModel] : undefined;
  const model = spec?.kinds.includes("image") ? storedModel! : DEFAULTS.image;

  const storedTier = prefs?.quality;
  const tier: PictureTier =
    storedTier && (PICTURE_TIERS as readonly string[]).includes(storedTier)
      ? (storedTier as PictureTier)
      : DEFAULT_PICTURE_TIER;

  return {
    model,
    tier,
    credits: pictureCreditsFor(tier, entitled),
    unlimited: hasUnlimitedUse(entitled),
  };
}
