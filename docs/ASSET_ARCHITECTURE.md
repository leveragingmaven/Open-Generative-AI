# Shared Asset Architecture Audit

## Scope

This document describes the asset generation, upload, download, storage, and history architecture that exists today in the Open-Generative-AI repository. It is an audit only. It does not define or implement Cloudflare R2, Creative Library behavior, branding, UI redesign, or feature changes.

## Current Asset Flow

The application currently treats most generated and uploaded assets as hosted URLs plus local metadata. Phase 2 introduced shared package-level adapters for providers, downloads, metadata, storage, history, jobs, and notifications, while preserving existing studio-owned histories and UI flows.

Main paths:

- `packages/studio/src/components/*Studio.jsx` calls the provider facade in `packages/studio/src/lib/providers/ProviderRegistry.js`.
- `packages/studio/src/lib/providers/MuApiProvider.js` wraps the existing MuAPI client in `packages/studio/src/muapi.js`.
- `packages/studio/src/muapi.js` posts jobs to MuAPI, polls for completion, and returns result URLs.
- Studios store recent generated URLs and prompt/model metadata in component state and per-studio `localStorage` keys.
- Uploads in React studios use `uploadFile()` through the provider facade.
- Package studio downloads use `downloadAsset()` from `packages/studio/src/lib/assets/downloadManager.js`.
- Workflow builder nodes store outputs as `resultUrl`, `outputs`, and `outputHistory`.
- Design Agent stores assets against creative-agent sessions using asset labels.
- Agent chat stores conversation history on the backend and performs its own upload/download handling.
- Legacy Electron/Vite components under `src/components` use `src/lib/muapi.js`, `src/lib/uploadHistory.js`, `src/lib/pendingJobs.js`, and `src/lib/localInferenceClient.js`.

## Asset Creation Locations

### Studio Package

- `packages/studio/src/components/ImageStudio.jsx`
  - Generates images through `generateImage()` and `generateI2I()`.
  - Uploads reference images through `uploadFile()`.
  - Stores generated history in `hg_image_studio_persistent`.
- `packages/studio/src/components/CinemaStudio.jsx`
  - Generates images through `generateImage()`.
  - Uploads optional references through `uploadFile()`.
  - Stores generated history in `hg_cinema_studio_persistent`.
- `packages/studio/src/components/AiInfluencerStudio.jsx`
  - Generates images through `generateImage()`.
  - Downloads generated image blobs locally.
- `packages/studio/src/components/VideoStudio.jsx`
  - Generates text-to-video, image-to-video, and video-to-video assets through `generateVideo()`, `generateI2V()`, and `processV2V()`.
  - Uploads image/video references through `uploadFile()`.
  - Stores generated history in `hg_video_studio_persistent`.
- `packages/studio/src/components/ClippingStudio.jsx`
  - Creates clips through `runClipping()`.
  - Uploads source video through `uploadFile()`.
  - Stores persistent state in `hg_clipping_studio_persistent`.
- `packages/studio/src/components/VibeMotionStudio.jsx`
  - Creates and edits motion graphics through `runMotionGraphics()` and `runMotionGraphicsEdit()`.
  - Stores generated history in `hg_vibe_motion_studio_persistent`.
- `packages/studio/src/components/LipSyncStudio.jsx`
  - Creates lip-sync videos through `processLipSync()`.
  - Uploads image, video, and audio inputs through `uploadFile()`.
  - Stores generated history in `hg_lipsync_studio_persistent`.
- `packages/studio/src/components/RecastStudio.jsx`
  - Creates body-swap videos through `processRecast()`.
  - Uploads source video and character images through `uploadFile()`.
  - Stores generated history in `hg_recast_studio_persistent`.
  - Also stores reusable recast assets in `hg_recast_studio_assets`.
- `packages/studio/src/components/MarketingStudio.jsx`
  - Creates marketing videos through `generateMarketingStudioAd()`.
  - Uploads product/avatar/additional images through `uploadFile()`.
  - Stores generated history in `hg_marketing_studio_persistent`.
- `packages/studio/src/components/AudioStudio.jsx`
  - Creates audio through `generateAudio()`.
  - Uploads source/reference audio through `uploadFile()`.
  - Stores generated history in `hg_audio_studio_persistent`.
- `packages/studio/src/components/DrawModal.jsx`
  - Creates an image edit source by exporting the canvas to a blob, uploading it through `uploadFile()`, then submitting it through `generateI2I()`.
