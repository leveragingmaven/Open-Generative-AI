# Repository 02: Open-AI-Design-Agent

## Repository Summary

**Purpose:** Open-source autonomous design agent that turns natural-language briefs into multi-asset creative deliverables.

**Target users:** Designers, marketers, agencies, creative technologists, and developers building self-hosted creative-agent products.

**Major features:** Brief-to-plan generation, model routing per deliverable, static and motion asset generation, brand kit conditioning, multi-image references, templates, editing, vectorization/export, local history, sessions, asset registration, job approval/rejection/cancellation, workflow integration, and a visual plan canvas.

**Unique capabilities:**

- One brief can yield a complete launch kit rather than one output.
- Plan nodes are dependency-aware and visualized as a DAG.
- Model routing varies by asset type: typography, vector, photorealism, motion, and lip sync.
- Brand palette, fonts, logo, tone, and reference assets persist through a campaign.
- Up to 14 reference images support consistency, placement, and style transfer.
- Jobs can be interrupted, approved, rejected, cancelled, edited, or resumed.
- Session assets are registered separately from chat messages.

**Strengths:** Strong campaign-oriented mental model, inspectable planning, clear session/asset/job boundaries, multi-modal routing, brand consistency, self-hosting, and reusable workflow/template concepts.

**Weaknesses:** The repository proxies upstream MuAPI rather than owning a provider-neutral execution abstraction; browser/session assumptions are mixed with server credentials; persistence and authorization are largely delegated upstream; plan schemas are backend response contracts rather than a formal local domain schema.

**Problem solved:** Converts a creative brief into a structured, reviewable, dependency-ordered set of design and motion outputs.

## Skill Inventory

| Skill | Inputs | Outputs | Complexity | Dependencies | User value | Difficulty |
|---|---|---|---|---|---|---|
| Campaign brief planning | Natural-language brief, brand context | Deliverable DAG | High | Creative agent planner | Very high | High |
| Logo design | Brief, style, references | Logo concepts | Medium | Vector-capable models | High | Medium |
| Brand identity board | Brief, palette, fonts, logo, references | Identity board assets | High | Multi-image references | Very high | High |
| Poster/flyer | Copy, format, brand kit | Print/social graphic | Medium | Typography-capable model | High | Medium |
| Social post bundle | Campaign brief, aspect ratios | Multiple social graphics | Medium | Templates, image models | Very high | Medium |
| Story ad | Brief, vertical format | Story creative | Medium | Image/video models | High | Medium |
| YouTube thumbnail | Title/copy, image references | Thumbnail | Medium | Text-rendering image model | High | Medium |
| Product mockup | Product reference, scene brief | Lifestyle/product images | Medium | Image editing model | Very high | Medium |
| Packaging mockup | Package/product image, style | Packaging visual | High | Image edit/vector models | High | High |
| UI/app screen concept | Product brief, visual direction | UI mockups | High | Image/design models | High | High |
| Illustration/character design | Character brief, style | Character/scene art | Medium | Image model | High | Medium |
| Motion ad | Brief, static references, duration | Video ad | High | Video model | Very high | High |
| Animated logo | Logo image, motion direction | Animated logo | Medium | I2V/video model | High | Medium |
| Talking head/spokesperson | Portrait, audio/script | Talking video | High | Speech/video/lip-sync models | High | High |
| Natural-language edit | Asset, edit instruction | Asset version | Medium | Image/video edit model | Very high | Medium |
| Restyle/recolor | Asset, style instruction | Restyled asset | Medium | Image editing | High | Medium |
| Inpaint/outpaint | Asset, mask/instruction | Edited/expanded asset | Medium | Edit model | High | Medium |
| Vectorize/export | Raster asset | SVG/print asset | Medium | Vector/upscale tool | High | Medium |
| Background remove/upscale | Asset | Production-ready variant | Low | Enhancement providers | High | Low |
| Multi-image consistency | Up to 14 references, brief | Consistent asset set | High | Reference-capable model | Very high | High |
| Workflow pipeline | Nodes, dependencies, inputs | Repeatable asset pipeline | High | Workflow engine | Very high | High |
| Session asset management | Session ID, generated/uploaded assets | Asset references | Medium | Creative Asset Library | High | Medium |

