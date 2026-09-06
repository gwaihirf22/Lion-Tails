import express, { type Express } from "express";
import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // An /api/ path that reached here matched no route, so it does not exist.
  // Answer JSON 404 rather than falling through to the SPA.
  //
  // Without this, a request to a removed or mistyped API path gets HTTP 200 and
  // index.html, the client calls response.json() on markup, and the user sees
  // `Unexpected token '<', "<!DOCTYPE "` -- indistinguishable from the proxy
  // timeout that produced the same message. It also meant a benchmark could
  // "successfully register" a user against a route that never existed.
  app.use("/api/*", (req, res) => {
    res.status(404).json({ message: `No such endpoint: ${req.method} ${req.originalUrl}` });
  });

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
