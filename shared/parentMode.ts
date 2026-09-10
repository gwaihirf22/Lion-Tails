/**
 * Parent Mode, as a fact about a session.
 *
 * ONE predicate. The check used to be written twice on the server -- in
 * requireParentMode and again, inline, in the forced-summary route -- and
 * the client computed its own from `expiresAt`. Two of those would have
 * disagreed the moment "until I turn it off" existed, because that is not an
 * expiry at all.
 *
 * Two fields, one answer: `parentModeIndefinite` (chosen at the password
 * prompt: keep it on until turned off or signed out) and `parentModeExpiry`
 * (the 30-minute window). Both live on the session, so logging out ends
 * either, and the login cookie's own lifetime bounds "indefinite" whatever
 * the DB row says.
 */
export const PARENT_MODE_WINDOW_MS = 30 * 60 * 1000;

export type ParentModeSession = {
  parentModeExpiry?: number | null;
  parentModeIndefinite?: boolean | null;
};

export function parentModeActive(session: ParentModeSession | undefined, now = Date.now()): boolean {
  if (!session) return false;
  if (session.parentModeIndefinite) return true;
  return typeof session.parentModeExpiry === "number" && now < session.parentModeExpiry;
}
