import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shellSource = readFileSync(new URL("../components/StandaloneShell.js", import.meta.url), "utf8");

test("Studio startup does not retain the unbounded global spinner gate", () => {
  assert.doesNotMatch(shellSource, /if \(!hasMounted\)/);
  assert.doesNotMatch(shellSource, /setHasMounted/);
  assert.match(shellSource, /<MavenSyncDashboard \/>/);
  assert.match(shellSource, /<RecoverableErrorBoundary/);
});

test("Studio retains active-workspace-only mounting", () => {
  assert.match(shellSource, /let activeWorkspaceContent = null/);
  assert.match(shellSource, /switch \(activeWorkspaceTab\)/);
  assert.match(shellSource, /case 'knowledge-center':/);
  assert.match(shellSource, /case 'publishing':/);
  assert.match(shellSource, /case 'agents':/);
  assert.doesNotMatch(shellSource, /const studioContent = \(\s*<>/);
});