- `packages/studio/src/components/DesignAgentStudio.jsx`
  - Hosts the design-agent package and syncs the API key into browser storage for that package.
- `packages/studio/src/components/WorkflowStudio.jsx`
  - Hosts workflow browsing and workflow execution entry points through shared MuAPI workflow wrappers.

### Workflow Builder

- `packages/Vibe-Workflow/packages/workflow-builder/src/components/UploadNode.jsx`
  - Uploads image, video, and audio files through `/api/app/get_file_upload_url`.
  - Stores uploaded URLs in node form values and exposes them as `outputs` and `resultUrl`.
- `packages/Vibe-Workflow/packages/workflow-builder/src/components/ImageNode.jsx`
  - Generates image outputs, polls node status, stores `outputHistory`, and renders image results.
- `packages/Vibe-Workflow/packages/workflow-builder/src/components/VideoNode.jsx`
  - Generates video outputs, polls node status, stores `outputHistory`, and renders video results.
- `packages/Vibe-Workflow/packages/workflow-builder/src/components/AudioNode.jsx`
  - Generates audio outputs, polls node status, stores `outputHistory`, and renders audio results.
- `packages/Vibe-Workflow/packages/workflow-builder/src/components/ApiNode.jsx`
  - Runs general API nodes, polls node status, stores `outputHistory`, and renders output URLs.
- `packages/Vibe-Workflow/packages/workflow-builder/src/components/VideoCombiner.jsx`
  - Generates combined video outputs, polls node status, and stores `outputHistory`.
- `packages/Vibe-Workflow/packages/workflow-builder/src/components/NodeFlow.jsx`
  - Maps backend workflow data into node `resultUrl`, `outputs`, and `outputHistory`.
  - Propagates upstream node result URLs into downstream node fields.
- `packages/Vibe-Workflow/packages/workflow-builder/src/components/utility.jsx`
  - Provides model catalogs and workflow-level `downloadFile()`.

### Design Agent

- `packages/Open-AI-Design-Agent/packages/design-agent/src/CreativeCanvas.jsx`
  - Loads session messages from `/sessions/{sessionId}/messages`.
  - Loads session assets from `/sessions/{sessionId}/assets`.
  - Uploads files by requesting `/api/v1/get_upload_url`, posting binary data to `/api/v1/upload-binary`, deriving the CDN URL, then registering the asset with the creative-agent session.
  - Tracks uploaded attachments as `{ asset_label, url, kind }`.
  - Polls active jobs and appends resulting assets to session state.
- `packages/Open-AI-Design-Agent/packages/design-agent/src/CanvasArea.jsx`
  - Downloads selected image/video/audio assets by fetching blobs and using `URL.createObjectURL()`.
  - Exports individual canvas nodes and full canvas snapshots as local downloaded files.

### Agent Chat

- `packages/Open-Poe-AI/packages/agents/src/AiAgent.jsx`
  - Loads and hydrates backend conversation history.
  - Stores first-message handoff in `sessionStorage` as `pending_first_msg`.
  - Uploads image attachments through `/api/app/get_file_upload_url` and signed form upload.
  - Submits agent jobs and polls `/api/api/v1/predictions/{request_id}/result`.
  - Downloads generated media by requesting `/api/workflow/cloudfront-signed-url`, fetching the signed URL as a blob, and creating a local object URL.
- `packages/Open-Poe-AI/packages/agents/src/components/EditAgent.jsx`
  - Uploads agent icons through `/api/app/get_file_upload_url`.
  - Generates icons through a MuAPI image endpoint.

### Legacy Electron/Vite Components

- `src/components/UploadPicker.js`
  - Shared legacy upload picker.
  - Uses `src/lib/uploadHistory.js` to persist recent uploads in `muapi_uploads`.
  - Uses `generateThumbnail()` to create base64 JPEG thumbnails from uploaded image files.
- `src/components/VideoStudio.js`, `src/components/CinemaStudio.js`, and `src/components/LipSyncStudio.js`
  - DOM-built legacy studios with local history sidebars, direct downloads, and pending job recovery.
- `src/components/LocalModelManager.js`
  - Downloads local inference binaries, auxiliary files, and model files through `src/lib/localInferenceClient.js`.

## Shared Services

### Studio Provider Facade

`packages/studio/src/lib/providers/ProviderRegistry.js` is the current React studio provider entry point. It exposes the same generation, upload, workflow, agent, app, and balance functions used by existing studios, and delegates the implemented provider to `packages/studio/src/lib/providers/MuApiProvider.js`.