## Workflow Intelligence

### Brief-to-deliverable pipeline

1. User supplies a natural-language brief.
2. Planner decomposes it into deliverable nodes.
3. Each node receives role, label, tool/model, estimated credits, and dependencies.
4. Plan is shown as a DAG.
5. User can inspect, edit, lock, interrupt, approve, reject, or switch model choices.
6. Nodes execute in dependency order.
7. Palette, fonts, logo, prompt context, and references flow forward.
8. Outputs are registered as session assets.
9. Final kit is assembled and downloadable.

### Design mode decision tree

```text
No reference image -> Generate mode
Reference image -> Edit mode
Natural-language multi-asset brief -> Agent mode
```

### Dependency pattern

```text
Brand brief
  -> logo/palette/font plan
  -> hero/reference assets
  -> social/poster variants
  -> motion/video cutdowns
  -> assembled campaign kit
```

### Approval and recovery

- Job approval/rejection/cancellation endpoints exist.
- Job status and event endpoints support progress observation.
- Session jobs can be listed and resumed.
- Uploads use signed URL acquisition, server-side proxying, and session asset registration.

## Prompt Intelligence

The reusable prompt strategy is a context compiler rather than a static prompt library:

- Brief is the primary creative intent.
- Brand kit is persistent context, not repeated manually by the user.
- Asset role determines model class and expected output.
- Dependency outputs become references or context for later nodes.
- Typography requests route to text-capable models.
- Product-placement requests route to image-edit models.
- Motion requests use prior static assets as I2V inputs.
- User edits are natural-language instructions applied to an existing asset.
- Multiple references support identity, composition, palette, and placement consistency.
- Prompt execution remains inspectable and editable.

Paraphrased formula:

```text
brief intent + asset role + brand constraints + references
  + output format + dependency outputs + capability requirements
  -> compiled asset request
```

## Recipe Catalog

### Campaign Launch Kit

- **Studio:** Campaign Builder / Creative Intelligence
- **Inputs:** Campaign brief, brand name, audience, goal; optional palette, fonts, logo, product references, tone.
- **Outputs:** Logo, identity references, hero image, social variants, poster, 9:16 video.
- **Dependencies:** Identity assets before variants; hero/reference before motion.

### Brand Identity Board

- **Studio:** Image Studio / Campaign Builder
- **Inputs:** Brand brief and visual direction; optional logo, palette, fonts, references.
- **Outputs:** Identity board and reusable brand references.

### Social Campaign Bundle

- **Studio:** Marketing Studio / Campaign Builder
- **Inputs:** Campaign brief, audience, offer, optional product and brand assets.
- **Outputs:** Square, portrait, story, and banner variants.

### Product Mockup Set

- **Studio:** Image Studio
- **Inputs:** Product reference and environment brief; optional lighting, camera, background style.
- **Outputs:** Product hero, lifestyle mockup, close-up, detail variant.

### Motion Ad Cutdown

- **Studio:** Video Studio
- **Inputs:** Static hero/product asset, motion direction, duration; optional audio and aspect ratios.
- **Outputs:** 9:16, 1:1, and 16:9 video variants.

### Natural-Language Asset Edit

- **Studio:** Image Studio / Video Studio / Draw/Edit
- **Inputs:** Source asset and edit instruction; optional mask and references.
- **Outputs:** New version linked to parent asset.

## Model Intelligence

- Typography: Ideogram, Flux Pro Ultra, Nano Banana, GPT-Image.
- Vector/logo: Recraft and Ideogram.
- Photoreal/product: Flux, Nano Banana Edit, GPT-Image Edit.
- Image editing: Nano Banana Edit, Flux Kontext, GPT-Image Edit, Seedream Edit.
- Video: Kling, Sora, Veo, Runway, Luma, Seedance, Wan.
- Lip sync/talking head: Infinite Talk, LTX Lipsync, Wan Speech-to-Video, Sync, LatentSync.

MavenSync should encode capability requirements and let Provider Registry resolve current deployments, quality tiers, cost, and availability rather than copying model lists into components.

## Studio Mapping

