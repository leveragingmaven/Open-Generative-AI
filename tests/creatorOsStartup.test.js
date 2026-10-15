import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shellSource = readFileSync(new URL("../components/StandaloneShell.js", import.meta.url), "utf8");
const errorSource = readFileSync(new URL("../app/studio/error.js", import.meta.url), "utf8");
const navigationSource = readFileSync(new URL("../packages/studio/src/studioNavigation.js", import.meta.url), "utf8");

test("Studio startup does not retain the unbounded global spinner gate", () => {
  assert.doesNotMatch(shellSource, /if \(!hasMounted\)/);
  assert.doesNotMatch(shellSource, /setHasMounted/);
  assert.match(shellSource, /<MavenSyncDashboard motionCarouselAllowed=\{motionCarouselAllowed\} \/>/);
  assert.match(shellSource, /<RecoverableErrorBoundary/);
});

test("Motion Carousel is owner-gated on Create and Dashboard surfaces only via the server probe", () => {
  assert.match(shellSource, /<MavenSyncCreateWorkspace motionCarouselAllowed=\{motionCarouselAllowed\} \/>/);
  assert.match(shellSource, /fetch\('\/api\/motion-carousel'/);
});

test("Studio home mounts the simple Dashboard and /studio/overview preserves the Workspace overview", () => {
  assert.match(shellSource, /import MavenHomeDashboard from '\.\.\/packages\/studio\/src\/components\/experience\/MavenHomeDashboard\.jsx'/);
  const mountBlock = shellSource.match(/let activeWorkspaceContent = null;[\s\S]*?} else if \(isCreateWorkspace\)/);
  assert.ok(mountBlock, "expected the workspace content mount block");
  const homeIndex = mountBlock[0].indexOf("<MavenHomeDashboard apiKey={studioApiKey} onOpenSettings={openSettings} />");
  const overviewIndex = mountBlock[0].indexOf("<MavenSyncDashboard motionCarouselAllowed={motionCarouselAllowed} />");
  assert.ok(homeIndex !== -1, "expected MavenHomeDashboard with shell settings on the slugless studio home");
  assert.ok(overviewIndex !== -1, "expected MavenSyncDashboard preserved for the overview workspace");
  assert.ok(homeIndex < overviewIndex, "home must map to the Dashboard and overview to the Workspace overview");
  assert.match(shellSource, /\{isHeaderVisible && \(/, "the global Creator OS header remains mounted on Studio home");
  assert.match(shellSource, /<header className="sticky top-0 z-50[^\"]*h-14/, "the existing header stays available during home scrolling");
  assert.doesNotMatch(shellSource, /isHeaderVisible && !isStudioHome/);
  assert.match(shellSource, /isStudioHome \? "min-h-screen overflow-x-clip"/);
  assert.match(shellSource, /isStudioHome \? "overflow-visible" : "min-h-0 overflow-hidden"/);
  assert.match(shellSource, /isStudioHome \? "overflow-visible" : activeWorkspaceTab === 'publishing'/);
});

test("Mobile shell chrome keeps the workspace name readable and tracks the dynamic viewport", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(shellSource, /ms-app-viewport overflow-hidden/, "the full-height shell must track the dynamic viewport so mobile browser chrome and the keyboard cannot hide bottom controls");
  assert.doesNotMatch(shellSource, /h-screen overflow-hidden/, "the fixed 100vh shell height must not be restored");
  assert.match(css, /\.ms-app-viewport \{\s*height: 100vh;\s*height: 100dvh;\s*\}/, "the dynamic viewport utility keeps a vh fallback");
  assert.match(shellSource, /hidden sm:block text-\[10px\] uppercase tracking-\[0\.2em\]/, "the header eyebrow is hidden on phone widths instead of wrapping inside the 56px header");
  assert.match(shellSource, /text-sm sm:text-base font-semibold tracking-tight truncate/, "the workspace name scales down on phone widths");
});

test("The mobile back control is icon-only and keeps its accessible name", () => {
  // At 360px the "Dashboard" label left the workspace name ~75px, which truncated it. The label is
  // now desktop-only, so the control must keep an accessible name for the icon-only phone case.
  assert.doesNotMatch(shellSource, /sm:hidden">Dashboard</, "the mobile-only back label must stay removed so the workspace name is not truncated");
  assert.match(shellSource, /aria-label="Back to Dashboard"/, "the icon-only back control keeps its accessible name");
  assert.match(shellSource, /hidden sm:inline">Back to Dashboard</, "the desktop label is preserved");
  assert.match(shellSource, /justify-center gap-1\.5 rounded-md border border-white\/10 bg-\[#1B1B1B\] px-3 py-2 text-\[11px\][^"]*sm:justify-start sm:px-2\.5 sm:py-1\.5/, "the phone tap target is padded without changing desktop padding");
});

test("Dedicated workflow routes are not classified as Studio home", () => {
  assert.match(shellSource, /const isStudioHome = slug\.length === 0 && !idFromParams;/);
  const workflowPage = shellSource.match(/if \(isStudioHome\) \{[\s\S]*?case 'workflows':[\s\S]*?break;/)?.[0];
  assert.ok(workflowPage?.includes("<MavenHomeDashboard apiKey={studioApiKey} onOpenSettings={openSettings} />"), "slugless /studio still mounts Maven Workspace");
  assert.ok(workflowPage?.includes("<WorkflowStudio apiKey={studioApiKey}"), "dedicated workflow routes mount WorkflowStudio");
  assert.match(shellSource, /activeWorkspaceContent = <WorkflowStudio apiKey=\{studioApiKey\}/);
  assert.match(shellSource, /const getWorkflowInfo = useCallback\(\(\) => \{/);
  assert.match(shellSource, /const wfIndex = slug\.findIndex\(s => s === 'workflows' \|\| s === 'workflow'\);/);
  assert.match(shellSource, /id: slug\[wfIndex \+ 1\] \|\| null/);
  assert.match(shellSource, /const \{ id: urlWorkflowId \} = getWorkflowInfo\(\);/);
  assert.match(shellSource, /const isEditingWorkflow = \(activeTab === 'workflows' \|\| !!idFromParams\) && urlWorkflowId;/);
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
  const catalogSource = readFileSync(new URL('../packages/studio/src/lib/agents/AgentCatalog.js', import.meta.url), 'utf8');
  const muapiSource = readFileSync(new URL('../packages/studio/src/muapi.js', import.meta.url), 'utf8');
  assert.match(agentSource, /const \[activeMainTab, setActiveMainTab\] = useState\(["']all["']\)/);
  assert.match(agentSource, /const CATALOG_REQUEST_TIMEOUT_MS = 30_000;/);
  assert.match(agentSource, /templates: \{ records: \[\], status: ["']loading["'], error: null \}/);
  assert.match(agentSource, /featured: \{ records: \[\], status: ["']loading["'], error: null \}/);
  assert.match(agentSource, /startAgentCatalogFeedRequest\(\{/);
  assert.match(agentSource, /sourceCatalog: feed\.key,[\s\S]*?isFeatured: feed\.isFeatured/);
  assert.match(agentSource, /requests\.forEach\(\(request\) => request\.abort\(\)\)/);
  assert.match(agentSource, /Some upstream agents unavailable; showing available catalog/);
  assert.match(agentSource, /Upstream agents unavailable; showing MavenSync templates/);
  assert.doesNotMatch(agentSource, /Promise\.allSettled/);
  assert.match(catalogSource, /const controller = new AbortController\(\)/);
  assert.match(catalogSource, /const timeoutId = setTimeout\(\(\) => controller\.abort\(\), timeoutMs\)/);
  assert.match(catalogSource, /clearTimeout\(timeoutId\)/);
  assert.match(muapiSource, /getTemplateAgents\(apiKey, \{ signal \} = \{\}\)/);
  assert.match(muapiSource, /getPublishedAgents\(apiKey, \{ signal \} = \{\}\)/);
  assert.match(muapiSource, /agents\/featured\/agents/);
});

test("Studio startup isolates workspaces from the full studio barrel", () => {
  assert.doesNotMatch(shellSource, /from ['"]studio['"]/);
  assert.doesNotMatch(shellSource, /import\(['"]studio['"]\)/);
  assert.match(shellSource, /import\('\.\.\/packages\/studio\/src\/components\/ImageStudio\.jsx'/);
  assert.match(shellSource, /import\('\.\.\/packages\/studio\/src\/components\/KnowledgeCenterStudio\.jsx'/);
  assert.doesNotMatch(errorSource, /from ['"]studio['"]/);
});
