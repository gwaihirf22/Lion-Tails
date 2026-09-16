import { creditsLabel, type PictureTier } from "@shared/schema";

/**
 * What GET /api/settings/models says about pictures, and how a button says it.
 *
 * It replaced `canIllustrate`, a boolean that answered "may this account draw
 * at all" -- a question the app stopped having when pictures started costing
 * credits instead of being gated. Everything here is DERIVED by the server
 * from the same helpers it charges with; nothing in the client prices a
 * picture or decides who may have one.
 */
export type PictureSettings = {
  models: { id: string; label: string; warning?: string; isDefault: boolean }[];
  model: string;
  modelName: string;
  tier: PictureTier;
  tiers: { tier: PictureTier; label: string; description: string; credits: number | null }[];
  /** Credits ONE picture costs this account. 0 when nobody is charged. */
  credits: number;
  /** An admin, or an account on its own key: pictures cost it nothing. */
  free: boolean;
};

/** Everything a picture button needs to know, in one place. */
export function pictureOffer(
  pictures: PictureSettings | undefined,
  remaining: number | undefined,
): {
  /** There is a picture to offer at all. False when the account turned them off. */
  offered: boolean;
  /** It can be pressed: free, or affordable. */
  affordable: boolean;
  /** " — 3 credits", or "" when this account is never charged. */
  price: string;
  /** Why it cannot be pressed, for a title attribute. */
  reason?: string;
} {
  if (!pictures) return { offered: false, affordable: false, price: "" };
  if (pictures.tier === "none") {
    return {
      offered: false,
      affordable: false,
      price: "",
      reason: "Pictures are turned off. Choose a picture quality in Settings.",
    };
  }
  if (pictures.free || pictures.credits === 0) {
    return { offered: true, affordable: true, price: "" };
  }
  const price = ` — ${creditsLabel(pictures.credits)}`;
  // Unknown balance is treated as affordable: the server refuses with a price
  // in the message, which is a better answer than a button greyed out because
  // one query has not landed yet.
  const affordable = remaining === undefined || remaining >= pictures.credits;
  return {
    offered: true,
    affordable,
    price,
    reason: affordable
      ? undefined
      : `${creditsLabel(pictures.credits)}, and you have ${creditsLabel(remaining ?? 0)}.`,
  };
}
