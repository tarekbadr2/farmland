// Test stub for Next.js's `server-only` marker module. In the app, importing
// `server-only` from client code is a build error; under vitest (plain Node,
// no Next resolver) the real module isn't resolvable at all, so server-only
// units like the Paymob seam couldn't be imported to test their pure helpers.
// This empty stub is aliased in for `server-only` so those imports are no-ops.
export {};
