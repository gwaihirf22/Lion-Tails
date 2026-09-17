/**
 * Cloudflare Turnstile, checked by the server.
 *
 * THE MISSING HALF. The app has had a signup "challenge" for months and it was
 * never verified anywhere but the browser, which is the same as not verifying
 * it (see shared/challenge.ts). So this module is the point of the change: a
 * token the client cannot mint, spent once, checked against Cloudflare.
 *
 * WHY TURNSTILE. Blake's choice, and it fits: free, invisible for nearly every
 * real visitor, no ad-tech cookies -- which matters for an app children use --
 * and the domain is already behind Cloudflare, so it is not a new company in
 * the request path. No library: `fetch` against siteverify, the way
 * priceWatch.ts already talks to OpenAI's pricing page.
 *
 * FAIL CLOSED. If Cloudflare cannot be reached, or answers something this
 * cannot read, the signup is refused. The alternative is that the one hole
 * worth closing reopens precisely when nobody is watching -- and a signup is
 * ~$1.40 of somebody else's OpenAI bill. A parent sees "we could not check
 * that just now"; a script sees a 400.
 */
import fs from "fs";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 10_000;

/**
 * The secret, from the environment or from a file.
 *
 * `adminKey()` in priceWatch.ts is the pattern and the reasoning is the same:
 * the file form keeps the secret out of docker-compose.yml, which is copied
 * into backups and diffs, and reading it on every use means rotating the file
 * needs no restart. TURNSTILE_* is a safe prefix -- tests/openaiEnvNames.test.ts
 * fails on any name the OpenAI SDK reads.
 */
export function turnstileSecret(): string | undefined {
  const direct = process.env.TURNSTILE_SECRET?.trim();
  if (direct) return direct;
  const file = process.env.TURNSTILE_SECRET_FILE;
  if (!file) return undefined;
  try {
    return fs.readFileSync(file, "utf8").split(/\r?\n/)[0].trim() || undefined;
  } catch {
    return undefined;
  }
}

/** The public half, for the widget. Public by design: it ships in the page. */
export function turnstileSiteKey(): string | undefined {
  return process.env.TURNSTILE_SITE_KEY?.trim() || undefined;
}

/**
 * Whether a challenge is demanded of this request.
 *
 * Configured means on. IN PRODUCTION IT IS ON WHATEVER THE CONFIG SAYS: a live
 * box whose secret went missing refuses registrations rather than silently
 * going back to the state this change exists to end. `challengeMisconfigured()`
 * is how the route tells a parent something is wrong at our end rather than
 * theirs.
 *
 * Off in development with no secret, and that is load-bearing:
 * scripts/dev-seed.ts and scripts/capture-guide.ts register accounts over this
 * API with no browser anywhere near them.
 */
export function challengeRequired(): boolean {
  return Boolean(turnstileSecret()) || process.env.NODE_ENV === "production";
}

/** On in production, but with nothing to check against. */
export function challengeMisconfigured(): boolean {
  return challengeRequired() && !turnstileSecret();
}

export type SiteverifyResult = { ok: boolean; codes: string[] };

/**
 * Cloudflare's answer, read defensively.
 *
 * Pure and exported so the shapes can be tested without the network: a real
 * success, a real failure with `error-codes`, and the answers that are not
 * JSON at all (a captive portal, an HTML error page) -- which must read as
 * "no" rather than throwing inside a request a parent is waiting on.
 */
export function readSiteverify(body: unknown): SiteverifyResult {
  if (!body || typeof body !== "object") return { ok: false, codes: ["unreadable"] };
  const raw = body as { success?: unknown; "error-codes"?: unknown };
  const codes = Array.isArray(raw["error-codes"])
    ? raw["error-codes"].filter((c): c is string => typeof c === "string")
    : [];
  return { ok: raw.success === true, codes };
}

/**
 * Spend a token. One token, one call: Cloudflare refuses a second use with
 * `timeout-or-duplicate`, which is what makes a captured token useless.
 *
 * `ip` is the real client address -- SWAG restores it from Cloudflare's
 * CF-Connecting-IP and `trust proxy` is on -- and Cloudflare uses it as a
 * second signal. Never throws.
 */
export async function verifyTurnstile(
  token: string | undefined,
  ip: string | undefined,
): Promise<SiteverifyResult> {
  const secret = turnstileSecret();
  if (!secret) return { ok: false, codes: ["no-secret"] };
  if (!token || typeof token !== "string") return { ok: false, codes: ["missing-input-response"] };

  const form = new URLSearchParams({ secret, response: token });
  if (ip) form.set("remoteip", ip);

  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return { ok: false, codes: [`http-${response.status}`] };
    return readSiteverify(await response.json().catch(() => undefined));
  } catch (error) {
    // Fail closed, and say so in the log: this is the one refusal that is our
    // fault rather than the visitor's.
    console.error("[turnstile] could not reach siteverify:", error);
    return { ok: false, codes: ["unreachable"] };
  }
}

/** What the visitor is told, by why it failed. */
export function refusalFor(result: SiteverifyResult): string {
  if (result.codes.includes("unreachable") || result.codes.includes("no-secret")) {
    return "We could not check that you are a person just now. Please try again in a minute.";
  }
  if (result.codes.includes("timeout-or-duplicate")) {
    return "That check has expired. Please tick the box again and resend.";
  }
  return "Please complete the check that says you are a person, then try again.";
}
