# Repository 06: Free-AI-Social-Media-Scheduler

## Repository Summary

This repository is a small self-hosted social publishing application for scheduling video posts to YouTube and TikTok. Its reusable value is the publishing-domain lifecycle, account connection abstraction, post database model, credit/refund behavior, scheduled due-item processing, request-ID polling, upload fallback, and post history API.

**Target users:** Creators, marketers, agencies, and self-hosted teams publishing video content.

**Strengths:** Simple relational model, clear scheduled/processing/completed/failed states, request-ID tracking, account ownership checks, reschedule/retry behavior, and a minimal self-hosted deployment model.

**Weaknesses:** Platform fields are embedded in one table, GET performs due processing and polling, publisher endpoints are hardcoded, account identity handling is platform-specific, and there is no campaign/asset/approval abstraction.

**Problem solved:** Turns hosted media URLs into scheduled or immediate platform publishing attempts with persistent history.

## Skill Inventory

- Connect and list social accounts.
- Upload a media file or use a fallback data URL.
- Schedule a video for a future time.
- Publish immediately.
- Configure YouTube title, description, tags, privacy, category, and kids flag.
- Configure TikTok privacy, comments, duets, and stitches.
- Track scheduled, processing, completed, and failed posts.
- Poll asynchronous publishing results.
- Retry/reschedule failed posts.
- Delete posts when not processing.
- Deduct credits on execution and refund on failed publishing.
- View published URL/result metadata.

## Workflow Intelligence

### Scheduled publication

```text
Select account + media + metadata + future time
  -> persist ScheduledPost(status=scheduled)
  -> due check
  -> deduct credits
  -> submit platform publish request
  -> persist requestId/status=processing
  -> poll provider result
  -> completed URL or failed/refund
```

### Immediate publication

```text
Validate credits
  -> deduct credit
  -> submit provider request
  -> create processing post record
  -> poll status
  -> complete or refund/fail
```

### Reschedule/retry

- PATCH updates scheduled time and resets status to scheduled.
- Failed metadata can be edited.
- Processing posts are protected from deletion/modification.

### Account workflow

- Authenticate user.
- Fetch external YouTube accounts and first-party TikTok accounts.
- Normalize platform/account display fields for UI selection.
- Keep account access scoped to the current user/session.

## Prompt Intelligence

The scheduler contains little generation prompting. Its useful prompt-adjacent intelligence is content packaging:

- A generated asset is transformed into platform-specific title, description, tags, privacy, and audience metadata.
- Platform overrides should be generated from a canonical campaign caption/brief rather than manually duplicated.
- Publishing metadata should be versioned separately from the Creative Asset.

Recommended MavenSync formula:

```text
Creative Asset + Campaign context + platform capability
  -> platform publishing metadata
  -> approval
  -> publishing job
```

## Recipe Catalog

### Scheduled Video Publication

- **Studio:** Publishing Center / Campaign Builder
- **Required inputs:** Asset ID, destination account, scheduled time.
- **Optional inputs:** Caption/title, description, tags, platform overrides, privacy.
- **Outputs:** Publishing job and status history.

### Immediate Video Publication

- **Studio:** Publishing Center
- **Required inputs:** Asset ID, destination account.
- **Optional inputs:** Platform metadata.
- **Outputs:** Processing/published/failed status.

### Multi-Account Distribution

- **Studio:** Publishing Center / Campaign Builder
- **Required inputs:** Asset ID, approved destination account set.
- **Optional inputs:** Per-platform metadata overrides and staggered times.
- **Outputs:** One child publishing job per account/platform.

### Retry Failed Publication

- **Studio:** Publishing Center
- **Required inputs:** Failed publishing job.
- **Optional inputs:** Edited metadata or new schedule.
- **Outputs:** New attempt linked to original job.

### Platform Metadata Compilation

- **Studio:** Creative Intelligence / Knowledge Center
- **Required inputs:** Campaign objective, asset, audience, platform capability.
- **Outputs:** Title/caption/description/tags and platform-specific validation result.

## Model Intelligence

This repository does not add new generation models. It consumes hosted media and invokes MuAPI publishing endpoints. The reusable model insight is that publishing should be capability-driven by destination platform and account permissions, not by generation model.

## Studio Mapping

- **Campaign Builder:** Select approved assets and destination/account plans.
- **Creative Intelligence Layer:** Compile platform metadata and validate campaign intent.
- **Creative Asset Library:** Supply durable asset IDs and media delivery URLs.
- **Publishing Center:** Account selection, metadata editing, schedule, approval, retry, history.
- **Provider Registry:** Publishing transport adapter and account capability lookup.
- **Knowledge Center:** Brand voice, platform tone, prohibited claims, hashtag guidance.
- **Workflow Studio:** External triggers and post-publication branching, not core publishing state ownership.

## UX Patterns

