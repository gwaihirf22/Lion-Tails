import express, { type Express } from "express";
import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { SHARE_TOKEN_PATTERN, sharePathFor, sharedStoryView } from "@shared/sharedStory";
import { splitAppendices } from "@shared/storyAppendices";
import {
  previewDescription,
  renderSharePage,
  shareCardImage,
  type ShareMeta,
} from "./lib/pageMeta";
import { builtInStoryById } from "./lib/builtInStories";
import { storage } from "./storage";

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

  /**
   * A shared story's page, with a preview that shows the story.
   *
   * Registered BEFORE the catch-all below, which would otherwise answer with
   * the generic index.html -- and a messaging app's crawler runs no JavaScript,
   * so the generic head is all it would ever see. See server/lib/pageMeta.ts.
   *
   * Production only. In development Vite serves index.html and every link gets
   * the generic card, which costs nothing: no crawler can reach the LAN dev
   * server anyway. Verified against dist/prod.js instead.
   *
   * The absolute urls come from the request. `trust proxy` is on (auth.ts), so
   * behind SWAG these are https://liontails.paul-blake.com, not the container.
   */
  const indexTemplate = fs.readFileSync(path.resolve(distPath, "index.html"), "utf8");
  app.get("/s/:token", async (req, res) => {
    let meta: ShareMeta | null = null;
    try {
      // A built-in story is shared by its own id rather than a token: it ships
      // with the app, is in every library, and has no row to hang a token on.
      // See server/lib/builtInStories.ts.
      const builtIn = builtInStoryById(req.params.token);
      const saved = builtIn
        ? builtIn
        : SHARE_TOKEN_PATTERN.test(req.params.token)
          ? await storage.getSharedStory(req.params.token)
          : undefined;
      if (saved) {
        const view = sharedStoryView(saved);
        const origin = `${req.protocol}://${req.get("host")}`;
        const absolute = (u?: string) =>
          !u ? undefined : /^https?:\/\//i.test(u) ? u : `${origin}${u.startsWith("/") ? "" : "/"}${u}`;
        meta = {
          title: view.title,
          description: previewDescription(splitAppendices(view.content).body),
          url: `${origin}${sharePathFor(req.params.token)}`,
          ...shareCardImage(absolute(view.imageUrl), (u) => absolute(u)!),
        };
      }
    } catch (error) {
      // A preview is a nicety. Never let it stop the page from loading.
      console.error("Error building a share preview:", error);
    }
    res.set("Cache-Control", "no-store");
    res.set("X-Robots-Tag", "noindex, nofollow");
    res.type("html").send(renderSharePage(indexTemplate, meta));
  });

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
