import { describe, it, expect } from "vitest";
import { hit, limiter, sweep, type LimitState } from "../server/lib/rateLimit";

/**
 * The judgement, without a clock or a server.
 *
 * This is the whole reason the limiter is written rather than installed: what
 * it decides is a pure function of a count, a window and the time, so it can
 * be driven past its own boundaries here instead of being discovered in
 * production by somebody locked out of their own account.
 */
const RULE = { limit: 3, windowMs: 60_000 };

describe("hit", () => {
  it("allows up to the limit and refuses after it", () => {
    const state: LimitState = new Map();
    expect(hit(state, "a", 0, RULE).allowed).toBe(true);
    expect(hit(state, "a", 1, RULE).allowed).toBe(true);
    expect(hit(state, "a", 2, RULE).allowed).toBe(true);
    expect(hit(state, "a", 3, RULE).allowed).toBe(false);
  });

  it("counts each key separately", () => {
    const state: LimitState = new Map();
    for (let i = 0; i < 3; i++) hit(state, "a", i, RULE);
    expect(hit(state, "a", 4, RULE).allowed).toBe(false);
    // Somebody else's address must not be spent by the first one.
    expect(hit(state, "b", 4, RULE).allowed).toBe(true);
  });

  it("starts again once the window has passed", () => {
    const state: LimitState = new Map();
    for (let i = 0; i < 4; i++) hit(state, "a", i, RULE);
    expect(hit(state, "a", 100, RULE).allowed).toBe(false);
    expect(hit(state, "a", 60_001, RULE).allowed).toBe(true);
  });

  it("says how long to wait, and never says zero", () => {
    const state: LimitState = new Map();
    hit(state, "a", 0, RULE);
    // Almost expired: a Retry-After of 0 reads as "try immediately", which is
    // exactly what the caller must not do.
    const nearly = hit(state, "a", 59_999, RULE);
    expect(nearly.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    const fresh = hit(state, "b", 0, RULE);
    expect(fresh.retryAfterSeconds).toBe(60);
  });

  it("reports what is left, and stops at zero", () => {
    const state: LimitState = new Map();
    expect(hit(state, "a", 0, RULE).remaining).toBe(2);
    expect(hit(state, "a", 1, RULE).remaining).toBe(1);
    expect(hit(state, "a", 2, RULE).remaining).toBe(0);
    expect(hit(state, "a", 3, RULE).remaining).toBe(0);
  });
});

describe("sweep", () => {
  it("drops what has expired and keeps what has not", () => {
    const state: LimitState = new Map();
    hit(state, "old", 0, RULE);
    hit(state, "new", 30_000, RULE);
    sweep(state, 61_000);
    expect(state.has("old")).toBe(false);
    expect(state.has("new")).toBe(true);
  });

  it("clears rather than growing without end", () => {
    // Losing counts under a flood is the right failure. The alternative is a
    // key per address until the process runs out of memory, which stops
    // everybody rather than the flood.
    const state: LimitState = new Map();
    for (let i = 0; i < 50; i++) hit(state, `k${i}`, 0, RULE);
    sweep(state, 1, 10);
    expect(state.size).toBe(0);
  });
});

describe("limiter", () => {
  it("forgets a key on demand, for limits that count only failures", () => {
    // The login limit counts failures: a family typing the right password all
    // afternoon must never be locked out of their own stories.
    const guard = limiter(RULE);
    guard.check("someone", 0);
    guard.check("someone", 1);
    guard.forget("someone");
    expect(guard.check("someone", 2).remaining).toBe(2);
  });

  it("sweeps as it goes, so nothing has to run a timer", () => {
    const guard = limiter(RULE);
    guard.check("a", 0);
    expect(guard.state.size).toBe(1);
    guard.check("b", 120_000);
    expect(guard.state.has("a")).toBe(false);
  });
});
