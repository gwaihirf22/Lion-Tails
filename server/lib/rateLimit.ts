/**
 * How often one caller may do a thing, and what happens when they do it more.
 *
 * WHY THIS IS WRITTEN RATHER THAN INSTALLED. express-rate-limit's default
 * store is an in-memory map, which is exactly what this is -- one process, one
 * container, no cluster and no Redis -- so the dependency would buy packaging
 * rather than capability. And the decision inside a dependency cannot be unit
 * tested, while this repo's whole testing story is that judgement lives in
 * pure functions. `hit()` is the judgement; the middleware is plumbing.
 *
 * WHAT IT IS FOR, AND WHAT IT IS NOT. Turnstile guards the sign-up FORM. This
 * guards the endpoint, which a script reaches without ever loading the form:
 * before it, /api/auth/login accepted unlimited password guesses and
 * /api/auth/register accepted unlimited accounts, each one carrying free
 * credits on the owner's key. Neither is a limit on what a family can do --
 * the story credits are that, and they are counted elsewhere.
 *
 * IT FORGETS ON RESTART, and that is acceptable: a deploy is minutes, the
 * window is minutes, and the thing being stopped is a script running for
 * hours. A limiter that survived restarts would need a table and a cleanup
 * job, which is a lot of machinery to buy back one deploy's worth of memory.
 */

export type LimitRule = {
  /** How many are allowed inside the window. */
  limit: number;
  windowMs: number;
};

export type LimitState = Map<string, { count: number; resetAt: number }>;

export type LimitVerdict = {
  allowed: boolean;
  /** What is left after this one. Reported so a caller can be told. */
  remaining: number;
  /** How long until it resets, in whole seconds, for Retry-After. */
  retryAfterSeconds: number;
};

/**
 * Count one attempt against a key, and say whether it is allowed.
 *
 * A FIXED window, not a sliding one. A sliding window needs every timestamp
 * kept per key; a fixed one needs a count and an expiry, and the difference
 * only matters to somebody timing their requests around the boundary -- who
 * gets, at worst, twice the limit across two windows. That is a fine trade for
 * ten logins in fifteen minutes.
 *
 * PURE apart from the map it is handed, which is what makes the rule testable
 * without a clock or a server: the caller passes `now`.
 */
export function hit(state: LimitState, key: string, now: number, rule: LimitRule): LimitVerdict {
  const existing = state.get(key);
  if (!existing || existing.resetAt <= now) {
    state.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { allowed: true, remaining: rule.limit - 1, retryAfterSeconds: Math.ceil(rule.windowMs / 1000) };
  }

  existing.count += 1;
  const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
  return {
    allowed: existing.count <= rule.limit,
    remaining: Math.max(0, rule.limit - existing.count),
    retryAfterSeconds,
  };
}

/**
 * Drop everything that has expired.
 *
 * Called on write rather than on a timer: a limiter that keeps a timer alive
 * holds the process open, and one that never sweeps is a memory leak with a
 * key per address. Bounded as well as swept -- if a flood arrives faster than
 * the sweep, the map is cleared rather than grown without end. Losing counts
 * under a flood is the right failure: the alternative is running out of
 * memory, which stops everybody.
 */
export function sweep(state: LimitState, now: number, maxKeys = 10_000): void {
  for (const [key, entry] of state) {
    if (entry.resetAt <= now) state.delete(key);
  }
  if (state.size > maxKeys) state.clear();
}

/** Counts every attempt, whatever the answer. */
export function limiter(rule: LimitRule) {
  const state: LimitState = new Map();
  return {
    state,
    check(key: string, now = Date.now()): LimitVerdict {
      sweep(state, now);
      return hit(state, key, now, rule);
    },
    /**
     * Is this key already over, WITHOUT counting this look as an attempt?
     *
     * For the limits that count failures: the answer is not known until the
     * password has been checked, so the guard has to ask twice -- once before,
     * to refuse somebody already over, and once after, to spend the allowance
     * only on a wrong answer. Counting the look would make a correct sign-in
     * cost the same as a wrong one.
     */
    peek(key: string, now = Date.now()): LimitVerdict {
      const entry = state.get(key);
      if (!entry || entry.resetAt <= now) {
        return { allowed: true, remaining: rule.limit, retryAfterSeconds: 0 };
      }
      return {
        allowed: entry.count < rule.limit,
        remaining: Math.max(0, rule.limit - entry.count),
        retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
      };
    },
    /** Forget a key -- used where only FAILURES should count towards a limit. */
    forget(key: string): void {
      state.delete(key);
    },
  };
}
