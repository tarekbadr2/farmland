// Unit tests for the deep-link parser — run with `npm test` in desktop/
// (node --test). No Electron needed.
const { test } = require("node:test");
const assert = require("node:assert");
const { deepLinkFromArgv } = require("./deep-link");

test("parses herdos://invite/<token> into a route", () => {
  assert.strictEqual(deepLinkFromArgv(["herdos://invite/abc123"]), "/invite/abc123");
});

test("preserves a query string", () => {
  assert.strictEqual(deepLinkFromArgv(["herdos://animal?id=5"]), "/animal?id=5");
});

test("keeps a trailing slash but collapses accidental double slashes", () => {
  assert.strictEqual(deepLinkFromArgv(["herdos://dashboard/"]), "/dashboard/");
  assert.strictEqual(deepLinkFromArgv(["herdos://record//9"]), "/record/9");
});

test("finds the link among other argv (exec path, flags)", () => {
  assert.strictEqual(
    deepLinkFromArgv(["C:\\app\\Herd OS.exe", "--flag", "herdos://record/9"]),
    "/record/9",
  );
});

test("returns null when there's no herdos:// argument", () => {
  assert.strictEqual(deepLinkFromArgv(["--hidden", "C:\\x\\app.exe"]), null);
  assert.strictEqual(deepLinkFromArgv([]), null);
  assert.strictEqual(deepLinkFromArgv(undefined), null);
});
