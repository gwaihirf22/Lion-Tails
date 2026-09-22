import { describe, it, expect } from "vitest";
import {
  abuseWarnings,
  refusalFindings,
  signupFindings,
  spendFindings,
  thresholdsFrom,
  volumeFindings,
  DEFAULT_THRESHOLDS,
  type AbuseAccount,
  type AbuseThresholds,
} from "../server/lib/abuseWatch";

/**
 * Every threshold, from both sides.
 *
 * The thing that goes wrong with a watcher is not that it fails to run; it is
 * that it fires one too early and accuses somebody, or one too late and never
 * fires at all. Both are boundary arithmetic, and boundary arithmetic is the
 * one thing a pure function can be held to exactly.
 */
const T: AbuseThresholds = {
  spendCentsPerDay: 100,
  storiesPerHour: 3,
  picturesPerHour: 4,
  refusalsPerDay: 2,
  signupsPerAddressPerDay: 2,
};

const account = (over: Partial<AbuseAccount> = {}): AbuseAccount => ({
  id: 1,
  username: "someone",
  isAdmin: false,
  banned: false,
  spentMicrosDay: 0,
  storiesHour: 0,
  picturesHour: 0,
  refusalsDay: 0,
  ...over,
});

const CENT = 10_000; // micros

describe("spendFindings", () => {
  it("says nothing at the threshold and something just over it", () => {
    expect(spendFindings([account({ spentMicrosDay: 100 * CENT })], T)).toHaveLength(0);
    expect(spendFindings([account({ spentMicrosDay: 100 * CENT + 1 })], T)).toHaveLength(1);
  });

  it("counts an admin, who is the only account that can run up an unbounded bill", () => {
    // Admins are uncharged and unlimited. Leaving them out would blind this to
    // the most expensive case there is.
    const found = spendFindings([account({ isAdmin: true, spentMicrosDay: 500 * CENT })], T);
    expect(found).toHaveLength(1);
    expect(found[0].message).toContain("admin");
  });

  it("is an action, and names the money in dollars", () => {
    const [f] = spendFindings([account({ spentMicrosDay: 423 * CENT })], T);
    expect(f.level).toBe("action");
    expect(f.message).toContain("$4.23");
    expect(f.accountId).toBe(1);
  });

  it("puts the dearest account first", () => {
    const found = spendFindings(
      [
        account({ id: 1, username: "small", spentMicrosDay: 200 * CENT }),
        account({ id: 2, username: "large", spentMicrosDay: 900 * CENT }),
      ],
      T,
    );
    expect(found.map((f) => f.accountId)).toEqual([2, 1]);
  });
});

describe("volumeFindings", () => {
  it("holds both counts at their threshold and reports each just over", () => {
    expect(volumeFindings([account({ storiesHour: 3, picturesHour: 4 })], T)).toHaveLength(0);
    const found = volumeFindings([account({ storiesHour: 4, picturesHour: 5 })], T);
    expect(found.map((f) => f.code)).toEqual(["abuse-stories", "abuse-pictures"]);
  });

  it("is only ever a watch: one job at a time means a big number is a long afternoon", () => {
    const found = volumeFindings([account({ storiesHour: 99, picturesHour: 99 })], T);
    expect(found.every((f) => f.level === "watch")).toBe(true);
  });

  it("writes one story and two stories correctly", () => {
    const one = volumeFindings([account({ storiesHour: 4 })], { ...T, storiesPerHour: 3 });
    expect(one[0].message).toContain("4 stories");
    const single = volumeFindings([account({ storiesHour: 1 })], { ...T, storiesPerHour: 0 });
    expect(single[0].message).toContain("1 story");
    expect(single[0].message).not.toContain("1 storys");
  });
});

describe("refusalFindings", () => {
  it("allows the odd refusal and reports a run of them", () => {
    // One refusal is somebody asking for Yoshi, which is Blake's own example.
    expect(refusalFindings([account({ refusalsDay: 2 })], T)).toHaveLength(0);
    expect(refusalFindings([account({ refusalsDay: 3 })], T)).toHaveLength(1);
  });

  it("is an action, and never says what was asked for", () => {
    const [f] = refusalFindings([account({ refusalsDay: 9 })], T);
    expect(f.level).toBe("action");
    expect(f.message).toContain("9 times");
    // There is no content column, so there is nothing here to leak -- this
    // fails the day somebody adds one and wires it through.
    expect(f.message).not.toMatch(/prompt|asked for "|drew "/i);
  });
});

