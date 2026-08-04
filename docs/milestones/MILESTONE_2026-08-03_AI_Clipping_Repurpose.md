# Milestone Title

AI Clipping as a Creative Skill + Video Studio Repurpose (Milestone 4 of the Creative OS next phase)

---

## Executive Summary

This milestone proves the complete Creative OS execution path end-to-end with one shared clipping implementation callable from Video Studio, the Command Bar, Agents, and the AI Twin:

```
User intent
  ↓
Intent Router                     ← "repurpose this video", "make youtube shorts", "find the best clips" → repurpose-shorts
  ↓
ai-clipping Skill                 ← registered in the approved Creative Skill Pack (lib/skills)
  ↓
repurposeVideo Recipe             ← RECIPE_LIBRARY, distinct from generic video-transform
  ↓
Creative Intelligence             ← plan() resolves capabilities + routes to a deployment
  ↓
Creative Execution Engine         ← context → job → queue → execute → complete/fail
  ↓
Provider Registry                 ← operation ai_clipping → MuAPI
  ↓
MuAPI runClipping                 ← self-polling transport (maxAttempts 900)
  ↓
Creative Job                      ← canonical job with skill/recipe/provider lineage
  ↓
Creative Assets                   ← one canonical asset per clip (subtype: short-form clip)
  ↓
Campaign                          ← metadata.repurposeJobs + addAsset relationships
  ↓
Publishing                        ← PublishingCenterMVP.createDraftFromAsset
```

No standalone AI Clipping Studio exists. The legacy `ClippingStudio.jsx` is preserved but unused by this path, and its fabricated mock coordinates are never reused. Every caller (Video Studio Repurpose mode, Command Bar intent, Agent runtime, AI Twin) routes through the same `buildRepurposeJob` + `RepurposeRuntime`; the Command Bar only resolves intent and routes context.

---

## Architecture

### Shared repurpose layer (`packages/studio/src/lib/repurpose/`)

- **`RepurposeProvider.js`** — the normalized MuAPI `ai-clipping` contract. Builds the payload (`buildClippingPayload`), normalizes any supported response shape into `{ requestId, sourceVideoUrl, clips[], coordinates[], coordinatesOnly, malformed, providerMetadata }`, validates it, and executes only through the Provider Registry (`executeClippingThroughRegistry`, operation `ai_clipping`). Honesty rules are enforced here:
  - No fabricated fallback highlights, mock coordinates, or scores.
  - Empty provider results surface as an honest empty state.
  - Malformed responses (`clips` present but not an array, clip without a usable URL, non-object) are detected and surfaced as errors — never guessed.
  - Duration is derived only from real start/end times when absent.
  - Useful public provider fields are preserved in `providerMetadata`.
- **`RepurposeJobBuilder.js`** — the single job skeleton (`buildRepurposeJob`) shared by studio / agent / twin / intent. Resolves the `repurposeVideo` recipe, the `ai-clipping` skill, and the provider from recipe config (never chosen by the Command Bar). Carries `twinId`/`twinName`/`agentId`/`agentName`/`campaignId`/`campaignName`/`workspace`/`instruction` plus the full recipe-contract `metadata`. Constants: `REPURPOSE_ASPECT_RATIOS` (`9:16`, `16:9`, `1:1`, `4:5`, `4:3`, `3:4`) and `REPURPOSE_MAX_HIGHLIGHTS` (`60`).
- **`RepurposeRuntime.js`** — orchestrates the real engines: `CreativeIntelligenceEngine.plan()` (capability requirements `video_editing` + `highlight_extraction`), `CreativeExecutionEngine.createExecutionContext/createJob/queue/execute/fail`, an in-memory persistence, and a provider-executor adapter that only calls the Provider Registry. On success it materializes **one canonical Creative Asset per clip** through `createCreativeAsset` (additively extended to persist `metadata` + `subtype`), wraps them in `withCampaignMetadata`, attaches the job id to `campaign.metadata.repurposeJobs` and each clip via `CampaignManager.addAsset`, and records a lightweight history reference.
- **`RepurposeHistory.js`** — `mavensync_repurpose_history`, light references only (jobId/requestId/status/assetIds/coordinatesCount/clipCount). Never stores clip payloads.

### Capability + skill wiring

