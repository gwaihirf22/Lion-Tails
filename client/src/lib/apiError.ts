/**
 * What to tell a person when a request fails. Pure.
 *
 * The body of a failed response is not always ours. In production the app sits
 * behind Cloudflare, and when a request runs past Cloudflare's 100 seconds the
 * answer is Cloudflare's own error PAGE -- several kilobytes of HTML -- which
 * the old handler put straight into a toast (a picture request, 2026-09-15).
 * So a body is only shown when it is a short message; anything that looks like
 * a page is replaced by a sentence chosen from the status.
 */

/** Statuses that mean "a proxy gave up waiting", not "the app said no". */
const TIMED_OUT = new Set([408, 504, 522, 524]);
/** Statuses that mean "the app could not be reached". */
const UNREACHABLE = new Set([502, 503, 520, 521, 523, 525, 526]);

export function isGatewayTimeout(status: number): boolean {
  return TIMED_OUT.has(status);
}

export function isUnreachable(status: number): boolean {
  return UNREACHABLE.has(status);
}

const looksLikeAPage = (text: string) => /<\s*(!doctype|html|head|body|div|span|script)\b/i.test(text);

export function errorMessageFor(status: number, statusText: string, body: string): string {
  let message: string | undefined;
  try {
    const parsed = JSON.parse(body) as { error?: unknown; message?: unknown };
    const m = parsed.error ?? parsed.message;
    if (typeof m === "string" && m.trim()) message = m.trim();
  } catch {
    const text = body.trim();
    if (text && !looksLikeAPage(text) && text.length <= 300) message = text;
  }
  if (message && !looksLikeAPage(message)) return message.length > 300 ? `${message.slice(0, 297)}…` : message;
  if (isGatewayTimeout(status)) return "The server took too long to answer. Please try again in a moment.";
  if (isUnreachable(status)) return "The server could not be reached just now. Please try again in a moment.";
  if (status === 401) return "Please sign in again.";
  if (status === 403) return "That is not available on this account.";
  if (status === 404) return "That could not be found.";
  if (status === 429) return "Too many requests just now. Please wait a moment and try again.";
  return statusText ? `Something went wrong (${status} ${statusText}).` : `Something went wrong (${status}).`;
}

/** An error that remembers its status, so a caller can treat a timeout differently. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}