`packages/studio/src/muapi.js` remains the MuAPI transport wrapper.

Responsibilities today:

- Selects the API base URL.
- Uploads files through `/api/v1/upload_file`.
- Submits prediction jobs.
- Polls prediction results through `/api/v1/predictions/{requestId}/result`.
- Wraps image, video, audio, clipping, marketing, lip-sync, recast, motion graphics, apps, balance, workflow, and agent catalog calls.
- Exposes workflow helpers such as `executeWorkflow()`, `pollWorkflowResult()`, `runSingleNode()`, `getNodeStatus()`, and `deleteNodeRun()`.

### Implemented Shared Package Modules

- `packages/studio/src/lib/providers/`
  - `CreativeProvider.js` defines the base provider contract.
  - `MuApiProvider.js` implements the current MuAPI-backed provider.
  - `ProviderRegistry.js` owns provider registration, active provider lookup, and backward-compatible facade exports.
  - `providerTypes.js` defines provider identifiers, capability names, and response normalization helpers.
- `packages/studio/src/lib/assets/`
  - `downloadManager.js` centralizes fetch-as-Blob downloads and safe open-in-new-tab fallback behavior.
  - `metadataManager.js` centralizes asset kind detection and filename creation.
  - `storageManager.js` wraps JSON localStorage reads and writes.
  - `historyManager.js` wraps local history read/write/prepend/remove operations.
  - `assetManager.js` re-exports the shared asset utilities.
- `packages/studio/src/lib/jobs/`
  - `jobTypes.js` normalizes job statuses and provider job responses.
  - `polling.js` provides reusable polling with timeout and cancellation support.
  - `jobManager.js` creates cancellable local job records and emits status updates.
- `packages/studio/src/lib/notifications/notify.js`
  - Provides `success`, `error`, `warning`, and `progress` wrappers without changing the current notification UI.

### Root MuAPI Wrapper

`src/lib/muapi.js` is the legacy/Electron-oriented client. It includes generation, upload, and polling behavior used by DOM-built studios under `src/components`.

### Upload Proxy Services

- `app/api/app/[[...path]]/route.js`
  - Proxies MuAPI `/app/*` calls.
  - Rewrites `get_file_upload_url` responses so uploads post to local `/api/upload-binary`.
  - Adds `x-proxy-target-url` to form fields.
- `app/api/v1/get_upload_url/route.js`
  - Requests MuAPI upload signing data from `/app/get_file_upload_url`.
- `app/api/upload-binary/route.js`
  - Posts multipart upload forms to the validated signed target.
- `app/api/v1/upload-binary/route.js`
  - Same upload proxy pattern for the design-agent path.
- `src/lib/uploadProxyTarget.js`
  - Validates signed upload targets before proxying binary data.

### History And Pending State

- `src/lib/uploadHistory.js`
  - Persists recent legacy uploads under `muapi_uploads`.
  - Generates thumbnail data URLs for image uploads.
- `src/lib/pendingJobs.js`
  - Persists pending async jobs under `muapi_pending_jobs`.
  - Used by legacy DOM-built studios for recovery.
- React studios under `packages/studio/src/components` mostly maintain their own `localStorage` persistence keys and do not share a history service.
- Workflow builder history comes from backend run history and node-local `outputHistory`.
- Design Agent history and assets are session-backed through creative-agent APIs.

### Local Inference Services

- `src/lib/localInferenceClient.js`
  - Wraps Electron `window.localAI`.
  - Downloads local inference binaries, models, and auxiliary files.
  - Uploads files to a configured Wan2GP server.
  - Runs and cancels local generation.
  - Subscribes to local generation/download progress events.

## Generation Flow

Current React studio generation flow:

1. Studio component collects prompt, model, uploaded URLs, and options.
2. Studio calls the provider facade in `packages/studio/src/lib/providers/ProviderRegistry.js`.
3. The active MuAPI provider delegates to `packages/studio/src/muapi.js`.
4. `muapi.js` submits to a MuAPI endpoint.
5. The wrapper extracts `request_id` or `id` and polls until a result URL is returned.
6. The studio creates a local history entry with the result URL and metadata.
7. The studio renders the asset and exposes local download/delete controls.

Workflow generation flow:

1. Node component submits a node run.
2. Node component polls node status.
3. Completed output is normalized into `outputs`, `resultUrl`, and `outputHistory`.
4. `NodeFlow.jsx` propagates selected output URLs to connected downstream nodes.

