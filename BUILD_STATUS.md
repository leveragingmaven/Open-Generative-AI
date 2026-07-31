# Creative Studio Build Status

## Current Phase

Phase 4 - MuAPI Social Publishing and Scheduler Foundation

Status: Completed

### Creative OS Studio Entry Point Fix

- Component tree: `/studio` -> `app/studio/[[...slug]]/page.js` -> `StandaloneShell` -> `getInitialTab()` -> `activeTab` -> mounted studio component.
- Root cause: `StandaloneShell.getInitialTab()` initialized the no-slug route to `image`, so `/studio` rendered `ImageStudio`; `AssetLibraryStudio` was already mounted only for the `asset-library` tab.
- Files changed: `components/StandaloneShell.js` and this document.
- Fix: the no-slug Studio entry point now selects the existing `asset-library` tab, which renders the existing Creative OS landing page in `AssetLibraryStudio`. Popstate handling uses the same home fallback.
- Final routing behavior: `/studio` opens Creative OS Home; explicit tab slugs such as `/studio/image`, `/studio/marketing`, and `/studio/workflows` retain their existing studio components. Unknown slugs retain the existing safe fallback to the first visible tab. Agency Mode selection remains unchanged.
- Validation: `npm run build:studio`, repository tests, Creative Intelligence tests, and local `/studio` route smoke testing completed for this fix.
- Remaining navigation issue: none identified for the entry-point change; existing shell navigation and browser history behavior remain in place.

Architecture documentation library established under `docs/architecture/`; `Creative_OS_Architecture_v1.md` remains the authoritative master overview.

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
- Cinema Studio and Image Studio use shared Creative Intelligence recipes for prompt construction.
- Marketing Studio is migrated to the shared `marketing` recipe while preserving its existing MuAPI payload and UI flow.
- Video Studio is migrated to the shared `video` recipe while preserving its T2V, I2V, V2V, extend, and MuAPI request flows.
- DrawModal image editing is migrated to the shared `imageEdit` recipe while preserving its canvas merge, upload, edit payload, history, and callback flow.
- AiInfluencerStudio is migrated to the shared `aiInfluencer` recipe while preserving its option ordering, custom prompt handling, model, aspect ratio, callback, and history flow.
- VibeMotionStudio is migrated to the shared `vibeMotion` recipe while preserving generation, edit_prompt, duration, aspect ratio, history, callback, and MuAPI flows.
- Audio Studio is migrated to the shared `audio` recipe while preserving model-specific parameters, uploads, references, history, callbacks, and MuAPI flow.
- Recast Studio is migrated to the shared `recast` recipe while preserving conditional prompt support, orientation, media inputs, history, callbacks, and MuAPI flow.
- Lip Sync Studio is migrated to the shared `lipSync` recipe while preserving conditional prompt support, image/video modes, audio input, seed, resolution, history, callbacks, and MuAPI flow.
- Video Studio V2V is migrated to the shared `videoTransform` recipe while preserving conditional prompt support, source video, transform parameters, history, callbacks, and MuAPI flow.
- Workflow Studio text inputs are migrated to the shared `workflow` recipe while preserving normalized input shapes and workflow execution behavior.
- Remaining manual prompt construction includes workflow-builder node interpolation/concatenation, legacy `src/components/*` studio paths, DrawModal display labels, and agent workflows.
- Publishing provider boundary exists under `packages/studio/src/lib/publishing`; MuAPI remains the required Creative Studio publishing transport.

### Creative Intelligence Prompt Audit

