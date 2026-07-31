# MavenSync Creative Platform UX Foundation Audit

## Scope and Method

This is a current-state audit of the existing MavenSync/Open Generative AI experience. It reviews the main shell, route structure, studios, Workflow Studio, Asset Library, settings/dialogs, shared styling, terminology, and primary journeys. It does not redesign layouts or add platform features.

## Current Navigation Map

```text
/                     -> redirects to /studio
/studio                -> StandaloneShell
  Images
    Image Studio       /studio/image
    Cinema Studio      /studio/cinema
    Design Agent       /studio/design-agent
    AI Influencer      /studio/ai-influencer
  Video
    Video Studio       /studio/video
    AI Clipping        /studio/clipping
    Vibe Motion        /studio/vibe-motion
    Lip Sync           /studio/lipsync
    Body Swap          /studio/body-swap
    Marketing Studio   /studio/marketing
  Audio
    Audio Studio       /studio/audio
  Agents & Automation
    Agents             /studio/agents
    Workflows          /studio/workflows
    Publishing Center  /studio/publishing
    Creative Asset Library /studio/asset-library

Separate application surfaces:
  /assistant
  /agents/create
  /agents/edit/:id
  /agents/:agent_id
  /workflow/:id
  /workflow/:id/:tab
```

## Screen Inventory

### Shell and Platform

- `StandaloneShell`: navigation, API-key/settings access, notifications, studio mounting, Agency Mode filtering.
- `AssetLibraryStudio`: asset browsing, search, filters, sorting, details, favorites, lineage display.
- `SettingsModal` and `ApiKeyModal`: credentials and application settings.

### Creative Studios

- Image Studio: image generation/editing and Draw workflow.
- Cinema Studio: cinematic camera/lens controls and image generation.
- Video Studio: T2V, I2V, V2V, references, duration, quality, extension.
- Marketing Studio: product/avatar/additional media and marketing video generation.
- Audio Studio: model-driven audio generation and uploads.
- Lip Sync Studio: image/video plus audio synchronization.
- Recast/Body Swap: source video and character image transformation.
- Vibe Motion: motion graphics generation/editing.
- AI Influencer: character option builder and portrait generation.
- AI Clipping: source-video clipping workflow.
- Design Agent: embedded conversational design canvas.

### Workflow and Automation

- Workflow Studio browser: templates, user workflows, published workflows, execution form.
- Vendored Workflow Builder: node graph authoring and node execution.
- Agents Studio: agent templates, user agents, published agents, conversations.
- Publishing Center: publishing foundation and draft/status concepts; live social capability remains limited.

## UX Strengths

- Clear visual identity: dark canvas, electric cyan accent, purple secondary accent, translucent panels.
- Large number of specialized creative operations are accessible from one shell.
- Studios preserve domain-specific controls instead of forcing every task into one generic form.
- Shared prompt primitives exist for several studios.
- Feature flags allow runtime migration without forcing user-visible cutovers.
- Asset Library provides a central discovery surface while preserving legacy histories.
- Workflow and Design Agent concepts support advanced users without blocking basic generation.
- Existing shell supports desktop and mobile navigation states.

## UX Weaknesses

- The navigation is tool-oriented and dense for first-time users; there are many similarly weighted destinations.
- `Marketing Studio` is grouped under Video despite being a business/content workflow.
- `Body Swap`, `Recast`, `Vibe Motion`, and `AI Influencer` use product-style names that do not immediately explain the outcome.
- `Workflows`, `Agents`, `Design Agent`, and `Publishing Center` sit together but represent different mental models.
- The shell has no clear first-run orientation or “start here” path.
- History remains distributed by studio while the Asset Library is a separate destination.
- Asset Library canonical records and legacy records have visibly different metadata completeness.
- Loading and error language varies by studio.
- Some controls use icon-only affordances while others use text buttons for similar actions.
- Prompt, script, brief, instruction, and description are used inconsistently.
- The current Asset Library grid is compact and metadata-light for review-heavy work.

## Navigation Issues

### Current grouping concerns

- `Marketing Studio` under Video is discoverability risk for users seeking campaign work.
- `Publishing Center` under Agents & Automation obscures its relationship to Campaigns and Assets.
- `Creative Asset Library` under Agents & Automation makes the central platform service feel like an automation tool.
- `Design Agent` under Images does not communicate that it spans image, video, campaign, and workflow planning.
- `AI Influencer Studio` is under Images despite supporting future video/identity workflows.

### Recommended navigation map

Preserve all existing routes, but organize future navigation conceptually:

```text
Create
  Image
  Video
  Audio
  Marketing
  Specialized Tools

Plan
  Campaigns
  Workflows
  Design Agent

Manage
  Creative Asset Library
  Collections
  Projects
  Favorites

Operate
  Publishing Center
  Agents & Automation

System
  Settings
```