Design-agent generation flow:

1. `CreativeCanvas.jsx` sends user instructions and attachment labels to the creative-agent session.
2. The package polls or resumes active jobs.
3. Resulting assets are loaded through the session assets endpoint.
4. Canvas components render assets by URL and asset label.

Agent chat generation flow:

1. `AiAgent.jsx` submits a request to an agent endpoint.
2. It polls the prediction result endpoint directly.
3. Conversation history is loaded from backend state.
4. Generated media parts can be downloaded through a signed URL flow.

## Upload Flow

Current upload flows are not unified.

- React studios call `uploadFile(apiKey, file, onProgress)` through `packages/studio/src/lib/providers/ProviderRegistry.js`, which delegates to the MuAPI provider and posts to `/api/v1/upload_file`.
- Workflow `UploadNode.jsx` requests `/api/app/get_file_upload_url`, posts the returned form fields to the returned upload URL, and derives `https://cdn.muapi.ai/{fields.key}`.
- Design Agent requests `/api/v1/get_upload_url`, posts to `/api/v1/upload-binary`, derives `https://cdn.muapi.ai/{fields.key}`, then registers the URL as a session asset.
- Agent chat and agent editing request `/api/app/get_file_upload_url`, post form data, and derive `https://cdn.muapi.ai/{fields.key}`.
- Legacy `UploadPicker.js` delegates actual upload to a passed `uploadFn` or `src/lib/muapi.js`.
- Local Wan2GP uploads go through Electron IPC via `src/lib/localInferenceClient.js`.

## Download Flow

Download logic is duplicated.

- `ImageStudio.jsx`, `VideoStudio.jsx`, `MarketingStudio.jsx`, `VibeMotionStudio.jsx`, `LipSyncStudio.jsx`, `RecastStudio.jsx`, `AudioStudio.jsx`, `CinemaStudio.jsx`, and `AiInfluencerStudio.jsx` include local blob-download helpers or inline download logic.
- `packages/Vibe-Workflow/packages/workflow-builder/src/components/utility.jsx` exports a separate `downloadFile()` that first requests `/api/workflow/cloudfront-signed-url`.
- `AiAgent.jsx` has its own signed URL and blob download path.
- `CanvasArea.jsx` has direct blob downloads plus fallback-to-new-tab behavior when CORS blocks direct blob fetching.

## History Flow

History is split by product area.

- React studios keep recent generated assets in component state and per-studio `localStorage` persistence keys.
- Legacy upload history uses `muapi_uploads`.
- Legacy pending async jobs use `muapi_pending_jobs`.
- Legacy DOM-built studio histories use keys such as `video_history`, `cinema_history`, and `lipsync_history`.
- Workflow builder stores node outputs in backend run history and maps it to node `outputHistory`.
- Design Agent stores conversation messages and session assets through creative-agent endpoints.
- Agent chat stores conversation history through backend agent endpoints and temporary first-message handoff in `sessionStorage`.

## Known Duplication

- Upload handling is duplicated across React studios, workflow upload nodes, design-agent uploads, agent chat uploads, and legacy upload picker code.
- Download buttons and blob download helpers are repeated in multiple studios and packages.
- Per-studio `localStorage` history load/save logic is repeated across Image, Video, Cinema, Audio, Marketing, Lip Sync, Recast, Clipping, and Vibe Motion.
- Output history UI patterns are repeated in workflow Image, Video, Audio, API, and Video Combiner nodes.
- Polling exists in `packages/studio/src/muapi.js`, `src/lib/muapi.js`, workflow nodes, design-agent jobs, and agent chat.
- Loading, progress, and error states are implemented independently in each studio.
- Asset rendering is split across direct `<img>`, `<video>`, `<audio>`, custom players, canvas nodes, and workflow-specific players without a shared asset model.
- Uploaded/generated assets are represented inconsistently as plain URLs, `{ url }`, `{ id, url, prompt }`, workflow `outputs`, design-agent `{ asset_label, url, kind }`, and agent message parts.

## Implemented Shared Asset Service Boundary

Implemented location:

- `packages/studio/src/lib/assets/assetManager.js`

Implemented companion modules:

- `packages/studio/src/lib/assets/downloadManager.js`
- `packages/studio/src/lib/assets/historyManager.js`
- `packages/studio/src/lib/assets/storageManager.js`
- `packages/studio/src/lib/assets/metadataManager.js`

Current responsibility:

