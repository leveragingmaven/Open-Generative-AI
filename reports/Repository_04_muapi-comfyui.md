# Repository 04: muapi-comfyui

## Repository Summary

This repository is a MuAPI custom-node pack for ComfyUI. Its reusable value is not the ComfyUI UI; it is the typed node contract, generic endpoint escape hatch, file/reference wiring, request-ID chaining, output normalization, and large library of declarative creative workflows.

**Target users:** Technical artists, workflow designers, automation engineers, and advanced creators who want visual composition over many MuAPI models.

**Core strengths:** Typed inputs/outputs, explicit modality boundaries, multi-reference wiring, generic raw JSON execution, reusable generated workflow specs, and practical output materialization.

**Weaknesses:** API keys are node inputs, endpoint/model lists are statically maintained, polling is embedded in nodes, workflow JSON is tightly coupled to ComfyUI graph format, and persistence/observability are external to the pack.

## Skill Inventory

- Text-to-image: prompt, aspect ratio, negative prompt, custom endpoint, extra JSON.
- Image-to-image: connected image input, prompt, endpoint override, extra parameters.
- Text-to-video: prompt, aspect ratio, quality, duration.
- Image-to-video: one to four connected images, prompt, aspect ratio, quality, duration.
- Video extension: previous request ID, quality, duration.
- Image enhancement: upscale, background removal, face swap, Ghibli conversion, colorization, erase, product shot.
- Video editing: effects, dance, dress change, face swap, upscale, watermark removal, motion control, clipping, captions, autocrop, combiner.
- Lip sync: video and audio inputs.
- Audio: Suno create/remix/extend and MMAudio text/video-to-audio.
- Image-to-3D: text/image/multi-image to textured 3D assets.
- Generic endpoint execution: arbitrary endpoint and raw JSON with file placeholders.
- Video saver: download provider video, save file, load sampled frames, return path/count.
- Multi-reference workflows: four-image I2V and Omni reference patterns.
- Chained generation: T2I to I2V; I2I to upscale; edit to video; music to video.

## Workflow Intelligence

### Typed node pipeline

```text
API key node
  -> typed generation node
  -> output URL/request ID/image frame
  -> downstream node or saver
```

### Generic node pipeline

```text
Endpoint + raw JSON + file placeholders
  -> upload referenced files
  -> substitute __file_N__ URLs
  -> submit endpoint
  -> poll request ID
  -> normalize output URL/preview/raw response
```

### Chaining patterns harvested

- Text-to-image -> image-to-video.
- Image-to-image -> upscale.
- Generate -> extend using request ID.
- Multi-image reference -> Omni/I2V model.
- Product image -> product shot -> ad/video.
- Storyboard/keyframes -> motion sequence.
- Image grid/character board -> consistent video.
- Music generation -> music video.
- Campaign image -> campaign video.

### Workflow generation pattern

The repository maintains a Python specification table with widget signatures, input connection types, output slots, node specs, and links, then generates ComfyUI JSON. This is valuable as a declarative workflow compiler pattern, not as a format MavenSync should copy.

## Prompt Intelligence

The workflow library demonstrates reusable prompt structures without requiring literal prompt reuse:

- Director-style motion briefs: subject, action, context, composition, lighting, style.
- Explicit reference tokens such as image slots for multi-reference models.
- Prompt fields separated from model, aspect ratio, quality, and duration.
- Specialized prompts per asset role: logo, product shot, thumbnail, ad creative, storyboard, campaign, social pack, interior, fashion, jewelry, music video.
- Prompt and parameter separation through `extra_params_json`.
- Generic JSON allows model-specific fields without changing node types.
- Negative prompts are optional node inputs rather than hardcoded global behavior.

Paraphrased prompt formula:

```text
subject + action + context + composition + lighting + style
  + reference bindings + output constraints
```

MavenSync should convert these into recipe sections and structured variables. Avoid embedding ComfyUI node names or provider endpoint names in prompts.

## Recipe Catalog

### Typed Text-to-Image