- `lib/skills/ai-clipping.js` — approved-schema skill manifest (`skillId "ai-clipping"`, name "Short-Form Video Repurposing", `category "video"`, `status "active"`, capabilities incl. long-form analysis / highlight extraction / short-form clipping / aspect-ratio reframing / ranked clip outputs / coordinate-only review / campaign attachment / multi-asset output, `provenance`, honesty constraints). Registered in `SKILL_LIBRARY`.
- `lib/intelligence/config.js` — `repurposeVideo` recipe added to `RECIPE_LIBRARY` (distinct from generic `video-transform`): `promptId plain`, `providerId muapi`, `skillId ai-clipping`, `operation ai_clipping`, `outputModality video`, `outputSubtype short-form clip`, `capabilityRequirements [video_editing, highlight_extraction]`, `inputs`, `outputs`, and lineage `metadata`.
- `lib/intelligence/CapabilityTypes.js` — `CAPABILITIES` gained `long_form_video_analysis` and `highlight_extraction`.
- `lib/intelligence/ProductionCapabilityCatalog.js` — the two new production capabilities + the `muapi-ai-clipping` deployment (provides `video_editing` + the two new capabilities, `operation ai_clipping`, `multiAsset: true`, `maxHighlights: 60`). This lets the **real** `CapabilityRouter` route the recipe instead of failing on "No eligible deployment".
- `lib/providers/MuApiProvider.js` — `execute` maps `ai_clipping → "runClipping"`.

### Engine additive fixes (safe for existing consumers)

- `CreativeExecutionEngine.createJob` now merges caller-supplied `metadata` (so the Creative Job carries `skillId`, `recipeId`, `provider`, `sourceAssetId`, `requestId`, `sourceVideoUrl`, `aspectRatio`, twin/agent/workspace).
- `CreativeExecutionEngine.transition` merges `metadata` instead of replacing it, so queue/start/complete/fail no longer wipe job metadata.
- The generic single-asset path (`createAssetFromExecution`/`AssetMaterializer`) is intentionally untouched — the repurpose runtime implements its own multi-asset materialization over the existing helpers.

### Video Studio Repurpose mode

- `components/repurpose/VideoRepurposePanel.jsx` — a third mode beside Generate/Animate, driven entirely by `buildRepurposeJob` + `createRepurposeRuntime` via the Provider Registry (no direct MuAPI calls in the studio).
  - Source pickers: upload (validated type + 512 MB cap, Provider Registry `uploadFile`), canonical `readCreativeLibrary()` assets, active campaign assets (via `localCampaignManager`), direct URL.
  - Settings: aspect ratio, max highlights (1–60), coordinate-only review, optional guidance.
  - Live job status + elapsed time; clip review grid (preview, title, hook, virality reason, ratio, duration, span, score — only what the provider returned); per-clip Download (`downloadAsset`) and **Add to Publishing** (`PublishingCenterMVP.createDraftFromAsset`).
  - Honest empty state when the provider returns no clips/coordinates; error box for failures; source lineage footer (job, request, provider, recipe, skill, source asset, campaign).
  - No hardcoded/unverified pricing is displayed.
- `components/VideoStudio.jsx` — mounts Repurpose mode (floating toggle + overlay panel), accepts `repurposeTarget`/`onRepurposeTargetHandled`.
- `components/StandaloneShell.js` — `handleCommandNavigate` routes `params.view === 'repurpose'` → `repurposeTarget` → Video Studio tab (already wired this milestone).

### Intent + Command Bar

- `lib/intents/IntentRouter.js` — `repurpose-shorts` retargeted to `recipeId "repurposeVideo"`, `skillIds ["ai-clipping"]`, route `/studio/video`, `tabId video`. Phrase matrix extended: "find the best clips", "turn my webinar into reels", "make reels", "create reels", "reels", "extract the highlights".
- `commandBarRegistry.js` — the INTENT item for repurpose carries `params { view: 'repurpose', recipeId, skillIds }`.

### Agent / AI Twin handoff

- `lib/agents/AgentRuntime.js` — `detectRepurposeRequest` reuses the canonical Intent Router (no duplicated phrase lists); `buildRepurposeInitiation` builds the shared `buildRepurposeJob`; `repurposeGuidanceLines` renders the ready-to-run job. Wired into `buildAgentReply`.
- `components/AiTwinWorkspace.jsx` — `buildTwinReply` uses the same helpers (workspace `ai-twin`).
- Neither the Agent nor the Twin executes clipping: they surface the shared job (recipe/skill/provider/request id) and route the user to Video Studio → Repurpose, the single execution surface.

