import { describe, expect, it, vi, beforeEach } from "vitest";
import { readdirSync, readFileSync } from "fs";
import path from "path";

/**
 * The ledger's promise is "every paid call is recorded". A test that only
 * checks the arithmetic cannot notice a call path that records nothing -- which
 * reads exactly like a cheap app. So: the wrappers are driven with fake replies
 * and the recorder is watched, and every file that makes a paid call is
 * required to reach the recorder.
 */
const recorded: Array<{ purpose: string; outcome: string; usage: unknown }> = [];
vi.mock("../server/lib/modelCalls", () => ({
  recordModelCall: vi.fn(async (ctx: { purpose: string }, usage: unknown, outcome: string) => {
    recorded.push({ purpose: ctx.purpose, outcome, usage });
    return true;
  }),
}));

const { requestModelJson } = await import("../server/lib/openai-implementation");

const ledger = {
  userId: 1,
  resolved: { model: "gpt-5.6-luna", provider: "openai" as const, tier: "economy" as const, usingOwnKey: false },
  purpose: "outline" as const,
};

describe("requestModelJson records every attempt", () => {
  beforeEach(() => {
    recorded.length = 0;
  });

  it("records a truncated attempt as failed and the retry as succeeded", async () => {
    const replies = [
      { content: '{"outline": [', finishReason: "length", usage: { prompt_tokens: 100, completion_tokens: 50 } },
      { content: '{"outline": ["a"]}', finishReason: "stop", usage: { prompt_tokens: 100, completion_tokens: 60 } },
    ];
    let i = 0;
    const out = await requestModelJson<{ outline: string[] }>({
      step: "t",
      model: "gpt-5.6-luna",
      debugData: [],
      maxTokens: 1000,
      ledger,
      call: async () => replies[i++],
    });
    expect(out.outline).toEqual(["a"]);
    expect(recorded.map((r) => r.outcome)).toEqual(["failed", "succeeded"]);
    expect(recorded[1].usage).toEqual(replies[1].usage);
  });

  it("records both attempts when neither is usable, before throwing", async () => {
    await expect(
      requestModelJson({
        step: "t",
        model: "gpt-5.6-luna",
        debugData: [],
        maxTokens: 1000,
        ledger,
        call: async () => ({ content: "not json", finishReason: "stop", usage: { prompt_tokens: 1, completion_tokens: 1 } }),
      }),
    ).rejects.toThrow();
    expect(recorded.map((r) => r.outcome)).toEqual(["failed", "failed"]);
  });

  it("records nothing without a ledger context", async () => {
    await requestModelJson({
      step: "t",
      model: "gpt-5.6-luna",
      debugData: [],
      maxTokens: 1000,
      call: async () => ({ content: "{}", finishReason: "stop" }),
    });
    expect(recorded).toEqual([]);
  });
});

describe("every paid call path reaches the ledger", () => {
  const PAID_CALL = /\.(chat\.completions\.create|images\.(edit|generate)|responses\.create)\(/;
  const serverDir = path.resolve(__dirname, "../server");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ts")) files.push(full);
    }
  };
  walk(serverDir);

  it("finds the call sites it is guarding", () => {
    // Guards the guard: a regex that matched nothing would pass vacuously.
    expect(files.filter((f) => PAID_CALL.test(readFileSync(f, "utf8"))).length).toBeGreaterThanOrEqual(6);
  });

  it("records from every file that makes one", () => {
    const unrecorded = files
      .filter((f) => PAID_CALL.test(readFileSync(f, "utf8")))
      .filter((f) => {
        const src = readFileSync(f, "utf8");
        return !/recordModelCall\(|ledger(:|For\(|,)/.test(src);
      })
      .map((f) => path.relative(serverDir, f));
    expect(unrecorded).toEqual([]);
  });
});
