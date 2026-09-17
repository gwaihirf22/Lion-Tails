/**
 * Who is using this in a way Blake should look at.
 *
 * Sign-ups are open and a new account carries free credits on the owner's key,
 * so the question "is anybody taking the mickey" has to have an answer that is
 * not "read the logs". Four signals, which is Blake's list: **money** (what one
 * account costs him), **volume** (a burst that looks like a script),
 * **refusals** (somebody finding out what a children's app will draw) and
 * **sign-ups** (several accounts from one address).
 *
 * THE JUDGEMENT IS PURE AND THE QUERIES ARE NOT, and they are separated here
 * for the reason this repo separates them everywhere: `abuseWarnings()` is a
 * function of rows, thresholds and nothing else, so every boundary can be
 * driven from both sides in a test. A threshold that fires one too early is
 * found in `tests/abuseWatch.test.ts`, not by an email accusing a friend of
 * Blake's of farming credits.
 *
 * IT REPORTS; IT NEVER ACTS. Nothing here bans, cancels, deletes or throttles.
 * "Suspicious" is not permission, and a threshold is a guess about behaviour --
 * the ban button is three inches away on the same page and a person presses it.
 *
 * COUNTS AND MONEY, NEVER CONTENT -- accountStats.ts's boundary, and the reason
 * `account_events` has no column for what was asked for. Every sentence below
 * is a number, a name and a threshold.
 */
import { pool } from "../db";
import type { Warning } from "@shared/warnings";
import { mostUrgentFirst } from "@shared/warnings";

/**
 * How much is too much. Stored in `app_settings` so a number can be tuned
 * without a deploy, with these as the floor when nothing is stored.
 *
 * The defaults are set against real measurements rather than round numbers:
 * the whole application billed $10.49 in its first measured week, a story
 * costs a few cents and a picture about five, and the story worker runs ONE
 * job at a time per account. So a single account costing three dollars in a
 * day, or starting twelve stories in an hour, is already far outside anything
 * a family does -- while leaving an enthusiastic Saturday afternoon alone.
 */
export type AbuseThresholds = {
  /** Owner-paid spend by one account in 24 hours, in cents. */
  spendCentsPerDay: number;
  /** Story jobs started by one account in an hour. */
  storiesPerHour: number;
  /** Pictures drawn for one account in an hour. */
  picturesPerHour: number;
  /** Times a model refused one account in 24 hours. */
  refusalsPerDay: number;
  /** Accounts created from one address in 24 hours. */
  signupsPerAddressPerDay: number;
};

export const DEFAULT_THRESHOLDS: AbuseThresholds = {
  spendCentsPerDay: 300,
  storiesPerHour: 12,
  picturesPerHour: 20,
  refusalsPerDay: 5,
  signupsPerAddressPerDay: 3,
};

/** One account's numbers over the windows above. */
export type AbuseAccount = {
  id: number;
  username: string;
  /** Admins are uncharged and unlimited, which is exactly why money still counts. */
  isAdmin: boolean;
  /** Already locked out. Nothing here has anything left to tell him. */
  banned: boolean;
  spentMicrosDay: number;
  storiesHour: number;
  picturesHour: number;
  refusalsDay: number;
};

/** Accounts made from one address, newest window only. */
export type AbuseAddress = {
  address: string;
  accounts: number;
  /** The usernames, so the sentence names them rather than a count. */
  usernames: string[];
};

export type AbuseInput = {
  accounts: AbuseAccount[];
  addresses: AbuseAddress[];
};

/**
 * A warning, plus who it is about.
 *
 * A superset of `Warning`, so both admin screens render it unchanged. The id is
 * what lets a later alert remember it has already said this about this account
 * rather than repeating it every hour.
 */
export type AbuseFinding = Warning & {
  accountId?: number;
  /**
   * The same finding about the same subject, across runs.
   *
   * `code` alone is a category and the message carries a count that moves, so
   * neither can answer "have I already said this". The key is what lets an
   * alert be sent once rather than every hour, and it is deliberately NOT the
   * message: one more picture must not read as news.
   */
  key: string;
};

const dollars = (micros: number) => `$${(micros / 1_000_000).toFixed(2)}`;
const centsToDollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * What one account costs the owner, in a day.
 *
 * "action", because it is his money and it is already spent. **Admins are
 * included on purpose**: an admin is uncharged and unlimited, so an admin is
 * the only kind of account that CAN run up an unbounded bill. Leaving them out
 * would blind this to the most expensive case there is.
 */
