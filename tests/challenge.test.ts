import { afterEach, describe, expect, it } from "vitest";
import { CREDENTIAL_RULES } from "@shared/challenge";
import { registerBodySchema } from "../server/auth";
import {
  challengeMisconfigured,
  challengeRequired,
  readSiteverify,
  refusalFor,
} from "../server/lib/turnstile";

/**
 * The signup gate. What makes these worth having: the thing they replace was
 * checked in the browser and thrown away before the request, so there was
 * nothing on the server to test at all -- and the question that briefly stood
 * beside it is gone too (shared/challenge.ts records why).
 */
describe("what the API demands of a registration", () => {
  const ok = {
    username: "blake",
    email: "blake@example.com",
    password: "a-real-password",
  };

  it("takes an ordinary registration", () => {
    expect(registerBodySchema.safeParse(ok).success).toBe(true);
  });

  /**
   * The API accepted all three of these until now: registerBodySchema
   * inherited `z.string()` from drizzle-zod, and the only rules in the app
   * were in the browser, where an attacker never goes.
   */
  it("refuses a one-character password, a bad email and a short username", () => {
    expect(registerBodySchema.safeParse({ ...ok, password: "a" }).success).toBe(false);
    expect(registerBodySchema.safeParse({ ...ok, email: "a" }).success).toBe(false);
    expect(registerBodySchema.safeParse({ ...ok, username: "ab" }).success).toBe(false);
  });

  it("still strips the privilege fields, which is why the schema exists", () => {
    const parsed = registerBodySchema.parse({
      ...ok,
      isAdmin: true,
      isVerified: true,
      verificationToken: "planted",
    } as Record<string, unknown>);
    expect("isAdmin" in parsed).toBe(false);
    expect("isVerified" in parsed).toBe(false);
    expect("verificationToken" in parsed).toBe(false);
  });

  it("strips the token too, so it cannot reach a column", () => {
    // It is read off the RAW body and consumed there. If it survived into the
    // parsed object, `...credentials` would carry it into drizzle's .values(),
    // which copies whatever keys it is given.
    const parsed = registerBodySchema.parse({
      ...ok,
      turnstileToken: "0.abc",
    } as Record<string, unknown>);
    expect("turnstileToken" in parsed).toBe(false);
  });

  it("holds the same password rule a reset has to meet", () => {
    expect(CREDENTIAL_RULES.password.safeParse("short").success).toBe(false);
    expect(CREDENTIAL_RULES.password.safeParse("long enough").success).toBe(true);
  });
});

describe("reading Cloudflare's answer", () => {
  it("passes a success and refuses a failure", () => {
    expect(readSiteverify({ success: true, challenge_ts: "…", hostname: "x" })).toEqual({
      ok: true,
      codes: [],
    });
    expect(readSiteverify({ success: false, "error-codes": ["invalid-input-response"] })).toEqual({
      ok: false,
      codes: ["invalid-input-response"],
    });
  });

  it("refuses anything it cannot read, rather than throwing mid-request", () => {
    // A captive portal, an HTML error page, a truncated body: all "no".
    for (const body of [undefined, null, "not json", 7, []]) {
      expect(readSiteverify(body as unknown).ok, String(body)).toBe(false);
    }
    // success present but not true is still no.
    expect(readSiteverify({ success: "true" }).ok).toBe(false);
    // Codes that are not strings do not become codes.
    expect(readSiteverify({ success: false, "error-codes": [1, null] }).codes).toEqual([]);
  });

  it("tells a visitor whose fault it was", () => {
    expect(refusalFor({ ok: false, codes: ["unreachable"] })).toMatch(/try again in a minute/);
    expect(refusalFor({ ok: false, codes: ["timeout-or-duplicate"] })).toMatch(/expired/);
    expect(refusalFor({ ok: false, codes: ["invalid-input-response"] })).toMatch(/complete the check/);
  });
});

describe("when a challenge is demanded", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it("is off on a development box with no secret, which is what keeps the scripts working", () => {
    process.env.NODE_ENV = "development";
    delete process.env.TURNSTILE_SECRET;
    delete process.env.TURNSTILE_SECRET_FILE;
    expect(challengeRequired()).toBe(false);
    expect(challengeMisconfigured()).toBe(false);
  });

  it("is on wherever a secret is configured", () => {
    process.env.NODE_ENV = "development";
    process.env.TURNSTILE_SECRET = "1x0000000000000000000000000000000AA";
    expect(challengeRequired()).toBe(true);
    expect(challengeMisconfigured()).toBe(false);
  });

  /**
   * The failure that matters: a live box whose secret went missing must refuse
   * sign-ups, not quietly return to the state this whole change exists to end.
   */
  it("is on in production even with no secret, and says it is misconfigured", () => {
    process.env.NODE_ENV = "production";
    delete process.env.TURNSTILE_SECRET;
    delete process.env.TURNSTILE_SECRET_FILE;
    expect(challengeRequired()).toBe(true);
    expect(challengeMisconfigured()).toBe(true);
  });
});
