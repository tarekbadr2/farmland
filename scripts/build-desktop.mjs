#!/usr/bin/env node
/**
 * Builds the fully static export that gets bundled inside the desktop app.
 *
 *   node scripts/build-desktop.mjs   →   ./out
 *
 * `output: 'export'` can't carry API routes or runtime-only dynamic routes, so
 * we temporarily move a few directories aside for the build and always restore
 * them (even if the build fails or is interrupted):
 *   • src/app/api        — server routes (the assistant page falls back to the
 *                          rule-based advisor when the route isn't bundled)
 *   • src/app/invite     — the /invite/[token] accept page is inherently runtime
 *                          (the token is only known at click time) and only ever
 *                          opens on the web; a bundled desktop app never needs it
 */

import { execSync } from "node:child_process";
import { existsSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Directories that can't live in a static export. Each is moved to a sibling
// stash for the duration of the build and moved back afterwards.
const EXCLUDES = [
  { live: path.join(root, "src", "app", "api"), stash: path.join(root, ".api-stash") },
  { live: path.join(root, "src", "app", "invite"), stash: path.join(root, ".invite-stash") },
];

// Clean up any leftovers from an interrupted run, then stash.
for (const { live, stash } of EXCLUDES) {
  if (existsSync(stash) && existsSync(live)) rmSync(stash, { recursive: true, force: true });
  if (existsSync(stash) && !existsSync(live)) renameSync(stash, live);
}

const stashed = EXCLUDES.filter(({ live }) => existsSync(live));
for (const { live, stash } of stashed) renameSync(live, stash);

// A Ctrl-C during `next build` skips the finally block, which would leave a
// directory stashed and the web build silently missing it. Restore on signals.
const restore = () => {
  for (const { live, stash } of stashed) {
    if (existsSync(stash) && !existsSync(live)) renameSync(stash, live);
  }
};
process.on("SIGINT", () => {
  restore();
  process.exit(130);
});
process.on("SIGTERM", () => {
  restore();
  process.exit(143);
});

try {
  rmSync(path.join(root, "out"), { recursive: true, force: true });
  execSync("next build", {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, BUILD_TARGET: "desktop" },
  });
  console.log("\n  desktop export ready → ./out\n");
} finally {
  restore();
}
