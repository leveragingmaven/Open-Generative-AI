import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shellSource = readFileSync(new URL("../components/StandaloneShell.js", import.meta.url), "utf8");
const createClientSource = readFileSync(new URL("../app/agents/create/AgentCreateClient.js", import.meta.url), "utf8");
const editClientSource = readFileSync(new URL("../app/agents/edit/[id]/AgentEditClient.js", import.meta.url), "utf8");
const mavenHomeSource = readFileSync(new URL("../packages/studio/src/components/experience/MavenHomeDashboard.jsx", import.meta.url), "utf8");

test("Creator OS Agents destination routes into the real executing Agents experience", () => {
  // The shell tab handler must send Agents to /agents/create, not /studio/agents.
  const navigateBlock = shellSource.match(/const navigateToTab = \(tabId\) => \{[\s\S]*?\n  \};/)?.[0];
  assert.ok(navigateBlock, "expected the shared navigateToTab helper");
  assert.match(navigateBlock, /if \(tabId === "agents"\) \{\s*\n\s*router\.push\("\/agents\/create"\);/);
  assert.match(navigateBlock, /router\.push\(`\/studio\/\$\{tabId\}`\);/);

  // The generic handleTabChange must delegate to the helper.
  assert.match(shellSource, /const handleTabChange = \(tabId\) => \{\s*\n\s*navigateToTab\(tabId\);/);

  // The Workspaces picker intercepts the Agents destination before delegating.
  const selectBlock = shellSource.match(/const select = \(item\) => \{[\s\S]*?\n  \};/)?.[0];
  assert.ok(selectBlock, "expected the WorkspacesMenu select handler");
  assert.match(selectBlock, /item\.id === "agents" && item\.route === "\/studio\/agents"/);
  assert.match(selectBlock, /onNavigate\("\/agents\/create"\);/);

  // Command Bar navigation from the dashboard home must also leave the shell.
  const commandNavigateBlock = shellSource.match(/const handleCommandNavigate = \(route, params\) => \{[\s\S]*?\n  \};/)?.[0];
  assert.ok(commandNavigateBlock, "expected the Command Bar navigation handler");
  assert.match(commandNavigateBlock, /if \(tabId === "agents"\) \{[\s\S]*?router\.push\("\/agents\/create"\);/);
  assert.match(commandNavigateBlock, /route === "\/studio\/agents"\) \{[\s\S]*?router\.push\("\/agents\/create"\);/);
});

test("Creator OS Agents no longer resolves to the Studio Agents workspace", () => {
  // No navigation path in the shell may still push /studio/agents.
  const pushedStudioAgents = shellSource.match(/router\.push\((`\/studio\/agents`|"\/studio\/agents")\)/);
  assert.equal(pushedStudioAgents, null, "expected no router.push('/studio/agents') to remain");
});

test("Other Studio destinations retain their existing routing", () => {
  // Non-agents tabs still use the generic /studio/:tabId route.
  assert.match(shellSource, /router\.push\(`\/studio\/\$\{tabId\}`\);/);

  // Workspaces picker still delegates untouched destinations by their route.
  const selectBlock = shellSource.match(/const select = \(item\) => \{[\s\S]*?\n  \};/)?.[0];
  assert.match(selectBlock, /onNavigate\(item\.route\);/);

  // Dashboard home in-shell navigation still pushes the requested studio route
  // for non-agents destinations.
  const commandNavigateBlock = shellSource.match(/const handleCommandNavigate = \(route, params\) => \{[\s\S]*?\n  \};/)?.[0];
  assert.match(commandNavigateBlock, /router\.push\(route\);/);
});

test("Agent create and edit clients use the supported Creator OS usedIn value", () => {
  assert.match(createClientSource, /usedIn="muapiapp"/);
  assert.match(editClientSource, /usedIn="muapiapp"/);
  assert.doesNotMatch(createClientSource, /usedIn="studio"/);
  assert.doesNotMatch(editClientSource, /usedIn="studio"/);
});

test("Maven Front Door keeps its original Agents destination", () => {
  // Maven's Front Door is out of scope: the dashboard file must remain
  // untouched, with its Agents card still pointing at the Studio workspace.
  assert.match(mavenHomeSource, /styles\.frontDoor/, "expected the Maven Front Door section");
  assert.match(mavenHomeSource, /title: "Agents", icon: "design", href: "\/studio\/agents"/);
  assert.doesNotMatch(mavenHomeSource, /\/agents\/create/);
});
