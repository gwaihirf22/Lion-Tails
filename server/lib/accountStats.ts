/**
 * Who has an account, and what it has cost — for the admin accounts page.
 *
 * The sibling of generationStats.ts, and it inherits that file's boundary
 * verbatim: **counts and money, never content**. Not one query here selects a
 * story title, a character name, a prompt or a request body. An owner needs to
 * know that an account spent nine dollars yesterday; he does not need to read
 * what somebody's child asked for, and a screen that showed it would be read
 * by whoever is standing behind him.
 *
 * Reads `pool` directly rather than going through IStorage, like
 * generationStats.ts and storyJobs.ts do: MemStorage would have to grow a
 * parallel implementation of every aggregate, and a second implementation of a
 * number is how two screens come to disagree about it.
 *
 * ONE query per table, joined by id in the caller — never a query per account.
 * Three accounts today; the shape has to survive three hundred.
 */
import { pool } from "../db";
import { storyAllowance, FREE_STORIES_PER_MONTH } from "@shared/schema";

/** What the list shows for one account. Money is the owner's, in micros. */
export type AccountRow = {
  id: number;
  username: string;
  email: string;
  isAdmin: boolean;
  isVerified: boolean;
  /** Locked out since, or null. Nothing of theirs is deleted while it is set. */
  bannedAt: string | null;
  bannedReason: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  signupIp: string | null;
  /** Credits spent and left, through the same pure rule every screen uses. */
  creditsUsed: number;
  creditsLeft: number;
  /** Lifetime portraits generated. Never reset, by design. */
  portraits: number;
  stories: number;
  storiesFailed: number;
  pictures: number;
  /** What this account cost the OWNER in the window. Null when nothing is priced. */
  spentMicros: number | null;
  /** Calls whose price is unknown, so the money above is a floor, not a total. */
  unpricedCalls: number;
  /** The newest story job, which is a better "last seen" than a login. */
  lastActivityAt: string | null;
};

export type AccountList = {
  windowDays: number;
  accounts: AccountRow[];
};

/**
 * Everyone, with the numbers beside them.
 *
 * The money window is bounded (30 days by default) because model_calls grows
 * per paid call and an unbounded SUM over all time gets slower every week.
 * Credits, portraits and story counts are lifetime, because that is what those
 * numbers mean.
 */
export async function accountList(windowDays = 30): Promise<AccountList> {
  if (!pool) return { windowDays, accounts: [] };

  const { rows } = await pool.query(
    `WITH spend AS (
       SELECT user_id,
              SUM(cost_micros) FILTER (WHERE cost_micros IS NOT NULL)::bigint AS micros,
              COUNT(*) FILTER (WHERE cost_micros IS NULL)::int AS unpriced,
              COUNT(*) FILTER (WHERE purpose IN ('cover','passage-picture','redraw','avatar'))::int AS pictures
         FROM model_calls
        WHERE created_at > now() - make_interval(days => $1::int)
          AND user_id IS NOT NULL
        GROUP BY user_id
     ), jobs AS (
       SELECT user_id,
              COUNT(*) FILTER (WHERE status = 'succeeded')::int AS stories,
              COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
              MAX(created_at) AS last_activity
         FROM story_jobs
        WHERE kind = 'story'
        GROUP BY user_id
     )
     SELECT u.id, u.username, u.email, u.is_admin, u.is_verified,
            u.banned_at, u.banned_reason,
            u.created_at, u.last_login_at, u.signup_ip,
            COALESCE(uu.count, 0)::int AS credits_used,
            uu.last_reset_date,
            COALESCE(uu.avatar_count, 0)::int AS portraits,
            COALESCE(j.stories, 0) AS stories,
            COALESCE(j.failed, 0) AS stories_failed,
            j.last_activity,
            COALESCE(s.pictures, 0) AS pictures,
            s.micros,
            COALESCE(s.unpriced, 0) AS unpriced
       FROM users u
       LEFT JOIN user_usage uu ON uu.user_id = u.id
       LEFT JOIN jobs j ON j.user_id = u.id
       LEFT JOIN spend s ON s.user_id = u.id
      ORDER BY u.id`,
    [windowDays],
  );

  return {
    windowDays,
    accounts: rows.map((r: Record<string, unknown>) => {
      // The same pure rule the pill, the settings card and the enqueue check
      // all use. Never a second copy of 50 and 10 in an admin screen.
      const allowance = storyAllowance({
        count: Number(r.credits_used),
        lastResetDate: (r.last_reset_date as Date | null) ?? null,
      });
      return {
        id: Number(r.id),
        username: String(r.username),
        email: String(r.email),
        isAdmin: Boolean(r.is_admin),
        isVerified: Boolean(r.is_verified),
        bannedAt: r.banned_at ? new Date(r.banned_at as string).toISOString() : null,
        bannedReason: (r.banned_reason as string | null) ?? null,
        createdAt: new Date(r.created_at as string).toISOString(),
        lastLoginAt: r.last_login_at ? new Date(r.last_login_at as string).toISOString() : null,
        signupIp: (r.signup_ip as string | null) ?? null,
        creditsUsed: allowance.used,
        creditsLeft: allowance.remaining,
        portraits: Number(r.portraits),
        stories: Number(r.stories),
        storiesFailed: Number(r.stories_failed),
        pictures: Number(r.pictures),
        // Null, not zero: nothing priced is a different fact from nothing spent.
        spentMicros: r.micros === null || r.micros === undefined ? null : Number(r.micros),
        unpricedCalls: Number(r.unpriced),
        lastActivityAt: r.last_activity ? new Date(r.last_activity as string).toISOString() : null,
      };
    }),
  };
}

