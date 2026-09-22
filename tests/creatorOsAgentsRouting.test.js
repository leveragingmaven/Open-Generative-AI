import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shellSource = readFileSync(new URL("../components/StandaloneShell.js", import.meta.url), "utf8");
const createClientSource = readFileSync(new URL("../app/agents/create/AgentCreateClient.js", import.meta.url), "utf8");
const editClientSource = readFileSync(new URL("../app/agents/edit/[id]/AgentEditClient.js", import.meta.url), "utf8");
const mavenHomeSource = readFileSync(new URL("../packages/studio/src/components/experience/MavenHomeDashboard.jsx", import.meta.url), "utf8");

test("Creator OS Agents destination resolves to the Studio Agents workspace", () => {
  // The shell tab handler restores the generic /studio/:tabId route, so the
  // Agents destination opens the redesigned AgentStudio at /studio/agents.
  const navigateBlock = shellSource.match(/const handleTabChange = \(tabId\) => \{[\s\S]*?\n  \};/)?.[0];
  assert.ok(navigateBlock, "expected the shell tab handler");
  assert.match(navigateBlock, /router\.push\(`\/studio\/\$\{tabId\}`\);/);
  assert.doesNotMatch(navigateBlock, /\/agents\/create/);
  assert.doesNotMatch(navigateBlock, /navigateToTab/);

  // The Workspaces picker delegates every destination (including Agents) by
  // its registry route — no Agents interception remains.
  const selectBlock = shellSource.match(/const select = \(item\) => \{[\s\S]*?\n  \};/)?.[0];
  assert.ok(selectBlock, "expected the WorkspacesMenu select handler");
  assert.match(selectBlock, /onNavigate\(item\.route\);/);
  assert.doesNotMatch(selectBlock, /\/agents\/create/);

  // Command Bar navigation from the dashboard home keeps the generic route push.
  const commandNavigateBlock = shellSource.match(/const handleCommandNavigate = \(route, params\) => \{[\s\S]*?\n  \};/)?.[0];
  assert.ok(commandNavigateBlock, "expected the Command Bar navigation handler");
  assert.doesNotMatch(commandNavigateBlock, /\/agents\/create/);
  assert.match(commandNavigateBlock, /router\.push\(route\);/);

  // The redesigned Studio Agents workspace is the mounted Agents experience.
  assert.match(shellSource, /case 'agents':[\s\S]*?<AgentStudio apiKey=\{studioApiKey\}/);
});

test("Creator OS Agents no longer resolves to /agents/create", () => {
  // No navigation path in the shell may send customers to /agents/create.
  assert.doesNotMatch(shellSource, /router\.push\("\/agents\/create"\)/);
  assert.doesNotMatch(shellSource, /router\.push\(`\/agents\/create`\)/);
});

test("Other Studio destinations retain their existing routing", () => {
  assert.match(shellSource, /router\.push\(`\/studio\/\$\{tabId\}`\);/);
  const selectBlock = shellSource.match(/const select = \(item\) => \{[\s\S]*?\n  \};/)?.[0];
  assert.match(selectBlock, /onNavigate\(item\.route\);/);
  const commandNavigateBlock = shellSource.match(/const handleCommandNavigate = \(route, params\) => \{[\s\S]*?\n  \};/)?.[0];
  assert.match(commandNavigateBlock, /router\.push\(route\);/);
});

test("Maven Front Door is untouched", () => {
  // Maven's Front Door keeps its own Agents destination inside MavenHomeDashboard.
  assert.match(mavenHomeSource, /styles\.frontDoor/, "expected the Maven Front Door section");
  assert.match(mavenHomeSource, /title: "Agents", icon: "design", href: "\/studio\/agents"/);
  assert.doesNotMatch(mavenHomeSource, /\/agents\/create/);
});

test("Design Agent remains a separate Studio destination", () => {
  assert.match(shellSource, /case 'design-agent':[\s\S]*?<DesignAgentStudio apiKey=\{studioApiKey\}/);
  assert.match(shellSource, /else if \(slug\.includes\('design-agent'\)\) candidate = 'design-agent';/);
  assert.doesNotMatch(shellSource, /design-agent.*\/agents\/create/s);
});

test("Agent create and edit clients keep the supported Creator OS usedIn value", () => {
  assert.match(createClientSource, /usedIn="muapiapp"/);
  assert.match(editClientSource, /usedIn="muapiapp"/);
  assert.doesNotMatch(createClientSource, /usedIn="studio"/);
  assert.doesNotMatch(editClientSource, /usedIn="studio"/);
});