export function spendFindings(accounts: AbuseAccount[], t: AbuseThresholds): AbuseFinding[] {
  const limit = t.spendCentsPerDay * 10_000; // cents -> micros
  return accounts
    .filter((a) => !a.banned && a.spentMicrosDay > limit)
    .sort((a, b) => b.spentMicrosDay - a.spentMicrosDay)
    .map((a) => ({
      level: "action" as const,
      code: "abuse-spend",
      accountId: a.id,
      key: `abuse-spend:${a.id}`,
      message:
        `${a.username} has cost ${dollars(a.spentMicrosDay)} in the last day ` +
        `(over ${centsToDollars(t.spendCentsPerDay)})` +
        `${a.isAdmin ? ", and is an admin, so nothing stops them" : ""}.`,
    }));
}

/**
 * A burst that does not look like a person.
 *
 * "watch", not "action": the story worker runs one job at a time per account,
 * so a high count is a long afternoon rather than a runaway loop, and a family
 * on a rainy Saturday must not be reported as an abuser. It is worth a look and
 * nothing more.
 */
export function volumeFindings(accounts: AbuseAccount[], t: AbuseThresholds): AbuseFinding[] {
  const out: AbuseFinding[] = [];
  for (const a of accounts.filter((x) => !x.banned).sort((x, y) => y.storiesHour - x.storiesHour)) {
    if (a.storiesHour > t.storiesPerHour) {
      out.push({
        level: "watch",
        code: "abuse-stories",
        accountId: a.id,
        key: `abuse-stories:${a.id}`,
        message: `${a.username} started ${plural(a.storiesHour, "story", "stories")} in the last hour (over ${t.storiesPerHour}).`,
      });
    }
  }
  for (const a of accounts.filter((x) => !x.banned).sort((x, y) => y.picturesHour - x.picturesHour)) {
    if (a.picturesHour > t.picturesPerHour) {
      out.push({
        level: "watch",
        code: "abuse-pictures",
        accountId: a.id,
        key: `abuse-pictures:${a.id}`,
        message: `${a.username} drew ${plural(a.picturesHour, "picture")} in the last hour (over ${t.picturesPerHour}).`,
      });
    }
  }
  return out;
}

/**
 * The model kept saying no.
 *
 * "action", and it is the signal this whole file was worth building for. One
 * refusal is somebody asking for Yoshi. A dozen is a person working out what a
 * children's app will draw, and that is the account to look at first -- which
 * is why it outranks money in the sort even though money is what gets spent.
 *
 * The sentence says a count and never what was asked for. There is no column
 * holding that and there is not going to be one.
 */
export function refusalFindings(accounts: AbuseAccount[], t: AbuseThresholds): AbuseFinding[] {
  return accounts
    .filter((a) => !a.banned && a.refusalsDay > t.refusalsPerDay)
    .sort((a, b) => b.refusalsDay - a.refusalsDay)
    .map((a) => ({
      level: "action" as const,
      code: "abuse-refusals",
      accountId: a.id,
      key: `abuse-refusals:${a.id}`,
      message:
        `${a.username} was refused ${plural(a.refusalsDay, "time")} in the last day ` +
        `(over ${t.refusalsPerDay}). Look at the account before deciding anything.`,
    }));
}

/**
 * Several accounts from one address, which is what farming free credits looks
 * like from the outside.
 *
 * "watch", because it is also what a family with two parents and a shared
 * router looks like, and what a school looks like. The address is shown so he
 * can recognise his own.
 */
export function signupFindings(addresses: AbuseAddress[], t: AbuseThresholds): AbuseFinding[] {
  return addresses
    .filter((a) => a.accounts > t.signupsPerAddressPerDay)
    .sort((a, b) => b.accounts - a.accounts)
    .map((a) => ({
      level: "watch" as const,
      code: "abuse-signups",
      key: `abuse-signups:${a.address}`,
      message:
        `${plural(a.accounts, "account")} were created from ${a.address} in the last day ` +
        `(over ${t.signupsPerAddressPerDay}): ${a.usernames.join(", ")}.`,
    }));
}

/**
 * Everything worth saying, most urgent first.
 *
 * Refusals lead the "action" half: money is already spent and can be argued
 * about later, whereas somebody pushing at what this will draw is a decision
 * for today.
 */
export function abuseWarnings(input: AbuseInput, thresholds: AbuseThresholds): AbuseFinding[] {
  return mostUrgentFirst([
    ...refusalFindings(input.accounts, thresholds),
    ...spendFindings(input.accounts, thresholds),
    ...volumeFindings(input.accounts, thresholds),
    ...signupFindings(input.addresses, thresholds),
  ]);
}

/**
 * Thresholds as stored, with every missing or nonsense field falling back to
 * the default.
 *
 * Pure, and total on purpose: this reads a jsonb column an admin will
 * eventually be able to edit, and a NaN or a negative number reaching a
 * comparison turns the watcher silently off -- which is the failure mode where
 * a check cannot fail. A number has to be finite and above zero to be used.
 */