export type AccountSpendLine = { label: string; calls: number; micros: number | null };

export type AccountDetail = {
  account: AccountRow | undefined;
  windowDays: number;
  perMonth: number;
  /** What the money went on, by purpose and model. */
  spend: AccountSpendLine[];
  /** Why generations failed, which is where misuse shows first. */
  failures: { code: string; n: number }[];
  /** Stories per day, so a burst is visible as a shape. */
  daily: { day: string; stories: number }[];
};

/** One account, in more detail. Still counts and money, still no content. */
export async function accountDetail(userId: number, windowDays = 30): Promise<AccountDetail> {
  const empty: AccountDetail = {
    account: undefined,
    windowDays,
    perMonth: FREE_STORIES_PER_MONTH,
    spend: [],
    failures: [],
    daily: [],
  };
  if (!pool) return empty;

  const list = await accountList(windowDays);
  const account = list.accounts.find((a) => a.id === userId);
  if (!account) return empty;

  const [spend, failures, daily] = await Promise.all([
    pool.query(
      `SELECT purpose, model, COUNT(*)::int AS calls,
              SUM(cost_micros) FILTER (WHERE cost_micros IS NOT NULL)::bigint AS micros
         FROM model_calls
        WHERE user_id = $1 AND created_at > now() - make_interval(days => $2::int)
        GROUP BY purpose, model
        ORDER BY micros DESC NULLS LAST`,
      [userId, windowDays],
    ),
    pool.query(
      `SELECT failure_code, COUNT(*)::int AS n
         FROM story_jobs
        WHERE user_id = $1 AND failure_code IS NOT NULL
          AND created_at > now() - make_interval(days => $2::int)
        GROUP BY failure_code
        ORDER BY n DESC`,
      [userId, windowDays],
    ),
    pool.query(
      `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, COUNT(*)::int AS stories
         FROM story_jobs
        WHERE user_id = $1 AND kind = 'story'
          AND created_at > now() - make_interval(days => $2::int)
        GROUP BY 1
        ORDER BY 1`,
      [userId, windowDays],
    ),
  ]);

  return {
    account,
    windowDays,
    perMonth: FREE_STORIES_PER_MONTH,
    spend: spend.rows.map((r: Record<string, unknown>) => ({
      label: `${String(r.purpose)} · ${String(r.model)}`,
      calls: Number(r.calls),
      micros: r.micros === null || r.micros === undefined ? null : Number(r.micros),
    })),
    failures: failures.rows.map((r: Record<string, unknown>) => ({
      code: String(r.failure_code),
      n: Number(r.n),
    })),
    daily: daily.rows.map((r: Record<string, unknown>) => ({
      day: String(r.day),
      stories: Number(r.stories),
    })),
  };
}
