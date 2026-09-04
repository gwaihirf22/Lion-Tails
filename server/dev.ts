// Development entrypoint: serves the client through Vite middleware with HMR.
// This file (and only this file) pulls Vite into the process, which is why the
// production bundle is built from server/prod.ts instead.
import { createApp, startServer } from "./index";
import { setupVite } from "./vite";

(async () => {
  const { app, server } = await createApp();
  await setupVite(app, server);
  startServer(server);
})();
