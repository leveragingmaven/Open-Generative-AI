import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const agentsLayoutSource = readFileSync(new URL("../app/agents/layout.js", import.meta.url), "utf8");
const workflowSource = readFileSync(new URL("../packages/studio/src/components/WorkflowStudio.jsx", import.meta.url), "utf8");

test("agent routes provide persistent dashboard and workspace navigation outside browser history", () => {
  assert.match(agentsLayoutSource, /href="\/studio"/);
  assert.match(agentsLayoutSource, /aria-label="Back to Dashboard"/);
  assert.match(agentsLayoutSource, /aria-label="Creator OS navigation"/);
  assert.match(agentsLayoutSource, /WORKSPACE_MENU_GROUPS/);
  assert.match(agentsLayoutSource, /EXPERIENCE_WORKSPACES/);
  assert.match(agentsLayoutSource, /<Link key=\{item\.id\} href=\{item\.route\}/);
  assert.match(agentsLayoutSource, /\{children\}/);
  assert.doesNotMatch(agentsLayoutSource, /window\.history\.back\(\)/);
});

test("Studio shell keeps dashboard and workspace navigation visible on compact layouts", () => {
  const shellSource = readFileSync(new URL("../components/StandaloneShell.js", import.meta.url), "utf8");
  assert.match(shellSource, /aria-label="Back to Dashboard"/);
  assert.match(shellSource, /className="flex shrink-0 items-center/);
  assert.match(shellSource, /<WorkspacesMenu onNavigate=\{handleCommandNavigate\}/);
  assert.match(shellSource, /Back to Dashboard/);
});

test("workflow editor exposes both All Workflows and Dashboard escapes", () => {
  assert.match(workflowSource, /router\.push\("\/studio\/workflows"\)/);
  assert.match(workflowSource, /router\.push\("\/studio"\)/);
  assert.match(workflowSource, /All Workflows/);
  assert.match(workflowSource, /Dashboard/);
});

test("workflow Zen mode retains a Creator OS Dashboard escape", () => {
  const zenModeStart = workflowSource.indexOf("/* Floating Immersive Mode Controller */");
  assert.notEqual(zenModeStart, -1, "expected the Zen mode controller");
  const zenMode = workflowSource.slice(zenModeStart);
  assert.match(zenMode, /router\.push\("\/studio\/workflows"\)/);
  assert.match(zenMode, /router\.push\("\/studio"\)/);
  assert.match(zenMode, /Dashboard/);
});
