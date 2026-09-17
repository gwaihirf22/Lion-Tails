/**
 * Tokens that are credentials: one place, one source of randomness.
 *
 * `Math.random()` is not that source, and password-reset tokens were made with
 * it -- `Array.from(Array(32), () => Math.floor(Math.random() * 36).toString(36))`
 * in both storage implementations. V8's Math.random is xorshift128+: observe a
 * handful of outputs and the internal state is recoverable, and with it every
 * past and future token. Whoever can predict a reset token owns the account.
 *
 * It has been harmless only because no reset token is ever delivered to
 * anybody (the email half of this app has never existed). The day a mailer is
 * wired up, that stops being luck.
 *
 * 16 bytes from the operating system's CSPRNG is 128 bits, the same strength
 * as a session id, and base64url is 22 characters that need no escaping in a
 * url -- which is where a reset token has to survive.
 *
 * THIS DOES NOT REACH ROWS ALREADY WRITTEN. Every token sitting in
 * `verification_tokens` when this shipped was minted by the old code and is
 * still guessable. They were left to age out rather than purged: they expire
 * 24 hours after they were made, nothing in the app can deliver one, and
 * deleting somebody's rows is Blake's decision rather than a tidy-up. So "the
 * tokens are crypto-random" is true of tokens made from here on, and of
 * nothing older.
 */
import { randomBytes } from "crypto";

export function newSecretToken(bytes = 16): string {
  return randomBytes(bytes).toString("base64url");
}
