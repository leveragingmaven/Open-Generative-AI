# Creative Jobs

## Purpose

Manage the lifecycle and provenance of every creative execution request.

## Responsibilities

- Create jobs from Asset Requests.
- Track attempts, dependencies, priority, idempotency, and checkpoints.
- Coordinate Provider Registry execution.
- Emit progress and lifecycle events.
- Retry, cancel, recover, and summarize jobs.
- Connect results to Creative Assets.

## Inputs and Outputs

**Inputs:** Campaign Plan, Asset Request, compiled recipe, Model Selection.

**Outputs:** Job state, attempts, provider IDs, progress, results, asset IDs, errors.

## Internal Workflow

```text
planned -> pending -> queued -> running -> materializing -> completed
                          └-> retrying -> queued
                          └-> cancelled/failed
```

## Data Ownership

Jobs own execution state and attempts. Assets own durable media identity; Publishing owns delivery state.

## Dependencies

Provider Registry, Asset Library, policy, event delivery, idempotency store.

## API Boundary

`/creative/jobs`, `/creative/jobs/:id/events`, retry/cancel operations.

## Caching

Short-lived status cache only; durable job state is authoritative.

## Failure Handling

Classify errors, retry transient failures, isolate batch items, recover from checkpoints, and preserve lineage.

## Extension Points

Approval gates, dependent media stages, voice turns, automation triggers, webhook status, and durable workers.

## Current Implementation Foundation

The execution foundation is under `packages/studio/src/lib/intelligence`:

- `ExecutionContext.js` captures resolved recipe, projected memory, routing, policy, correlation, idempotency, and audit metadata.
- `ExecutionAttempt.js` models future provider attempts without invoking a provider.
- `ExecutionPersistence.js` defines injectable persistence with an in-memory implementation.
- `ExecutionInfrastructure.js` provides idempotency, retry policy, cancellation, and event seams.
- `CreativeExecutionEngine.js` validates plans, creates jobs, transitions lifecycle state, creates attempts, and records results/errors.

Provider execution integration now occurs only through the injected `ProviderExecutionPort`/`ProviderRegistryExecutionAdapter` boundary. `ExecutionResult` and `ExecutionError` normalize provider outcomes without exposing vendor-specific behavior to the engine. Registered providers can return completed results or accepted/asynchronous task references. Asset materialization remains a future boundary. The existing lightweight `CreativeOrchestrator` remains a planning/execution-plan helper.

## Asynchronous Execution Foundation

- `ProviderTask.js` normalizes submitted, queued, processing, waiting, completed, failed, cancelled, expired, and unknown task states.
- `PollingPolicy.js` provides injectable interval, duration, check-count, backoff, and jitter settings.
- `ExecutionCheckpoint.js` and `CheckpointRepository.js` preserve resumable task metadata.
- `AsyncExecutionCoordinator.js` submits, polls, emits normalized task events, handles terminal states, and supports cancellation through an injected provider task port.
- `CreativeExecutionEngine.executeAsync()` integrates this lifecycle without changing existing studio polling.

No queue daemon or durable worker is included in this foundation.

## Related Documents

[Provider Registry](Provider_Registry.md), [Creative Assets](Creative_Assets.md), [Publishing Engine](Publishing_Engine.md), [Studio Contract](../Studio_Contract.md).
