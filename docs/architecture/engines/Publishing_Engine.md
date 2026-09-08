# Publishing Engine

## Purpose

Deliver approved Creative Assets to external destinations without regenerating or mutating source creative.

## Responsibilities

- Manage accounts, drafts, approvals, schedules, jobs, attempts, and status.
- Validate platform capabilities and metadata.
- Submit through Provider Registry publishing adapters.
- Retry transient failures and reconcile usage/credits.
- Support webhook and polling status.

## Inputs and Outputs

**Inputs:** Asset IDs, Campaign, Publishing Draft, account, platform metadata, schedule.

**Outputs:** Publishing Job, attempts, published URLs, errors, analytics events.

## Internal Workflow

```text
Select assets -> compile metadata -> validate -> approve -> schedule/submit -> track -> publish
```

## Data Ownership

Publishing owns delivery state and account references. Creative Assets remain source-of-truth for media.

## Dependencies

Asset Library, Provider Registry, policy, scheduler/queue, usage ledger, Analytics.

## API Boundary

`/creative/publishing/drafts`, approval, jobs, status, retry, and account endpoints.

## Caching

Account capabilities, platform schemas, and validation metadata.

## Failure Handling

Classify auth, validation, media, rate-limit, provider, and billing errors. Reconcile deductions/refunds idempotently.

## Extension Points

Platform capability manifests, multi-account distribution, webhook adapters, platform-specific metadata recipes, and approval policies.

## Related Documents

[Creative Assets](Creative_Assets.md), [Creative Jobs](Creative_Jobs.md), [API Contracts](../API_Contracts.md), [MuAPI Publishing Foundation](../../MUAPI_PUBLISHING.md).