- Account connection status panel.
- Platform-aware metadata form.
- Schedule date/time control.
- Immediate versus scheduled action distinction.
- Post history with status, error, request ID, and published URL.
- Processing records protected from destructive edits.
- Retry/reschedule action for failed records.
- Credit balance and estimated cost shown before submission.
- Multi-account selection for distribution.
- Platform-specific fields shown conditionally.

## Automation Opportunities

- Due-item worker/queue instead of request-triggered processing.
- Per-account child publishing jobs.
- Retry with exponential backoff and error classification.
- Webhook-first status updates with polling fallback.
- Approval gate before credit deduction/submission.
- Campaign completion when all destinations succeed or reach terminal failure.
- Refund/credit settlement as an idempotent accounting operation.
- Post-publication event to n8n/GHL or Campaign status.

## Gap Analysis

- MavenSync already has publishing draft/provider foundations but needs durable account/job schemas and confirmed transport behavior.
- Core Campaign and Creative Asset models need references from publishing drafts/jobs without embedding platform fields in Campaign.
- Publishing state should be separate from CreativeJob generation state.
- Due-item processing should not happen inside a read endpoint.
- Credits and refunds require an idempotent ledger rather than direct balance mutation.
- Account credentials must remain server-side and tenant-scoped.

## MavenSync Integration Opportunities

### Immediate

- Use `assetId` instead of raw media URL in publishing drafts while resolving a delivery URL at submission. High value, medium effort.
- Add explicit publishing attempt/request ID and terminal status mapping. High value, low effort.
- Add platform capability validation before approval. High value, medium effort.

### Phase 2

- Add durable publishing job/account relationship models. Very high value, medium effort.
- Add approval -> schedule/publish transition. Very high value, medium effort.
- Add idempotent credit/usage settlement. High value, high effort.

### Future

- Add YouTube/TikTok adapters through Provider Registry.
- Add platform expansion via capability manifests.
- Add webhook/event integrations for n8n/GHL.

## Database Impact

| Feature | Existing tables affected | New tables | New columns | Migration | Relationships |
|---|---|---|---|---|---|
| Publishing drafts | Campaigns, assets | `publishing_drafts` | `campaignId`, `assetIds`, `status`, `scheduledAt` | Required for durable publishing | Campaign/assets to draft |
| Publishing accounts | User/tenant | `publishing_accounts` | `platform`, `providerAccountId`, `displayName`, `status`, `credentialRef` | Required | Tenant to accounts |
| Publishing jobs | Creative jobs if reused carefully | `publishing_jobs` | `draftId`, `accountId`, `providerJobId`, `status`, `publishedUrl`, `error` | Required | Draft/account to attempts |
| Publishing attempts | Publishing jobs | `publishing_attempts` | `attempt`, `startedAt`, `completedAt`, `error`, `requestId` | Recommended | Job to attempts |
| Credit accounting | User/tenant | `usage_ledger` | `eventType`, `amount`, `referenceId`, `idempotencyKey` | Required for production billing | Ledger to job/draft |
| Platform metadata | Drafts | None or JSON field | `platformOverrides` | Additive | Draft to platform variants |

Do not place YouTube/TikTok fields directly on the core Campaign model.

## API Surface

- Provider calls: account list/connect, publish submit, status polling, optional cancel/delete.
- Internal endpoints: account list, draft create/update, validate, schedule, publish-now, job status, retry, reschedule, delete.
- Background jobs: due scheduling, submission, polling, retry, settlement.
- Event system: draft approved, job submitted, published, failed, refunded, account disconnected.
- Queue requirements: required for reliable scheduled publication and retries.
- Retry logic: classify auth, rate-limit, transient, media, validation, and billing errors.
- Polling: fallback for providers without webhooks.
- Streaming: not needed; status events are sufficient.
- Webhooks: preferred for provider status and account changes.

## Codex Implementation Prompts

### Publishing Asset IDs

Update publishing draft contracts to reference Creative Asset IDs while preserving temporary URL compatibility. Add validation and delivery-resolution tests. Do not implement live social publishing.

### Publishing Job Model

Add provider-neutral publishing job and attempt models with status, provider job ID, account ID, draft ID, error, and published URL. Do not alter provider transport or UI.

### Approval Gate

Implement a publishing draft approval transition that blocks submission until approved. Add legal transition tests and preserve existing draft validation.

### Idempotent Settlement

Add a usage ledger interface for publishing credit deductions/refunds keyed by job attempt idempotency key. Do not integrate Stripe or change account billing in this milestone.

## Ignore List

- Copying the scheduler UI.
- Hardcoding YouTube/TikTok fields into Campaign.
- Triggering due processing from GET requests.
- Direct MuAPI calls from UI components.
- Mutating balances without a ledger/idempotency key.
- Treating platform account credentials as Creative Asset metadata.
- Adding social APIs during the Creative Intelligence foundation phases.