- Active package studio generation paths now use `buildRecipe()`: Cinema, Image, Marketing, Video T2V/I2V/V2V, Draw/Edit, AI Influencer, Vibe Motion, Audio, Recast, Lip Sync, and Workflow text inputs.
- The active package studio layer contains no remaining local prompt builder or direct prompt construction for ordinary studio generation.
- Provider payload mapping remains intentionally in `packages/studio/src/muapi.js`; it translates recipe output into MuAPI fields and is not prompt authoring.
- Vendored workflow-builder prompt concatenation and dynamic graph interpolation remain because they transform node connections and runtime values, not standalone studio prompts.
- Legacy prompt paths remain under `src/components/*`, `src/lib/promptUtils.js`, and `src/lib/muapi.js` for the separate Electron/Vite application loaded by `src/main.js` and `electron/main.js`. They are not refactored in this audit because that product surface remains independently supported.
- Agent `system_prompt` and Design Agent instruction paths remain owned by their respective agent packages and are outside ordinary Creative Studio generation.
- Remaining technical debt: the active intelligence configuration still imports legacy camera/lens vocabulary from `src/lib/promptUtils.js`, and the legacy desktop surface has no shared-layer bridge.
- Audit validation: `npm run build:studio`, `node --test tests/*.test.js`, and `node --test packages/studio/src/lib/intelligence/PromptBuilder.test.js` passed.
- Files changed in the completion audit: `packages/studio/src/components/AudioStudio.jsx`, `LipSyncStudio.jsx`, `RecastStudio.jsx`, `VibeMotionStudio.jsx`, `VideoStudio.jsx`, `WorkflowStudio.jsx`, `packages/studio/src/lib/intelligence/config.js`, and this document. The studio component changes are the preceding focused migration set retained in the worktree; no additional component behavior was changed by the audit itself.
- Architecture summary: 11 active package studio surfaces now call `buildRecipe()` (`Cinema`, `Image`, `Marketing`, `Video`, `Draw/Edit`, `AI Influencer`, `Vibe Motion`, `Audio`, `Recast`, `Lip Sync`, and `Workflow`). Legacy prompt files remaining are `src/lib/promptUtils.js`, `src/components/ImageStudio.js`, `VideoStudio.js`, `CinemaStudio.js`, `LipSyncStudio.js`, and `src/lib/muapi.js`, all belonging to the separate Electron/Vite surface. Provider expansion is ready at the active studio boundary because studios depend on recipes and the existing provider facade rather than provider-specific prompt construction.
- The active package no longer imports runtime vocabulary or prompt logic from `src/lib/promptUtils.js`; cinematic camera, lens, focal-length, and aperture maps now live in `packages/studio/src/lib/intelligence/vocabulary.js`. The legacy Electron/Vite dependency remains intentionally unchanged for backward compatibility.

### Creative Asset Library Foundation

- Files changed: `CreativeAsset.js`, `AssetCollection.js`, `AssetTags.js`, `CreativeLibrary.js`, `intelligence/index.js`, `CreativeAsset.test.js`, and this document.
- `CreativeAsset` now provides canonical core, generation, creative settings, input, output, organization, metadata, and versioning fields.
- Asset helpers support create, clone, update, serialize, and deserialize operations.
- `CreativeLibrary` remains localStorage-backed and now stores canonical assets while preserving existing read/save/remove exports; update and clone operations are also available.
- Collections and normalized tags are available as local, UI-independent helpers.
- Cloudflare R2, provider logic, and studio UI were not modified.
- Validation: `npm run build:studio`, `node --test tests/*.test.js`, and `node --test packages/studio/src/lib/intelligence/PromptBuilder.test.js` passed; Creative Asset unit tests also pass.
- Known limitation: existing studio histories are not automatically migrated into canonical assets; this foundation adds the model and storage API without changing existing UI flows.

### Platform 1.0 Front-End Integration & Validation

- Asset Library is mounted in the main Studio navigation and exported through the studio package.
- Canonical assets and legacy studio histories are surfaced through `AssetLibraryService` without history migration.
- Search, type/provider/recipe/model/date/favorite/archive filtering, sorting, favorite updates, details metadata, and parent lineage display are wired.
- Loading, empty, and error states are present in the Asset Library workspace.
- Current limitation: legacy-only records remain read-only for repository-backed favorite/archive updates; this preserves the no-migration constraint.
- Validation: studio build, 44 existing tests, and 48 intelligence tests passed.

### Asset Manager Abstraction

