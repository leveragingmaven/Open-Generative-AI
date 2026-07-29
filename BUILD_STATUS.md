# Creative Studio Build Status

## Current Phase

Phase 4 - MuAPI Social Publishing and Scheduler Foundation

Status: Completed

Goal: add a MuAPI-required social publishing foundation with normalized drafts, platform capabilities, server-side route boundary, local publishing history, and optional MavenSync status reporting.

Latest pass: inspected the repo for existing social scheduler code, confirmed none is implemented, and added a safe MuAPI publishing provider foundation without live social publishing side effects.

## Build Order

1. Repository and route inventory - Completed
2. Studio launch/load validation - Completed
3. Production-breaking fixes - Completed
4. Build validation - Completed
5. Cleanup and commit - Completed
6. Phase 2 shared architecture foundation - Completed
7. Phase 3 MavenSync Hub integration foundation - Completed
8. Phase 4 MuAPI social publishing foundation - Completed
9. Phase 5 Design Agent and Workflow Studio integration hardening - Completed with mock validation

## Repository Inventory

### App Routes

- `/` - root app page.
- `/studio/[[...slug]]` - main Creative Studio shell.
- `/workflow/[id]` and `/workflow/[id]/[tab]` - workflow builder routes.
- `/assistant` - assistant page.
- `/agents/create`, `/agents/edit/[id]`, `/agents/[agent_id]`, `/agents/[agent_id]/[conversation_id]` - agent routes.
- API proxy routes:
  - `/api/api/v1/[[...path]]`
  - `/api/app/[[...path]]`
  - `/api/workflow/[[...path]]`
  - `/api/agents/[[...path]]`
  - `/api/v1/creative-agent/[[...path]]`
  - `/api/v1/get_upload_url`
  - `/api/v1/upload-binary`
  - `/api/upload-binary`

### Studios

Main shell source: `components/StandaloneShell.js`

Studio package exports: `packages/studio/src/index.js`

- Image Studio - `packages/studio/src/components/ImageStudio.jsx`
- Cinema Studio - `packages/studio/src/components/CinemaStudio.jsx`
- Design Agent Studio - `packages/studio/src/components/DesignAgentStudio.jsx`
- AI Influencer Studio - `packages/studio/src/components/AiInfluencerStudio.jsx`
- Video Studio - `packages/studio/src/components/VideoStudio.jsx`
- AI Clipping - `packages/studio/src/components/ClippingStudio.jsx`
- Vibe Motion - `packages/studio/src/components/VibeMotionStudio.jsx`
- Lip Sync - `packages/studio/src/components/LipSyncStudio.jsx`
- Body Swap - `packages/studio/src/components/RecastStudio.jsx`
- Marketing Studio - `packages/studio/src/components/MarketingStudio.jsx`
- Audio Studio - `packages/studio/src/components/AudioStudio.jsx`
- Agents - `packages/studio/src/components/AgentStudio.jsx`
- Workflows - `packages/studio/src/components/WorkflowStudio.jsx`
- Explore Apps - `packages/studio/src/components/AppsStudio.jsx`

Additional exported but not directly shown in the main shell navigation:

- MCP CLI Studio - `packages/studio/src/components/McpCliStudio.jsx`

Legacy/Electron-oriented studio components also exist under `src/components`.

### Shared Components

- Main Next shell: `components/StandaloneShell.js`
- API key modal: `components/ApiKeyModal.js`
- Prompt composer primitives: `packages/studio/src/components/prompt/PromptComposer.jsx`
- Prompt composer docs: `packages/studio/src/components/prompt/README.md`
- Draw modal: `packages/studio/src/components/DrawModal.jsx`
- Workflow UI/shared workflow pieces: `packages/studio/src/components/WorkflowUI.jsx`
- Workflow builder package: `packages/Vibe-Workflow/packages/workflow-builder/src`
- Agent package: `packages/Open-Poe-AI/packages/agents/src`
- Design agent package: `packages/Open-AI-Design-Agent/packages/design-agent/src`

### Shared Services