This is a recommendation for the branding/UX phase, not an implementation change in this sprint.

## Terminology Inventory

| Current terms | Recommended canonical term | Guidance |
|---|---|---|
| Studio | Studio | Use for a focused creative workspace. |
| Asset / generated item / result | Asset | Use `Creative Asset` in platform documentation; use `Asset` in UI. |
| History | History | Use for studio-local legacy records only. |
| Library | Asset Library | Use for reusable cross-studio assets. |
| Workflow | Workflow | Use for reusable multi-step graph. |
| Campaign | Campaign | Use for business objective and planned creative work. |
| Collection | Collection | Use for user organization of assets. |
| Prompt / script / description | Instruction or Brief | Use `Prompt` only for model-facing text; `Brief` for campaign intent; `Script` for spoken/video copy. |
| Generate / Create / Run | Generate for assets, Run for workflows, Publish for distribution | Avoid interchangeable action labels. |
| Publish / Schedule | Publish for immediate delivery, Schedule for future delivery | Keep separate from generation. |
| Body Swap / Recast | Body Swap or Recast | Choose one product label during branding; expose explanatory subtitle. |
| Design Agent / Agents | Design Agent for creative planning, Agents for automation/conversation | Do not use “Agent” as a generic synonym for every AI action. |

## User Journey Findings

### Generate an image

**Path:** Open `/studio` -> Image Studio -> enter prompt -> choose model/settings -> generate -> review/download/history.

**Strengths:** Direct entry path, familiar prompt flow, model/settings visible.

**Friction:** New users must understand model, aspect ratio, quality, batch, upload, and Draw controls before understanding the primary action.

**Opportunity:** Progressive disclosure and a short first-run hint, without changing current controls.

### Generate marketing content

**Path:** Open shell -> expand Video category -> Marketing Studio -> upload product -> optionally select avatar/media -> enter script -> set format/ratio/resolution/duration -> launch.

**Friction:** Marketing is hidden in Video; the required product upload is discovered only after entering the studio.

**Opportunity:** Future navigation grouping and a clear preflight checklist.

### Create a video

**Path:** Open shell -> Video Studio -> choose model -> choose T2V/I2V/V2V -> upload references if needed -> configure duration/quality -> generate -> preview/history/download.

**Strengths:** Domain controls are comprehensive.

**Friction:** Model capability differences make controls appear/disappear; modes and references require prior knowledge.

**Opportunity:** Capability explanation and mode-specific input guidance.

### Execute a workflow

**Path:** Open shell -> Agents & Automation -> Workflows -> select templates/my/published -> open workflow -> fill inputs -> run -> inspect outputs.

**Friction:** Workflow Studio and the separate `/workflow/:id` routes create two concepts of workflow execution. Node-level status and output provenance are not consistently visible in the shell experience.

**Opportunity:** Future Workflow Studio convergence and clear `Run Workflow` terminology.

### Find a previously generated asset

**Path:** Open shell -> Asset Library -> search/filter/sort -> select asset -> inspect metadata/lineage -> favorite/download.

**Strengths:** Central cross-studio entry point and legacy compatibility.

**Friction:** Legacy assets may lack provider/recipe/type metadata; canonical asset registration is uneven across studios.

**Opportunity:** Show provenance completeness and source studio badges.

### Return to a previous project

**Current experience:** Project/campaign context is available in MavenSync integration contracts, but the visible shell does not provide a consistent project switcher or project-first navigation.

**Friction:** Users can lose context when moving between Hub and Creative Studio; local studio histories are not visibly scoped by project.

**Opportunity:** Future project context bar and project-scoped Asset Library.

## Design System Inventory

### Typography

- Primary application font: Inter/system sans.
- Many studio controls use small uppercase labels around `10–13px`.
- Metadata often falls below comfortable reading size.
- Recommendation: define a minimum readable metadata size and reserve uppercase for labels, not user content.

### Color palette

- Electric cyan primary: `#22d3ee`.
- Cyan hover: `#06b6d4`.
- Purple accent: `#a855f7`.
- Danger: `#ef4444`.
- Deep black app/panel/card backgrounds.
- Zinc/white alpha borders and text.
- Recommendation: centralize semantic statuses so error/warning/success colors are consistent.

### Glass styling

- `.glass`, `.glass-panel`, backdrop blur, translucent black panels, white-alpha borders.
- Studios often reimplement equivalent utility classes locally.
- Recommendation: converge repeated panel/button patterns into documented tokens before redesign.

### Cards

- Rounded cards, thin borders, hover border brightening, image-first presentation.
- Asset Library and studios use different radius, shadow, and metadata density choices.