export function thresholdsFrom(stored: unknown): AbuseThresholds {
  const out = { ...DEFAULT_THRESHOLDS };
  if (!stored || typeof stored !== "object") return out;
  for (const key of Object.keys(DEFAULT_THRESHOLDS) as (keyof AbuseThresholds)[]) {
    const value = (stored as Record<string, unknown>)[key];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) out[key] = value;
  }
  return out;
}

// ---------------------------------------------------------------------------
// The rows. Everything above is a function of what follows and nothing else.
// ---------------------------------------------------------------------------

/** Purposes that are a picture. The same list accountStats.ts counts. */
const PICTURE_PURPOSES = "('cover','passage-picture','redraw','avatar')";

export async function readThresholds(): Promise<AbuseThresholds> {
  if (!pool) return { ...DEFAULT_THRESHOLDS };
  try {
    const { rows } = await pool.query("SELECT value FROM app_settings WHERE key = 'abuse_thresholds'");
    return thresholdsFrom(rows[0]?.value);
  } catch {
    // A missing row and an unreachable database mean the same thing here: use
    // the defaults rather than report nothing.
    return { ...DEFAULT_THRESHOLDS };
  }
}

/**
 * The numbers, in as few queries as there are windows.
 *
 * One query for the accounts and one for the addresses -- never a query per
 * account, accountStats.ts's rule. The windows are inside the SQL so "the last
 * hour" is the database's clock, which is the same clock every timestamp here
 * was written by.
 */
export async function gatherAbuseInput(): Promise<AbuseInput> {
  if (!pool) return { accounts: [], addresses: [] };

  const [accounts, addresses] = await Promise.all([
    pool.query(
      `WITH spend AS (
         SELECT user_id, SUM(cost_micros) FILTER (WHERE cost_micros IS NOT NULL)::bigint AS micros
           FROM model_calls
          WHERE created_at > now() - interval '1 day' AND user_id IS NOT NULL
          GROUP BY user_id
       ), pics AS (
         SELECT user_id, COUNT(*)::int AS n
           FROM model_calls
          WHERE created_at > now() - interval '1 hour' AND user_id IS NOT NULL
            AND purpose IN ${PICTURE_PURPOSES}
          GROUP BY user_id
       ), jobs AS (
         SELECT user_id, COUNT(*)::int AS n
           FROM story_jobs
          WHERE created_at > now() - interval '1 hour' AND kind = 'story'
          GROUP BY user_id
       ), refusals AS (
         SELECT user_id, COUNT(*)::int AS n
           FROM account_events
          WHERE created_at > now() - interval '1 day' AND kind = 'refusal'
          GROUP BY user_id
       )
       SELECT u.id, u.username, u.is_admin, u.banned_at,
              COALESCE(s.micros, 0)::bigint AS micros,
              COALESCE(j.n, 0) AS stories,
              COALESCE(p.n, 0) AS pictures,
              COALESCE(r.n, 0) AS refusals
         FROM users u
         LEFT JOIN spend s ON s.user_id = u.id
         LEFT JOIN jobs j ON j.user_id = u.id
         LEFT JOIN pics p ON p.user_id = u.id
         LEFT JOIN refusals r ON r.user_id = u.id`,
    ),
    pool.query(
      `SELECT signup_ip AS address, COUNT(*)::int AS accounts,
              array_agg(username ORDER BY created_at) AS usernames
         FROM users
        WHERE signup_ip IS NOT NULL AND created_at > now() - interval '1 day'
        GROUP BY signup_ip
        HAVING COUNT(*) > 1`,
    ),
  ]);

  return {
    accounts: accounts.rows.map((r: Record<string, unknown>) => ({
      id: Number(r.id),
      username: String(r.username),
      isAdmin: Boolean(r.is_admin),
      banned: r.banned_at !== null && r.banned_at !== undefined,
      spentMicrosDay: Number(r.micros),
      storiesHour: Number(r.stories),
      picturesHour: Number(r.pictures),
      refusalsDay: Number(r.refusals),
    })),
    addresses: addresses.rows.map((r: Record<string, unknown>) => ({
      address: String(r.address),
      accounts: Number(r.accounts),
      usernames: (r.usernames as string[]) ?? [],
    })),
  };
}

export type AbuseReport = {
  findings: AbuseFinding[];
  thresholds: AbuseThresholds;
  /** So the page can say what it looked at, rather than implying it looked at everything. */
  accountsChecked: number;
};

/** Gather, then judge. The admin page's one call. */
export async function abuseReport(): Promise<AbuseReport> {
  const [input, thresholds] = await Promise.all([gatherAbuseInput(), readThresholds()]);
  return {
    findings: abuseWarnings(input, thresholds),
    thresholds,
    accountsChecked: input.accounts.length,
  };
}