- Studio API wrapper: `packages/studio/src/muapi.js`
- Studio model catalog: `packages/studio/src/models.js`
- Root MuAPI wrapper for Electron/Vite path: `src/lib/muapi.js`
- Root model re-export: `src/lib/models.js`
- Agency mode config: `src/lib/agencyMode.js`
- Local inference client: `src/lib/localInferenceClient.js`
- Local model catalog: `src/lib/localModels.js`
- Pending jobs: `src/lib/pendingJobs.js`
- Prompt utilities: `src/lib/promptUtils.js`
- Upload history: `src/lib/uploadHistory.js`
- Upload proxy targeting: `src/lib/uploadProxyTarget.js`
- i18n/settings labels: `src/lib/i18n.js`
- Electron local inference services: `electron/lib/*`

## Architecture Notes

Detailed audit: `docs/ASSET_ARCHITECTURE.md`

### Shared Asset Services

- Provider facade: `packages/studio/src/lib/providers/ProviderRegistry.js`.
- MuAPI provider implementation: `packages/studio/src/lib/providers/MuApiProvider.js`.
- Provider base/types: `packages/studio/src/lib/providers/CreativeProvider.js`, `packages/studio/src/lib/providers/providerTypes.js`.
- Primary MuAPI transport wrapper: `packages/studio/src/muapi.js`.
- Shared asset manager modules: `packages/studio/src/lib/assets/*`.
- Shared job manager modules: `packages/studio/src/lib/jobs/*`.
- Shared notification wrapper: `packages/studio/src/lib/notifications/notify.js`.
- Legacy/Electron API wrapper: `src/lib/muapi.js`.
- Upload proxy validation: `src/lib/uploadProxyTarget.js`.
- Upload proxy routes:
  - `app/api/app/[[...path]]/route.js`
  - `app/api/v1/get_upload_url/route.js`
  - `app/api/upload-binary/route.js`
  - `app/api/v1/upload-binary/route.js`
- Legacy upload history: `src/lib/uploadHistory.js`.
- Legacy pending jobs: `src/lib/pendingJobs.js`.
- Local inference asset/model bridge: `src/lib/localInferenceClient.js`.
- Workflow download helper and model catalogs: `packages/Vibe-Workflow/packages/workflow-builder/src/components/utility.jsx`.

### Shared Asset Flow

- React studios generally generate assets through `packages/studio/src/muapi.js`, receive hosted result URLs, then store recent entries in per-studio state and `localStorage`.
- Package studio components now call the provider facade, which delegates to the MuAPI provider and preserves the existing MuAPI transport behavior.
- Package studio direct URL downloads now use the shared `downloadAsset()` helper.
- Uploads are not fully unified. React studios use `uploadFile()` from the studio MuAPI wrapper, workflow and agent packages use signed upload URLs, Design Agent uses `/api/v1/get_upload_url` plus `/api/v1/upload-binary`, and local Wan2GP uploads go through Electron IPC.
- Workflow builder assets are represented as node `resultUrl`, `outputs`, and `outputHistory`.
- Design Agent assets are session-backed and identified by `{ asset_label, url, kind }`.
- Agent chat assets are attached to backend conversation history and downloaded through signed URL helpers.

### Recommended Integration Points

- Implemented shared asset service location: `packages/studio/src/lib/assets/assetManager.js`.
- Implemented provider registry location: `packages/studio/src/lib/providers/ProviderRegistry.js`.
- Implemented job manager location: `packages/studio/src/lib/jobs/jobManager.js`.
- Implemented notification wrapper location: `packages/studio/src/lib/notifications/notify.js`.
- Best future Creative Library connection points:
  - after successful React studio upload;
  - after React studio generation result URL is received;
  - when workflow nodes append `outputHistory`;
  - when `NodeFlow.jsx` maps backend run history to node data;
  - after Design Agent registers or loads session assets;
  - when Agent chat hydrates generated media parts;
  - when legacy `UploadPicker.js` saves upload history.

### Technical Debt Discovered

- No shared normalized asset record exists.
- Upload progress and signed-upload handling are duplicated across studios, workflow nodes, Design Agent, and agent chat.
- Download helpers are duplicated across studio components, workflow utilities, Design Agent canvas, and agent chat.
- Per-studio history persistence uses independent localStorage keys and similar load/save/delete logic.
- Polling exists in multiple independent implementations; a shared package-level job manager now exists for incremental migration.
- Asset rendering and type handling are split between direct media elements, custom players, canvas nodes, and workflow renderers.
- Legacy DOM-built studios and React package studios maintain parallel asset flows.

