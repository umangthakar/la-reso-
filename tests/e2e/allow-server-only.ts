// ============================================================
// Let a test import a "server-only" module.
//
// lib/crypto.ts starts with `import "server-only"`, which is a guard against
// the file ever being pulled into a CLIENT bundle. The package resolves two
// different ways: under the `react-server` condition (what Next applies on the
// server) it is an empty no-op, and otherwise it throws on import.
//
// A Playwright worker is plain Node, so it gets the throwing copy even though
// it is about as server-side as code gets. This redirects the specifier to the
// package's OWN empty entry — the exact module Next resolves on the server —
// rather than stubbing the behaviour out with something invented here.
//
// Import this BEFORE any module that is marked server-only.
// ============================================================

import Module from "node:module";
import path from "node:path";

type Resolver = (request: string, ...rest: unknown[]) => string;

const loader = Module as unknown as { _resolveFilename: Resolver };
const original = loader._resolveFilename;

// The no-op entry shipped by the package itself. Addressed by path rather than
// require.resolve, because the package's `exports` map deliberately hides
// every subpath — which is the whole reason plain Node lands on the throwing
// copy in the first place.
const EMPTY = path.resolve(__dirname, "..", "..", "node_modules", "server-only", "empty.js");

loader._resolveFilename = function (
  this: unknown,
  request: string,
  ...rest: unknown[]
): string {
  if (request === "server-only") return EMPTY;
  return original.call(this, request, ...rest);
} as Resolver;

export {};
