import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { asyncRoute, errorHandler } from "../server/lib/asyncRoute";
import { ROOT, allRouteRegistrations, type Registration } from "./helpers/routeFiles";

/**
 * Express 4 drops the promise an async handler returns, so a rejection in one
 * is an unhandled rejection and Node 20 exits on it. The defect is therefore
 * not in any handler's logic but in the WRAPPER around it -- which is exactly
 * what a unit test of the handler cannot see. So this reads the route files
 * the way tests/modelCallsLedger.test.ts reads the call sites: every async
 * registration must either be wrapped in asyncRoute() or open with its own
 * try block before the first await.
 *
 * Run against the tree before the fix, it named eighteen routes.
 *
 * The scanner lives in tests/helpers/routeFiles.ts, shared with
 * routeAuth.test.ts, which holds every non-public route to a 401.
 */

/** Async, and neither wrapped nor guarded by its own try before the first await. */
function unprotected(r: Registration): boolean {
  if (!/\basync\s*\(/.test(r.signature)) return false;
  if (r.signature.includes("asyncRoute(")) return false;
  const firstAwait = r.body.search(/\bawait\b/);
  const firstTry = r.body.search(/\btry\s*\{/);
  if (firstTry === -1) return true;
  return firstAwait !== -1 && firstAwait < firstTry;
}

describe("every async route reaches the error middleware", () => {
  const all = allRouteRegistrations();

  it("finds the routes at all", () => {
    // If the pattern stops matching the registration style, this test would
    // pass by finding nothing. Pin a floor well under the real count.
    expect(all.length).toBeGreaterThan(80);
    expect(all.some((r) => r.route === "/api/universes")).toBe(true);
    expect(all.some((r) => r.route === "/api/auth/login")).toBe(true);
    expect(all.some((r) => r.route === "/api/songs")).toBe(true);
  });

  it("wraps or guards every async handler", () => {
    const bad = all.filter(unprotected).map((r) => `${r.method.toUpperCase()} ${r.route} (${r.file})`);
    expect(bad).toEqual([]);
  });
});

describe("asyncRoute", () => {
  it("forwards a rejection to next", async () => {
    const boom = new Error("pool is gone");
    const next = vi.fn();
    asyncRoute(async () => {
      throw boom;
    })({} as any, {} as any, next);
    await new Promise((r) => setImmediate(r));
    expect(next).toHaveBeenCalledWith(boom);
  });

  it("does nothing on success", async () => {
    const next = vi.fn();
    asyncRoute(async (_req, res) => {
      (res as any).sent = true;
    })({} as any, {} as any, next);
    await new Promise((r) => setImmediate(r));
    expect(next).not.toHaveBeenCalled();
  });
});

describe("errorHandler", () => {
  function res() {
    const r: any = { headersSent: false, statusCode: 0, body: undefined };
    r.status = (n: number) => ((r.statusCode = n), r);
    r.json = (b: unknown) => ((r.body = b), r);
    return r;
  }
  const quiet = () => vi.spyOn(console, "error").mockImplementation(() => undefined);

  it("uses the error's own status and message", () => {
    quiet();
    const r = res();
    errorHandler(Object.assign(new Error("No such thing"), { status: 404 }), {} as any, r, vi.fn());
    expect(r.statusCode).toBe(404);
    expect(r.body).toEqual({ message: "No such thing" });
  });

  it("defaults to 500 and never sends an empty message", () => {
    quiet();
    const r = res();
    errorHandler({}, {} as any, r, vi.fn());
    expect(r.statusCode).toBe(500);
    expect(r.body).toEqual({ message: "Internal Server Error" });
  });

  it("defers to Express once headers are sent", () => {
    quiet();
    const r = res();
    r.headersSent = true;
    const next = vi.fn();
    const err = new Error("late");
    errorHandler(err, {} as any, r, next);
    expect(next).toHaveBeenCalledWith(err);
    expect(r.statusCode).toBe(0);
  });
});

/**
 * Two invariants the hardening PR established, held here so they cannot
 * quietly come back.
 */
describe("what a route file may not do", () => {
  function serverFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      return statSync(full).isDirectory() ? serverFiles(full) : full.endsWith(".ts") ? [full] : [];
    });
  }

  it("opens a database pool only in db.ts and the startup probe", () => {
    // GET /api/system/db-status used to `new Pool()` on every unauthenticated
    // request and never end it -- a connection leak anyone could drive.
    const offenders = serverFiles(path.join(ROOT, "server"))
      .filter((f) => readFileSync(f, "utf8").includes("new Pool("))
      .map((f) => path.relative(ROOT, f))
      .sort();
    expect(offenders).toEqual(["server/db.ts", "server/index.ts"]);
  });

  it("creates a hero story from the admin route and nowhere else", () => {
    // hero_stories is the shared table two routes serve WITHOUT a login.
    // POST /api/story/save used to copy a family's story into it.
    const text = readFileSync(path.join(ROOT, "server/routes.ts"), "utf8");
    expect(text.match(/createHeroStory\(/g)?.length ?? 0).toBe(1);
  });
});
