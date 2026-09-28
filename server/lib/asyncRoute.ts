/**
 * An async handler that throws must reach the error middleware, not the
 * process.
 *
 * Express 4 does nothing with the promise an `async (req, res) => {...}`
 * handler returns. A rejection inside one is an unhandled rejection, and Node
 * 20 exits on those by default -- so one Postgres hiccup on
 * `GET /api/universes`, which awaited the pool with no try/catch, took down
 * every signed-in session and the story job that was running. Eighteen routes
 * were written that way, all of them the newer, tidier handlers that returned
 * early instead of nesting a try block.
 *
 * `asyncRoute` is the wrapper: it forwards a rejection to `next`, where
 * `errorHandler` turns it into a 500 JSON body. A handler that has its own
 * try/catch does not need it. `tests/asyncRoutes.test.ts` reads the route
 * files and fails on any async registration that has neither, because this
 * is a defect in the WRAPPER around a handler, and no unit test of the handler
 * can see it (the chapter-prompt golden exists for the same reason).
 *
 * Written rather than installed: express-async-errors patches Express's
 * Layer prototype at import time, which is invisible at the registration
 * site, and the whole point of this file is that the guard is visible where
 * the routes are listed together (decisions §12).
 */
import type { NextFunction, Request, Response } from "express";

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export function asyncRoute(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * The one error middleware. `res.headersSent` is checked first: a throw
 * after a partial write used to reach `res.status()` on a finished response,
 * which throws again inside the error handler -- the second crash hiding the
 * first. Express's default handler closes the connection in that case, which
 * is the right answer.
 */
export function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) return next(err);
  const e = (err ?? {}) as { status?: unknown; statusCode?: unknown; message?: unknown };
  const status =
    typeof e.status === "number" ? e.status : typeof e.statusCode === "number" ? e.statusCode : 500;
  const message = typeof e.message === "string" && e.message ? e.message : "Internal Server Error";
  res.status(status).json({ message });
  console.error(err);
}