### Phase 2 Architecture Implementation

- Provider abstraction exists under `packages/studio/src/lib/providers`.
- MuAPI is the only implemented provider; future provider IDs are represented for Gemini, OpenAI, Replicate, FAL, OpenRouter, and internal MavenSync services.
- Package studio components import provider facade functions instead of importing `muapi.js` directly.
- Shared asset modules exist under `packages/studio/src/lib/assets` for downloads, metadata, local JSON storage, and local history helpers.
- Package studio duplicated direct Blob download helpers now route through `downloadAsset()`.
- Shared job modules exist under `packages/studio/src/lib/jobs` for normalized statuses, polling, cancellation, subscriptions, and local job records.
- Shared notification wrapper exists under `packages/studio/src/lib/notifications`.
- Existing studio UI, prompts, routing, branding, and workflows were preserved.

### Phase 3 MavenSync Hub Integration Foundation

- MavenSync integration modules exist under `packages/studio/src/lib/mavensync`.
- `MavenSyncClient` provides disabled-safe Hub API adapter methods for launch context, project, campaign, knowledge, asset registration, asset return, current user, and publishing status.
- `MavenSyncSession` normalizes existing AI-gency/Agency browser identity sources without storing authentication tokens in localStorage.
- `LaunchContext` parses opaque launch identifiers, validates allowed return origins, and strips temporary launch parameters from the visible URL after consumption.
- `KnowledgeConnector` and `ProjectConnector` normalize Hub-provided creative and project context without coupling studios to Hub response shapes.
- `AssetHandoff` normalizes Creative Studio-owned generated asset references for Hub registration and preserves local assets on registration failure.
- `useMavenSyncIntegration()` exposes optional `standalone`, `agency`, and `hub-launch` integration state.
- Image Studio generated-image completion is the first reference integration path.
- Publishing provider boundary exists under `packages/studio/src/lib/publishing`; MuAPI remains the required Creative Studio publishing transport.

### Phase 4 MuAPI Social Publishing Foundation

- Existing scheduler/social publishing inspection found no Creative Studio social scheduler UI, account connection flow, queue/calendar state, or MuAPI social publishing calls.
- Workflow publishing and agent `is_published` fields are unrelated listing/publication features, not social scheduling.
- Publishing provider package now includes provider registry, errors, publishing types, status normalization, platform capabilities, local publishing history, and MavenSync status reporter.
- `MuApiPublishingProvider` supports local draft create/update, validation, duplicate in-flight submission prevention, schedule/publish submission through same-origin `/api/publishing/*`, local job/history persistence, and optional MavenSync status reporting.
- Live account connection, schedule, publish-now, job status, cancellation, and reschedule operations route through `app/api/publishing/[[...path]]/route.js` and return explicit unsupported capability responses until MuAPI social endpoints are confirmed.
- Platform capability registry marks unknown values as `"unknown"` rather than guessing.
- Server route strips browser cookies, authorization, browser `x-api-key`, host, connection, and content-length headers before any future upstream MuAPI call.

### API Wrappers And Upload Services

- `packages/studio/src/muapi.js`
  - generation wrappers for image, video, image-to-image, image-to-video, video-to-video, lip sync, clipping, marketing, apps, and balance.
  - upload wrapper for MuAPI file uploads.
- `src/lib/muapi.js`
  - Electron/Vite-oriented MuAPI client.
- Upload proxy routes:
  - `app/api/upload-binary/route.js`
  - `app/api/v1/upload-binary/route.js`
  - `app/api/v1/get_upload_url/route.js`
- Workflow proxy routes:
  - `app/api/workflow/[[...path]]/route.js`
- Agent proxy routes:
  - `app/api/agents/[[...path]]/route.js`
  - `app/api/v1/creative-agent/[[...path]]/route.js`
- Local/Electron upload bridge:
  - `electron/preload.js`
  - `electron/lib/wan2gpProvider.js`
  - `src/lib/localInferenceClient.js`

### Storage And Settings