- **Studio:** Image Studio
- **Inputs:** Prompt, aspect ratio, optional negative prompt.
- **Optional:** Model override, endpoint override, extra JSON.
- **Outputs:** Generated image, preview, request ID.

### Typed Image-to-Video

- **Studio:** Video Studio
- **Inputs:** Prompt, one to four reference images.
- **Parameters:** Aspect ratio, quality, duration.
- **Outputs:** Video URL, first frame, request ID.

### Generate and Extend Video

- **Studio:** Video Studio / Campaign Builder
- **Inputs:** Initial prompt, request ID for extension.
- **Parameters:** Quality, duration.
- **Outputs:** New video and request ID lineage.

### Generic Endpoint Recipe

- **Studio:** Workflow Studio / Recipe Engine
- **Inputs:** Logical capability, endpoint-resolved parameters, files.
- **Outputs:** Normalized asset and raw provider metadata.
- **Safety:** Provider Registry resolves endpoint; recipe never embeds credentials.

### Product Campaign Chain

- **Studio:** Campaign Builder
- **Pipeline:** Product image -> product photography/enhance -> multiple angles -> hero/ad/video.
- **Outputs:** Linked asset family with parent/version relationships.

### Social Pack

- **Studio:** Campaign Builder / Image Studio
- **Pipeline:** Hero/reference -> reframe or edit into multiple aspect-ratio variants.
- **Outputs:** Asset collection with role metadata.

### Storyboard to Video

- **Studio:** Video Studio / Workflow Studio
- **Pipeline:** Keyframes/storyboard -> I2V scenes -> assembled sequence.
- **Outputs:** Keyframe assets, scene videos, final composition references.

### Image-to-3D Asset

- **Studio:** Future creative tool / Asset Library
- **Inputs:** Text, image, or multi-image references.
- **Outputs:** Model URL and request ID.

## Model Intelligence

The node pack maintains category-specific endpoint registries:

- T2I, I2I, T2V, I2V, video extension, enhancement, video edit, lip sync, audio, and 3D.
- A `custom` option exists in each category for unsupported/new endpoints.
- Endpoint lists include current model families across Flux, HiDream, GPT-Image, Imagen, Seedream, Nano Banana, Midjourney, Seedance, Kling, Veo, Wan, Hunyuan, Sora, Runway, Luma, Vidu, PixVerse, Suno, MMAudio, Topaz, Tripo3D, and Meshy.

MavenSync should harvest the category/capability taxonomy and custom endpoint fallback, but keep model availability in Provider Registry configuration rather than duplicating static arrays in UI.

## Studio Mapping

- **Image Studio:** T2I, I2I, enhancement, face swap, background removal, upscale, 3D request planning.
- **Video Studio:** T2V, I2V, extend, video edit, motion control, clipping, multi-reference.
- **Audio Studio:** Suno/MMAudio operations.
- **Workflow Studio:** Generic endpoint node, typed node graph, raw JSON, chained pipelines.
- **Campaign Builder:** Product campaign, social pack, storyboard, multi-angle, ad workflows.
- **Creative Asset Library:** URL/frame extraction, request lineage, generated variants, 3D outputs.
- **Recipe Engine:** Declarative typed-node recipes and chain recipes.
- **Provider Registry:** Endpoint resolution, uploads, polling, response normalization, error mapping.

## UX Patterns

- One API key node wired to multiple downstream nodes.
- Typed nodes for discoverability plus generic node for power users.
- Visible request ID output for extension/chaining.
- Explicit file/image input ports instead of hidden uploads.
- Preview and save nodes as separate output concerns.
- Searchable categorized model selection.
- Workflow JSON import/export.
- “Custom endpoint” escape hatch.
- Extra JSON for advanced parameters without expanding every node schema.
- Frame sampling controls for saved video previews.

## Automation Opportunities

- Add request-ID dependencies to CreativeExecutionPlan.
- Build reusable chain recipes from typed node graphs.
- Auto-upload and materialize reference files through Asset Manager.
- Support partial retry at a failed graph node.
- Save intermediate frames/thumbnails as Creative Asset variants.
- Add generic endpoint dry-run validation from recipe schema.
- Generate campaign asset collections from skill workflow definitions.

