import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shellSource = readFileSync(new URL("../components/StandaloneShell.js", import.meta.url), "utf8");
const errorSource = readFileSync(new URL("../app/studio/error.js", import.meta.url), "utf8");
const navigationSource = readFileSync(new URL("../packages/studio/src/studioNavigation.js", import.meta.url), "utf8");

test("Studio startup does not retain the unbounded global spinner gate", () => {
  assert.doesNotMatch(shellSource, /if \(!hasMounted\)/);
  assert.doesNotMatch(shellSource, /setHasMounted/);
  assert.match(shellSource, /<MavenSyncDashboard \/>/);
  assert.match(shellSource, /<RecoverableErrorBoundary/);
});

test("Studio home mounts the simple Dashboard and /studio/overview preserves the Workspace overview", () => {
  assert.match(shellSource, /import MavenHomeDashboard from '\.\.\/packages\/studio\/src\/components\/experience\/MavenHomeDashboard\.jsx'/);
  const mountBlock = shellSource.match(/let activeWorkspaceContent = null;[\s\S]*?} else if \(isCreateWorkspace\)/);
  assert.ok(mountBlock, "expected the workspace content mount block");
  const homeIndex = mountBlock[0].indexOf("<MavenHomeDashboard />");
  const overviewIndex = mountBlock[0].indexOf("<MavenSyncDashboard />");
  assert.ok(homeIndex !== -1, "expected MavenHomeDashboard on the slugless studio home");
  assert.ok(overviewIndex !== -1, "expected MavenSyncDashboard preserved for the overview workspace");
  assert.ok(homeIndex < overviewIndex, "home must map to the Dashboard and overview to the Workspace overview");
});

test("Dedicated workflow routes are not classified as Studio home", () => {
  assert.match(shellSource, /const isStudioHome = slug\.length === 0 && !idFromParams;/);
  const workflowPage = shellSource.match(/if \(isStudioHome\) \{[\s\S]*?case 'workflows':[\s\S]*?break;/)?.[0];
  assert.ok(workflowPage?.includes("<MavenHomeDashboard />"), "slugless /studio still mounts Maven Home");
  assert.ok(workflowPage?.includes("<WorkflowStudio apiKey={studioApiKey}"), "dedicated workflow routes mount WorkflowStudio");
  assert.match(shellSource, /activeWorkspaceContent = <WorkflowStudio apiKey=\{studioApiKey\}/);
  assert.match(shellSource, /path\.startsWith\('\/studio\/workflows\/'\)/);
  assert.match(shellSource, /router\.replace\(`\/workflow\/\$\{urlWorkflowId\}`\)/);
});

test("Workspace overview owns a dedicated route in the navigation registry", () => {
  assert.match(navigationSource, /\{ id: 'dashboard', label: 'Dashboard', route: '\/studio', tabIds: \[\] \}/);
  assert.match(navigationSource, /\{ id: 'workspace-overview', label: 'Workspace overview', route: '\/studio\/overview', tabIds: \[\] \}/);
});

test("Slugless routes do not conceptually fall back to asset-library", () => {
  assert.doesNotMatch(shellSource, /slug\.length === 0 \? 'asset-library'/);
  assert.doesNotMatch(shellSource, /\(segments\[1\] \|\| 'asset-library'\)/);
});

test("Studio retains active-workspace-only mounting", () => {
  assert.match(shellSource, /let activeWorkspaceContent = null/);
  assert.match(shellSource, /switch \(activeWorkspaceTab\)/);
  assert.match(shellSource, /case 'knowledge-center':/);
  assert.match(shellSource, /case 'publishing':/);
  assert.match(shellSource, /case 'agents':/);
  assert.doesNotMatch(shellSource, /const studioContent = \(\s*<>/);
});

test("Agents mounts eagerly and keeps its catalog effect", () => {
  assert.match(shellSource, /import AgentStudio from ['"]\.\.\/packages\/studio\/src\/components\/AgentStudio\.jsx['"]/);
  assert.doesNotMatch(shellSource, /const AgentStudio = workspaceImport\(\(\) => import\(['"]\.\.\/packages\/studio\/src\/components\/AgentStudio\.jsx/);
  const agentCase = shellSource.match(/case 'agents':[\s\S]*?break;/)?.[0];
  assert.ok(agentCase?.includes('<AgentStudio apiKey={studioApiKey}'), 'Agents tab should preserve existing props');
  const agentSource = readFileSync(new URL('../packages/studio/src/components/AgentStudio.jsx', import.meta.url), 'utf8');
  const muapiSource = readFileSync(new URL('../packages/studio/src/muapi.js', import.meta.url), 'utf8');
  assert.match(agentSource, /const \[activeMainTab, setActiveMainTab\] = useState\(["']all["']\)/);
  assert.match(agentSource, /const CATALOG_REQUEST_TIMEOUT_MS = 15_000;/);
  assert.match(agentSource, /new AbortController\(\)/);
  assert.match(agentSource, /feed\.load\(apiKey, \{ signal: controller\.signal \}\)/);
  assert.match(agentSource, /sourceCatalog: ["']featured["'], isFeatured: true/);
  assert.match(agentSource, /useEffect\(\(\) => \{[\s\S]*?Promise\.allSettled/);
  assert.match(muapiSource, /getTemplateAgents\(apiKey, \{ signal \} = \{\}\)/);
  assert.match(muapiSource, /getPublishedAgents\(apiKey, \{ signal \} = \{\}\)/);
});

test("Studio startup isolates workspaces from the full studio barrel", () => {
  assert.doesNotMatch(shellSource, /from ['"]studio['"]/);
  assert.doesNotMatch(shellSource, /import\(['"]studio['"]\)/);
  assert.match(shellSource, /import\('\.\.\/packages\/studio\/src\/components\/ImageStudio\.jsx'/);
  assert.match(shellSource, /import\('\.\.\/packages\/studio\/src\/components\/KnowledgeCenterStudio\.jsx'/);
  assert.doesNotMatch(errorSource, /from ['"]studio['"]/);
});
