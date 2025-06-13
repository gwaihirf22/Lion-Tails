import dotenv from 'dotenv';
dotenv.config();
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import path from "path";
// Import PostgreSQL for database check
import { Pool } from '@neondatabase/serverless';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Serve static files from the public directory
app.use('/public', express.static(path.join(process.cwd(), 'public')));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
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

// Function to check database connection
async function checkDatabase(): Promise<boolean> {
  if (!process.env.DATABASE_URL) {
    log("No DATABASE_URL provided, will use in-memory storage");
    return false;
  }
  
  try {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    log("Database connection successful");
    return true;
  } catch (error) {
    log("Database connection failed");
    if (error instanceof Error) {
      log("Error details: " + error.message);
    }
    return false;
  }
}

(async () => {
  // Ensure database is ready before starting server
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
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5001
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5001;
  server.listen(port, "127.0.0.1", () => {
    log(`serving on port ${port}`);
  });
})();
