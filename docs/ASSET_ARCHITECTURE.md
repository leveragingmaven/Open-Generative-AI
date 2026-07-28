# Shared Asset Architecture Audit

## Scope

This document describes the asset generation, upload, download, storage, and history architecture that exists today in the Open-Generative-AI repository. It is an audit only. It does not define or implement Cloudflare R2, Creative Library behavior, branding, UI redesign, or feature changes.

## Current Asset Flow

The application currently treats most generated and uploaded assets as hosted URLs plus local metadata. There is no single shared asset record or asset service across all studios.

Main paths:

- `packages/studio/src/components/*Studio.jsx` calls functions from `packages/studio/src/muapi.js`.
- `packages/studio/src/muapi.js` posts jobs to MuAPI, polls for completion, and returns result URLs.
- Studios store recent generated URLs and prompt/model metadata in component state and per-studio `localStorage` keys.
- Uploads in React studios use `uploadFile()` from `packages/studio/src/muapi.js`.
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

### Studio MuAPI Wrapper

`packages/studio/src/muapi.js` is the primary React studio API wrapper.

Responsibilities today:

- Selects the API base URL.
- Uploads files through `/api/v1/upload_file`.
- Submits prediction jobs.
- Polls prediction results through `/api/v1/predictions/{requestId}/result`.
- Wraps image, video, audio, clipping, marketing, lip-sync, recast, motion graphics, apps, balance, workflow, and agent catalog calls.
- Exposes workflow helpers such as `executeWorkflow()`, `pollWorkflowResult()`, `runSingleNode()`, `getNodeStatus()`, and `deleteNodeRun()`.

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
2. Studio calls a wrapper in `packages/studio/src/muapi.js`.
3. `muapi.js` submits to a MuAPI endpoint.
4. The wrapper extracts `request_id` or `id`.
5. The wrapper polls until a result URL is returned.
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

- React studios call `uploadFile(apiKey, file, onProgress)` from `packages/studio/src/muapi.js`, which posts to `/api/v1/upload_file`.
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

## Recommended Future Shared Asset Service

Recommended location:

- `packages/studio/src/services/assetService.js`

Recommended companion hook location if UI state needs to be shared later:

- `packages/studio/src/hooks/useAssetHistory.js`

Recommended responsibility:

- Normalize asset records across studios.
- Provide upload helpers with progress callbacks.
- Provide download helpers for direct URLs, signed URLs, and blob downloads.
- Provide history persistence adapters for local studio history.
- Provide type detection for image/video/audio/generated file URLs.
- Provide thumbnail extraction where appropriate.
- Wrap existing MuAPI, workflow, design-agent, and local inference asset flows through adapters without changing their current endpoint contracts.

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

No functional change should be made during this audit phase. For a later implementation phase, introduce a small shared asset service in `packages/studio/src/services/assetService.js` and migrate one low-risk studio first. The initial service should wrap existing behavior rather than replace endpoints or storage.
