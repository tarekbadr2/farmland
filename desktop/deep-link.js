// Pure deep-link parsing, split out of main.js so it can be unit-tested without
// launching Electron. `herdos://invite/<token>` → `/invite/<token>`, etc.

const PROTOCOL = "herdos";

/**
 * Extract an in-app route from process argv (Windows/Linux) or an open-url
 * string (macOS). Returns a leading-slash path with any query preserved, or
 * null when there's no herdos:// argument.
 */
function deepLinkFromArgv(argv) {
  const arg = (argv || []).find((a) => typeof a === "string" && a.startsWith(`${PROTOCOL}://`));
  if (!arg) return null;
  try {
    const u = new URL(arg);
    return `/${u.hostname}${u.pathname}${u.search}`.replace(/\/{2,}/g, "/");
  } catch {
    return null;
  }
}

module.exports = { PROTOCOL, deepLinkFromArgv };
