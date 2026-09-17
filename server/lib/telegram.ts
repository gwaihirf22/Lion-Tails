/**
 * Telling Blake something happened, on the channel he already reads.
 *
 * He runs Telegram for Sonarr, Radarr and the server's own notifications, so
 * this joins a stream he looks at rather than an inbox he does not -- and the
 * app has no mailer at all: `EMAIL_*` is read by nothing and password reset
 * mints a token it then discards. Choosing Telegram was choosing the channel
 * that exists.
 *
 * NO LIBRARY. One POST to one documented URL, `fetch` with a timeout, exactly
 * as priceWatch.ts calls LiteLLM and turnstile.ts calls siteverify. A bot
 * framework here would be a dependency, a polling loop and an update handler
 * for an app that only ever sends.
 *
 * THE TOKEN IS READ ON EVERY USE, never cached in a module variable, so
 * rotating the file needs no restart -- `adminKey()`'s convention, and the
 * same `*_FILE` pattern the OpenAI admin key uses. A Telegram bot token IS a
 * credential: anyone holding it can read and send everything the bot can, so
 * it is scrubbed out of any error text before that text is logged or stored.
 * `TELEGRAM_CHAT_ID` is not a secret and is a plain variable.
 *
 * IT NEVER THROWS. Every caller is a background loop or an admin button, and
 * an alert that fails must not take down the thing that raised it -- the
 * findings are on the admin page whether or not this works, which is the rule
 * that nothing is alert-only.
 */
import fs from "fs";

const SEND_TIMEOUT_MS = 10_000;

/** Read on every use. See the file comment: rotation must not need a restart. */
export function telegramToken(): string | undefined {
  const direct = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (direct) return direct;
  const file = process.env.TELEGRAM_BOT_TOKEN_FILE;
  if (!file) return undefined;
  try {
    return fs.readFileSync(file, "utf8").split(/\r?\n/)[0].trim() || undefined;
  } catch {
    return undefined;
  }
}

export function telegramChatId(): string | undefined {
  return process.env.TELEGRAM_CHAT_ID?.trim() || undefined;
}

/** Both halves, or it is off. Two settings, one question. */
export function telegramConfigured(): boolean {
  return Boolean(telegramToken() && telegramChatId());
}

/**
 * A bot token looks like `123456789:AAH...` and the number in front is not the
 * secret half, but it identifies the bot -- so the whole thing goes.
 *
 * Applied to every message this file keeps or prints. The price watcher does
 * the same for `sk-` keys, for the same reason: an error string from a failed
 * request is exactly where a credential ends up, and app_settings is read by a
 * web page.
 */
export function scrubToken(text: string): string {
  // NO LEADING \b. The token's first appearance is inside the URL, as
  // `.../bot123456789:AAH...`, and `t` to `1` is word-to-word -- so a leading
  // boundary matches nothing and the scrub silently does not happen. That is
  // exactly the check that cannot fail, and `tests/abuseAlerts.test.ts`
  // caught it here rather than in a log.
  return text.replace(/\d{6,}:[A-Za-z0-9_-]{20,}/g, "<token>");
}

export type SendResult = { ok: boolean; error?: string };

/**
 * Send one message, and answer whether it went.
 *
 * Plain text, no parse mode: a message here carries a username somebody chose,
 * and Markdown or HTML parsing would turn an underscore or a bracket in a name
 * into a 400 from Telegram -- or, worse, into markup. The only formatting is
 * newlines, which need none.
 */
export async function sendTelegram(text: string): Promise<SendResult> {
  const token = telegramToken();
  const chatId = telegramChatId();
  if (!token || !chatId) return { ok: false, error: "Telegram is not set up" };

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        // Nothing here is worth a preview, and a link in a username would
        // otherwise fetch somebody else's URL from Telegram's servers.
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!res.ok) {
      // Telegram puts the reason in the body; the URL it came from holds the
      // token, so both are scrubbed before either is kept.
      const body = await res.text().catch(() => "");
      return { ok: false, error: scrubToken(`${res.status} ${res.statusText} ${body}`.trim()).slice(0, 300) };
    }
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: scrubToken(message).slice(0, 300) };
  }
}