- Browser local storage:
  - `muapi_key`
  - `sidebar_collapsed`
  - `vadoo_banner_dismissed`
  - `muapi_uploads`
  - local language preference
  - pending job state
- Cookie:
  - `muapi_key` is synced by `StandaloneShell` for proxied requests.
- Settings:
  - Main shell Settings button opens API key management.
  - Electron/Vite path includes local model settings through legacy components.
- Environment:
  - `.env.example` contains MuAPI proxy and Agency Mode defaults.
  - Full studio validation requires Agency Mode disabled or all studio tabs listed in `CREATIVE_STUDIO_TABS`.

### Navigation

- Main categories are defined in `components/StandaloneShell.js`.
- Images: Image Studio, Cinema Studio, Design Agent, AI Influencer Studio.
- Video: Video Studio, AI Clipping, Vibe Motion, Lip Sync, Body Swap, Marketing Studio.
- Audio: Audio Studio.
- Agents & Automation: Agents, Workflows.
- Explore Apps is a standalone nav item.
- Design Agent intentionally hides the shell header/sidebar while active.

## Studio Checklist

Validation method: local Next dev server, temporary local validation key, no generation submissions.

| Studio | Route | Launches | Loads | Runtime Errors | Missing Imports | Assets | Navigation | Buttons/Controls | API Calls |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Image Studio | `/studio/image` | Pass | Pass | None observed | None | Hero assets load | Pass | Visible prompt/model/ratio/count/draw/generate controls | Not submitted |
| Cinema Studio | `/studio/cinema` | Pass | Pass | None observed | None | Hero assets load | Pass | Visible ratio/resolution/camera/shoot controls | Not submitted |
| Design Agent | `/studio/design-agent` | Pass | Pass | None observed | None | Shell loads agent UI | Header hidden by design | Visible chat/session/asset controls | Not submitted |
| AI Influencer Studio | `/studio/ai-influencer` | Pass | Pass | None observed | None | UI loads | Pass | Visible Face/Body/Style/Human controls | Not submitted |
| Video Studio | `/studio/video` | Pass | Pass | None observed | None | Hero assets load | Pass | Visible upload/model/ratio/duration/draw/generate controls | Not submitted |
| AI Clipping | `/studio/clipping` | Pass | Pass | None observed | None | UI loads | Pass | Visible upload/ratio/highlights/mode/generate controls | Not submitted |
| Vibe Motion | `/studio/vibe-motion` | Pass | Pass | None observed | None | UI loads | Pass | Visible generate/edit/ratio/duration controls | Not submitted |
| Lip Sync | `/studio/lipsync` | Pass | Pass | None observed | None | UI loads | Pass | Visible portrait/video/upload/model controls | Not submitted |
| Body Swap | `/studio/body-swap` | Pass | Pass | None observed | None | UI loads | Pass | Visible video/character upload/model/orientation controls | Not submitted |
| Marketing Studio | `/studio/marketing` | Pass | Pass | None observed | None | Avatar assets load | Pass | Visible UGC/avatar/ratio/res/duration/launch controls | Not submitted |
| Audio Studio | `/studio/audio` | Pass | Pass | None observed | None | UI loads | Pass | Visible model/style/vocal/generate controls | Not submitted |
| Agents | `/studio/agents` | Pass | Pass | None observed | None | UI loads | Pass | Visible templates/my agents/my chats/create controls | Not submitted |
| Workflows | `/studio/workflows` | Pass | Pass | None observed | None | UI loads | Pass | Visible create/templates/my workflows/community controls | Not submitted |
| Explore Apps | `/studio/apps` | Pass | Pass | None observed | None | App cards load | Pass | Visible GitHub/Demo controls | External links not followed |

### Remaining Studio Validation Pass

Validation method: Playwright on local dev server with `AGENCY_MODE=false`, temporary local validation key, `vadoo_banner_dismissed=1`, no Generate/Shoot/Launch submissions, and no file uploads selected.

Expected validation noise filtered: invalid-key `403` responses for balance and app-interest calls, plus favicon noise.

