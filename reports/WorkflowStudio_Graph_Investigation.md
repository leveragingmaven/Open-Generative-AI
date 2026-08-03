# Workflow Studio Graph Rendering — Investigation Report

**Date:** 2026-08-02
**Scope:** Read-only. Determine why Workflow Studio opens but the workflow graph does not appear.
**Method:** Code trace (host app → studio package → workflow-builder package) + live verification of every API in the chain against the running server and the MuAPI upstream.

---

## 1. Verdict

The graph-rendering data chain is **fully functional and verified end-to-end**. The graph *does* render — but only on the **"Full Workflow" (builder) tab**. When a user opens any workflow/template, Workflow Studio intentionally lands on the **Playground tab**, which renders an input form + empty preview panel, **not** the ReactFlow graph. That is the most likely reason the graph "does not appear."

Two additional contributors:

1. A **latent stuck-loading bug** in `NodeFlow.jsx` that hides the graph behind a full-screen "Loading..." overlay forever if either builder API fails or arrives without the expected shape (currently masked because the proxy succeeds).
2. **Port confusion in the runtime environment**: three Next servers are running; port 3000 belongs to a *different* app (`mavensync-knowledge-compiler`), this app serves on **3001** (works) and **3002** (hung/times out).

---

## 2. Environment Verification

| Port | Process | App | Works? |
|------|---------|-----|--------|
| 3000 | `...\mavensync-knowledge-compiler\node_modules\next\...\start-server.js` | mavensync-knowledge-compiler (different project) | N/A — wrong app |
| 3001 | `...\open-generative-ai\node_modules\next\...\start-server.js` | this app (production build) | **Yes** — all routes + proxy verified |
| 3002 | same as 3001 | this app (stale/hung instance) | No — HTTP requests time out |

- `.next` build timestamp: **2026-08-02 18:55** — newer than every relevant source file (`WorkflowStudio.jsx` 8/1, `NodeFlow.jsx` 7/27). The running build on 3001 reflects current source.
- Package consumption: `studio` is consumed from **source** (`main: src/index.js`); `workflow-builder` from **pre-built `dist`** (`main: dist/index.js`). `dist` (7/27 18:38) is in sync with source (last src edit 7/27 18:37). Not a stale-dist problem.
- `node_modules/workflow-builder` is a junction → `packages/Vibe-Workflow/packages/workflow-builder`, and Next `transpilePackages` includes `workflow-builder`, so the resolved `dist` is compiled into the build.

---

## 3. Architecture — Loading Chain (verified)

```
User clicks a workflow card
  → WorkflowStudio.jsx handleSelectWorkflow()            [packages/studio/src/components/WorkflowStudio.jsx:206]
  → router.push('/workflow/{id}/playground')             [WorkflowStudio.jsx:217  — NOTE: always "playground"]
  → Route app/workflow/[id]/[tab]/page.js
  → components/StandaloneShell.js:448 <WorkflowStudio apiKey=studioApiKey/>
  → WorkflowStudio URL-sync effect → selectedWorkflow    [WorkflowStudio.jsx:382-418]
  → loadWorkflowDetails() Promise.allSettled([inputs, nodeSchemas, workflowDef])
      getAllNodeSchemas → ProviderRegistry:76 → MuApiProvider:127 → muapi.js
          GET /api/workflow/{id}/node-schemas            → proxy route.js → https://api.muapi.ai/workflow/{id}/node-schemas
      getWorkflowData   → ProviderRegistry:77 → MuApiProvider:131 → muapi.js
          GET /api/workflow/get-workflow-def/{id}        → proxy route.js → https://api.muapi.ai/workflow/get-workflow-def/{id}
  → <WorkflowUI workflowId initialNodeSchemas initialWorkflowData/>  [WorkflowStudio.jsx:901-910]
  → <WorkflowBuilder .../>                                [WorkflowUI.jsx:16-21]
  → <NodeFlow initialNodeSchemas initialWorkflowData/>    [WorkflowBuilder.jsx — drops workflowId]
  → processWorkflowData() → nodes/edges                   [NodeFlow.jsx:162-220]
  → <ReactFlow> canvas                                    [NodeFlow.jsx render ~2091+]
```

Proxy: `app/api/workflow/[[...path]]/route.js` forwards `/api/workflow/*` → `${MUAPI_BASE_URL}/workflow/*` with `x-api-key` from `getServerMuApiKey()` (`MUAPI_API_KEY` in `.env.local`; agency mode `AGENCY_MODE=true`).

---

## 4. Live API Verification (all passed)

