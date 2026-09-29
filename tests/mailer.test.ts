import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import type { Transporter } from "nodemailer";
import {
  mailConfigured,
  resetMessage,
  scrubSecret,
  sendMail,
  smtpSettings,
  transportOptions,
} from "../server/lib/mailer";
import { ROOT } from "./helpers/routeFiles";

/**
 * The mailer, with no network and no SMTP server.
 *
 * What a parent receives is the rendered message, and the transport is
 * nodemailer's job -- so the tests hand `sendMail` a fake transport and
 * assert what it is given, hold the settings reader to its `_FILE` form,
 * and pin the two rules a mistake here would break silently: the password
 * never reaches error text, and nothing but mailer.ts imports nodemailer.
 */

const KEYS = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_PASSWORD_FILE", "MAIL_FROM"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function configure(extra: Partial<Record<(typeof KEYS)[number], string>> = {}) {
  process.env.SMTP_HOST = "smtp.example.invalid";
  process.env.SMTP_USER = "liontails.app@example.invalid";
  process.env.SMTP_PASSWORD = "abcd efgh ijkl mnop";
  process.env.MAIL_FROM = "Lion Tails <no-reply@example.invalid>";
  Object.assign(process.env, extra);
}

/** A transport that records what it was handed, or throws what it was told to. */
function fakeTransport(fail?: Error) {
  const sent: unknown[] = [];
  const transport = {
    sendMail: async (message: unknown) => {
      if (fail) throw fail;
      sent.push(message);
      return {};
    },
  } as unknown as Transporter;
  return { transport, sent };
}

describe("the settings", () => {
  it("is off with nothing set, and on with host, user and password", () => {
    expect(mailConfigured()).toBe(false);
    configure();
    expect(mailConfigured()).toBe(true);
    expect(smtpSettings()).toMatchObject({
      host: "smtp.example.invalid",
      port: 587,
      user: "liontails.app@example.invalid",
      from: "Lion Tails <no-reply@example.invalid>",
    });
  });

  it("needs all three of host, user and password", () => {
    configure();
    for (const k of ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"] as const) {
      const keep = process.env[k];
      delete process.env[k];
      expect(mailConfigured(), `without ${k}`).toBe(false);
      process.env[k] = keep;
    }
  });

  it("reads the password from a file, first line, trimmed", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "mailer-"));
    const file = path.join(dir, "smtp-password");
    writeFileSync(file, "  file-password  \nsecond line ignored\n");
    configure();
    delete process.env.SMTP_PASSWORD;
    process.env.SMTP_PASSWORD_FILE = file;
    expect(smtpSettings()?.password).toBe("file-password");
  });

  it("an unreadable file is off, not a throw", () => {
    configure();
    delete process.env.SMTP_PASSWORD;
    process.env.SMTP_PASSWORD_FILE = "/nonexistent/smtp-password";
    expect(mailConfigured()).toBe(false);
  });

  it("the From line falls back to the user, which is what Gmail sends as anyway", () => {
    configure();
    delete process.env.MAIL_FROM;
    expect(smtpSettings()?.from).toBe("liontails.app@example.invalid");
  });

  it("a port that is not a port is off", () => {
    configure({ SMTP_PORT: "smtp" });
    expect(mailConfigured()).toBe(false);
  });

  it("465 is implicit TLS; anything else starts plain and upgrades", () => {
    configure();
    expect(transportOptions(smtpSettings()!)).toMatchObject({ port: 587, secure: false });
    configure({ SMTP_PORT: "465" });
    expect(transportOptions(smtpSettings()!)).toMatchObject({ port: 465, secure: true });
    expect(transportOptions(smtpSettings()!).auth).toEqual({
      user: "liontails.app@example.invalid",
      pass: "abcd efgh ijkl mnop",
    });
  });
});

describe("the reset message", () => {
  const m = resetMessage("https://liontails.example/", "blake", "tok_abc-123");

  it("carries the link, on the origin the parent used, and the account name", () => {
    expect(m.text).toContain("https://liontails.example/reset-password/tok_abc-123");
    expect(m.text).not.toContain("example//reset");
    expect(m.text).toContain('"blake"');
    expect(m.subject).toBe("Reset your Lion Tails password");
  });

  it("is plain text: a username is somebody's choice, not markup", () => {
    expect(m.text).not.toMatch(/<[a-z]/i);
  });

  it("says how long the link lasts and that ignoring it changes nothing", () => {
    expect(m.text).toMatch(/24 hours/);
    expect(m.text).toMatch(/ignore this email/i);
  });
});

describe("sending", () => {
  it("is refused, not thrown, when nothing is configured", async () => {
    const { transport, sent } = fakeTransport();
    const result = await sendMail({ to: "a@example.invalid", subject: "s", text: "t" }, transport);
    expect(result).toEqual({ ok: false, error: "Email is not set up" });
    expect(sent).toHaveLength(0);
  });

  it("hands the transport From, To, Subject and the plain text", async () => {
    configure();
    const { transport, sent } = fakeTransport();
    const result = await sendMail({ to: "parent@example.invalid", subject: "Hello", text: "Body\nline" }, transport);
    expect(result).toEqual({ ok: true });
    expect(sent).toEqual([
      {
        from: "Lion Tails <no-reply@example.invalid>",
        to: "parent@example.invalid",
        subject: "Hello",
        text: "Body\nline",
      },
    ]);
  });

  it("a refusal comes back as words with the password taken out, and never throws", async () => {
    configure();
    const { transport } = fakeTransport(
      new Error("535-5.7.8 Username and Password not accepted (sent abcd efgh ijkl mnop)"),
    );
    const result = await sendMail({ to: "a@example.invalid", subject: "s", text: "t" }, transport);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("535-5.7.8");
    expect(result.error).not.toContain("abcd efgh ijkl mnop");
    expect(result.error).toContain("<password>");
  });

  it("scrubSecret is a no-op with no secret, and total with one", () => {
    expect(scrubSecret("nothing here", undefined)).toBe("nothing here");
    expect(scrubSecret("x secret y secret", "secret")).toBe("x <password> y <password>");
  });
});

describe("one sender", () => {
  it("nodemailer is imported in server/ by mailer.ts and nothing else", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|js)$/.test(name)) files.push(full);
      }
    };
    walk(path.join(ROOT, "server"));
    const importers = files
      .filter((f) => /from\s+["']nodemailer["']/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(ROOT, f));
    expect(importers).toEqual(["server/lib/mailer.ts"]);
  });
});
