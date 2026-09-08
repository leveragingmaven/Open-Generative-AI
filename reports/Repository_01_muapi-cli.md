# Repository 01: muapi-cli

## Repository Summary

**Purpose:** Official terminal and agent-facing interface for MuAPI generative media services.

**Target users:** Developers, technical artists, automation engineers, CLI users, and AI agents.

**Major features:** Image/video/audio generation, editing and enhancement, upload, prediction polling, model discovery, schema-driven arbitrary model execution, workflow commands, authentication, API-key management, JSON/JQ output, downloads, OpenAPI inspection, and MCP server mode.

**Unique capabilities:**

- Curated high-level verbs plus a generic model runner.
- Live OpenAPI schema introspection with one-hour local caching.
- Human-readable Rich output and machine-readable JSON in the same command surface.
- Semantic exit codes for authentication, rate limits, billing, not-found, timeout, and validation failures.
- MCP tools, LangChain tools, asset loading, budget callbacks, and a Deep Agents planner/specialist pattern.

**Strengths:** Clear command taxonomy, practical async submit/poll abstraction, schema-driven extensibility, automation-friendly output, explicit authentication/configuration, and strong agent interoperability.

**Weaknesses:** CLI-specific credential/configuration assumptions, live-schema dependency, provider-specific endpoint aliases, local filesystem/keyring assumptions, and no durable campaign/job state of its own.

**Problem solved:** Makes a large generative model catalog usable from humans, scripts, workflow systems, and AI agents without writing provider-specific HTTP code for every model.

## Skill Inventory

| Skill | Inputs | Outputs | Complexity | User value | MavenSync mapping |
|---|---|---|---|---|---|
| Text-to-image | Prompt, model, optional parameters | Image URLs/files, request ID | Low | High | Image Studio / Recipe Engine |
| Image editing | Prompt, source image, model | Edited image | Medium | High | Image Studio / Creative Asset Library |
| Text-to-video | Prompt, model, duration/options | Video URL/file | Medium | High | Video Studio |
| Image-to-video | Prompt, source image, model | Video URL/file | Medium | High | Video Studio |
| Music creation | Music prompt, model | Audio result | Medium | High | Audio Studio |
| Audio from text/video | Prompt or video input | Audio result | Medium | Medium | Audio Studio |
| Audio remix/extend | Song ID | New audio | Medium | Medium | Audio Studio |
| Image upscale | Asset URL | Enhanced image | Low | High | Image Studio / Asset Library |
| Background removal | Image URL | Transparent image | Low | High | Image Studio |
| Face swap | Source and target media | Swapped media | Medium | Medium | Recast / Image Studio |
| Skin enhancement | Image URL | Enhanced image | Low | Medium | Image Studio |
| Colorization | Image URL | Colorized image | Low | Medium | Image Studio |
| Style conversion | Image URL, style operation | Styled image | Low | Medium | Image Studio / Recipe Engine |
| Outpainting | Image URL, optional prompt | Extended image | Medium | High | Image Studio |
| Object erase | Image URL, mask URL | Edited image | Medium | High | Image Studio / Draw/Edit |
| Video effects | Video URL, effect | Edited video | Medium | Medium | Video Studio |
| Lip sync | Video/image and audio | Lip-synced video | Medium | High | Lip Sync Studio |
| Dance animation | Image and motion video | Animated video | Medium | Medium | Video Studio |
| Dress change | Image, optional prompt | Edited image | Medium | Medium | Image Studio |
| Highlight clipping | Source video | Clips | Medium | High | Video Studio / Campaign Builder |
| Generic model execution | Endpoint, arbitrary JSON inputs | Provider result | High | High for advanced users | Workflow Studio / Provider Registry |
| Model discovery | Category/filter | Model catalog | Low | High | Provider Registry |
| Asset upload | Local file | Hosted URL | Low | High | Asset Manager |
| Prediction wait | Request ID | Final result/status | Low | High | Creative Orchestrator |
| MCP creative tools | Tool arguments | Structured results | Medium | High | Creative Intelligence agent integration |
| Model/skill selection | Intent, kind, tier | Ranked models/skills | Medium | Very high | Recipe Engine / Provider Registry |
| Named multi-step skill | Skill name and inputs | Multi-asset result | High | Very high | Campaign Planner / Recipes |
| Open-ended creative agent | Brief, optional approval | Plan and generated assets | High | Very high | Creative Orchestrator future integration |
| Asset RAG loader | Request IDs | Documents with asset metadata | Medium | High | Knowledge Center / Asset Library |
| Cost budget callback | Budget and tool events | Spend summary/abort | Medium | Very high | Campaign policy / execution control |

