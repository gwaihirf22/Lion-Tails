// Production entrypoint: serves the pre-built client from dist/public.
// Deliberately does NOT import ./vite — esbuild bundles this file with
// --packages=external, so any Vite import here would make the runtime image
// depend on devDependencies.
import { createApp, startServer } from "./index";
import { serveStatic } from "./static";

(async () => {
  const { app, server } = await createApp();
  serveStatic(app);
  startServer(server);
})();
