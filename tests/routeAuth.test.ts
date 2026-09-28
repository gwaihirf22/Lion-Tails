import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { allRouteRegistrations } from "./helpers/routeFiles";

/**
 * Every route that is not public answers 401 to a request with no session.
 *
 * The roadmap's first testing gap, and the one whose absence has cost the
 * most: eight write routes once shipped reachable from the public internet
 * (decisions §12), and the hardening pass found two more paths a session
 * could reach that it should not have. A test that lists the routes from the
 * SOURCE (tests/helpers/routeFiles.ts) covers a route the moment it is
 * registered; the allowlist below is the only thing a person maintains, and
 * every entry on it is public on purpose, with the reason beside it.
 *
 * The app is the real one -- createApp() from server/index.ts -- booted with
 * no DATABASE_URL, so storage is MemStorage, the story worker and the two
 * watches return without starting, and requiredSecret() falls back to its
 * development default. It listens on an ephemeral port and is driven with
 * the global fetch; no supertest, because six lines are cheaper than a
 * dependency and the repo prefers written over installed.
 */

/** Public by design. Method + path, exactly as registered. */
const PUBLIC = new Set<string>([
  // Liveness. CI's smoke test asserts a 200 with no cookie.
  "get /api/health",
  // The sign-in flow itself, and the challenge the form asks about first.
  "get /api/auth/challenge",
  "post /api/auth/register",
  "post /api/auth/login",
  "post /api/auth/logout",
  "post /api/auth/verify-email",
  "post /api/auth/reset-password-request",
  "post /api/auth/reset-password",
  // Answers "not active" for nobody rather than 401: the client polls it
  // before it knows whether anyone is signed in.
  "get /api/auth/parent-mode-status",
  // A story someone shared, for anybody holding the link.
  "get /api/shared/:token",
  // Shared reference data: readable by everyone, written by admins only.
  "get /api/biblical-events",
  "get /api/heroes",
  "get /api/heroes/:id",
  "get /api/heroes/:heroId/stories",
  "get /api/hero-stories",
  "get /api/hero-stories/:id",
  "get /api/songs",
  "get /api/songs/:id",
  "get /api/songs/popular",
  "get /api/songs/search",
]);

/**
 * Route parameters are filled with an id that is not a built-in story's:
 * refuseBuiltIn() runs before the session check on a few routes and answers
 * 403 for the prologue, which would hide a missing guard behind a different
 * refusal.
 */
function concrete(route: string): string {
  return route.replace(/:[A-Za-z]+/g, "not-a-real-id");
}

let server: Server;
let base: string;

beforeAll(async () => {
  delete process.env.DATABASE_URL;
  const { createApp } = await import("../server/index");
  ({ server } = await createApp());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 30_000);

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("with no session", () => {
  const all = allRouteRegistrations();

  it("finds the routes at all", () => {
    expect(all.length).toBeGreaterThan(80);
  });

  it("names only real routes as public", () => {
    const registered = new Set(all.map((r) => `${r.method} ${r.route}`));
    for (const entry of PUBLIC) {
      expect(registered.has(entry), `${entry} is on the allowlist but not registered`).toBe(true);
    }
  });

  const guarded = all.filter((r) => !PUBLIC.has(`${r.method} ${r.route}`));

  it.each(guarded.map((r) => [r.method.toUpperCase(), r.route] as const))(
    "%s %s answers 401",
    async (method, route) => {
      const res = await fetch(base + concrete(route), {
        method,
        headers: method === "GET" ? {} : { "content-type": "application/json" },
        body: method === "GET" ? undefined : "{}",
        redirect: "manual",
      });
      // Read the body so the socket is released before the next request.
      await res.text();
      expect(res.status).toBe(401);
    },
  );
});
