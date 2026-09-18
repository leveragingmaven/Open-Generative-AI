import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const agentsLayoutSource = readFileSync(new URL("../app/agents/layout.js", import.meta.url), "utf8");
const workflowSource = readFileSync(new URL("../packages/studio/src/components/WorkflowStudio.jsx", import.meta.url), "utf8");

test("agent routes provide an explicit Creator OS escape outside browser history", () => {
  assert.match(agentsLayoutSource, /href="\/studio\/agents"/);
  assert.match(agentsLayoutSource, /aria-label="Return to Creator OS Agents"/);
  assert.match(agentsLayoutSource, /\{children\}/);
  assert.doesNotMatch(agentsLayoutSource, /window\.history\.back\(\)/);
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