- Added `AssetManager.js`, `StorageAdapter.js`, and `LocalStorageAdapter.js` under `packages/studio/src/lib/intelligence`.
- `StorageAdapter` defines `saveAsset`, `updateAsset`, `removeAsset`, `getAsset`, `listAssets`, and `cloneAsset`.
- `LocalStorageAdapter` is the active implementation and owns localStorage serialization/access.
- `AssetManager` owns canonical asset normalization and delegates persistence to the adapter.
- `CreativeLibrary` now uses the default local `AssetManager` while preserving its existing public APIs.
- Future R2, S3, or filesystem adapters can implement `StorageAdapter` without changing studios or `CreativeLibrary`.
- `StorageRegistry` now registers the local adapter under `local`, resolves named adapters, and supplies the default adapter used by `AssetManager`.
- Validation: `npm run build:studio`, `node --test tests/*.test.js`, and intelligence asset/prompt tests passed.

### Phase 2 Campaign Foundation

- Added the provider-agnostic `Campaign` domain model with lifecycle, planning, recipe, organization, approval, metadata, and version fields.
- Added `CampaignAsset` as a lightweight campaign-to-creative-asset relationship without duplicating asset data.
- Added `CampaignStatus` constants for draft, planning, generating, review, approved, queued, completed, and archived states.
- Added `CampaignManager` CRUD, clone, status, and asset relationship helpers.
- Campaign persistence reuses `StorageAdapter` and `StorageRegistry`; `LocalStorageAdapter` stores campaigns under `creative_campaigns` while preserving asset storage behavior.
- Foundation is ready for a future Publishing Queue and Campaign Builder; scheduling, publishing, social APIs, n8n, GHL, R2, and UI are intentionally out of scope.
- Validation: `npm run build:studio`, `node --test tests/*.test.js`, and all intelligence tests passed.

### Phase 2 Campaign Builder Foundation

- Added reusable `CampaignTemplate` definitions for Product Launch, Weekly Content, Authority Building, Course Promotion, Lead Magnet, and Holiday Campaign planning.
- Added provider-agnostic `CampaignPlan` and structured asset requests describing roles, purposes, priorities, references, and metadata.
- Added `CampaignBuilder` helpers for plan creation, request generation, template application, workload estimation, plan updates, and cloning.
- Added `CampaignPlanner` orchestration helpers for building plans, estimating workload, organizing roles, and assigning recipes.
- Planning produces request objects only; it does not generate assets or call providers.
- Foundation is ready for Creative Intelligence generation integration, Campaign Builder UI, and future Publishing Queue work.
- Validation: `npm run build:studio`, `node --test tests/*.test.js`, and all intelligence tests passed.

### Phase 2 Creative Execution Orchestration

- Added `CreativeJob`, `CreativeJobStatus`, `CreativeExecutionPlan`, and `CreativeOrchestrator`.
- Creative Orchestrator converts Campaign Plans into provider-neutral execution jobs, tracks lifecycle state, preserves priority and dependencies, and returns execution summaries.
- Job helpers support pending, queued, running, completed, failed, retrying, and cancelled states.
- Orchestration does not generate assets, call providers, alter MuAPI, or change storage. It prepares jobs for future Provider Registry execution.
- Foundation is ready for Provider execution integration.
- Validation: `npm run build:studio`, `node --test tests/*.test.js`, and all intelligence tests passed.

### Phase 2 Creative Memory Foundation

- Added extensible `CreativeMemory` records supporting brand, voice, audience, offer, product, visual, character, campaign, platform, writing, and approved-claims memory types.
- Added scoped memory, confidence, approval, version, supersession, effective dates, provenance, and metadata fields.
- Added `CreativeMemoryEngine` for create, retrieve, list, update, archive, selective projection, and cache invalidation.
- Added `MemoryRegistry` for extensible memory types, `MemoryStorageAdapter` for local persistence, and `MemoryCache` as an injectable cache seam.
- Creative Memory remains provider-independent and does not modify studios or providers.
- Foundation is ready for Knowledge Engine projection, durable memory storage, approval workflows, and production cache integration.
- Validation: studio build, 44 existing tests, and 14 intelligence tests passed.

### Phase 2 Capability Router Foundation

- Added extensible capability definitions and requirement contracts.
- Added provider-neutral deployment capability metadata registry without modifying the existing Provider Registry.
- Added eligibility filtering for required capabilities, availability, policy allowlists, and input/output constraints.
- Added deterministic scoring, preference weighting, ranked candidates, fallback deployments, and routing explanations.
- Capability Router is selection-only and does not invoke providers, modify studios, or alter MuAPI behavior.
- Foundation is ready for live provider metadata, health/capacity refresh, pricing/evidence ingestion, and Creative Job integration.
- Validation: studio build, 44 existing tests, and 16 intelligence tests passed.

