import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Unit tests for the pure logic layer (metrics, billing math). No DOM, no
// Firebase — these functions are deliberately side-effect free so they're
// trivially testable. `vite-tsconfig-paths` resolves the `@/…` imports.
export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      // `server-only` is a Next.js build-time marker with no Node resolution;
      // alias it to an empty stub so server-only modules (e.g. the Paymob seam)
      // can be imported to unit-test their pure helpers.
      "server-only": fileURLToPath(new URL("./src/test/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
