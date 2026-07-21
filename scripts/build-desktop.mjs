#!/usr/bin/env node
/**
 * Builds the fully static export that gets bundled inside the desktop app.
 *
 *   node scripts/build-desktop.mjs   →   ./out
 *
 * `output: 'export'` can't carry API routes, so we temporarily move src/app/api
 * aside for the build and always restore it (even if the build fails). The
 * assistant page already falls back to the rule-based advisor when the route
 * isn't there, so the bundle degrades cleanly.
 */

import { execSync } from "node:child_process";
import { existsSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const api = path.join(root, "src", "app", "api");
const stash = path.join(root, ".api-stash");

// Clean any leftover from an interrupted run.
if (existsSync(stash) && existsSync(api)) rmSync(stash, { recursive: true, force: true });
if (existsSync(stash) && !existsSync(api)) renameSync(stash, api);

const hadApi = existsSync(api);
if (hadApi) renameSync(api, stash);

try {
  rmSync(path.join(root, "out"), { recursive: true, force: true });
  execSync("next build", {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, BUILD_TARGET: "desktop" },
  });
  console.log("\n  desktop export ready → ./out\n");
} finally {
  if (hadApi && existsSync(stash)) renameSync(stash, api);
}
