import { describe, it, expect } from "vitest";
import { alertText, toAnnounce, REPEAT_AFTER_MS, type AlertMemory } from "../server/lib/abuseAlerts";
import { scrubToken } from "../server/lib/telegram";
import type { AbuseFinding } from "../server/lib/abuseWatch";

/**
 * The half of alerting that goes wrong quietly.
 *
 * A threshold that is wrong names the wrong account, and somebody notices. A
 * dedupe that is wrong either repeats itself until the channel is muted -- at
 * which point he believes he is covered and is not -- or swallows something it
 * should have said. Neither shows up in a log, so both are held here.
 */
const finding = (over: Partial<AbuseFinding> = {}): AbuseFinding => ({
  level: "action",
  code: "abuse-refusals",
  key: "abuse-refusals:7",
  accountId: 7,
  message: "someone was refused 9 times in the last day (over 5).",
  ...over,
});

const HOUR = 60 * 60 * 1000;

describe("toAnnounce", () => {
  it("says something the first time", () => {
    const { announce, memory } = toAnnounce([finding()], {}, 1_000);
    expect(announce).toHaveLength(1);
    expect(memory["abuse-refusals:7"].at).toBe(1_000);
  });

  it("does not say it again an hour later, however much the number moved", () => {
    // The loop runs hourly. Without this, one account over a limit is
    // twenty-four messages a day and the channel gets muted.
    const first = toAnnounce([finding()], {}, 0);
    const second = toAnnounce(
      [finding({ message: "someone was refused 40 times in the last day (over 5)." })],
      first.memory,
      HOUR,
    );
    expect(second.announce).toHaveLength(0);
  });

  it("says it again once the day is up, and not a moment before", () => {
    const first = toAnnounce([finding()], {}, 0);
    expect(toAnnounce([finding()], first.memory, REPEAT_AFTER_MS - 1).announce).toHaveLength(0);
    expect(toAnnounce([finding()], first.memory, REPEAT_AFTER_MS).announce).toHaveLength(1);
  });

  it("always says an escalation, inside the window", () => {
    // Watch becoming action is a different thing happening. Swallowing it is
    // how a dedupe turns into a gag.
    const watched = finding({ level: "watch", key: "abuse-spend:7", code: "abuse-spend" });
    const first = toAnnounce([watched], {}, 0);
    const escalated = toAnnounce([{ ...watched, level: "action" }], first.memory, HOUR);
    expect(escalated.announce).toHaveLength(1);
  });

  it("does not say a de-escalation: a problem getting smaller can wait for the page", () => {
    const acted = finding({ level: "action", key: "abuse-spend:7" });
    const first = toAnnounce([acted], {}, 0);
    const calmer = toAnnounce([{ ...acted, level: "watch" }], first.memory, HOUR);
    expect(calmer.announce).toHaveLength(0);
  });

  it("does not re-arm an escalation by resetting the clock", () => {
    // The level is kept current on a swallowed finding, so watch -> action ->
    // action sends once, not every hour after the first rise.
    const watched = finding({ level: "watch" });
    const a = toAnnounce([watched], {}, 0);
    const b = toAnnounce([{ ...watched, level: "action" }], a.memory, HOUR);
    const c = toAnnounce([{ ...watched, level: "action" }], b.memory, 2 * HOUR);
    expect(b.announce).toHaveLength(1);
    expect(c.announce).toHaveLength(0);
  });

  it("keeps two subjects apart", () => {
    const one = finding({ key: "abuse-refusals:1", accountId: 1 });
    const two = finding({ key: "abuse-refusals:2", accountId: 2 });
    const first = toAnnounce([one], {}, 0);
    expect(toAnnounce([one, two], first.memory, HOUR).announce.map((f) => f.accountId)).toEqual([2]);
  });

  it("forgets what has aged out, so the stored memory stays small", () => {
    const old: AlertMemory = { "abuse-spend:99": { at: 0, level: "watch" } };
    const { memory } = toAnnounce([], old, REPEAT_AFTER_MS * 2 + 1);
    expect(memory["abuse-spend:99"]).toBeUndefined();
  });
});

describe("alertText", () => {
  it("leads with what to decide, and marks the two levels apart", () => {
    const text = alertText([
      finding({ level: "watch", key: "w", message: "a watch sentence" }),
      finding({ level: "action", key: "a", message: "an action sentence" }),
    ]);
    const lines = text.split("\n");
    expect(lines[0]).toContain("Lion Tails");
    expect(lines[1]).toContain("an action sentence");
    expect(lines[2]).toContain("a watch sentence");
  });

  it("adds a link only when there is a site to link to", () => {
    expect(alertText([finding()])).not.toContain("/admin/accounts");
    expect(alertText([finding()], "https://example.test/")).toContain(
      "https://example.test/admin/accounts",
    );
  });
});

describe("scrubToken", () => {
  it("takes the whole token, bot id and all", () => {
    // The number in front is not the secret half, but it identifies the bot,
    // and this string ends up in a log and in app_settings.
    const url = "https://api.telegram.org/bot123456789:AAHfakefakefakefakefakefake12345/sendMessage";
    expect(scrubToken(`request to ${url} failed`)).not.toContain("AAHfake");
    expect(scrubToken(`request to ${url} failed`)).toContain("<token>");
  });

  it("leaves ordinary text alone", () => {
    const plain = "429 Too Many Requests: retry after 12";
    expect(scrubToken(plain)).toBe(plain);
  });
});
