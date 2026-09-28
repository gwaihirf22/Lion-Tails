import { readFileSync } from "fs";
import path from "path";

/**
 * Every route registration in the three files that register routes, read
 * from the SOURCE rather than from a running app.
 *
 * Two tests need the same list: asyncRoutes (is every async handler wrapped
 * or guarded?) and routeAuth (does every non-public route refuse a request
 * with no session?). Reading the source is what makes both cover a route by
 * construction: a route added tomorrow is in the list the moment it is
 * registered, with nobody having to remember to add it to a test.
 */
export const ROOT = path.resolve(__dirname, "..", "..");
export const ROUTE_FILES = ["server/routes.ts", "server/auth.ts", "server/songs.ts"];

export type Registration = {
  file: string;
  method: "get" | "post" | "put" | "patch" | "delete";
  route: string;
  /** From `app.<verb>(` to the `=> {` that opens the handler. */
  signature: string;
  /** The handler body, up to the next registration. */
  body: string;
};

export function routeRegistrations(file: string): Registration[] {
  const text = readFileSync(path.join(ROOT, file), "utf8");
  // A registration runs from `app.<verb>("...` to the `=> {` that opens the
  // handler. Guards and the handler's parameter list sit in between and may
  // wrap onto a second line.
  const re = /\bapp\.(get|post|put|patch|delete)\(\s*"([^"]+)"[\s\S]*?=>\s*\{/g;
  const found: Array<{ method: Registration["method"]; route: string; signature: string; start: number; end: number }> = [];
  for (let m = re.exec(text); m; m = re.exec(text)) {
    found.push({
      method: m[1] as Registration["method"],
      route: m[2],
      signature: m[0],
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return found.map((f, i) => ({
    file,
    method: f.method,
    route: f.route,
    signature: f.signature,
    body: text.slice(f.end, i + 1 < found.length ? found[i + 1].start : undefined),
  }));
}

export function allRouteRegistrations(): Registration[] {
  return ROUTE_FILES.flatMap(routeRegistrations);
}
