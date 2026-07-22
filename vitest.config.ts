import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Unit tests for the pure logic layer (metrics, billing math). No DOM, no
// Firebase — these functions are deliberately side-effect free so they're
// trivially testable. `vite-tsconfig-paths` resolves the `@/…` imports.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
