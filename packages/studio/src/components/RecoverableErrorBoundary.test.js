import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("recoverable loading boundary contains a user-safe retry fallback", () => {
  const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "RecoverableErrorBoundary.jsx"), "utf8");

  assert.match(source, /role="alert"/);
  assert.match(source, /Reload \/ Retry/);
  assert.match(source, /window\.location\.reload/);
  assert.doesNotMatch(source, /ChunkLoadError|stack|password|token/i);
});