## Workflow Intelligence

### CLI generation flow

1. Resolve API key from environment, keyring, or config.
2. Resolve curated alias or endpoint name.
3. Build normalized provider payload.
4. Submit to MuAPI.
5. Extract request ID.
6. Optionally poll every three seconds for up to ten minutes.
7. Return human output, JSON, filtered JSON, and optionally download outputs.

### Generic schema-driven runner

1. User supplies endpoint/model name.
2. CLI fetches or loads cached OpenAPI spec.
3. Endpoint schema is resolved, including one `$ref` hop.
4. Inputs merge in precedence order: input file, repeated key/value inputs, prompt.
5. `--dry-run` can inspect the resulting request without submission.
6. The same runner reaches models not represented by curated commands.

### Agent decision tree

```text
Brief
  -> unknown model or skill: select
  -> single clear asset: generate
  -> known multi-step recipe: run_skill
  -> multi-asset or multimodal brief: creative_agent with human interrupt
```

### Workflow and automation patterns

- Submit/poll as a reusable primitive.
- Named skill invocation for repeatable multi-step production.
- Open-ended planner/executor for complex briefs.
- Human approval interrupt before expensive or ambiguous creative execution.
- Budget callback across tool calls.
- Download output materialization after completion.
- MCP stdio and hosted HTTP transport for agent clients.

## Prompt Intelligence

The repository does not primarily define a large prompt library. Its reusable prompt intelligence is structural:

- Treat prompt as one input among arbitrary schema-defined parameters.
- Separate intent/model selection from execution.
- Use model/skill selection before expensive generation.
- Preserve arbitrary prompt fields for endpoints not known to the UI.
- Support optional prompt plus image/video/audio references.
- Use named recipes for repeatable multi-step outcomes.
- Keep machine-readable request payloads distinct from human CLI presentation.
- Use a generic prompt field only when the live schema supports it.

Recommended MavenSync prompt pattern:

```text
Intent -> capability/skill selection -> recipe resolution -> prompt compilation -> provider request
```

Negative prompting and camera/lighting/composition should remain Recipe Engine concerns, not CLI concerns.

## Recipe Catalog

### Single Image Generation

- **Studio:** Image Studio
- **Inputs:** Prompt, optional model, arbitrary model parameters
- **Outputs:** Image asset(s)
- **Recommended parameters:** Aspect ratio, quality, count, seed where supported
- **Provider fields:** Resolved only by Provider Registry

### Image Edit

- **Studio:** Image Studio / Draw/Edit
- **Inputs:** Prompt, source image, optional mask
- **Outputs:** Edited image asset
- **Recommended parameters:** Model, image references, mask, aspect ratio

### Video Generation

- **Studio:** Video Studio
- **Inputs:** Prompt, optional image/video references, model, duration
- **Outputs:** Video asset
- **Recommended parameters:** Aspect ratio, duration, resolution, quality, seed

### Audio Generation

- **Studio:** Audio Studio
- **Inputs:** Music/audio prompt or source video
- **Outputs:** Audio asset
- **Recommended parameters:** Duration, style, vocal/instrument settings where model schema supports them

### Enhancement

- **Studio:** Image Studio / Asset Library
- **Inputs:** Existing asset and operation
- **Outputs:** New asset version
- **Operations:** Upscale, background remove, colorize, style conversion, product shot, erase, outpaint

### Generic Endpoint Run

- **Studio:** Workflow Studio / Provider Registry
- **Inputs:** Endpoint ID, live schema variables, optional prompt, files
- **Outputs:** Normalized Creative Asset result
- **Important:** Treat endpoint schema as model capability metadata; do not expose MuAPI fields in Recipe definitions.

### Named Creative Skill

- **Studio:** Campaign Builder / Creative Orchestrator
- **Inputs:** Recipe variables and asset references
- **Outputs:** Multiple planned or generated assets
- **Examples:** UGC ad, storyboard, clipping workflow, product creative set

## Model Intelligence

The CLI exposes a broad catalog rather than prescribing one model. Useful model intelligence patterns:

- Curated aliases for common image, video, and audio models.
- Live model discovery and category filtering.
- Generic endpoint execution for newly added models.
- Intent-based ranking through `muapi_select`.
- Quality tiers such as best versus default.
- Provider availability and cost should be resolved at runtime.

MavenSync should store logical recipe/model preferences, not hardcode CLI aliases. Recommended defaults should be selected by the Provider Registry using capability, quality, latency, and cost policies.

## Studio Mapping