| Endpoint | Result |
|----------|--------|
| `GET /api/workflow/get-template-workflows` (port 3001) | 200 — flat array `{id, slug, name, ...}`; first template id `f9d988cf-...` |
| `GET /api/workflow/{id}/node-schemas` (port 3001) | 200 — `{ categories: { utility, text, audio, image, video, api } }` |
| `GET /api/workflow/get-workflow-def/{id}` (port 3001) | 200 — top-level `data: { nodes: [7] }` + `edges: [7]`; `is_owner=false`, `is_published=false` |
| `GET /workflow/get-template-workflows` (upstream, direct key) | 200 — same shape |
| `GET /workflow/get-workflow-def/{id}` (upstream, direct key) | 200 — node sample has `{id, category, model, position, input_params, output_params.outputs, ...}` — matches `processWorkflowData` exactly |
| `GET /workflow/{id}/node-schemas` (upstream, direct key) | 200 — `{ categories: {...} }` |
| `GET /workflow/{id}/builder` and `/studio/workflows` (port 3001) | 200 — pages serve |

No fetch/import failure was found anywhere in the chain. Sample workflows exist (7 templates returned). The graph component **receives** correct data.

---

## 5. Root-Cause Candidates

### 5.1 PRIMARY — The landing tab is "Playground," not the graph

`handleSelectWorkflow` (WorkflowStudio.jsx:206-221):

```js
const targetTab = urlTab || "playground";
setActiveSubTab(targetTab);
if (!fromUrl) router.push(`/workflow/${wf.id}/${targetTab}`);
```

From the list page `urlTab` is `null`, so **every selection lands on `/workflow/{id}/playground`**. The Playground tab (WorkflowStudio.jsx:644-898) renders a Configuration form + a preview panel (empty until "Run Workflow"). The ReactFlow graph is rendered **only** inside the builder branch (WorkflowStudio.jsx:899-922):

```jsx
) : (
  <div className="flex-1 relative bg-[#050505]">
    {nodeSchemas && workflowDef ? <WorkflowUI ... /> : <Loading Builder/>}
```

So on initial open the user sees a form, not a graph. The graph requires an explicit click on **"Full Workflow"** (WorkflowStudio.jsx:561-574, pushes `/workflow/{id}/builder`). This matches the symptom "the workflow graph does not appear."

### 5.2 SECONDARY — Latent stuck "Loading..." overlay (`isRestoring` never cleared)

If `getAllNodeSchemas`/`getWorkflowData` fail client-side, WorkflowStudio falls back to `nodeSchemas = []` / `def = { nodes: [], edges: [] }` (WorkflowStudio.jsx:273-274) and still renders `WorkflowUI`. Then in NodeFlow:

- `processWorkflowData` returns `null` because `nodeSchemas?.categories` is missing or `workflowData?.data?.nodes` is missing (NodeFlow.jsx:163-166) → `isRestoring = !initialState = true` (NodeFlow.jsx:257).
- The fallback effect (NodeFlow.jsx:405-421) is intended to fetch and clear the flag, but its guard **returns early**:
  ```js
  if (initialWorkflowData && nodeSchemas?.categories) return;   // truthy initialWorkflowData + no categories → skip
  if (!id || !nodeSchemas?.categories) return;                   // no categories → skip
  ```
  With `nodeSchemas = []`, both branches return and `isRestoring` is **never** set to `false`.
- Result: the full-screen `fixed inset-0 z-20` "Loading..." overlay (NodeFlow.jsx:2093-2098) hides the graph forever.

Currently masked because the proxy succeeds (both APIs return the right shapes). It will trigger on any environment where `/api/workflow/*` is unreachable — e.g., opening the app from a host/port that lacks the proxy route.

### 5.3 ENVIRONMENT — wrong server / port

- localhost:3000 = a **different project** (`mavensync-knowledge-compiler`). Opening that shows the wrong app entirely.
- localhost:3002 = a hung/stale instance of this app (requests time out).
- localhost:3001 = this app; fully functional.

---

## 6. Evidence Snapshot

- Running processes/listeners: ports 3000/3001/3002 identified by PID and command line (Section 2).
- `dist` vs `src` timestamps in sync; `.next` build newer than sources (Section 2).
- All six endpoint checks (proxy + upstream) returned 200 with shapes matching consumers (Section 4).
- Node payload fields match `processWorkflowData` mapping (id/category/model/position/input_params/output_params) (Section 4).
- `workflowId` prop is passed by `WorkflowUI` (WorkflowUI.jsx:17) but dropped by `WorkflowBuilder` — **not** a render blocker, since the graph derives entirely from `initialWorkflowData`/`initialNodeSchemas`.

---

## 7. Recommendations (for the follow-up fix task; no changes made here)

1. **Decide intended default tab.** If opening a workflow should show the graph, change `targetTab = urlTab || "playground"` to route to `builder` (or persist the last-used tab) in `WorkflowStudio.jsx:212`.
2. **Fix the `isRestoring` dead-lock** in `NodeFlow.jsx:405-421`: when `initialNodeSchemas` lacks `categories` or `initialWorkflowData` lacks `data.nodes`, still run the fetch path (drop the early `return`), or set `isRestoring(false)` in a `.finally`.
3. **Clean up the runtime environment:** kill the hung server on 3002 and the unrelated app on 3000, or run this app with an explicit port, so the correct instance is used.