describe("signupFindings", () => {
  it("leaves a shared router alone and reports a farm", () => {
    const one = { address: "1.2.3.4", accounts: 2, usernames: ["mum", "dad"] };
    expect(signupFindings([one], T)).toHaveLength(0);
    const many = { address: "1.2.3.4", accounts: 5, usernames: ["a", "b", "c", "d", "e"] };
    const [f] = signupFindings([many], T);
    expect(f.level).toBe("watch");
    expect(f.message).toContain("1.2.3.4");
    expect(f.message).toContain("a, b, c, d, e");
  });

  it("has no account id: it is about an address, not a person", () => {
    const [f] = signupFindings([{ address: "9.9.9.9", accounts: 9, usernames: ["x"] }], T);
    expect(f.accountId).toBeUndefined();
  });
});

describe("a banned account", () => {
  it("is left out of every signal about a person", () => {
    // They are already locked out. Repeating yesterday's numbers every hour is
    // how a warnings list becomes something nobody reads.
    const banned = account({ banned: true, spentMicrosDay: 999 * CENT, storiesHour: 99, picturesHour: 99, refusalsDay: 99 });
    expect(abuseWarnings({ accounts: [banned], addresses: [] }, T)).toHaveLength(0);
  });
});

describe("abuseWarnings", () => {
  it("is empty when everybody is inside every limit", () => {
    const quiet = [account({ spentMicrosDay: 50 * CENT, storiesHour: 3, picturesHour: 4, refusalsDay: 2 })];
    expect(abuseWarnings({ accounts: quiet, addresses: [] }, T)).toEqual([]);
  });

  it("puts what to decide before what to notice, and refusals before money", () => {
    const found = abuseWarnings(
      {
        accounts: [
          account({ id: 1, username: "busy", storiesHour: 99 }),
          account({ id: 2, username: "dear", spentMicrosDay: 900 * CENT }),
          account({ id: 3, username: "refused", refusalsDay: 30 }),
        ],
        addresses: [{ address: "1.1.1.1", accounts: 9, usernames: ["a"] }],
      },
      T,
    );
    expect(found.map((f) => f.code)).toEqual([
      "abuse-refusals",
      "abuse-spend",
      "abuse-stories",
      "abuse-signups",
    ]);
  });
});

describe("thresholdsFrom", () => {
  it("falls back to the default for anything missing or nonsense", () => {
    // A NaN or a negative reaching a comparison turns the watcher silently
    // off, which is the failure mode where a check cannot fail.
    expect(thresholdsFrom(undefined)).toEqual(DEFAULT_THRESHOLDS);
    expect(thresholdsFrom("nonsense")).toEqual(DEFAULT_THRESHOLDS);
    expect(thresholdsFrom({ refusalsPerDay: -1 }).refusalsPerDay).toBe(DEFAULT_THRESHOLDS.refusalsPerDay);
    expect(thresholdsFrom({ refusalsPerDay: 0 }).refusalsPerDay).toBe(DEFAULT_THRESHOLDS.refusalsPerDay);
    expect(thresholdsFrom({ refusalsPerDay: "8" }).refusalsPerDay).toBe(DEFAULT_THRESHOLDS.refusalsPerDay);
    expect(thresholdsFrom({ spendCentsPerDay: Number.NaN }).spendCentsPerDay).toBe(
      DEFAULT_THRESHOLDS.spendCentsPerDay,
    );
  });

  it("takes a real number, and only the keys it knows", () => {
    const t = thresholdsFrom({ refusalsPerDay: 20, somethingElse: 1 });
    expect(t.refusalsPerDay).toBe(20);
    expect(Object.keys(t).sort()).toEqual(Object.keys(DEFAULT_THRESHOLDS).sort());
  });

  it("never mutates the defaults", () => {
    thresholdsFrom({ refusalsPerDay: 99 });
    expect(DEFAULT_THRESHOLDS.refusalsPerDay).toBe(5);
  });
});
