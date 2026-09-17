/**
 * Whether an account is locked out, said once.
 *
 * Four places need this answer -- the sign-in check, the request that arrives
 * on a live session, the public share link, and the admin page -- and a rule
 * written four times is four rules. So: one predicate, one sentence, both
 * pure, both tested.
 *
 * THE SENTENCE IS SHOWN TO THE PERSON BANNED, so it says what happened and
 * what to do, and nothing else. Not why: a reason belongs to the owner's page,
 * not to an argument at the sign-in form.
 */

export type BannableAccount = { bannedAt?: Date | string | null };

export function isBanned(account: BannableAccount | null | undefined): boolean {
  return Boolean(account?.bannedAt);
}

export const ACCOUNT_SUSPENDED_MESSAGE =
  "This account has been suspended. Nothing has been deleted. Email Lion Tails if you think this is a mistake.";

/** The code the client keys on, so the message can be reworded freely. */
export const ACCOUNT_SUSPENDED_CODE = "account_suspended";

/**
 * May this admin ban, unban or change the admin flag on this account?
 *
 * Two rules, and both are about the owner locking himself out:
 *  - nobody may ban or demote themselves, which is the classic way to lose
 *    the only key to the house;
 *  - the last admin may not be demoted or banned by anybody, because an app
 *    with no admin has no way back except hand-written SQL against the
 *    production database.
 *
 * Pure, and takes the admin count rather than reading it, so the rule is
 * testable and the caller does its database work inside whatever it already
 * holds.
 */
export function mayChangeAccount(
  actorId: number,
  target: { id: number; isAdmin: boolean },
  adminCount: number,
): { ok: true } | { ok: false; reason: string } {
  if (actorId === target.id) {
    return { ok: false, reason: "You cannot ban or demote your own account." };
  }
  if (target.isAdmin && adminCount <= 1) {
    return { ok: false, reason: "That is the last admin account. Promote somebody else first." };
  }
  return { ok: true };
}