### Phase 2 Creative Intelligence Integration Foundation

- Added provider-neutral `CreativeRequest` and `CreativePlan` planning models.
- Added `RecipeResolver` for recipe selection/compilation without duplicating prompt or provider logic.
- Added `CreativeIntelligenceEngine` to coordinate selective Creative Memory projections, recipe resolution, capability requirements, optional routing, warnings, and plan validation.
- The engine is planning-only and does not invoke providers, create jobs, generate assets, or modify studios.
- Foundation is ready for Creative Job handoff and API boundary integration in the next milestone.
- Validation: studio build, 44 existing tests, and 18 intelligence tests passed.

### Phase 3 Creative Execution Engine Foundation

- Added `ExecutionContext`, `ExecutionAttempt`, execution lifecycle constants, injectable persistence, idempotency, retry, cancellation, and event interfaces.
- Added `CreativeExecutionEngine` to validate Creative Plans, create Creative Jobs, create future provider attempts, transition job state, record results/errors, and expose execution status.
- Provider execution, asset generation/materialization, queues, workers, storage changes, MuAPI, and studio migration remain intentionally out of scope.
- Foundation is ready for the next provider execution milestone.
- Validation: studio build, 44 existing tests, and 20 intelligence tests passed.

### Phase 3 Provider Execution Integration

- Added the provider execution port and registry adapter boundary without modifying existing provider implementations or MuAPI.
- Added normalized execution results for success, warnings, timing, provider/deployment metadata, response references, and output references.
- Added platform-level execution error normalization with retryability classification.
- Creative Execution Engine can now invoke an injected Provider Registry execution contract and update Creative Job/Attempt state; asset materialization remains deferred.
- Validation: studio build, 44 existing tests, and 22 intelligence tests passed.

### Phase 4 Creative Asset Engine & Lineage Foundation

- Added Asset Factory, metadata, reference, relationship, lineage, version, repository, and index abstractions.
- Successful normalized Execution Results can now be materialized into canonical Creative Assets through an injected repository.
- Materialized assets retain execution context, job, plan, recipe, provider, deployment, memory provenance, timestamps, output references, and version lineage without duplicating full execution data.
- Existing Asset Manager/storage adapters and studio histories remain unchanged; object storage, thumbnails, signed delivery, and durable indexing remain future work.
- Validation: studio build, 44 existing tests, and 27 intelligence tests passed.

### Phase 4 Durable Asset Storage & Output Materialization

- Added provider-independent `AssetStorage` contract with in-memory and injected S3-compatible implementations.
- Added `AssetMaterializer` for remote output validation, bounded download, MIME normalization, checksums, deterministic storage keys, delivery references, and per-output partial failure handling.
- Successful outputs can be linked to canonical Creative Assets with storage metadata while preserving provider provenance and lineage.
- No R2 credentials, SDK, browser storage secrets, studio upload behavior, provider logic, or publishing behavior were changed.
- Current R2 readiness: adapter-compatible but not production-activated because the repository has no configured server-side R2 runtime.
- Validation: studio build, 44 existing tests, and 30 intelligence tests passed.

### Phase 5 Image Studio Runtime Migration Foundation

- Added `ImageStudioRuntime.js` as an isolated Creative OS compatibility bridge for Image Studio request normalization and runtime composition.
- The bridge preserves image/text-to-image and image-edit request fields, references, aspect ratio, model, quality settings, and compatibility metadata without changing Image Studio UI or current provider calls.
- Existing Image Studio generation, history, polling, uploads, and callbacks remain unchanged; the bridge is available for controlled runtime adoption and does not alter other studios.
- Runtime limitation: built-in image recipes require production capability/deployment registrations before a live component cutover; current studio execution remains safely backward-compatible.
- Validation: studio build, 44 existing tests, and 33 intelligence tests passed.

### Phase 5 Image Studio Production Runtime Cutover