- **Image Studio:** Generation, editing, enhancement, uploads, model discovery, output downloads.
- **Video Studio:** Text-to-video, image-to-video, effects, dance, clipping, polling.
- **Audio Studio:** Music creation, remix, extension, audio-from-video.
- **Workflow Studio:** Generic schema-driven runner, arbitrary parameters, dry-run inspection.
- **Campaign Builder:** Named multi-step skill planning and asset-count estimation.
- **Creative Intelligence Layer:** Intent selection, recipe resolution, request normalization, cost policy, job lifecycle.
- **Creative Asset Library:** Asset loader/RAG metadata, output materialization, versioning.
- **Recipe Engine:** Named skills and reusable prompt/parameter structures.
- **Provider Registry:** MuAPI transport and future provider selection.

## UX Patterns

- Curated commands for common tasks, advanced generic runner for power users.
- Human output and JSON output from the same operation.
- `--dry-run` before spending credits.
- Live model-specific help from schema introspection.
- Explicit wait/no-wait control.
- Filtered JSON output for scripts.
- Auto-download output option.
- Masked identity and API key management.
- Semantic error categories instead of opaque failures.

MavenSync adoption opportunities:

- Add a request preview before generation.
- Show selected recipe/model rationale and estimated spend.
- Offer advanced parameter expansion without changing the primary studio UI.
- Make every generation result exportable as a Creative Asset.

## Automation Opportunities

- Queue jobs from Campaign Plans into Creative Orchestrator.
- Poll provider jobs through a shared status adapter.
- Add retry classification by rate limit, timeout, validation, and billing errors.
- Apply campaign credit budgets using a cost callback equivalent.
- Add human approval gates before open-ended creative-agent execution.
- Expose Creative Asset retrieval as Knowledge Center documents.
- Add MCP tools for recipe selection, planning, and asset generation.

## Gap Analysis

- MavenSync currently has provider registry and orchestration foundations but no generic live schema introspection contract.
- Cost estimation exists conceptually but needs normalized provider cost metadata.
- Current Creative Orchestrator does not yet invoke providers; CLI patterns provide the submit/poll contract.
- Current recipes are simple configuration entries; named multi-step skills need a controlled recipe graph format.
- Asset Manager is local-only; the CLI’s hosted URL/download pattern can inform future materialization.
- Human approval and budget callbacks are not yet integrated into execution.

## MavenSync Integration Opportunities

### Immediate

- Add generic request preview/dry-run support to execution planning. High value, low difficulty.
- Add normalized submit/poll state mapping to Creative Orchestrator. High value, medium difficulty.
- Add cost budget checks before provider execution. Very high value, medium difficulty.

### Phase 2

- Add schema-backed capability metadata to Provider Registry. High value, medium difficulty.
- Add named multi-step skill recipes to Campaign Builder. Very high value, high difficulty.
- Add asset loader metadata projection into Knowledge Center. High value, medium difficulty.

### Future

- Add MCP-facing Creative Intelligence tools. High value, medium difficulty.
- Add human approval interrupts for open-ended plans. High value, medium difficulty.
- Add arbitrary endpoint support through configuration-driven provider profiles. High value, high difficulty.

## Codex Implementation Prompts

### Prompt 1: Request Preview

Implement a read-only request preview for Creative Intelligence execution. Accept a canonical recipe request, resolve its current model/provider selection, and return the normalized provider-neutral request plus estimated inputs. Do not call a provider, modify studios, or add UI. Add unit tests and one focused commit.

### Prompt 2: Cost Budget Guard

Add a pre-execution budget guard to Creative Orchestrator. Accept a request cost estimate and campaign budget policy, reject over-budget jobs before provider invocation, preserve existing job states, and add tests for allowed and rejected jobs. Do not change provider adapters.

### Prompt 3: Schema Capability Import

Add a configuration-only capability importer that converts a provider OpenAPI endpoint schema into logical input metadata. Keep provider transport unchanged, validate malformed schemas, and add fixtures/tests for image, video, and arbitrary endpoints.

### Prompt 4: Creative Asset Loader

Add a read-only Asset Library loader that converts canonical Creative Assets into Knowledge Center document records. Do not introduce a vector database or alter asset persistence. Add mapping tests and preserve current asset APIs.

## Ignore List

- Reproducing the CLI terminal UI.
- Replacing MavenSync’s Provider Registry.
- Copying MuAPI endpoint aliases into recipes.
- Hardcoding the full external model catalog into studio components.
- Replacing existing MuAPI transport.
- Adding CLI-specific keyring/config behavior to browser studios.
- Treating MCP as a replacement for the internal provider boundary.
- Copying example prompts verbatim.
