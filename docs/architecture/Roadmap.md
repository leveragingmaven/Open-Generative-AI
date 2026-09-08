# Architecture Roadmap

## Phase 1: Creative Intelligence Core

Stabilize semantic requests, recipes, context, assets, jobs, and studio contracts.

**Depends on:** Existing intelligence layer, Campaign Builder, Asset Manager, Provider Registry.

**Done when:** Active studios use canonical contracts and contract tests cover request-to-asset flow.

## Phase 2: Capability Router

Add capability definitions, deployment metadata, weighted routing, cost/latency/license filters, health, and evidence freshness.

**Done when:** Routing decisions are explainable and policy-aware.

## Phase 3: Creative Jobs

Add durable attempts, retries, checkpoints, idempotency, cancellation, recovery, and events.

**Done when:** Jobs recover after restart and partial batches retry independently.

## Phase 4: Creative Asset Library

Materialize owned assets, unify histories, support versions, variants, thumbnails, collections, and delivery URLs.

**Done when:** All asset-producing paths create canonical records.

## Phase 5: Creative Memory

Normalize Knowledge Center context into scoped, versioned, confidence-scored projections.

**Done when:** Recipes request only required context with provenance.

## Phase 6: Workflow Studio

Add typed nodes, generic schemas, dependencies, chaining, references, preview, and partial retry.

**Done when:** Workflow runs produce traceable child jobs/assets and recover from node failure.

## Phase 7: Publishing

Add account, draft, approval, queue, publishing job, attempt, webhook/polling, and settlement domains.

**Done when:** Approved Asset IDs publish independently with auditable retries.

## Phase 8: Voice Studio

Add streaming STT/TTS, voice recipes, turn state, interruption, memory, and tool approvals.

**Done when:** Voice-to-brief and voice-agent flows use common recipe/job/asset contracts.

Related: [Creative Jobs](engines/Creative_Jobs.md), [Publishing Engine](engines/Publishing_Engine.md), [Creative Memory](engines/Creative_Memory.md).
