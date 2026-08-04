# Milestone Title

Vibe Motion as Workflow Templates (Milestone 5 of the Creative OS next phase)

---

## Executive Summary

This milestone proves the second Creative OS execution pattern — **Workflow Template → Creative Skill → Recipe → Creative Intelligence → Creative Execution → Provider Registry → Provider → Creative Job → Creative Asset → Campaign → Publishing** — for Motion Graphics as a capability inside Marketing Studio. It mirrors the shipped Milestone 4 (AI Clipping) architecture with one shared motion implementation callable from Marketing Studio, the Command Bar, Agents, and the AI Twin:

```
User intent
  ↓
Intent Router                     ← "animate my logo", "create motion graphics", "build a countdown" → motion-graphics
  ↓
vibe-motion Skill                 ← registered in the approved Creative Skill Pack (lib/skills)
  ↓
motionGraphics Recipe             ← RECIPE_LIBRARY (operation motion_graphics, outputSubtype "motion graphic")
  ↓
Workflow Template Library         ← 10 canonical templates (logo-reveal … promo-intro), shared defaults
  ↓
Creative Intelligence             ← plan() resolves capabilities + routes to a deployment
  ↓
Creative Execution Engine         ← context → job → queue → execute → complete/fail
  ↓
Provider Registry                 ← operation motion_graphics → MuAPI
  ↓
MuAPI runMotionGraphics           ← self-polling transport (maxAttempts 900)
  ↓
Creative Job                      ← canonical job with skill/recipe/provider/template lineage
  ↓
Creative Asset                    ← one canonical asset per render (subtype: motion graphic)
  ↓
Campaign                          ← metadata.parentJobId + CampaignManager.addAsset relationships
  ↓
Publishing                        ← PublishingCenterMVP.createDraftFromAsset
```

No standalone Motion Studio was created; the legacy `VibeMotionStudio.jsx` and the separate MuAPI workflow system are preserved untouched. Every caller (Marketing Studio Motion Graphics view, Command Bar intent, Agent runtime, AI Twin) routes through the same `buildMotionJob` + `createMotionGraphicsRuntime`; the Command Bar only resolves intent and routes context.

---

## Architecture

### Shared motion layer (`packages/studio/src/lib/motion/`)

- **`MotionConstants.js`** — `MOTION_SKILL_ID="vibe-motion"`, `MOTION_RECIPE_ID="motionGraphics"`, `MOTION_OPERATION="motion_graphics"`, `MOTION_EDIT_OPERATION="motion_graphics_edit"`, `MOTION_CAPABILITY="motion_graphics"`, `MOTION_PROVIDER_ID="muapi"`, `MOTION_OUTPUT_SUBTYPE="motion graphic"`.
- **`templates.js`** — the **Workflow Template Library**: exactly ten canonical templates (`logo-reveal`, `countdown-timer`, `sales-dashboard`, `animated-quote`, `product-spotlight`, `social-announcement`, `lower-third`, `statistics-animation`, `call-to-action`, `promo-intro`). Each template declares `templateId`/`title`/`description`/`category`/`inputs` (label + type + required + default + description)/`defaultDurationSeconds`/`defaultAspectRatio`/`recommendedProvider("muapi")`/`requiredSkills(["vibe-motion"])`/`supportedRecipes(["motionGraphics"])`. Helpers: `getWorkflowTemplate`, `listWorkflowTemplates({category})`, `resolveTemplateDefaults`. `BRAND_COLORS_DEFAULT = ["#22d3ee","#a855f7","#f43f5e","#ffffff"]`.
- **`MotionJobBuilder.js`** — the single job skeleton (`buildMotionJob`) shared by studio / agent / twin / intent, plus `buildMotionRequest` (maps job → Creative Request). Resolves the `motionGraphics` recipe, the `vibe-motion` skill, and the provider from recipe config (never chosen by the Command Bar). **`buildMotionJob` throws on an unknown template id** before any provider call. Constants: `MOTION_ASPECT_RATIOS` (`16:9`, `9:16`, `1:1`, `4:5`, `3:4`, `21:9`). Carries `twinId`/`twinName`/`agentId`/`agentName`/`campaignId`/`campaignName`/`workspace` plus full recipe-contract `metadata`. `detectMotionTemplate(text)` maps free text to a template id (logo → `logo-reveal`, countdown, chart/revenue → `sales-dashboard`, quote, statistic, intro, etc.).
- **`MotionProvider.js`** — the normalized MuAPI `motion-graphics` contract. `buildMotionPrompt` (template description + text/attribution/colors/dataPoints/countdown/images + optional user refinement), `buildMotionPayload`, `buildMotionEditPayload` (throws without a `sourceRequestId`), `normalizeMotionResponse` (extracts `url`/`outputs`/`output.video` incl. nested objects, `preview`, `providerMetadata`; flags malformed shapes), `validateMotionResult`, and `executeMotionThroughRegistry` / `executeMotionEditThroughRegistry` (registry-only, operations `motion_graphics` / `motion_graphics_edit`). Honesty rules are enforced here:
  - No fabricated renders. Empty-but-valid provider results (a `requestId` with no video) surface as an **honest empty state** — `validateMotionResult` accepts them.
  - Malformed responses (`outputs` non-array, provider error string, no `requestId` and no video) fail the job with a clear error — never guessed.
  - Useful public provider fields are preserved in `providerMetadata`.