| Studio | Route | Mounted | Main Controls Observed | Upload Controls | Unexpected Runtime Errors | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Cinema Studio | `/studio/cinema` | Pass | Prompt, aspect ratio, resolution, camera/lens selector, Shoot button | File inputs mounted; no upload submitted | None observed | Validated |
| Design Agent | `/studio/design-agent` | Pass | Session UI, chat input, zoom controls, agent canvas controls | File inputs mounted; no upload submitted | None observed | Validated |
| AI Influencer Studio | `/studio/ai-influencer` | Pass | Face/Body/Style builder controls, prompt input, Generate controls | File inputs mounted; no upload submitted | None observed | Validated |
| AI Clipping | `/studio/clipping` | Pass | Prompt/input field, clipping controls, generate controls | File inputs mounted; no upload submitted | None observed | Validated |
| Vibe Motion | `/studio/vibe-motion` | Pass | Prompt/input field, motion controls, generate/edit controls | File inputs mounted; no upload submitted | None observed | Validated |
| Lip Sync | `/studio/lipsync` | Pass | Prompt/input field, portrait/video/audio controls, generate controls | File inputs mounted; no upload submitted | None observed | Validated |
| Body Swap | `/studio/body-swap` | Pass | Prompt/input field, video/character controls, orientation controls | File inputs mounted; no upload submitted | None observed | Validated |
| Marketing Studio | `/studio/marketing` | Pass | Prompt/input field, UGC/avatar/ratio/resolution/duration controls | File inputs mounted; no upload submitted | None observed | Validated with known thumbnail issue |
| Audio Studio | `/studio/audio` | Pass | Model/style/vocal/prompt controls, generate controls | File inputs mounted; no upload submitted | None observed | Validated |
| Agents | `/studio/agents` | Pass | Templates/My Agents/My Chats/Create controls | File inputs mounted by shared shell/package; no upload submitted | None observed | Validated |
| Workflows | `/studio/workflows` | Pass | Create workflow, templates, user/community workflow controls | File inputs mounted by shared package; no upload submitted | None observed | Validated |
| Explore Apps | `/studio/apps` | Pass | Template cards, GitHub/Demo controls | Not applicable | None observed | Validated |

## Shared Component Checklist

| Area | Files | Status | Notes |
| --- | --- | --- | --- |
| Main shell | `components/StandaloneShell.js` | Pass | Route and sidebar navigation validated in full-studio mode. |
| API key gate | `components/ApiKeyModal.js` | Pass | Gate appears without key; local validation key bypasses gate. |
| Prompt composer | `packages/studio/src/components/prompt/PromptComposer.jsx` | Pass | Shared prompt controls load across studios. |
| MuAPI client | `packages/studio/src/muapi.js` | Pass with expected 403s | Dummy key produces expected balance/app-interest 403 responses. |
| Upload controls | studio upload components and MuAPI upload wrapper | Not submitted | Controls mount; upload API was not exercised to avoid external side effects. |
| Navigation | `components/StandaloneShell.js` | Pass | All categories and direct routes validated in full-studio mode. |
| Settings | `components/StandaloneShell.js` | Pass | Settings button visible in full shell mode. |
| Workflow builder package | `workflow-builder` workspace | Pass by import/build | Workflow landing loads; builder deep behavior not exercised. |
| Agent package | `ai-agent` workspace | Pass by import/build | Agent landing loads; external agent operations not exercised. |
| Design agent package | `design-agent` workspace | Pass by import/build | Creative Agent UI loads. |

## Bug Tracker

### Fixed

- Production build failed during page-data collection because Next inferred the workspace root as the user directory when multiple lockfiles were present.
  - Error: `Cannot find module for page: /api/v1/get_upload_url`.
  - Fix: set `outputFileTracingRoot` in `next.config.mjs` to this repository root.
  - Status: Fixed. `npm run build` passes.
- IS-001: Generated Image Studio result cards could be partially hidden behind the floating PromptComposer.
  - Fix: increased the result gallery bottom scroll padding in `packages/studio/src/components/ImageStudio.jsx`.
  - Validation: seeded local image history rendered with 64px clearance between the result card and PromptComposer; gallery remained scrollable.
- IS-003: Image Studio generated-image Download action could fail silently for cross-origin URLs.
  - Fix: hardened `downloadImage()` to fetch as a Blob, save with a filename, and fall back to opening the asset URL with console diagnostics.