---

## Files

### Added
- `packages/studio/src/lib/repurpose/RepurposeProvider.js` (+ `.test.js`, 8 tests)
- `packages/studio/src/lib/repurpose/RepurposeJobBuilder.js` (+ `.test.js`, 7 tests)
- `packages/studio/src/lib/repurpose/RepurposeRuntime.js` (+ `.test.js`, 8 tests)
- `packages/studio/src/lib/repurpose/RepurposeHistory.js`
- `packages/studio/src/lib/repurpose/index.js`
- `packages/studio/src/components/repurpose/VideoRepurposePanel.jsx`
- `docs/milestones/MILESTONE_2026-08-03_AI_Clipping_Repurpose.md`

### Modified
- `packages/studio/src/lib/skills/ai-clipping.js`, `lib/skills/index.js` — skill registered.
- `packages/studio/src/lib/intelligence/config.js` — `repurposeVideo` recipe.
- `packages/studio/src/lib/intelligence/CapabilityTypes.js` — two new capabilities.
- `packages/studio/src/lib/intelligence/ProductionCapabilityCatalog.js` — new capabilities + `muapi-ai-clipping` deployment.
- `packages/studio/src/lib/providers/MuApiProvider.js` — `ai_clipping → runClipping`.
- `packages/studio/src/lib/intelligence/CreativeExecutionEngine.js` — metadata merge in `createJob`/`transition` (additive).
- `packages/studio/src/lib/intelligence/CreativeAsset.js` — persists `metadata` + `subtype` (additive; prior milestone).
- `packages/studio/src/lib/intents/IntentRouter.js` (+ `.test.js`) — retarget + phrase matrix.
- `packages/studio/src/commandBarRegistry.js` (+ `.test.js`) — `params { view: 'repurpose' }`.
- `packages/studio/src/components/VideoStudio.jsx` — Repurpose mode mount.
- `packages/studio/src/lib/agents/AgentRuntime.js` (+ `.test.js`), `lib/agents/index.js` — repurpose handoff.
- `packages/studio/src/components/AiTwinWorkspace.jsx` — twin reply handoff.
- `components/StandaloneShell.js` — `repurposeTarget` routing.
- `BUILD_STATUS.md` — milestone entry.

### Untouched (stop conditions)
- `packages/studio/src/components/ClippingStudio.jsx` — preserved; fabricated mocks not reused.
- Generic engine's single-asset `createAssetFromExecution`/`AssetMaterializer` path.
- Publishing Center, Asset Library, Recipe Engine core, Vibe Motion, Recast.

---

## Validation

- `node --test packages/studio/src/lib/repurpose/*.test.js` — **23/23 pass** (payload/defaults/missing-source, string/rich/coords/empty/malformed clip entries, honest empty, providerMetadata preservation, skill registry, recipe contract, distinct-from-generic, intent resolution, job context, CreativeRequest lineage, full multi-asset pipeline, campaign job + assets, coordinate-only, malformed, provider failure, missing source, agent/twin/studio same builder).
- `node --test packages/studio/src/lib/intelligence/*.test.js` — **48/48 pass** (engine metadata merge is additive; no assertion on exact job metadata shape exists).
- `node --test packages/studio/src/**/*.test.js` — **225/225 pass**.
- `npm run build:studio` — clean, 240 files compiled.
- Root `next build` — clean.
- `next lint` remains unconfigured (not a gate).

---

## Limitations

- The generic Creative Execution Engine still emits a single asset per job; the repurpose runtime's multi-asset materialization is bespoke (by design, per audit finding). It reuses canonical asset/campaign helpers.
- Cost is not surfaced (no verified MuAPI pricing) — deliberately absent.
- Clip review and downloads depend on the provider-returned URLs; expired URLs fall back to the standard `downloadAsset` open-URL path.
- The Repurpose panel is the execution surface; Agents/Twins route to it rather than running inline.

---

## Next

- Vibe Motion / Recast (explicitly out of scope for this milestone).
- Removing `ClippingStudio.jsx` once the Repurpose path fully supersedes it (kept per stop condition).
- Surface verified MuAPI clipping pricing when available.