- **`MotionGraphicsRuntime.js`** — orchestrates the real engines: `createMotionGraphicsRuntime` runs `CreativeIntelligenceEngine.plan()` (capability requirement `motion_graphics`), `CreativeExecutionEngine.createExecutionContext/createJob/queue/execute/fail`, an in-memory persistence, and a provider-executor adapter (`createMotionProviderExecutor`) that only calls the Provider Registry and composes the edit payload when a `sourceRequestId` is present. On success it materializes **one canonical Creative Asset** through `createCreativeAsset` with lineage metadata (`templateId`, `skillId`, `recipeId`, `provider`, `durationSeconds`, `aspectRatio`, `campaignId`, `parentJobId`, plus `twinId`/`agentId`/`workspace`/`requestId`/`sourceRequestId`/`createdFromStudio`), wraps it in `withCampaignMetadata`, attaches the job via `CampaignManager.addAsset`, and records a lightweight history reference.
- **`MotionHistory.js`** — `mavensync_motion_history` (`MOTION_HISTORY_KEY`), light references only (job/request/status/assetId/result url/duration). Never stores video payloads.
- **`index.js`** — barrel (constants, templates, job builder, provider, runtime, history, `detectMotionTemplate`).

### Capability + skill wiring

- `lib/skills/vibe-motion.js` — approved-schema skill manifest (`skillId "vibe-motion"`, name "Vibe Motion", `category "motion graphics"`, `status "active"`, 8 capabilities incl. brand-animated logos / animated lower thirds / countdown timers / animated data & statistics / kinetic-typography quotes / product motion / intro & outro animations / social announcement videos, `supportedStudios` marketing/video/agents/ai-twin, priority P1/P4/P6, `provenance` knowledge-compiler/MavenSync 2026-08-03, honesty constraints). Registered in `SKILL_LIBRARY`.
- `lib/intelligence/config.js` — `motionGraphics` recipe added to `RECIPE_LIBRARY`: `skillId vibe-motion`, `providerId muapi`, `operation motion_graphics`, `outputModality video`, `outputSubtype "motion graphic"`, `capabilityRequirements [motion_graphics]`, full `inputs`/`outputs`/`metadata` blocks.
- `lib/intelligence/CapabilityTypes.js` — `CAPABILITIES` gained `MOTION_GRAPHICS` and `MOTION_GRAPHICS_EDIT`.
- `lib/intelligence/ProductionCapabilityCatalog.js` — the two new production capabilities + the `muapi-motion-graphics` deployment (provides `motion_graphics`, `operation motion_graphics`, inputs text/image, outputs video, `edit: true`, `maxDurationSeconds: 30`, commercial). This lets the **real** `CapabilityRouter` route the recipe instead of failing on "No eligible deployment".
- `lib/providers/MuApiProvider.js` — `execute` maps `motion_graphics → "runMotionGraphics"` and `motion_graphics_edit → "runMotionGraphicsEdit"` (replacing only the overloaded `video_editing` coupling for motion; `ai_clipping → runClipping` unchanged).

### Marketing Studio Motion Graphics view

- `components/motion/MarketingMotionPanel.jsx` — a capability view inside Marketing Studio, driven entirely by `buildMotionJob` + `createMotionGraphicsRuntime` via the Provider Registry (no direct MuAPI calls in the studio).
  - Template picker grid from the Workflow Template Library; template inputs (text, brand colors default, duration slider, aspect ratio, optional prompt); logo + reference uploads (Provider Registry `uploadFile`, type-validated).
  - Render via the shared runtime with `providerRegistry`/`localAssetManager`/`localCampaignManager`; live job status; video result with Download (`downloadAsset`) and **Add to Publishing** (`PublishingCenterMVP.createDraftFromAsset`); honest empty state; lineage footer (job, request, provider, recipe, skill, template, campaign); recent renders from `readMotionRuns`.
  - Consumes a `motionTarget` deep-link `{ recipeId, templateId, intent, skillIds }` and pre-selects the template via `detectMotionTemplate` when the intent mentions one.
- `components/MarketingStudio.jsx` — mounts a Motion Graphics capability view beside AI Video Ads via a segmented switch; opens automatically when the Command Bar deep-link arrives (`view === 'motion'`), otherwise reachable by the toggle. The ads path (create/execute marketing request) is untouched.

### Intent + Command Bar