- IS-004: Image Studio fullscreen preview lacked a Download action.
  - Fix: added a visible fullscreen-preview Download button that reuses `downloadImage()`.

### In Progress

- None.

### Blocked

- Real API generation validation is blocked by absence of a real MuAPI key in this validation pass.
- Upload endpoint side effects were intentionally not exercised in Phase 1 functional smoke validation.
- IS-002: Reference-image upload validation is externally blocked by MuAPI 403 insufficient-credit/auth responses with the validation key.
- VS-001: Real Video Studio generation and paid upload validation are externally blocked by unavailable MuAPI credits/valid credentials.
- RS-001: Real generation and paid upload validation remain externally blocked for Cinema, Design Agent, AI Influencer, AI Clipping, Vibe Motion, Lip Sync, Body Swap, Marketing, Audio, Agents, and Workflows.

## Known Issues

### Fixed

- IS-001: Image Studio result cards are no longer covered by the floating PromptComposer.
- IS-003: Image Studio result-card Download now saves via Blob when possible and falls back with diagnostics.
- IS-004: Image Studio enlarged preview now includes a Download action.

### Open

- Preset video thumbnails may fail to render on some Chromium/GPU combinations.
  - Status: Non-blocking cosmetic issue.
  - Notes: Assets are playable, audio works if controls are enabled, and studio launch/load/generation controls are not blocked.

### External / Credit Blocked

- IS-002: Image Studio reference-image upload calls return MuAPI 403 insufficient-credit/auth responses with the validation key.
  - Status: External / Credit Blocked.
  - Notes: Not treated as an application defect; paid upload calls were not attempted.
- VS-001: Video Studio paid generation and paid upload calls were not submitted.
  - Status: External / Credit Blocked.
  - Notes: Interface validation used seeded local history and did not invent successful API results.
- RS-001: Remaining studios' real generation, workflow execution, agent execution, and paid uploads were not submitted.
  - Status: External / Credit Blocked.
  - Notes: Interface validation completed using non-submitting route loads, mounted controls, local validation key, and console/page-error inspection.
- Dummy validation key causes expected `403` responses for balance and app-interest calls.
  - Status: Non-blocking.
  - Notes: No JavaScript runtime exception was observed from these failures.

### Enhancement

- IS-005: Allow bundled avatar or presenter selections to be replaced or extended later with MavenSync-managed and user-uploaded assets.
  - Status: Enhancement request.
  - Notes: No implementation in Phase 1.

### Local Environment

- `.env.example` defaults to Agency Mode with `CREATIVE_STUDIO_TABS=image,marketing`.
  - Status: Non-blocking for production build; important for validation.
  - Notes: Full Creative Studio validation requires Agency Mode disabled or all tabs included.

### Dependency Audit

- `npm install` reports 30 vulnerabilities: 2 low, 5 moderate, 22 high, 1 critical.
  - Status: Non-blocking for Phase 1 build stabilization.
  - Notes: No `npm audit fix` was run because it can introduce dependency changes outside the requested scope.

## Validation Log

- `npm install`
  - Status: Passed.
  - Result: dependencies already up to date.
  - Notes: npm audit reported existing vulnerabilities.
- Studio browser validation
  - Status: Passed for all listed studios in full-studio mode.
  - Notes: used a temporary local validation key and did not submit generation jobs.
- Image Studio repair validation
  - Status: Passed.
  - Notes: verified seeded result history, PromptComposer clearance, result-card Download action presence, fullscreen preview, and fullscreen Download action without paid API calls.
- Video Studio validation
  - Status: Passed as far as possible without paid side effects.
  - Notes: verified launch, prompt field, model selector, aspect-ratio selector, duration selector, resolution/quality selector, upload file chooser, seeded result history, result-card Download/Fullscreen actions, enlarged preview close action, navigation, and expected invalid-key 403 handling.
- Remaining studio validation
  - Status: Passed as far as possible without paid side effects.
  - Notes: validated Cinema, Design Agent, AI Influencer, AI Clipping, Vibe Motion, Lip Sync, Body Swap, Marketing, Audio, Agents, Workflows, and Explore Apps route mount, main controls, upload-control presence where applicable, and unexpected console/page errors.
