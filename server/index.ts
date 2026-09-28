import express from "express";
import { registerRoutes } from "./routes";
import { seedReferenceData } from "./seed";
import { startStoryWorker, stopStoryWorker } from "./lib/storyWorker";
import { errorHandler } from "./lib/asyncRoute";
import { startPriceWatch } from "./lib/priceWatch";
import { startAbuseWatch } from "./lib/abuseAlerts";
import { log } from "./static";
import path from "path";
import type { Server } from "http";
// pg is a CommonJS module; the production bundle is ESM built with
// --packages=external, so Node loads pg as CJS at runtime and cannot
// destructure named exports from it:
//   SyntaxError: Named export 'Pool' not found.
// Import the default and destructure at runtime; the type import erases at
// compile time and is safe. See docs/decisions.md §1.
import pg from "pg";
const { Pool } = pg;

// Function to check database connection
async function checkDatabase(): Promise<boolean> {
  if (!process.env.DATABASE_URL) {
    log("No DATABASE_URL provided, will use in-memory storage");
    return false;
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const client = await pool.connect();
    await client.query("SELECT NOW()");
    client.release();
    log("Database connection successful");
    return true;
  } catch (error) {
    log("Database connection failed");
    if (error instanceof Error) {
      log("Error details: " + error.message);
    }
    return false;
  } finally {
    await pool.end().catch(() => {});
  }
}

/**
 * Builds the Express app and registers every route that is common to both the
 * development and production servers.
 *
 * The caller is responsible for attaching the client-serving layer afterwards
 * (Vite middleware in dev, static files in prod) because that catch-all route
 * must be registered last, and because the Vite path must never be imported by
 * the production bundle.
 */
export async function createApp(): Promise<{ app: express.Express; server: Server }> {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  app.use((req, res, next) => {
    const start = Date.now();
    const reqPath = req.path;
    let capturedJsonResponse: Record<string, any> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (reqPath.startsWith("/api")) {
        let logLine = `${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`;
        if (capturedJsonResponse) {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }

        if (logLine.length > 80) {
          logLine = logLine.slice(0, 79) + "…";
        }

        log(logLine);
      }
    });

    next();
  });

  // Ensure database is reachable before starting; the app has an in-memory
  // fallback, so a failure here is logged rather than fatal.
  try {
    log("Checking database connection...");
    await checkDatabase();
    log("Database check completed.");
  } catch (err) {
    log("Database check failed");
    if (err instanceof Error) {
      log("Error details: " + err.message);
    } else {
      log("Unknown error occurred during database check");
    }
    log("Application will continue with in-memory storage if needed.");
  }

  const server = await registerRoutes(app);

  /**
   * Serve static files from the public directory.
   *
   * AFTER registerRoutes, and that is the whole of how character portraits are
   * protected. `setupAuth` runs inside registerRoutes, so a guard registered
   * before this point has no session to read; and express.static answers the
   * first matching request, so a static mount above the routes would serve
   * every portrait to anybody with the url before the guard was ever consulted.
   *
   * Moving this line back up is silent: nothing errors, no test fails, and
   * `/public/images/stories/avatars/...` simply starts answering 200 without a
   * session again. Everything registered in registerRoutes is `/api/*` or that
   * one avatar path, so nothing else competes for these urls.
   */
  app.use("/public", express.static(path.join(process.cwd(), "public")));

  // Seed reference data before we start listening, so the app never serves a
  // half-populated Heroes of the Faith list. Resolves quickly when there is no
  // database -- databaseReady resolves false rather than hanging.
  await seedReferenceData();

  // The story worker starts behind the same database gate. That one gate does
  // three jobs: it satisfies "no database means refuse" for the async path, it
  // keeps the CI smoke test green (which boots with no DATABASE_URL and would
  // otherwise have a worker polling a pool that does not exist), and it needs no
  // new infrastructure. startStoryWorker awaits databaseReady itself and returns
  // without starting when there is none, so this does not block startup.
  startStoryWorker();
  // Behind the same gate, for the same reasons. See server/lib/priceWatch.ts.
  startPriceWatch();
  // And the accounts watch, hourly rather than daily. It runs whether or not
  // Telegram is configured, so a missing variable is a log line rather than a
  // watcher nobody knows is absent.
  startAbuseWatch();

  // The one error middleware. Every async handler either has its own try
  // block or is wrapped in asyncRoute() so a rejection lands here rather
  // than as an unhandled rejection; tests/asyncRoutes.test.ts holds that.
  app.use(errorHandler);

  return { app, server };
}

let processHooksInstalled = false;

/**
 * Starts listening, and takes the process's two lifecycle events.
 *
 * UNHANDLED REJECTION: log and stay up. Node 20 exits on one by default, and
 * before asyncRoute() existed eighteen route handlers could produce one from a
 * single database hiccup -- every session and the running story gone. The
 * wrapper is the fix; this is what keeps the next miss a log line instead of
 * an outage. uncaughtException is left at Node's default: after a
 * synchronous throw the state is unknown and exiting is right.
 *
 * SIGTERM / SIGINT: stop taking work, hand the running story job back so the
 * next container resumes it on its first poll (see stopStoryWorker), let
 * in-flight requests finish, then exit. Docker gives ten seconds; the
 * fallback exits at five so a keep-alive that never closes cannot use them
 * all. The price and abuse watches are unref'd timers and need nothing.
 */
export function startServer(server: Server) {
  const port = Number(process.env.PORT) || 5000;
  server.listen({ port, host: "0.0.0.0" }, () => {
    log(`serving on port ${port}`);
  });

  if (processHooksInstalled) return;
  processHooksInstalled = true;

  process.on("unhandledRejection", (reason) => {
    console.error("[unhandled rejection]", reason);
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`${signal} received, shutting down`);
    const fallback = setTimeout(() => process.exit(0), 5_000);
    fallback.unref();
    void stopStoryWorker()
      .catch(() => undefined)
      .then(() => server.close(() => process.exit(0)));
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
