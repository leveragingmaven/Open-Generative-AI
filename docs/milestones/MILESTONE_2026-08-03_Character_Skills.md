# Milestone Title

Character Skills & Character Studio — Recast (Performance Transfer) (Milestone 6 of the Creative OS next phase)

---

## Executive Summary

This milestone establishes the **Character Skills** concept in Creative OS and ships the first Character Skill — **Recast (Performance Transfer)** — as a capability inside a new **Character Studio**. It proves the same execution path as Milestones 4 and 5 with a character-specific twist:

```
User intent
  ↓
Intent Router                     ← "recast this video", "transfer this performance", "create a talking avatar",
  ↓                                 "make my spokesperson talk", "animate my character" → talking-avatar
recast Skill                      ← first registered Character Skill (lib/skills, category Character)
  ↓
performanceTransfer Recipe        ← RECIPE_LIBRARY (operation performance_transfer, outputSubtype "performance transfer")
  ↓
Creative Intelligence             ← plan() resolves 4 capability requirements (performance transfer, identity
  ↓                                 preservation, motion transfer, character consistency)
Creative Execution Engine         ← context → job → queue → execute → complete/fail
  ↓
Provider Registry                 ← operation performance_transfer → MuAPI
  ↓
MuAPI processRecast               ← self-polling transport
  ↓
Creative Job                      ← canonical job with skill/recipe/provider/identity lineage
  ↓
Creative Asset                    ← one canonical asset per transfer (subtype: performance transfer)
  ↓
Campaign                          ← metadata.performanceTransfers + CampaignManager.addAsset
  ↓
Publishing                        ← PublishingCenterMVP.createDraftFromAsset
```

The defining addition over M4/M5 is the **character identity source** (`lib/characters`): Character Studio reuses an **AI Influencer preset persona**, an **AI Twin likeness** (approved candidate / profile-image asset / reference image), or a **temporary upload** — a studio never invents a likeness. The AI Twin contributes Memory/Knowledge/Brand (execution context) while the Character Skill contributes execution.

