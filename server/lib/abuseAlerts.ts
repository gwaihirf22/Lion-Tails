/**
 * Telling Blake about a finding once, and then leaving him alone.
 *
 * abuseWatch.ts decides what is true; this decides what is worth waking
 * somebody for. They are separate files because they are separate mistakes: a
 * threshold that is wrong reports the wrong account, and a dedupe that is wrong
 * sends the same sentence every hour until he mutes the channel -- at which
 * point the alerting is worse than none, because he believes he is covered.
 *
 * NOTHING IS ALERT-ONLY. Every sentence sent here is already on
 * `/admin/accounts`, by construction: both come from the same
 * `abuseReport()`. A finding he never saw because a message failed is still on
 * the page when he looks.
 *
 * THE LOOP IS startPriceWatch's, line for line in shape -- self-scheduling
 * setTimeout rather than setInterval, gated on `databaseReady`, first run
 * delayed so a restart loop is not a send loop, re-armed in `finally`, and
 * `unref`'d so it never holds the process open. Hourly rather than daily: an
 * account spending money does it in an afternoon.
 */
import { pool, databaseReady } from "../db";
import { abuseReport, type AbuseFinding } from "./abuseWatch";
import { sendTelegram, telegramConfigured } from "./telegram";

const HOUR_MS = 60 * 60 * 1000;

/** How long the same finding stays "already said". */
export const REPEAT_AFTER_MS = 24 * HOUR_MS;

/** What was sent and when, keyed by `AbuseFinding.key`. */
export type AlertMemory = Record<string, { at: number; level: AbuseFinding["level"] }>;

export type AlertDecision = {
  announce: AbuseFinding[];
  memory: AlertMemory;
};

/**
 * Which findings to send, and what to remember afterwards.
 *
 * PURE, and it takes `now` -- the whole point of lifting this out of the loop
 * is that "does a day count as a day" can be driven from both sides in a test
 * instead of waited for.
 *
 * Three rules, and the third is the one that matters:
 *
 * 1. Something not said inside the window is said.
 * 2. Something said inside the window is not said again, however much the
 *    number in it has moved. One more picture is not news.
 * 3. **An escalation is always said.** A finding that was a "watch" yesterday
 *    and is an "action" today is a different thing happening, and swallowing
 *    it is how a dedupe turns into a gag. The reverse -- action to watch -- is
 *    not sent: a problem getting smaller can wait for the page.
 *
 * Memory is pruned to what is still relevant, so a key for an account nobody
 * has thought about in a week does not live in app_settings for ever.
 */
export function toAnnounce(
  findings: AbuseFinding[],
  memory: AlertMemory,
  now: number,
  repeatAfterMs = REPEAT_AFTER_MS,
): AlertDecision {
  const announce: AbuseFinding[] = [];
  const next: AlertMemory = {};

  // Keep only what has not aged out, so the stored object stays small.
  for (const [key, entry] of Object.entries(memory)) {
    if (now - entry.at < repeatAfterMs * 2) next[key] = entry;
  }

  for (const finding of findings) {
    const seen = next[finding.key];
    const escalated = seen?.level === "watch" && finding.level === "action";
    const stale = !seen || now - seen.at >= repeatAfterMs;
    if (stale || escalated) {
      announce.push(finding);
      next[finding.key] = { at: now, level: finding.level };
    } else {
      // Not sent, but the level is kept current so a later escalation is
      // measured against what is true now rather than what was first seen.
      next[finding.key] = { at: seen.at, level: finding.level };
    }
  }

  return { announce, memory: next };
}

/**
 * The message.
 *
 * Pure, so the wording is a test rather than something read off a phone. Plain
 * text: a username is somebody's own text and Markdown would either break the
 * send or render as markup.
 */
export function alertText(findings: AbuseFinding[], siteUrl?: string): string {
  const actions = findings.filter((f) => f.level === "action");
  const watches = findings.filter((f) => f.level === "watch");
  const lines: string[] = ["Lion Tails — accounts to look at"];
  for (const f of actions) lines.push(`⚠️ ${f.message}`);
  for (const f of watches) lines.push(`• ${f.message}`);
  if (siteUrl) lines.push(`${siteUrl.replace(/\/$/, "")}/admin/accounts`);
  return lines.join("\n");
}

async function readMemory(): Promise<AlertMemory> {
  if (!pool) return {};
  try {
    const { rows } = await pool.query("SELECT value FROM app_settings WHERE key = 'abuse_alerts'");
    const value = rows[0]?.value;
    return value && typeof value === "object" ? (value as AlertMemory) : {};
  } catch {
    // Unreadable memory means "not said yet", which sends a duplicate at
    // worst. The other way round -- treating it as said -- is silence.
    return {};
  }
}

async function writeMemory(memory: AlertMemory): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ('abuse_alerts', $1::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify(memory)],
  );
}

export type AlertRun = {
  findings: number;
  announced: number;
  sent: boolean;
  /** Why nothing was sent, when nothing was. Never carries a token. */
  note?: string;
};

/**
 * Look, decide, send. The loop's body and the admin page's "check now".
 *
 * The memory is written only when the send SUCCEEDED. A failed send that had
 * already recorded the finding as told would swallow it for a day, which is
 * the one bug in a deduped alerter that nobody notices.
 */
export async function runAbuseAlerts(): Promise<AlertRun> {
  const report = await abuseReport();
  if (report.findings.length === 0) return { findings: 0, announced: 0, sent: false, note: "nothing over a limit" };
  if (!telegramConfigured()) {
    return { findings: report.findings.length, announced: 0, sent: false, note: "Telegram is not set up" };
  }

  const memory = await readMemory();
  const decision = toAnnounce(report.findings, memory, Date.now());
  if (decision.announce.length === 0) {
    // Nothing new to say, but the pruned memory is still worth keeping.
    await writeMemory(decision.memory).catch(() => undefined);
    return { findings: report.findings.length, announced: 0, sent: false, note: "already told you" };
  }

  const result = await sendTelegram(alertText(decision.announce, process.env.PUBLIC_URL));
  if (!result.ok) {
    return { findings: report.findings.length, announced: decision.announce.length, sent: false, note: result.error };
  }
  await writeMemory(decision.memory);
  return { findings: report.findings.length, announced: decision.announce.length, sent: true };
}

let timer: NodeJS.Timeout | undefined;

/**
 * Hourly, self-scheduled after each run finishes.
 *
 * Started next to `startPriceWatch()`. It runs whether or not Telegram is
 * configured -- `runAbuseAlerts` answers "not set up" and costs one query --
 * because the alternative is a watcher that silently does not exist on a box
 * where somebody forgot a variable, and then nobody finds out until they go
 * looking for why they were never told.
 */
export function startAbuseWatch(): void {
  if (timer) return;
  const run = async () => {
    try {
      const result = await runAbuseAlerts();
      if (result.sent) console.log(`[abuse-watch] told Telegram about ${result.announced} finding(s)`);
      else if (result.note && result.findings > 0) console.warn(`[abuse-watch] ${result.findings} finding(s), not sent: ${result.note}`);
    } catch (error) {
      // NEVER throws into the scheduler: an unhandled rejection here would
      // take the timer with it and the watch would be off until a deploy.
      console.error("[abuse-watch] run failed:", error);
    } finally {
      timer = setTimeout(run, HOUR_MS);
      timer.unref?.();
    }
  };
  databaseReady
    .then((ready) => {
      if (!ready || !pool) return;
      // A few minutes in, so a container crash-looping is not a send loop.
      timer = setTimeout(run, 6 * 60 * 1000);
      timer.unref?.();
    })
    .catch(() => undefined);
}
