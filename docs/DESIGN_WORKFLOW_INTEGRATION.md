# Design Agent And Workflow Studio Integration

## Current Architecture

The active Creative Studio route is:

`/studio` -> `app/studio/[[...slug]]/page.js` -> `components/StandaloneShell.js` -> `studio` package exports.

The active embedded workspaces are:

- Design Agent: `packages/studio/src/components/DesignAgentStudio.jsx`
- Workflow Studio: `packages/studio/src/components/WorkflowStudio.jsx`
- Design Agent upstream package: `packages/Open-AI-Design-Agent/packages/design-agent/src`
- Workflow builder upstream package: `packages/Vibe-Workflow/packages/workflow-builder/src`

Inactive lookalikes exist under legacy `src/components`, but this phase only changed the active package workspace path.

## Provider Contracts

Design Agent now has an explicit provider boundary under `packages/studio/src/lib/providers/design`.

Implemented MuAPI-backed operations:

- `createSession()`
- `getSession()`
- `sendMessage()`
- `getSessionAssets()`
- `getDesignJob()`

Explicit unsupported operations:

- `uploadReferenceAsset()`
- `getAsset()`
- `submitDesignJob()`
- `cancelDesignJob()`

Workflow Studio now has an explicit provider boundary under `packages/studio/src/lib/providers/workflow`.

Implemented MuAPI-backed operations:

- `getWorkflowTemplates()`
- `createWorkflow()`
- `updateWorkflow()` for rename-only updates
- `validateWorkflow()`
- `executeWorkflow()`
- `getWorkflowRun()`
- `getWorkflowResults()`

Explicit unsupported operations:

- `cancelWorkflowRun()`
- `uploadWorkflowAsset()`

Unsupported operations return capability errors instead of implying an undocumented MuAPI endpoint exists.

## Authentication Boundary

Browser code calls same-origin routes:

- `/api/v1/creative-agent/*`
- `/api/workflow/*`
- `/api/app/*`
- `/api/v1/get_upload_url`

These routes now prefer server-side `MUAPI_API_KEY` and strip browser `Authorization`, `x-api-key`, cookies, and `content-length` before forwarding upstream.

Standalone local setups may still pass a browser `x-api-key` only when `AGENCY_MODE` is not enabled and no server key is configured. Bearer-token forwarding is not supported for Design Agent.

`DesignAgentStudio.jsx` no longer writes the MuAPI key into `localStorage.token`; it removes stale values before mounting the vendored canvas. AI-gency or Hub session identity is normalized through `useMavenSyncIntegration()` and used only as attribution.

## Asset Ownership

Design Agent assets normalize through `normalizeDesignAgentAsset()`.

Workflow outputs keep their original provider `outputs` for UI compatibility and additionally expose normalized `assets` records for shared Creative Studio asset handling.

Normalized records preserve owner and tenant IDs, project/campaign/content plan/launch IDs when present, provider, source job/run ID, prompt, filename, MIME type, URL, timestamps, and temporary URL metadata.

Hub registration is optional. Failure to report to Hub does not remove local results.

## Job Lifecycle

Job normalization uses `packages/studio/src/lib/jobs/jobTypes.js`.

Supported normalized states include `idle`, `queued`, `running`, `processing`, `succeeded`, `partially_completed`, `failed`, `cancelled`, `timed_out`, and `unknown`.

Workflow polling includes a lightweight `PollingRegistry` that deduplicates simultaneous in-flight polling requests by key and clears the key after completion.

## Standalone And Hub Launch Behavior

Standalone mode remains supported. If no MavenSync launch context is available, attribution fields remain null and local Studio behavior continues.

When launched from Hub and the MavenSync adapter has context, Design Agent sessions, Workflow runs, and normalized assets can carry `ownerId`, `tenantId`, `projectId`, `campaignId`, `contentPlanId`, and `launchId`.

Hub reporting remains best-effort and non-blocking.

## Validation

Validated with Node tests and mocks:

- Design Agent session normalization
- Design Agent provider payloads exclude browser credentials
- unsupported capability errors
- Workflow preset normalization
- Workflow graph validation
- temporary URL handling
- job status mapping
- duplicate polling prevention and cleanup
- raw Workflow UI outputs preserved alongside normalized assets
- Hub failure does not delete local normalized asset state

Live validation blockers:

- paid MuAPI Design Agent and Workflow execution were not triggered
- real upload side effects were not triggered
- Hub backend launch/context/asset registration endpoints are outside this repository
- some provider operations remain unsupported because no confirmed MuAPI endpoint was found
