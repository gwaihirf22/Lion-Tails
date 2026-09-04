import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { log } from "./static";
import path from "path";
import type { Server } from "http";
// Standard PostgreSQL client for the startup connectivity check
import { Pool } from "pg";

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

  // Serve static files from the public directory
  app.use("/public", express.static(path.join(process.cwd(), "public")));

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

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    console.error(err);
  });

  return { app, server };
}

/** Starts listening. Port is configurable so the container can be remapped. */
export function startServer(server: Server) {
  const port = Number(process.env.PORT) || 5000;
  server.listen({ port, host: "0.0.0.0" }, () => {
    log(`serving on port ${port}`);
  });
}