No standalone Recast app was created. The legacy `RecastStudio.jsx` (Body Swap tab) and `AiInfluencerStudio.jsx` are preserved untouched per the stop condition. Every caller (Character Studio, Command Bar intent, Agent runtime, AI Twin) routes through the same `buildRecastJob` + `createRecastRuntime`; the Command Bar only resolves intent and routes context. Agents and the AI Twin hand off by surfacing the ready job (or routing to Character Studio when the identity image / driving video isn't attached yet) — they never duplicate execution.

---

## Architecture

### Shared character layer (`packages/studio/src/lib/recast/`)

- **`RecastConstants.js`** — `RECAST_SKILL_ID="recast"`, `RECAST_RECIPE_ID="performanceTransfer"`, `RECAST_OPERATION="performance_transfer"`, `RECAST_CAPABILITY="performance_transfer"`, `RECAST_PROVIDER_ID="muapi"`, `RECAST_OUTPUT_SUBTYPE="performance transfer"`. Nobody hardcodes these values.
- **`RecastJobBuilder.js`** — the single job skeleton (`buildRecastJob`) shared by studio / agent / twin / intent, plus `buildRecastRequest` (maps job → Creative Request). **Throws without a character identity image or a driving video** before any provider call. Resolves the `performanceTransfer` recipe, the `recast` skill, and the provider from recipe config (never chosen by the Command Bar). Constants: `RECAST_ASPECT_RATIOS` (`16:9`, `9:16`, `1:1`, `4:5`, `4:3`, `3:4`, `21:9`), `RECAST_DEFAULT_MODEL="kling-v3.0-pro-recast"`. Carries `characterIdentity` (normalized Creative OS identity), `characterImage`, `drivingVideo`, `sourceAssetId`, `twinId`/`twinName`/`agentId`/`agentName`/`campaignId`/`campaignName`/`workspace` plus full recipe-contract `metadata`.
- **`RecastProvider.js`** — the normalized MuAPI `performance-transfer` contract. `buildRecastPayload` maps `characterImage → image_url` and `drivingVideo → video_url` (accepts snake_case aliases), passes through `model`/`aspect_ratio`/`character_orientation`/`prompt` — nothing invented. `normalizeRecastResponse` extracts `request_id`/`id`/`prediction_id` and video from `url`/`video`/`result_url`/`outputs`/`output.video`/`result.outputs`/`data.outputs` (incl. nested objects), flags malformed shapes (`outputs` non-array, provider error string, non-object). `validateRecastResult`:
  - **Honest empty state accepted**: a valid request id with no rendered video is a valid outcome — never fabricate a video.
  - **Malformed fails**: no request id and no video, or wrong-typed fields, fail the job with a clear error — never guessed.
  - Useful public provider fields are preserved in `providerMetadata`.
  - `executeRecastThroughRegistry` routes operation `performance_transfer` through the Provider Registry (never MuAPI directly).
- **`RecastRuntime.js`** — `createRecastRuntime` + `createRecastProviderExecutor`: `CreativeIntelligenceEngine.plan()` with all four capability requirements, `CreativeExecutionEngine.createExecutionContext/createJob/queue/execute/fail`, in-memory persistence, and a provider-executor adapter that only calls the Provider Registry. On success it materializes **one canonical Creative Asset** through `createCreativeAsset` with full lineage (`characterImage`, `characterIdentity`, `drivingVideo`, `sourceAssetId`/`parentSourceAssetId`, `parentJobId`, `model`, `aspectRatio`, `characterOrientation`, `skillId`, `recipeId`, `provider`, `requestId`, `twinId`/`agentId`/`workspace`/`campaignId`/`createdFromStudio`), wraps it in `withCampaignMetadata`, attaches the job via `CampaignManager.addAsset` (role `performance-transfer`, `metadata.performanceTransfers`), and records a lightweight history reference.
- **`RecastHistory.js`** — `mavensync_recast_history` (`RECAST_HISTORY_KEY`), LIMIT 50, light references only (job/request/status/identity/source/assetId/result url). Never stores video payloads.
- **`index.js`** — barrel (constants, job builder, provider, runtime, history).

### Character Identity source (`packages/studio/src/lib/characters/`)

- **`CharacterIdentity.js`** — `CHARACTER_IDENTITY_TYPES` (`influencer` | `twin` | `upload`); `PRESET_INFLUENCERS` (8 consent-driven personas — Priya, Elena, Kai, Sora, Minji, Margot, Niko, Jin — reusing the Marketing Studio avatar persona assets at `https://d3adwkbyhxyrtq.cloudfront.net/web-app/{Name}.webp`); `twinIdentityImageUrl(twin)` (approved candidate → profile-image asset → first asset → first reference image); `characterIdentityFromTwin` (skips twins with no likeness, id `twin-<twinId>`); `characterIdentityFromUpload`; `listCharacterIdentities({ twins, includePresets })` (presets first, then twin likenesses); `resolveCharacterIdentity` (accepts a canonical identity or a bare `{ url }` → temporary upload). Identities are normalized `{ id, type, name, imageUrl, sourceId }`.
- **`index.js`** — barrel.

### Capability + skill wiring

- `lib/skills/recast.js` — first **Character** skill manifest (approved schema): `skillId "recast"`, name "Recast — Performance Transfer", `category "Character"`, `status "active"`, capabilities `["performance transfer", "identity preservation", "motion transfer", "character consistency"]`, `supportedStudios ["character", "video", "agents", "ai-twin"]`, P1/P4/P6, vocabulary (character identity, driving video, character consistency, …), craftGuidance, constraints, evaluationRules (identity fidelity, performance fidelity, honesty, lineage), provenance knowledge-compiler/MavenSync 2026-08-03. Registered in `SKILL_LIBRARY`.
- `lib/intelligence/config.js` — `performanceTransfer` recipe added to `RECIPE_LIBRARY`: `skillId recast`, `providerId muapi`, `operation performance_transfer`, `outputModality video`, `outputSubtype "performance transfer"`, `capabilityRequirements` all four, full `inputs`/`outputs`/`metadata` blocks (incl. `characterImage`, `drivingVideo`, `characterIdentity`, `model`, `aspectRatio`, `characterOrientation`, `prompt`, `sourceAssetId`).
- `lib/intelligence/CapabilityTypes.js` — `CAPABILITIES` gained `PERFORMANCE_TRANSFER`, `IDENTITY_PRESERVATION`, `MOTION_TRANSFER` (`character_consistency` already existed).
- `lib/intelligence/ProductionCapabilityCatalog.js` — the three new production capabilities + the `muapi-performance-transfer` deployment (provides all four incl. `character_consistency` + commercial, `characterOrientation: true`, `maxDrivingSeconds: 30`, `maxReferenceImages: 1`, `logicalModel muapi-recast-catalog`). This lets the **real** `CapabilityRouter` route the recipe instead of failing on "No eligible deployment".
- `lib/providers/MuApiProvider.js` — `execute` maps `performance_transfer → "processRecast"` (the existing `recast → processRecast` mapping is unchanged).

### Character Studio

- `components/character/CharacterStudio.jsx` — the **Character capability hub** in the shell: initial nav lists Performance Transfer (ready) and Talking Avatar / Lip Sync / Character Animation (coming soon, next Character Skills). Consumes the `characterTarget` deep-link (recipe `performanceTransfer` / skill `recast`) and opens the Performance Transfer panel.
- `components/character/CharacterPerformancePanel.jsx` — the Recast execution view, driven entirely by `buildRecastJob` + `createRecastRuntime` via the Provider Registry (no direct MuAPI calls in the studio):
  - **1 · Choose the character identity** — three tabs: **Select Influencer** (grid of the 8 `PRESET_INFLUENCERS`), **Select Character (AI Twin)** (AI Twin likenesses from `listTwins()` → `listCharacterIdentities`), **Upload Temporary Image** (`uploadFile` + `characterIdentityFromUpload`). Future Character Skills reuse the same identity source.
  - **2 · Driving video (the performance)** — upload via Provider Registry or pick from the Creative Library (`readCreativeLibrary()` filtered to video assets).
  - **3 · Model & output** — recast model selector (`recastModels`/`getRecastModelById`), aspect ratio (`getAspectRatiosForRecastModel` filtered), Kling `character_orientation` (image max 10s / video max 30s), optional prompt only when `model.hasPrompt`.
  - Run via the shared runtime; live status + elapsed; result video with **Download** (`downloadAsset`) and **Add to Publishing** (`PublishingCenterMVP.createDraftFromAsset`); **honest empty state** message; lineage footer (job, request, identity, source video, provider, recipe, skill, campaign); recent transfers from `readRecastRuns()`.
- `studioNavigation.js` — new `character` tab (Character Studio) in the Video & Character category (beside body-swap).
- `studio/src/index.js` — exports `CharacterStudio` and `CharacterPerformancePanel`.

### Intent + Command Bar + Shell

- `lib/intents/IntentRouter.js` — `talking-avatar` retargeted to `{ studio: "Character Studio", tabId: "character", route: "/studio/character", recipeId: "performanceTransfer", skillIds: ["recast"] }`; phrase matrix extended with "recast this video", "transfer this performance", "performance transfer", "make my spokesperson talk", "make my spokesperson speak", "spokesperson video", "talking spokesperson", "character animation", "animate my character".
- `commandBarRegistry.js` — the INTENT item for talking-avatar carries `params { view: 'character', recipeId: 'performanceTransfer', skillIds: ['recast'], intent: matchedPhrase }`.
- `components/StandaloneShell.js` — `handleCommandNavigate` routes `params.view === 'character'` → `characterTarget` → Character Studio (and **adds the missing M5 branch** `params.view === 'motion'` → `motionTarget` → Marketing Studio); mounts `<CharacterStudio>` and passes `motionTarget` to `<MarketingStudio>` (which already consumed it in M5).

### Agent / AI Twin handoff

- `lib/agents/AgentRuntime.js` — `detectRecastRequest` reuses the canonical Intent Router (no duplicated phrase lists); `buildRecastInitiation` builds the shared `buildRecastJob` when the identity image and driving video are attached, otherwise returns a `needsMedia` context that routes to Character Studio (with recipe/skill resolved from config); `recastGuidanceLines` renders the ready job or the routing hint. Wired into `buildAgentReply`.
- `components/AiTwinWorkspace.jsx` — `buildTwinReply` uses the same helpers with the **twin's own likeness** (`characterIdentityFromTwin`) as the character identity when it exists.
- Neither the Agent nor the Twin executes recast: they surface the shared job (recipe/skill/provider/request id) or route to Character Studio → Performance Transfer, the single execution surface.

---

## Files

### Added
- `packages/studio/src/lib/recast/RecastConstants.js`
- `packages/studio/src/lib/recast/RecastJobBuilder.js`
- `packages/studio/src/lib/recast/RecastProvider.js` (+ `RecastProvider.test.js`, 15 tests)
- `packages/studio/src/lib/recast/RecastRuntime.js` (+ `RecastRuntime.test.js`, 10 tests)
- `packages/studio/src/lib/recast/RecastHistory.js`
- `packages/studio/src/lib/recast/index.js`
- `packages/studio/src/lib/characters/CharacterIdentity.js` (+ `CharacterIdentity.test.js`, 12 tests)
- `packages/studio/src/lib/characters/index.js`
- `packages/studio/src/components/character/CharacterStudio.jsx`
- `packages/studio/src/components/character/CharacterPerformancePanel.jsx`
- `docs/milestones/MILESTONE_2026-08-03_Character_Skills.md`

### Modified
- `packages/studio/src/lib/skills/recast.js`, `lib/skills/index.js`, `skills.test.js` — first Character skill registered.
- `packages/studio/src/lib/intelligence/config.js` — `performanceTransfer` recipe.
- `packages/studio/src/lib/intelligence/CapabilityTypes.js` — `performance_transfer`, `identity_preservation`, `motion_transfer`.
- `packages/studio/src/lib/intelligence/ProductionCapabilityCatalog.js` — new capabilities + `muapi-performance-transfer` deployment.
- `packages/studio/src/lib/providers/MuApiProvider.js` — `performance_transfer → processRecast`.
- `packages/studio/src/studioNavigation.js` — `character` tab in Video & Character category.
- `packages/studio/src/index.js` — exports `CharacterStudio` / `CharacterPerformancePanel`.
- `packages/studio/src/lib/intents/IntentRouter.js` (+ `.test.js`) — retarget + phrase matrix.
- `packages/studio/src/commandBarRegistry.js` (+ `.test.js`) — `params { view: 'character' }`.
- `packages/studio/src/lib/agents/AgentRuntime.js` (+ `.test.js`), `lib/agents/index.js` — recast handoff.
- `packages/studio/src/components/AiTwinWorkspace.jsx` — twin reply handoff with the twin's own likeness.
- `components/StandaloneShell.js` — `characterTarget` + **missing `motionTarget` branch from M5** + both mounts.
- `BUILD_STATUS.md` — milestone entry.

### Untouched (stop conditions)
- `packages/studio/src/components/RecastStudio.jsx` (Body Swap) and `AiInfluencerStudio.jsx` — preserved; not the execution surface for this capability.
- `SpecializedStudioRuntime.js`, the MuAPI workflow system, generic engine's single-asset path, Publishing Center, Asset Library, Recipe Engine core, Clipping/Repurpose, Vibe Motion.

---

## Validation

- `node --test packages/studio/src/lib/recast/*.test.js` — **25/25 pass** (provider payload/normalize/validate/registry routing 15; runtime full pipeline, honest empty state, malformed/no-requestId/provider-failure paths, shared job identity across studio/agent/twin/command bar, orientation/aspect lineage 10).
- `node --test packages/studio/src/lib/characters/*.test.js` — **12/12 pass** (preset influencers, twin likeness derivation, upload normalization, list/resolve).
- `node --test packages/studio/src/lib/agents/*.test.js` — **17/17 pass** (recast detection/initiation/guidance through the shared builder, needsMedia routing, no duplicated logic).
- `node --test packages/studio/src/**/*.test.js` — **300/300 pass**.
- `npm run build` in `packages/studio` — clean (266 files compiled).
- Root `next build` — clean, no import warnings.
- `next lint` remains unconfigured (not a gate).

---

## Limitations

- The generic Creative Execution Engine still emits a single asset per job; the recast runtime reuses the canonical single-asset materialization (matching the engine's contract) — one canonical performance-transfer asset per transfer.
- Cost/expiry are not surfaced (no verified MuAPI recast pricing); expired result URLs fall back to the standard `downloadAsset` open-URL path.
- The Character Performance Panel is the execution surface; Agents/Twins route to it rather than running inline.
- Lip Sync already exists as a separate legacy tab; Character Studio lists it as a future Character Skill for the consolidated execution path.
- Character identity is a Creative OS identity source only (influencer / twin / upload) — no arbitrary external likeness ingestion beyond uploads.

---

## Next

- **Talking Avatar as the second Character Skill** (same `lib/recast` layer + identity source; new skill manifest, recipe, and panel — "coming soon" today).
- Recast / talking-avatar pricing surfacing when MuAPI provides it.
- Remove legacy `RecastStudio.jsx` once the Character Studio fully supersedes it (kept per stop condition).