### Buttons

- Cyan primary actions.
- Icon-only circular/rounded actions in result overlays.
- Several studios use bespoke inline SVG and different hover states.
- Recommendation: define primary, secondary, destructive, icon, and loading button semantics.

### Forms

- Dark inputs with white-alpha borders.
- Prompt controls have shared primitives in the studio package.
- Model dropdowns and popovers vary in dimensions and labels.

### Modals and drawers

- API key modal and DrawModal use separate layout conventions.
- Design Agent hides shell navigation while active.
- Recommendation: document modal focus, escape, close-label, and mobile behavior.

### Status indicators

- Toasts, inline errors, spinners, elapsed timers, and custom progress states coexist.
- Status language is not yet standardized across generation and workflow contexts.

### Empty/loading/error states

- Some studios show instructional empty states.
- Others show only a blank result area or alert.
- Asset Library has explicit empty/loading/error states.
- Recommendation: standardize state copy and severity without changing layouts.

### Icons

- Inline SVG, Lucide, React Icons, and package-specific icon sets coexist.
- Current icons are generally consistent in stroke style but not in size/visual weight.

### Spacing, radius, shadows

- Shared CSS variables define `6/10/16/24px` radii and standard shadows.
- Tailwind utilities introduce additional values in individual studios.
- Recommendation: use existing variables as the documented baseline; do not introduce another token system.

## UX Strengths

- Strong breadth of creative capabilities.
- Clear direct generation paths for common image/video tasks.
- Mature specialized controls for advanced users.
- Existing runtime feature flags support safe rollout.
- Asset Library creates a central cross-studio destination.
- Workflow and agent surfaces support advanced automation.

## UX Weaknesses

- Information architecture is tool-first rather than intent-first.
- Metadata, status, and error language vary across studios.
- Project/campaign context is not persistently visible.
- Legacy history and canonical Asset Library are not yet perceived as one system.
- Workflow execution has separate route and embedded-builder mental models.
- Small metadata typography reduces scanability.

## Quick Improvements Completed

- Added `aria-label="Search creative assets"` to the Asset Library search control.
- Added `aria-label="Sort creative assets"` to the Asset Library sort control.
- Added contextual favorite labels: “Add to favorites” and “Remove from favorites”.
- Improved Asset Library loading/error/empty-state presentation in the integration sprint.
- Added lineage text to the Asset Library details panel.

These are low-risk affordance and consistency improvements; no workflow or layout relocation was performed.

## Prioritized UX Recommendations

### P0: Consistency and orientation

1. Add a persistent project/campaign context indicator.
2. Standardize action vocabulary: Generate, Run, Save, Publish, Schedule.
3. Standardize loading/error/empty-state copy.
4. Add capability guidance when a model hides or changes controls.
5. Explain runtime fallback only in diagnostics, not as user-facing complexity.

### P1: Information architecture

1. Reorganize navigation conceptually while preserving routes.
2. Move Marketing into a Create/Marketing mental grouping.
3. Give Asset Library a first-class Manage position.
4. Clarify Design Agent versus Agents.
5. Present Workflows as Plan/Automate rather than a generic studio.

### P2: Review and productivity

1. Add richer Asset Library metadata/provenance badges.
2. Add compare/version affordances.
3. Add reusable collection/project views.
4. Add consistent keyboard/focus behavior.
5. Add first-run guidance for new users.

## Screens That Should Remain Largely Unchanged

- Image Studio: strong direct-generation flow; improve guidance incrementally.
- Cinema Studio: specialized controls are valuable; avoid flattening them.
- Audio Studio: model-driven form is functional; standardize state copy only.
- Lip Sync Studio: explicit input mode is useful; preserve the form model.
- Recast Studio: media-first workflow is appropriate.
- Vibe Motion Studio: timeline/progress behavior should remain recognizable.
- Asset Library basic grid: retain as the initial browse surface while improving density/provenance later.

## Screens That Merit Major Redesign in the UX Phase

- Main navigation/shell information architecture.
- Workflow Studio execution and run monitoring experience.
- Design Agent/Agents relationship and entry points.
- Publishing Center once live publishing is available.
- Asset Library details/review experience after durable indexing and collections exist.
- Project/campaign context and cross-studio handoff.

## Architectural Observations

- The current architecture supports incremental UX work because studios, runtime adapters, Asset Library service, and shell navigation are separable.
- UX changes must not reintroduce provider logic or local prompt construction.
- Asset Library should become the primary cross-studio history surface only after canonical registration coverage improves.
- Navigation redesign should follow project/campaign context decisions, not precede them.
- The current sprint did not change platform architecture or core workflows.
