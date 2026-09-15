import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

/**
 * The OpenAI SDK reads some environment variables on its own, and sends them.
 *
 * `new OpenAI()` picks up OPENAI_PROJECT_ID and puts it in an OpenAI-Project
 * header on EVERY request. Production learned that the hard way: the cost
 * bill check was given OPENAI_PROJECT_ID to scope the Costs API, the SDK sent
 * it with every story call, the app's key belongs to a different project, and
 * every story failed with "401 OpenAI-Project header should match project for
 * API key". So the app's own settings must never borrow one of the SDK's names.
 *
 * The list is READ FROM THE INSTALLED SDK, not typed here: a name the SDK adds
 * in a later version is covered the day it is installed.
 */
const root = path.resolve(__dirname, "..");
const sdk = readFileSync(path.join(root, "node_modules/openai/client.js"), "utf8");
const sdkNames = Array.from(new Set(Array.from(sdk.matchAll(/readEnv\)\(['"]([A-Z0-9_]+)['"]\)/g), (m) => m[1])));

/** Names the app is meant to hand the SDK. Anything else is a collision. */
const INTENDED = new Set(["OPENAI_API_KEY"]);

function files(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (entry === "node_modules" || entry === "dist") continue;
    if (statSync(full).isDirectory()) files(full, out);
    else if (/\.(ts|tsx|js|mjs|cjs|ya?ml|sh)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("the app does not set the OpenAI SDK's own environment variables", () => {
  it("reads the SDK's names from the installed package", () => {
    // Guards the guard: an empty list would make the check below pass vacuously.
    expect(sdkNames).toEqual(expect.arrayContaining(["OPENAI_API_KEY", "OPENAI_PROJECT_ID"]));
  });

  it("uses none of them except OPENAI_API_KEY", () => {
    const sources = [
      ...files(path.join(root, "server")),
      ...files(path.join(root, "shared")),
      ...files(path.join(root, "client/src")),
      ...files(path.join(root, "scripts")),
      path.join(root, "docker-compose.yml"),
    ];
    const offenders: string[] = [];
    for (const file of sources) {
      const text = readFileSync(file, "utf8");
      for (const name of sdkNames) {
        if (INTENDED.has(name)) continue;
        if (new RegExp(`\\b${name}\\b`).test(text)) offenders.push(`${path.relative(root, file)}: ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
