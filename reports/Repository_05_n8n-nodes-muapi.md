# Repository 05: n8n-nodes-muapi

## Repository Summary

This repository provides n8n community nodes for MuAPI generation and upload. Its reusable value is the automation-facing execution contract: credential injection, per-item batching, binary/URL ingestion, conditional model parameters, optional request-ID return, standardized polling, and workflow JSON examples.

**Target users:** Automation builders, operations teams, marketers, developers, and self-hosted n8n users.

**Core strengths:** Native n8n expression support, credential abstraction, binary item handling, continue-on-fail behavior, configurable polling, model/category-aware parameter display, and reusable workflow examples.

**Weaknesses:** Static model registry, provider-specific payload builder, hardcoded MuAPI base URL, limited event semantics, and no durable Creative Asset/Campaign relationship.

**Problem solved:** Makes asynchronous generative media operations composable inside business automation workflows.

## Skill Inventory

- Text-to-image with model-specific width/height, aspect ratio, and count fields.
- Image-to-image with source URL lists and model-specific aspect ratio.
- Text-to-video with aspect ratio, resolution, duration, prompt optimizer, and Sora-specific controls.
- Image-to-video with single image, image list, Omni references, video/audio reference lists, duration, resolution, and aspect ratio.
- Image enhancement: upscale, background removal, face swap, product shot, anime, object erase, and other operations.
- Video editing: effects, motion, face swap, dress change, clipping, lip sync, and model-specific fields.
- Audio: Suno create/remix/extend, MMAudio text-to-audio, and video-to-audio.
- Image/text-to-3D.
- Generic category/model selection with schema-like conditional fields.
- Upload binary data from prior n8n node items.
- Upload remote URL by downloading and re-uploading.
- Batch processing over all incoming n8n items.
- Return request ID only for manual or downstream polling.
- Continue-on-fail item-level error handling.

## Workflow Intelligence

### Standard n8n generation flow

```text
Trigger
  -> expression-resolved inputs
  -> MuAPI Predictor
  -> submit endpoint
  -> automatic poll
  -> output URL/request metadata
  -> downstream business node
```

### Manual async flow

```text
Trigger
  -> MuAPI Predictor with Return Request ID Only
  -> delay/branch/business logic
  -> result polling operation
  -> completed asset
```

### Upload flow

```text
Binary item OR URL
  -> MIME/filename detection
  -> MuAPI upload_file
  -> hosted URL
  -> generation node reference
```

### Batch/error flow

- Iterate over each incoming item.
- Preserve paired-item relationships.
- Continue-on-fail returns an error item instead of terminating the workflow.
- Default behavior throws an item-indexed `NodeOperationError`.

## Prompt Intelligence

- Prompts are n8n expressions, allowing campaign data, CRM fields, previous node outputs, and user input to flow into generation.
- Prompt fields are separated by modality/category while model-specific parameter visibility is conditional.
- Generic model selection uses a single node with category-specific prompt names and parameter groups.
- Prompt and media references can be assembled from upstream automation nodes.
- Prompts should be compiled before the n8n execution boundary; the node should receive a canonical request rather than own brand/prompt composition.

Paraphrased MavenSync formula:

```text
campaign/CRM/context variables
  -> Recipe Engine prompt compilation
  -> expression-resolved request
  -> CreativeJob execution
```

## Recipe Catalog

### Automation Image Generation

- **Studio:** Image Studio / Campaign Builder
- **Inputs:** Recipe prompt, campaign variables, optional reference asset IDs.
- **Outputs:** Creative Asset plus request/job metadata.
- **Automation hooks:** Trigger, approval, CRM field, webhook follow-up.

### Automation Video Generation

- **Studio:** Video Studio / Workflow Studio
- **Inputs:** Prompt, aspect ratio, duration, quality, references.
- **Outputs:** Video asset and job status.

### Request-ID Deferred Generation

- **Studio:** Creative Orchestrator / Workflow Studio
- **Inputs:** Asset request and provider execution preference.
- **Outputs:** Pending CreativeJob with request ID.
- **Follow-up:** Poll/status node or internal job monitor.

### Media Ingestion

- **Studio:** Asset Manager
- **Inputs:** Binary item or remote URL, filename/MIME.
- **Outputs:** Canonical Creative Asset reference.

### Batch Creative Variant

- **Studio:** Campaign Builder / Automation
- **Inputs:** List of campaign variants, each with prompt/context variables.
- **Outputs:** One job/asset per input item with paired-item lineage.

### Generic Provider Operation

- **Studio:** Workflow Studio
- **Inputs:** Capability/model selection and expression-resolved parameters.
- **Outputs:** Normalized result or request ID.

## Model Intelligence

The n8n node maintains a category-oriented model registry with display name, short value, provider endpoint, and description. It exposes model-specific fields through conditional UI rules.

Useful patterns:

- Distinguish logical model value from provider endpoint.
- Display only parameters supported by the selected model.
- Maintain specialized exceptions for models with unique controls.
- Use a generic category operation for long-tail coverage.
- Keep endpoint mappings behind provider configuration.

MavenSync should improve this by moving model metadata to the existing Provider Registry and generating request schemas/configuration from it rather than maintaining a second static catalog.

## Studio Mapping