- Provide download helpers for direct URL Blob downloads and fallback opening.
- Provide type detection for image/video/audio/generated file URLs.
- Provide local history persistence adapters that preserve existing per-studio storage keys.
- Provide JSON storage helpers and filename helpers.

Upload execution remains provider-owned in this increment so existing endpoint contracts and progress behavior are preserved.

This service should not own UI rendering. Components should continue to decide how to present assets.

## Future Creative Library Integration Points

Potential integration points, based on current data flow:

- Immediately after a React studio receives a completed result URL and before or during insertion into per-studio local history.
- Immediately after `uploadFile()` succeeds in React studios.
- After workflow nodes append to `outputHistory` in Image, Video, Audio, API, and Video Combiner nodes.
- In `NodeFlow.jsx` where backend run history is mapped into node `outputHistory`.
- After Design Agent registers uploaded assets through `/sessions/{sessionId}/assets`.
- When Design Agent loads session assets through `loadAssets()`.
- When Agent chat hydrates generated media parts from conversation history.
- When Agent chat and Edit Agent complete file uploads through `/api/app/get_file_upload_url`.
- When legacy `UploadPicker.js` calls `saveUpload()`.
- When legacy DOM-built studios append generation history.

Current dependencies any future Creative Library integration would need to respect:

- API key header and cookie behavior in `components/StandaloneShell.js` and proxy routes.
- Existing MuAPI URL result shapes.
- Workflow `resultUrl`, `outputs`, and `outputHistory` shapes.
- Design-agent session and asset-label model.
- Agent message part and signed download URL flow.
- Existing localStorage histories until migration is intentionally designed.

## Technical Debt Discovered

- There is no single normalized `AssetRecord` type.
- Uploads use multiple endpoint styles and progress implementations.
- Downloads use multiple signing, fetch, blob, and fallback patterns.
- History persistence is mostly component-owned and not portable.
- Polling is duplicated across product areas.
- Generated assets are not consistently distinguishable from uploaded assets.
- Deletion usually removes local history entries only; it does not imply remote asset deletion.
- Legacy DOM-built studios and React package studios have parallel asset implementations.
- Design Agent already has a richer session asset model, but it is isolated from the general studio package.

## Current Recommendation

The Phase 2 foundation now exists under `packages/studio/src/lib`. Future work should continue incremental migration behind these modules rather than introducing parallel service paths. Provider migration is complete for package studio component imports; asset history, signed upload adapters, workflow package downloads, agent package downloads, and Design Agent canvas downloads remain intentionally unmigrated to avoid changing behavior outside the studio package surface.

## Phase 1 Shared Asset Architecture Plan

This section began as a planning section. Phase 2 implemented the package-level foundation described below without redesigning studio UI or changing generation workflows.

### Duplicated Download Logic

Confirmed duplicated download helpers:

- `packages/studio/src/components/ImageStudio.jsx` uses `downloadImage()`.
- `packages/studio/src/components/VideoStudio.jsx` uses local `downloadFile()`.
- `packages/studio/src/components/CinemaStudio.jsx` includes local Blob download logic.
- `packages/studio/src/components/AiInfluencerStudio.jsx` includes local Blob download logic.
- `packages/studio/src/components/AudioStudio.jsx` includes local Blob download logic.
- `packages/studio/src/components/MarketingStudio.jsx` uses local `downloadFile()`.
- `packages/studio/src/components/VibeMotionStudio.jsx` uses local `downloadFile()`.
- `packages/studio/src/components/LipSyncStudio.jsx` uses local `downloadFile()`.
- `packages/studio/src/components/RecastStudio.jsx` uses local `downloadFile()`.
- `packages/Vibe-Workflow/packages/workflow-builder/src/components/utility.jsx` exports a workflow-specific signed URL download helper.
- `packages/Open-Poe-AI/packages/agents/src/AiAgent.jsx` has an agent-specific signed URL download helper.
- `packages/Open-AI-Design-Agent/packages/design-agent/src/CanvasArea.jsx` has direct Blob download and canvas export logic.
- Legacy `src/components/*Studio.js` files include parallel Blob download helpers.

Implemented:

1. Created `downloadAsset()` in `packages/studio/src/lib/assets/downloadManager.js`.
2. Migrated package studio download helpers in Image, Video, Cinema, AI Influencer, Audio, Marketing, Vibe Motion, Lip Sync, Recast, and AI Clipping.
3. Kept workflow signed downloads, agent signed downloads, Design Agent canvas exports, and legacy DOM-built studio downloads separate because their endpoint and canvas behaviors differ.

