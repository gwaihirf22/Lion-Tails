import { defineConfig } from "vitest/config";
import path from "path";

/**
 * A SEPARATE config from vite.config.ts, deliberately.
 *
 * vite.config.ts sets `root: client/`, which is right for building the SPA and
 * wrong for tests -- it would hide every test under server/ and shared/ from
 * the runner. The aliases are duplicated rather than imported because pulling
 * in the build config also pulls in the React and shadcn-theme plugins, which
 * a Node-environment unit test has no use for.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
      "@assets": path.resolve(__dirname, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // No network in tests. scripts/verify-heroes.ts is the thing that talks to
    // Wikipedia and bible-api.com, and it is run by hand because a test suite
    // that depends on two free APIs fails for reasons that have nothing to do
    // with the code.
  },
});