- **Campaign Builder:** Batch variant expansion and automation-ready asset requests.
- **Creative Intelligence Layer:** Recipe compilation, context resolution, job creation, policy and cost checks.
- **Workflow Studio:** Generic external automation bridge and request-ID workflows.
- **Creative Asset Library:** Upload normalization, MIME/filename metadata, generated output registration, paired-item lineage.
- **Provider Registry:** Endpoint mapping, submit/poll/cancel, model-specific request profiles.
- **Knowledge Center:** Campaign/CRM variables and approved prompt context.
- **Marketing Studio:** Triggerable campaign variants and asset follow-up actions.

## UX Patterns

- Credentials are configured once and reused by nodes.
- Node subtitle summarizes selected operation/input type.
- Conditional fields reduce irrelevant controls.
- Binary versus URL input is explicit.
- Continue-on-fail is configurable.
- Request-ID-only mode exposes advanced async control without forcing all users to manage polling.
- Paired item metadata preserves source-row traceability.

## Automation Opportunities

- Trigger generation from campaign changes, CRM events, form submissions, or webhooks.
- Batch creative variants from spreadsheet/database rows.
- Route failures to retry/approval branches.
- Poll long-running jobs asynchronously.
- Register assets and return IDs to downstream systems.
- Use campaign status transitions after workflow completion.
- Add idempotency keys from n8n execution ID plus asset request ID.
- Support `continueOnFail` semantics in Creative Orchestrator as per-job failure isolation.

## Gap Analysis

- MavenSync Creative Orchestrator does not yet expose a native automation trigger boundary.
- Campaign Jobs need item-level lineage and idempotency metadata.
- Asset Manager needs binary/remote-ingestion normalization with MIME, filename, size, and source URL metadata.
- Provider Registry needs configurable model parameter profiles rather than static component branching.
- Job status needs a first-class request-ID-only/deferred polling state.
- n8n workflow export/import is not yet a MavenSync concern; use an adapter rather than adopting n8n as core architecture.

## MavenSync Integration Opportunities

### Immediate

- Add idempotency and source execution metadata to CreativeJob. High value, low difficulty.
- Add binary/URL asset ingestion helper through AssetManager. High value, medium difficulty.
- Preserve item/variant lineage in CampaignAsset metadata. High value, low difficulty.

### Phase 2

- Add a provider-neutral webhook/automation ingress contract. Very high value, medium effort.
- Add deferred polling and request-ID handoff to Creative Orchestrator. High value, medium effort.
- Add batch request expansion from Campaign Plan variables. Very high value, medium effort.

### Future

- Add n8n-compatible export/import adapter.
- Add workflow execution callbacks/events.
- Add external automation credential references without exposing provider secrets.

## Database Impact

| Feature | Existing tables affected | New tables | New columns | Migration | Relationships |
|---|---|---|---|---|---|
| Batch item lineage | `creative_jobs`, `assets`, campaign plans | None | `sourceExecutionId`, `sourceItemIndex`, `variantKey` | Additive if durable persistence exists | Execution item to job/asset |
| Idempotency | `creative_jobs` | Optional unique index | `idempotencyKey` | Required before external automation production | One key to one active job |
| Deferred request IDs | `creative_jobs` | None | `providerJobId`, `pollAfter`, `externalStatus` | Additive | Job to provider run |
| Upload ingestion | `assets` | None | `sourceUri`, `sourceFilename`, `sourceMimeType`, `sizeBytes` | Additive | Asset to source input |
| Batch campaign variants | Campaign plans/jobs | Optional `campaign_plan_items` | `itemKey`, `variables` | Future | Plan item to jobs/assets |

## API Surface

- Provider calls: upload, submit, status polling, optional cancel.
- Internal endpoints: request submit, job status, asset ingestion, webhook/automation ingress.
- Background jobs: polling, upload materialization, batch expansion, retry.
- Event system: job submitted, completed, failed, retrying, asset created.
- Queue requirements: recommended for batch and deferred polling; not needed for a single synchronous request.
- Retry logic: transient errors and rate limits retry; validation/billing errors route to failure branch.
- Polling: configurable interval and timeout.
- Streaming: not required; progress events are sufficient.
- Webhooks: recommended for external automation callbacks.

## Codex Implementation Prompts

### Idempotent Creative Job Submission

Add an idempotency key to CreativeJob creation and reject duplicate active submissions for the same campaign/request key. Do not change provider calls or UI. Add tests for duplicate, completed, and retryable cases.

### Batch Variant Expansion

Implement a pure CampaignPlan expansion helper that takes a list of variable records and produces one provider-neutral AssetRequest per record. Preserve recipe and reference metadata; do not call providers or add UI.

### Asset Ingestion Metadata

Add a local-only AssetManager ingestion helper accepting binary metadata or a remote URL reference. Store filename, MIME, size, and source metadata without downloading files or changing the storage adapter contract.

### Deferred Polling State

Extend CreativeJob metadata to support request-ID-only execution and a next-poll timestamp. Preserve existing lifecycle statuses and add deterministic status-summary tests.

## Ignore List

- Recreating n8n’s node UI inside MavenSync.
- Adding n8n as a runtime dependency.
- Copying static model registries into studio components.
- Direct provider calls from automation adapters.
- Exposing API keys in campaign or job data.
- Treating n8n execution history as Creative Asset history.