- `lib/intents/IntentRouter.js` — `motion-graphics` target retargeted to `{ studio: "Marketing Studio", tabId: "marketing", route: "/studio/marketing", recipeId: "motionGraphics", skillIds: ["vibe-motion"] }`. Phrase matrix preserved (existing motion phrases + spec's eight navigation phrases: "Animate my logo", "Create motion graphics", "Create a countdown", "Make a lower third", "Animate statistics", "Build a promo intro", "Generate social animation").
- `commandBarRegistry.js` — the INTENT item for motion carries `params { view: 'motion', recipeId: 'motionGraphics', skillIds: ['vibe-motion'], intent: matchedPhrase }`.

### Agent / AI Twin handoff

- `lib/agents/AgentRuntime.js` — `detectMotionRequest` reuses the canonical Intent Router (no duplicated phrase lists) plus `detectMotionTemplate`; `buildMotionInitiation` builds the shared `buildMotionJob`; `motionGuidanceLines` renders the ready-to-run job. Wired into `buildAgentReply`.
- `components/AiTwinWorkspace.jsx` — `buildTwinReply` uses the same helpers (workspace `ai-twin`).
- Neither the Agent nor the Twin executes motion: they surface the shared job (recipe/skill/provider/template/request id) and route the user to Marketing Studio → Motion Graphics, the single execution surface.

---

## Files

### Added
- `packages/studio/src/lib/motion/MotionConstants.js`
- `packages/studio/src/lib/motion/templates.js` (+ `templates.test.js`, 7 tests)
- `packages/studio/src/lib/motion/MotionJobBuilder.js`
- `packages/studio/src/lib/motion/MotionProvider.js` (+ `MotionProvider.test.js`, 15 tests)
- `packages/studio/src/lib/motion/MotionGraphicsRuntime.js` (+ `MotionGraphicsRuntime.test.js`, 8 tests)
- `packages/studio/src/lib/motion/MotionHistory.js`
- `packages/studio/src/lib/motion/index.js`
- `packages/studio/src/components/motion/MarketingMotionPanel.jsx`
- `docs/milestones/MILESTONE_2026-08-03_Vibe_Motion_Workflow_Templates.md`

### Modified
- `packages/studio/src/lib/skills/vibe-motion.js`, `lib/skills/index.js` — skill registered.
- `packages/studio/src/lib/intelligence/config.js` — `motionGraphics` recipe.
- `packages/studio/src/lib/intelligence/CapabilityTypes.js` — `motion_graphics` + `motion_graphics_edit`.
- `packages/studio/src/lib/intelligence/ProductionCapabilityCatalog.js` — new capabilities + `muapi-motion-graphics` deployment.
- `packages/studio/src/lib/providers/MuApiProvider.js` — `motion_graphics → runMotionGraphics`, `motion_graphics_edit → runMotionGraphicsEdit`.
- `packages/studio/src/components/MarketingStudio.jsx` — Motion Graphics capability view mount.
- `packages/studio/src/lib/intents/IntentRouter.js` (+ `.test.js`) — retarget + target metadata.
- `packages/studio/src/commandBarRegistry.js` (+ `.test.js`) — `params { view: 'motion' }`.
- `packages/studio/src/lib/agents/AgentRuntime.js` (+ `.test.js`), `lib/agents/index.js` — motion handoff.
- `packages/studio/src/components/AiTwinWorkspace.jsx` — twin reply handoff.
- `components/StandaloneShell.js` — `motionTarget` routing (command bar → Marketing Studio motion view).
- `BUILD_STATUS.md` — milestone entry.

### Untouched (stop conditions)
- `packages/studio/src/components/VibeMotionStudio.jsx` and `SpecializedStudioRuntime.js` — preserved; not the execution surface for this capability.
- The MuAPI workflow system (`lib/providers/workflow/`, `WorkflowStudio.jsx`) — a separate concept.
- Generic engine's single-asset `createAssetFromExecution`/`AssetMaterializer` path, Publishing Center, Asset Library, Recipe Engine core, Clipping/Repurpose, Recast.

---

## Validation

- `node --test packages/studio/src/lib/motion/*.test.js` — **30/30 pass** (templates schema/registration/filter/defaults/frozen 7; provider prompt/payload/edit/normalize/validate/registry routing 15; runtime full pipeline, campaign + history fidelity, honest empty state, malformed/provider-failure paths, shared job identity across agent/twin/studio/command bar 8).
- `node --test packages/studio/src/lib/agents/*.test.js` — **12/12 pass** (motion detection/initiation/guidance through the shared builder, no duplicated logic).
- `node --test packages/studio/src/**/*.test.js` — **259/259 pass**.
- `npm run build` in `packages/studio` — clean (252 files compiled).
- Root `next build` — clean, no import warnings.
- `next lint` remains unconfigured (not a gate).

---

## Limitations

- The generic Creative Execution Engine still emits a single asset per job; the motion runtime reuses the canonical single-asset materialization (matching the engine's contract) — no multi-asset motion output yet.
- Cost is not surfaced (no verified MuAPI pricing) — deliberately absent.
- Result playback and downloads depend on provider-returned URLs; expired URLs fall back to the standard `downloadAsset` open-URL path.
- The Marketing Motion Panel is the execution surface; Agents/Twins route to it rather than running inline.

---

## Next

- Recast / talking-avatar as the next capability (same Workflow Template pattern).
- Remove `VibeMotionStudio.jsx` once the Motion Graphics capability fully supersedes it (kept per stop condition).
- Surface verified MuAPI motion-graphics pricing when available.