## Gap Analysis

- MavenSync’s Workflow Studio has graph execution but needs a normalized typed capability/node schema inspired by the node input/output contracts.
- Creative Orchestrator needs explicit output slots and request-ID lineage for chained jobs.
- Asset Manager needs frame/thumbnail variant metadata for video saver behavior.
- Recipe Engine needs a generic endpoint recipe with schema-validated `extraParams`.
- Provider Registry needs a controlled custom endpoint configuration path.
- Static endpoint lists should become registry data with availability and deprecation metadata.

## MavenSync Integration Opportunities

### Immediate

- Add `requestId` and output-slot lineage to CreativeJob metadata. High value, low difficulty.
- Add generic `extraParameters` to recipe requests with schema validation. High value, medium difficulty.
- Add four-reference input support to video recipes. High value, low difficulty.

### Phase 2

- Add typed workflow node capability schemas to Workflow Studio. Very high value, medium difficulty.
- Add chain recipe templates for T2I->I2V, edit->upscale, and generate->extend. Very high value, medium difficulty.
- Add frame/thumbnail variants to Creative Asset Library. High value, medium difficulty.

### Future

- Add 3D asset outputs and model metadata.
- Add generic endpoint discovery from provider schemas.
- Add workflow graph import/export compatibility adapters.

## Database Impact

| Feature | Existing tables affected | New tables | New columns | Migration | Relationships |
|---|---|---|---|---|---|
| Request-ID chaining | `creative_jobs`, `assets` if persisted | None | `parentJobId`, `sourceRequestId`, `outputSlot` | Required if durable jobs already exist; otherwise defer | Job-to-job and job-to-asset lineage |
| Multi-reference inputs | `creative_requests`/asset metadata | None | `referenceAssetIds` or relation records | Small additive migration | Request-to-many assets |
| Frame variants | `assets` | Optional `asset_variants` | `variantType`, `frameIndex`, `timestampSeconds` | Additive | Parent asset to variants |
| Generic endpoint metadata | registry tables/config | None | `requestProfileId`, `schemaVersion` | No migration for config-only implementation | Deployment-to-capability profile |
| Workflow recipes | campaign plans and recipes | Optional `workflow_recipe_versions` | `graph`, `version`, `requiredCapabilities` | Future migration | Recipe-to-many jobs/assets |

## API Surface

- Provider calls: submit endpoint, upload file, poll prediction, retrieve result.
- Internal endpoints: canonical request submission, job status, asset materialization, workflow execution.
- Background jobs: provider polling, file upload/materialization, frame extraction, thumbnail generation.
- Events: job submitted, progress, completed, failed, asset materialized.
- Queue requirements: useful for chained workflows and partial retries; not required for planning-only recipes.
- Retry logic: retry transient HTTP, timeout, rate-limit, and upload failures; do not retry validation/billing failures automatically.
- Polling: provider-specific polling remains behind Provider Registry.
- Streaming: optional progress events; outputs are asynchronous.
- Webhooks: optional future optimization where provider supports them.

## Codex Implementation Prompts

### Request-ID Lineage

Extend CreativeJob metadata with parent request ID, source job ID, and output slot. Preserve current job APIs, add lineage tests, and do not call providers or modify UI.

### Multi-Reference Recipe Inputs

Add schema-validated `referenceAssetIds` support to Creative Asset Requests and map them to provider-neutral input references. Preserve existing single-reference behavior and add tests.

### Chain Recipes

Add configuration-only chain recipes for text-to-image to image-to-video, image-edit to upscale, and generation to extension. Compile chains into existing Campaign Plans and Creative Jobs without provider changes.

### Video Variants

Add frame and thumbnail variant metadata to Creative Assets and a pure variant planner. Do not add R2 or media processing in this milestone.

## Ignore List

- Copying ComfyUI node UI or graph JSON as MavenSync’s primary architecture.
- Hardcoding endpoint lists in studios.
- Exposing API keys in node/request payloads.
- Replacing Provider Registry with direct `requests` calls.
- Copying generated workflow examples verbatim.
- Adding a second polling or storage system.