### Duplicated History And Storage Logic

Confirmed per-studio persistence keys:

- `hg_image_studio_persistent`
- `hg_cinema_studio_persistent`
- `hg_video_studio_persistent`
- `hg_clipping_studio_persistent`
- `hg_vibe_motion_studio_persistent`
- `hg_lipsync_studio_persistent`
- `hg_recast_studio_persistent`
- `hg_recast_studio_assets`
- `hg_marketing_studio_persistent`
- `hg_audio_studio_persistent`

Additional storage paths:

- `muapi_uploads` in `src/lib/uploadHistory.js`.
- `muapi_pending_jobs` in `src/lib/pendingJobs.js`.
- Legacy `muapi_history`, `video_history`, `cinema_history`, and `lipsync_history`.
- Design Agent session assets and messages through backend creative-agent APIs.
- Agent chat conversation history through backend agent APIs.
- Workflow node history through backend run history mapped to `outputHistory`.

Implemented:

1. Added shared metadata normalization helpers with `id`, `url`, `kind`, `source`, `studio`, `prompt`, `model`, `createdAt`, and optional raw provider metadata.
2. Added a local history adapter that wraps existing localStorage keys without migrating data immediately.
3. Left workflow `outputHistory`, design-agent `{ asset_label, url, kind }`, and agent message parts unmigrated.
4. Preserved existing remote deletion semantics; deleting local history still does not imply remote asset deletion.

### Duplicated Upload Logic

Confirmed upload paths:

- React studios call `uploadFile(apiKey, file, onProgress)` through `packages/studio/src/lib/providers/ProviderRegistry.js`.
- Workflow `UploadNode.jsx` requests `/api/app/get_file_upload_url` and posts signed form data.
- Design Agent requests `/api/v1/get_upload_url`, posts through `/api/v1/upload-binary`, then registers session assets.
- Agent chat and agent editing request `/api/app/get_file_upload_url` and post signed form data.
- Legacy `UploadPicker.js` accepts a custom `uploadFn` and persists upload history.
- Local Wan2GP uploads go through Electron IPC in `src/lib/localInferenceClient.js`.

Implemented:

1. MuAPI uploads now route through the provider facade.
2. Signed upload, design-agent registered upload, agent upload, and local Wan2GP upload paths remain separate adapters to be migrated only with focused validation.
3. Paid upload execution remains behind explicit user actions.

### Duplicated Provider Logic

Confirmed provider duplication:

- Image Studio defines provider logos, provider filtering, provider labels, and model dropdown behavior locally.
- Video Studio defines a parallel provider logo/filter/model dropdown path.
- Local inference provider routing exists separately in `src/lib/localModels.js` and `src/lib/localInferenceClient.js`.
- Workflow model provider data is embedded in workflow utility model catalogs.

Implemented:

1. Added shared provider registry and provider capability metadata.
2. Implemented MuAPI as the active provider.
3. Kept model catalogs and UI provider display behavior unchanged.
4. Kept local inference provider routing separate because it controls local execution, not only display metadata.

### Proposed Module Boundaries

Implemented modules:

- `packages/studio/src/lib/assets/assetManager.js`
  - Asset utility barrel.
- `packages/studio/src/lib/assets/downloadManager.js`
  - Direct URL Blob downloads and fallback opening.
- `packages/studio/src/lib/assets/historyManager.js`
  - Local history load/save/prepend/remove helpers.
- `packages/studio/src/lib/assets/storageManager.js`
  - JSON localStorage helpers.
- `packages/studio/src/lib/assets/metadataManager.js`
  - Asset kind and filename helpers.
- `packages/studio/src/lib/providers/ProviderRegistry.js`
  - Provider registration and backward-compatible studio API facade.
- `packages/studio/src/lib/providers/MuApiProvider.js`
  - MuAPI provider implementation.
- `packages/studio/src/lib/jobs/jobManager.js`
  - Reusable async job records, cancellation, and subscriptions.
- `packages/studio/src/lib/notifications/notify.js`
  - Notification wrapper facade.

### Migration Order

1. Completed: provider registry facade for package studio API calls.
2. Completed: shared direct URL download helper and package studio migration.
3. Completed: local storage/history/metadata helper modules.
4. Completed: reusable job manager foundation.
5. Completed: notification wrapper foundation.
6. Remaining: migrate workflow, agent, design-agent, and legacy package paths only with focused validation.