- Image Studio T2I and I2I branches now submit through `ImageStudioRuntime` when `CREATIVE_OS_IMAGE_STUDIO=true`.
- The runtime path performs Creative Request normalization, Creative Intelligence planning, Capability Router resolution, Creative Job execution, normalized result handling, and optional asset materialization.
- The legacy provider path remains an automatic compatibility fallback when the flag is disabled or runtime execution fails before a usable result.
- Existing Image Studio UI, uploads, history, callbacks, response shape, provider methods, and other studios remain unchanged.
- Remaining direct execution paths are in all non-Image studios and the Image Studio legacy fallback path.
- Validation: studio build, 44 existing tests, and 34 intelligence tests passed.

### Phase 5 Marketing Studio Runtime Migration

- Added `MarketingStudioRuntime.js` as an isolated Creative OS compatibility bridge.
- Marketing Studio now supports feature-flagged Creative OS planning, routing, execution, normalized results, and optional asset materialization.
- `CREATIVE_OS_MARKETING_STUDIO=false` preserves legacy execution; runtime failures before a usable result automatically fall back to the existing Marketing Studio provider path.
- Existing marketing prompts, payload fields, media references, history, callbacks, UI, and other studios remain unchanged.
- Remaining legacy execution paths include all non-migrated studios and the Marketing Studio fallback path.
- Validation: studio build, 44 existing tests, and 38 intelligence tests passed.

### Phase 5 Specialized Studio Runtime Migration

- Added independent runtime adapters and feature flags for Recast, Vibe Motion, and AI Influencer Studio.
- Added flags: `CREATIVE_OS_RECAST_STUDIO`, `CREATIVE_OS_VIBE_MOTION_STUDIO`, and `CREATIVE_OS_AI_INFLUENCER_STUDIO`.
- Recast uses video editing capability requirements; Vibe Motion distinguishes video generation/edit operations; AI Influencer preserves image generation and identity/reference inputs.
- All three studios retain legacy execution as the default and automatic fallback.
- Workflow Studio remains intentionally unmigrated for separate multi-step runtime work.
- Validation: studio build, 44 existing tests, and 42 intelligence tests passed.

### Phase 6 Workflow Execution Engine Foundation

- Added provider-independent workflow nodes, definitions, DAG validation, shared workflow context, and Workflow Execution Engine.
- Initial node types cover image generation/editing, marketing, video generation/editing, audio, lip sync, asset references, decisions, logical delays, and end nodes.
- Engine supports sequential dependencies, conditional branching, shared variables, asset passing, failure propagation, retry hooks, cancellation, partial completion, and injected async-compatible node execution.
- Workflow Studio UI and existing workflow/provider execution paths remain unchanged; this is the future orchestration seam.
- Validation: studio build, 44 existing tests, and 45 intelligence tests passed.

### Phase 5 Media Studio Runtime Migration

- Added feature-flagged Creative OS runtime bridges for Cinema, Video, Lip Sync, and Audio Studio.
- Added flags: `CREATIVE_OS_CINEMA_STUDIO`, `CREATIVE_OS_VIDEO_STUDIO`, `CREATIVE_OS_LIPSYNC_STUDIO`, and `CREATIVE_OS_AUDIO_STUDIO`.
- Each studio preserves its legacy provider path as automatic fallback, including existing payloads, polling, history, callbacks, uploads, and response shapes.
- Runtime capability requirements now cover video generation, video editing, lip sync, voice/audio generation, and image generation/editing recipes.
- Remaining legacy execution paths are the disabled/fallback paths and non-migrated studios; no additional studio migration is included in this milestone.
- Validation: studio build, 44 existing tests, and 40 intelligence tests passed.

### Phase 5 Production Capability Registry

- Added declarative production capability and deployment catalog with extensible operations, feature states, health, limits, supports, quality, speed, cost, licensing, and version metadata.
- Registered MuAPI-backed image generation and image editing deployments for Capability Router resolution.
- Image and image-edit recipes now declare capability requirements without changing studio behavior.
- Capability Router eligibility now respects deployment feature state and health.
- No studios or provider implementations were modified; the catalog enables a future runtime cutover.
- Validation: studio build, 44 existing tests, and 35 intelligence tests passed.

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
