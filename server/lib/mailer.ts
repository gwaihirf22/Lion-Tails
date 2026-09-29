/**
 * The one place this app sends an email.
 *
 * For most of its life it sent none: the nodemailer module that once lived
 * beside the JWT code was deleted with it, `EMAIL_*` was read by nothing, and
 * password reset minted a token and dropped it (docs/decisions.md §33). What
 * brought a mailer back is the one thing only an email can do -- reach a
 * parent who cannot sign in. Nothing else is sent: alerts stay on Telegram,
 * sign-up does not verify an address.
 *
 * SMTP, so a LIBRARY. `telegram.ts`, `turnstile.ts` and `priceWatch.ts` are
 * one `fetch` each because they talk to HTTP APIs; SMTP is STARTTLS, AUTH
 * PLAIN, dot-stuffing and a line-oriented reply grammar, and writing that to
 * keep a rule about HTTP would be the wrong trade. nodemailer has no
 * dependencies of its own, so it carries no advisory the audit gate would
 * have to argue with. It is imported HERE and nowhere else; a test holds
 * that, so a second sender cannot appear quietly.
 *
 * GMAIL WITH A DOMAIN ALIAS is what it is configured for in production
 * (Blake's choice): a dedicated account with an app password, sending as
 * no-reply@paul-blake.com through a verified "Send mail as" alias. A free
 * transactional tier was the alternative, and those are pruned when unused
 * -- which a reset mailer for a family app always is. A Gmail account with
 * a handful of sends a year is not.
 *
 * SETTINGS ARE READ ON EVERY USE, never cached in a module variable, so a
 * rotated app password needs no restart -- `adminKey()`'s convention and
 * `telegramToken()`'s reader, `_FILE` form included. The password IS a
 * credential (it is full access to the mailbox), and it is taken out of any
 * error text before that text is logged or shown on the admin page.
 *
 * IT NEVER THROWS. A caller is a request handler that must answer a parent
 * in a sentence, or the admin's test button; both want a result, not an
 * exception.
 *
 * PLAIN TEXT ONLY. A reset email needs one link, and HTML is an escaping
 * surface for a username somebody chose.
 */
import fs from "fs";
import nodemailer, { type Transporter } from "nodemailer";
import type { SendResult } from "./telegram";

const SEND_TIMEOUT_MS = 15_000;

/** How long a reset link lasts: the token row's own expiry (db-storage.ts). */
const LINK_HOURS = 24;

export type SmtpSettings = {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
};

/** Read on every use. See the file comment: rotation must not need a restart. */
export function smtpPassword(): string | undefined {
  const direct = process.env.SMTP_PASSWORD?.trim();
  if (direct) return direct;
  const file = process.env.SMTP_PASSWORD_FILE;
  if (!file) return undefined;
  try {
    return fs.readFileSync(file, "utf8").split(/\r?\n/)[0].trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Every setting, or nothing. Host, user and password are the three that
 * cannot be guessed; the port defaults to 587 (STARTTLS, what Gmail wants)
 * and the From line falls back to the user, which is the address Gmail
 * sends as anyway when no alias has been verified.
 */
export function smtpSettings(): SmtpSettings | undefined {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const password = smtpPassword();
  if (!host || !user || !password) return undefined;
  const port = Number(process.env.SMTP_PORT?.trim() || 587);
  if (!Number.isInteger(port) || port <= 0) return undefined;
  const from = process.env.MAIL_FROM?.trim() || user;
  return { host, port, user, password, from };
}

/** One question, the way `telegramConfigured()` is one question. */
export function mailConfigured(): boolean {
  return smtpSettings() !== undefined;
}

/**
 * What nodemailer is handed. Pure, so a test can hold it without a socket:
 * 465 is implicit TLS, everything else starts plain and upgrades.
 */
export function transportOptions(s: SmtpSettings) {
  return {
    host: s.host,
    port: s.port,
    secure: s.port === 465,
    auth: { user: s.user, pass: s.password },
    connectionTimeout: SEND_TIMEOUT_MS,
    greetingTimeout: SEND_TIMEOUT_MS,
    socketTimeout: SEND_TIMEOUT_MS,
  };
}

/**
 * The password out of a string, wherever it appears. SMTP error text is the
 * server's reply and does not normally carry it, but "normally" is not a
 * reason to let a credential reach a log or the admin page.
 */
export function scrubSecret(text: string, secret: string | undefined): string {
  if (!secret) return text;
  return text.split(secret).join("<password>");
}

export type MailMessage = { to: string; subject: string; text: string };

/**
 * The reset email, as words. Pure: the assembled message is what a parent
 * reads, and a test asserts the link and the name are in it and no markup
 * is. `origin` is the request's own scheme and host (`static.ts`'s rule),
 * so the link points at whatever address the parent used to reach the app.
 */
export function resetMessage(origin: string, username: string, token: string): Omit<MailMessage, "to"> {
  const link = `${origin.replace(/\/+$/, "")}/reset-password/${token}`;
  return {
    subject: "Reset your Lion Tails password",
    text: [
      `Someone asked to reset the password for the Lion Tails account "${username}".`,
      "",
      `If that was you, open this link within ${LINK_HOURS} hours and choose a new password:`,
      "",
      link,
      "",
      "If it was not you, ignore this email. Nothing changes unless the link is used.",
    ].join("\n"),
  };
}

/**
 * Send one message and answer whether it went.
 *
 * `transport` is for tests: nodemailer's stream transport renders the
 * message without a network, so what a parent would receive is asserted
 * byte for byte. Production builds one from the settings on every call --
 * a transport is cheap, and caching one would cache the password with it.
 */
export async function sendMail(message: MailMessage, transport?: Transporter): Promise<SendResult> {
  const settings = smtpSettings();
  if (!settings) return { ok: false, error: "Email is not set up" };
  try {
    const t = transport ?? nodemailer.createTransport(transportOptions(settings));
    await t.sendMail({
      from: settings.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
    return { ok: true };
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    return { ok: false, error: scrubSecret(raw, settings.password).slice(0, 300) };
  }
}