- Shared asset architecture plan
  - Status: Completed.
  - Notes: documented duplicated download, history, storage, upload, and provider logic in `docs/ASSET_ARCHITECTURE.md`.
- Phase 2 architecture implementation
  - Status: Completed.
  - Notes: added provider, asset, job, and notification foundations; migrated safe package studio provider/download call sites.
- Phase 3 MavenSync Hub integration foundation
  - Status: Completed.
  - Notes: added optional Hub launch/session/context/asset handoff adapters, Image Studio reference asset registration, and documentation/tests for the integration contract.
- Phase 4 MuAPI social publishing foundation
  - Status: Completed.
  - Notes: added publishing provider foundation, same-origin server route boundary, normalized drafts/statuses, platform capabilities, local publishing history, and focused tests.
- Phase 5 Design Agent and Workflow Studio integration hardening
  - Status: Completed with mock validation; live MuAPI execution remains externally blocked.
  - Notes: added Design Agent and Workflow provider adapters, removed Design Agent browser key persistence, hardened same-origin proxy credential stripping, normalized Workflow outputs as shared asset records, and added focused Node tests.
- `npm run build`
  - Initial status: Failed during page-data collection due workspace root inference.
  - Final status: Passed after `next.config.mjs` fix.

## Completed

- Created master build tracker.
- Inspected repository structure, studios, shared components, services, API wrappers, upload paths, storage, navigation, and settings.
- Validated all existing studios launch and load in full-studio mode.
- Classified dummy-key API 403 responses as expected validation noise.
- Fixed production build failure.
- Confirmed production build succeeds.
- Completed Image Studio fixes IS-001, IS-003, and IS-004.
- Validated Video Studio interface and navigation without paid generation or upload side effects.
- Created `BUG_BACKLOG.md` for confirmed Image Studio and Video Studio findings.
- Completed remaining-studio validation pass for all studios not previously deep-validated.
- Expanded shared asset architecture plan with duplicated download, history/storage, upload, and provider logic.
- Implemented Phase 2 provider abstraction, shared asset manager modules, shared job manager, and shared notification wrapper.
- Migrated package studio MuAPI call sites to the provider facade.
- Migrated package studio direct URL downloads to the shared download manager.
- Implemented Phase 3 MavenSync integration package and Image Studio reference asset handoff.
- Documented Hub API contract in `docs/MAVENSYNC_INTEGRATION.md`.
- Added focused MavenSync integration tests using Node's built-in `node:test`.
- Implemented Phase 4 MuAPI publishing foundation and documented it in `docs/MUAPI_PUBLISHING.md`.
- Added focused publishing foundation tests using Node's built-in `node:test`.
- Implemented Phase 5 Design Agent and Workflow Studio provider hardening and documented it in `docs/DESIGN_WORKFLOW_INTEGRATION.md`.
- Added focused Design/Workflow integration tests using Node's built-in `node:test`.

## In Progress

- None.

## Blocked

- Real external API generation tests.
- Upload side-effect tests.
- Image Studio reference upload validation with real credits.
- Video Studio generation/upload validation with real credits.
- Remaining studio generation/upload/workflow/agent execution validation with real credits.
- MavenSync Hub backend endpoints are not implemented in this repository.
- Live Hub launch exchange, asset registration, asset return, and publishing-status reporting require the Hub backend contract to be implemented.
- Live MuAPI social publishing endpoints and account connection flows were not present in this repository.
- Live social scheduling/publishing validation is blocked by confirmed MuAPI social endpoint contract, credentials, and connected social accounts.
- Live Design Agent generation, Workflow execution, and paid upload side effects remain blocked by MuAPI credits/credentials and were validated only with mocks.
- Hub launch exchange and asset registration remain dependent on the Hub backend contract.

## Commit History

- `docs: initialize Creative Studio build tracker and stabilize phase 1 validation`
- `docs: document shared asset architecture`
- `fix: complete Image Studio repairs and validate Video Studio`
- `docs: complete Phase 1 validation and shared asset plan`
- `feat: add shared studio architecture foundations`
- `feat: add MavenSync Hub integration foundation`
- `feat: add MuAPI social publishing foundation`
- `feat: harden design and workflow studio integrations`