- **Campaign Builder:** Brief decomposition, templates, asset roles, dependencies, plan review.
- **Creative Intelligence Layer:** Brief compiler, capability routing, brand context injection, plan/job coordination.
- **Image Studio:** Static generation, editing, identity boards, product mockups, vector/upscale operations.
- **Video Studio:** Motion ads, animated logos, social cutdowns, I2V, talking-head outputs.
- **Marketing Studio:** Campaign variants, product/avatar ads, platform-neutral creative bundles.
- **Workflow Studio:** Explicit DAG construction and reusable multi-node pipelines.
- **Knowledge Center:** Brand kit, approved references, palette, font, tone, campaign context.
- **Creative Asset Library:** Session assets, parent/version links, reference reuse, downloadable kits.
- **Recipe Engine:** Capability-specific templates and multi-asset recipes.
- **Provider Registry:** Model/deployment resolution and transport only.

## UX Patterns

- Brief-first experience instead of model-first selection.
- Visible plan before expensive execution.
- DAG plan visualization with dependency layers.
- Per-node model choice and editable intermediate results.
- Lock/fork/resume plan operations.
- Session sidebar and persistent conversation history.
- Asset panel separated from messages.
- Multi-image attachment tray and reference labels.
- Generation status/events per job.
- Downloadable assembled kit organized by category.
- Responsive canvas with zoom and hideable chat/sidebar.
- Natural-language edit action on existing assets.

## Automation Opportunities

- Dependency-aware job execution from Campaign Plans.
- Human approval before expensive or irreversible nodes.
- Pause/resume/cancel at job or plan level.
- Asset registration after upload and generation.
- Retry failed nodes without restarting the full campaign.
- Fork a plan from an intermediate node.
- Persist plan and job event history.
- Batch generation for aspect-ratio variants.

## Gap Analysis

- MavenSync has Campaign Plans and Creative Orchestrator foundations but lacks agent-style dependency-aware plan visualization and node-level intervention.
- Brand kit conditioning is available conceptually through Knowledge Center but needs a normalized brand context contract.
- Creative Asset Library has version lineage but needs plan-node provenance and reference roles.
- Job model exists but does not yet expose approval, event stream, lock, fork, or resume semantics.
- Provider Registry can route models but lacks capability scoring/ranking.

## MavenSync Integration Opportunities

### Immediate

- Preserve plan-node provenance through Creative Jobs. High value, low effort.
- Add parent/version links when a plan node produces a Creative Asset. High value, low effort.

### Phase 2

- Compile Knowledge Center brand kits into prompt variables and constraints. Very high value, medium effort.
- Add approval, lock, fork, and resume transitions. Very high value, medium effort.
- Add capability-based model ranking. Very high value, high effort.

### Future

- Add plan DAG visualization to Campaign Builder UI.
- Add agent/MCP planning tools.
- Add session-to-campaign conversion.
- Add assembled campaign kit export.

## Codex Implementation Prompts

### Plan Node Provenance

Extend CreativeJob metadata to preserve asset role, purpose, dependency IDs, and source reference IDs from CampaignPlan. Do not invoke providers or change UI. Add serialization tests and one focused commit.

### Approval State Machine

Add approval, lock, reject, and resume transitions to CreativeExecutionPlan without changing provider invocation. Validate legal transitions, add tests, and preserve existing job statuses.

### Brand Context Compiler

Create a provider-neutral brand context compiler accepting normalized Knowledge Center brand data and returning prompt variables plus generation constraints. Do not include raw documents, call providers, or modify UI. Add sanitization and precedence tests.

### Capability Router

Implement a pure capability scoring function ranking registered deployments for a Campaign asset request using modality, quality tier, latency, cost, and policy metadata. Do not call providers. Add deterministic fixture tests.

## Ignore List

- Copying CreativeCanvas UI.
- Replacing Campaign Builder with a chat-only workflow.
- Copying upstream MuAPI session endpoints into MavenSync domain models.
- Browser token/localStorage assumptions.
- Direct provider calls from UI components.
- Treating agent message history as the Creative Asset Library.
- Adding platform-specific campaign fields to core Campaign or Plan models.
