# MavenSync Creative OS Architecture Gap Analysis

**Review basis:** Current repository implementation compared with `Creative_OS_Architecture_v1.md` and the focused architecture library under `docs/architecture/`.

**Scope:** Assessment only. No application code was modified for this review.

## Executive Assessment

MavenSync has the beginnings of the Creative Operating System boundary, but the current repository is still a browser/package-level foundation rather than a complete execution platform.

The strongest matches are:

- Shared recipe-backed prompt construction across active studios.
- Provider facade and MuAPI adapter boundary.
- Local Creative Asset model, Asset Manager, Storage Adapter, and Storage Registry.
- Campaign, CampaignAsset, CampaignStatus, and CampaignManager foundations.
- Campaign templates, plans, asset requests, and planning helpers.
- Provider-neutral Creative Jobs and execution plans at an in-memory orchestration level.
- MavenSync context and asset handoff foundations.
- Publishing type/provider boundaries with explicit unsupported live operations.

The largest gaps are:

- No durable Creative Job Manager.
- No real Capability Router or deployment registry.
- No Creative Memory Engine.
- No canonical API boundary for Creative Intelligence requests.
- Generated assets are not consistently materialized into owned storage.
- Workflow, Design Agent, and agent packages still have parallel execution paths.
- Publishing is normalized but not operationally connected to confirmed social transports.
- Analytics, policy, usage, queue, event, and recovery systems are not implemented.

## Milestone Legend

| Code | Architecture milestone |
|---|---|
| M0 | Current foundation and compatibility hardening |
| M1 | Creative Intelligence Core |
| M2 | Capability Router |
| M3 | Durable Creative Jobs |
| M4 | Durable Creative Asset Library |
| M5 | Creative Memory |
| M6 | Workflow Engine convergence |
| M7 | Publishing Engine |
| M8 | Voice Studio |
| M9 | Analytics and optimization |

## 1. What Matches the Architecture

### 1.1 Recipe-backed prompt construction

**Status:** Matches.

Active package studios use `buildRecipe()` for the migrated generation paths:

- Cinema
- Image
- Marketing
- Video T2V/I2V/V2V
- Draw/Edit
- AI Influencer
- Vibe Motion
- Audio
- Recast
- Lip Sync
- Workflow text inputs

**Architecture alignment:** Recipes are separated from provider transport and studio UI.

**Milestone:** M1 complete for current prompt migration.

### 1.2 Provider facade

**Status:** Partial-to-strong match.

`packages/studio/src/lib/providers/ProviderRegistry.js` and `MuApiProvider.js` provide a shared package-level provider boundary. Active package studios call the facade rather than importing `muapi.js` directly.

**Architecture alignment:** Studios do not own MuAPI transport.

**Limitations:** The registry is still primarily a compatibility facade around MuAPI functions. It does not yet expose normalized capability/deployment selection, health, cost, license, or generic execution contracts.

**Milestone:** M0/M1 complete; M2 required for full alignment.

### 1.3 Local Creative Asset model

**Status:** Matches foundation scope.

`CreativeAsset`, `AssetManager`, `StorageAdapter`, `LocalStorageAdapter`, `StorageRegistry`, collections, tags, serialization, cloning, and version lineage exist under `packages/studio/src/lib/intelligence`.

**Architecture alignment:** Asset identity is separated from storage implementation.

**Limitations:** Existing studios still maintain independent histories and most outputs remain provider URLs plus local metadata.

**Milestone:** M0 complete; M4 required for full alignment.

### 1.4 Campaign domain

**Status:** Matches foundation scope.

Campaign, CampaignAsset, CampaignStatus, CampaignManager, templates, plans, asset requests, CampaignBuilder, and CampaignPlanner exist.

**Architecture alignment:** Campaigns describe goals and planned work without embedding provider details.

**Limitations:** Campaign persistence is local adapter-backed and planning is not yet connected to durable execution or Memory projections.

**Milestone:** M1 foundation complete; M3/M5/M7 extend it.

### 1.5 Creative execution model

**Status:** Partial match.

`CreativeJob`, `CreativeJobStatus`, `CreativeExecutionPlan`, and `CreativeOrchestrator` convert asset requests into provider-neutral in-memory jobs and track basic lifecycle transitions.

**Architecture alignment:** Execution is separated from planning and provider calls.

**Limitations:** No durable repository, attempts, idempotency, checkpoints, events, workers, retries with backoff, provider invocation, or asset materialization.

**Milestone:** M1 foundation; M3 required.

### 1.6 MavenSync integration context

**Status:** Partial match.

MavenSync launch context, project/campaign connectors, Knowledge connector, asset handoff, and safe reporting exist.

**Architecture alignment:** External Hub context is normalized and optional.

**Limitations:** There is no Creative Memory projection engine, confidence/version model, or recipe-scoped context compiler.

**Milestone:** M0 foundation; M5 required.

### 1.7 Publishing boundary

**Status:** Partial match.

Publishing types, validation, platform capability registry, local history, provider registry, MuAPI publishing facade, route boundary, and status reporting exist.

**Architecture alignment:** Publishing is treated as separate from generation and uses normalized drafts/jobs.

**Limitations:** Live upstream publishing operations are explicitly unsupported; account, durable publishing job, attempts, queue, approval, webhook, and usage ledger are missing.

**Milestone:** M7.

## 2. Partial Matches Requiring Completion

### 2.1 Studio Contract

**Current state:** Studios use common props and provider facade functions, but most still construct provider-shaped parameter objects directly and receive result URLs rather than canonical Creative Job/Asset responses.

**Required change:** Introduce an application-level Creative Intelligence client/facade that accepts `CreativeRequest` and returns `CreativeJobAccepted`. Keep legacy provider functions as compatibility adapters during migration.

**Milestone:** M1, followed by per-studio migration in M3/M4.

### 2.1a Image Studio Runtime Bridge

**Status:** Compatibility bridge implemented; production cutover remains pending.

**Implemented:** Image Studio request normalization and injectable Creative OS runtime composition for intelligence, execution, and materialization testing without changing the component or provider behavior.

**Remaining:** Register image capabilities/deployments, connect production storage/materialization policy, and migrate the component behind a feature flag with parity validation.

**Milestone:** M5/Image Studio migration foundation.

### 2.1b Image Studio Runtime Cutover

**Status:** Feature-flagged production runtime path implemented with legacy fallback.

**Implemented:** Image Studio T2I/I2I requests can traverse Creative Intelligence, production Capability Router registrations, Creative Execution Engine, Provider Registry, normalized results, and optional asset materialization.

**Compatibility:** `CREATIVE_OS_IMAGE_STUDIO=false` preserves legacy behavior. Runtime failures before a usable result fall back to the existing provider path.

**Remaining:** Enable by default only after live parity validation, then remove the fallback after all rollback criteria are met.

**Milestone:** M5 production consumer; other studio migrations remain separate.

### 2.1c Marketing Studio Runtime Bridge

**Status:** Feature-flagged compatibility bridge implemented; production cutover remains rollout-controlled.

**Implemented:** Marketing request normalization, recipe/routing/runtime composition, response compatibility, and automatic legacy fallback.

**Remaining:** Enable by default after live parity validation and migrate subsequent studios independently.

**Milestone:** M5 second production consumer.

### 2.1d Media Studio Runtime Bridges

**Status:** Cinema, Video, Lip Sync, and Audio have feature-flagged runtime adapters with legacy fallback.

**Implemented:** Per-studio request adapters preserve existing provider-shaped payloads while composing Creative OS runtime requests and response compatibility.

**Remaining:** Enable flags after live parity validation, then remove legacy fallback paths only after rollback criteria are met.

**Milestone:** M5 media consumer rollout.

### 2.1e Specialized Studio Runtime Bridges

**Status:** Recast, Vibe Motion, and AI Influencer have independent feature-flagged runtime adapters with legacy fallback.

**Implemented:** Provider-neutral request normalization preserving specialized references, modes, operations, and response compatibility.

**Remaining:** Runtime rollout parity validation and separate Workflow Studio migration.

**Milestone:** M5 specialized consumer rollout.

### 2.2 Provider Contract

**Current state:** `CreativeProvider` exposes capability names and MuAPI function methods.

**Required change:** Add normalized provider adapter concepts for submit/status/cancel/health/cost and deployment metadata without removing legacy facade exports.

**Milestone:** M2.

### 2.3 Workflow Engine

**Current state:** Workflow provider adapters and vendored workflow builder exist. Workflow execution normalizes presets/runs/assets, but the builder still has independent graph execution, polling, output history, and prompt interpolation.

**Required change:** Establish one canonical workflow run/job boundary, preserve builder compatibility, and map node runs to Creative Jobs and Creative Assets.

**Milestone:** M6.

### 2.4 Design Agent and Agent packages

**Current state:** Provider adapter foundations exist, but embedded packages still perform direct Axios/API route calls and maintain session/job/asset behavior independently.

**Required change:** Add compatibility bridges first, then converge session assets and jobs onto canonical Asset and Job contracts.

**Milestone:** M1 compatibility; M3/M4/M6 convergence.

### 2.5 Asset ownership

**Current state:** Asset Manager and local storage abstraction exist, but generated outputs are not consistently persisted through them. Per-studio histories and provider-hosted URLs remain authoritative in practice.

**Required change:** Dual-write/import histories, materialize outputs asynchronously, preserve temporary provider references, and expose canonical Asset IDs.

**Milestone:** M4.

## 3. Missing Architecture Components

### 3.1 Knowledge Engine

**Status:** Missing as a distinct engine.

Existing MavenSync Knowledge connector normalizes selected context, but it does not provide a general Knowledge Object lifecycle.

**Missing:** Ingestion, source provenance, classification, approval, versioning, scoped projections, permission filtering, and invalidation.

**Milestone:** M5.

### 3.2 Creative Memory Engine

**Status:** Foundation implemented; full engine remains incomplete.

**Implemented:** Extensible memory types, scoped records, confidence/version fields, local storage adapter, registry, selective projections, cache seam, update/archive/invalidation primitives.

**Remaining:** Knowledge Object ingestion, source synchronization, permission enforcement, approval workflows, durable storage, retention policies, conflict resolution, and production cache infrastructure.

**Milestone:** M5 foundation complete; remaining M5 work follows.

### 3.2a Creative Intelligence Engine

**Status:** Foundation implemented.

**Implemented:** Provider-neutral request normalization, recipe resolution, selective memory projection requests, capability requirement assembly, optional routing coordination, warnings, and plan validation.

**Remaining:** Intent classification, policy integration, durable API boundary, Campaign Builder integration, multimodal interpretation, and Creative Job handoff.

**Milestone:** M1 foundation complete; job/provider integration remains M3.

### 3.3 Capability Router

**Status:** Production catalog foundation implemented; runtime routing remains incomplete.

**Implemented:** Extensible capability definitions, production capability/deployment catalog, provider-neutral deployment metadata registry, required-capability matching, feature-state/health/availability/policy filters, deterministic scoring, fallback candidates, and routing explanations.

**Remaining:** Live Provider Registry metadata synchronization, health/capacity refresh, pricing/evidence ingestion, deployment registry persistence, advanced constraint matching, learned ranking, and runtime routing adoption by studios/jobs.

**Milestone:** M2 foundation complete; remaining M2 work follows.

### 3.4 Creative Execution Engine

**Status:** Foundation implemented; durable execution remains incomplete.

**Implemented:** Execution contexts, extensible lifecycle states, attempts, injectable persistence, idempotency metadata, retry policy, cancellation/event seams, readiness validation, result/error recording, and lineage metadata.

**Remaining:** Durable repositories, process restart recovery, checkpoints, queues/workers, provider health/status integration, cancellation reconciliation, and asset materialization. Additional providers must implement the generic registry execution contract as they are added.

**Milestone:** M3/M4 execution foundation complete; provider execution and durable runtime remain.

### 3.5 Asset materialization and delivery

**Status:** Durable storage/materialization foundation implemented; production activation remains incomplete.

**Implemented:** Asset factory, structured metadata, references, lineage relationships, immutable version snapshots, injectable repository/index interfaces, object-storage contract, in-memory storage, S3-compatible adapter seam, remote-output validation, checksums, keys, delivery references, and partial-output materialization.

**Remaining:** R2 credentials/SDK activation, durable metadata repository, signed delivery implementation, retention, thumbnails/variants, production download controls, search indexing, and migration from per-studio histories.

**Milestone:** M4.

### 3.6 Analytics Engine

**Status:** Missing.

**Missing:** Append-only events, attribution, campaign metrics, asset performance, model evidence, recipe outcomes, cost reports, and optimization feedback.

**Milestone:** M9.

### 3.7 Policy and usage services

**Status:** Missing as shared engines.

**Missing:** Tenant policy, provider/model allowlists, license policy, content safety decisions, quotas, budget reservation, usage ledger, and idempotent refunds.

**Milestone:** M2 for routing policy; M3 for job budgets; M7 for publishing settlement.

### 3.8 Event and automation boundary

**Status:** Partial/missing.

Some status reporting and local subscriptions exist, but there is no shared event bus/outbox/webhook contract.

**Missing:** Job events, asset events, publishing events, automation triggers, webhook ingress, idempotency, and delivery retry.

**Milestone:** M3, M7, M9.

## 4. What Should Be Refactored Later

These are important but should follow stable contracts rather than be started as broad rewrites.

### 4.1 Replace compatibility provider methods

Refactor `generateImage`, `generateVideo`, `generateAudio`, and similar facade methods behind a canonical execution client only after M1/M2 contracts are stable.

**Milestone:** M3.

### 4.2 Converge duplicate polling

Existing MuAPI, workflow, Design Agent, and agent package polling should eventually use Creative Job Manager status handling.

**Milestone:** M3/M6.

### 4.3 Migrate local histories

Import existing `hg_*_persistent`, legacy histories, workflow output histories, and session assets into canonical Asset records with dual-read compatibility.

**Milestone:** M4.

### 4.4 Remove legacy Electron/Vite prompt paths

The legacy `src/components/*` and `src/lib/muapi.js` surface remains independently supported. Do not remove or rewrite it until product ownership and support status are explicitly decided.

**Milestone:** M0 decision; later migration separate from Creative OS core.

### 4.5 Converge Design Agent and Workflow packages

Use adapters and bridges first; remove direct package calls only after canonical API contracts are operational.

**Milestone:** M6.

### 4.7 Workflow Execution Engine

**Status:** Provider-independent orchestration foundation implemented.

**Implemented:** Extensible nodes, DAG validation, execution context, sequential/conditional execution, asset passing, retry hooks, failure propagation, cancellation, and partial completion.

**Remaining:** Creative OS node executor integration, durable workflow runs, checkpoint/recovery, UI migration, and convergence with the vendored Workflow Builder.

**Milestone:** M6 foundation complete; Workflow Studio migration remains separate.

### 4.6 Separate publishing from local draft history

The publishing package currently has useful normalized types but local persistence and unsupported live operations. Move to durable Publishing Draft/Job/Attempt domains when transport is confirmed.

**Milestone:** M7.

## 5. What Should Remain Unchanged

### 5.1 Existing studio UI

Do not redesign or rewrite current studio components as part of architecture convergence. Migrate behind compatibility facades.

### 5.2 MuAPI transport implementation

Keep `packages/studio/src/muapi.js` provider-specific. It is the correct location for MuAPI endpoint mapping until a generic adapter replaces it incrementally.

### 5.3 Existing provider facade exports

Keep backward-compatible exports while new intelligence execution APIs are introduced.

### 5.4 Existing MavenSync launch/context behavior

Preserve standalone, Agency, and Hub-launch fallback behavior. Improve security and consistency incrementally.

### 5.5 Existing local asset storage during migration

Keep localStorage as an active adapter until durable storage and import/rollback paths are proven.

### 5.6 Existing workflow builder behavior

Do not rewrite the vendored builder. Add canonical run/job/asset bridges around it.

### 5.7 Existing publishing type normalization

Retain normalized publishing drafts and validation as the migration seam for future durable publishing.

## 6. Implementation Milestone Matrix

| Gap | Current status | Required action | Milestone | Priority |
|---|---|---|---|---|
| Recipe-backed active studios | Matches | Maintain contract tests | M1 | Complete |
| Provider facade | Partial | Add normalized adapter contract | M2 | High |
| Semantic Studio API | Partial | Add Creative Intelligence client | M1 | P0 |
| Capability definitions | Missing | Add capability registry | M2 | P0 |
| Deployment/model registry | Missing | Separate logical models/deployments | M2 | P0 |
| Routing/scoring | Missing | Add explainable router | M2 | P0 |
| In-memory Creative Jobs | Partial | Add durable attempts/checkpoints/idempotency | M3 | P0 |
| Provider execution | Missing in orchestrator | Connect jobs to Provider Registry | M3 | P0 |
| Canonical asset writes | Partial | Dual-write and materialize outputs | M4 | P0 |
| Storage adapter | Matches foundation | Add durable adapter later | M4 | High |
| History migration | Missing | Import/dual-read existing histories | M4 | High |
| Knowledge normalization | Partial | Build Knowledge Object engine | M5 | P1 |
| Creative Memory | Missing | Add scoped projections/confidence/versioning | M5 | P0 |
| Workflow normalization | Partial | Map node runs to canonical jobs/assets | M6 | P1 |
| Design Agent convergence | Partial | Bridge sessions/jobs/assets | M6 | P1 |
| Publishing types | Partial | Add durable accounts/drafts/jobs/attempts | M7 | P0 |
| Publishing transport | Partial | Confirm/adapt live provider operations | M7 | P0 |
| Publishing queue | Missing | Add scheduler/worker boundary | M7 | P0 |
| Usage ledger | Missing | Add idempotent accounting | M7 | P1 |
| Voice domain | Missing | Add voice recipes/turn state/providers | M8 | P1 |
| Analytics | Missing | Add append-only events/attribution | M9 | P1 |
| Policy engine | Missing | Add policy and license filters | M2/M7 | P0 |
| Automation events | Partial | Add webhook/outbox/idempotency | M3/M7 | P1 |

## 7. Recommended Critical Path

```text
M1 Semantic Creative Request
  -> M2 Capability Router
  -> M3 Durable Creative Jobs + Provider Execution
  -> M4 Canonical Asset Materialization
  -> M5 Creative Memory
  -> M6 Workflow Convergence
  -> M7 Publishing
  -> M9 Analytics
```

Voice Studio should proceed after the core request/job/asset/memory contracts are stable, but its provider ports can be designed in parallel during M5.

## 8. Architectural Readiness Assessment

| Area | Assessment |
|---|---|
| Architecture direction | Strongly aligned |
| Active prompt/recipe separation | Strongly aligned |
| Provider isolation | Partial but usable migration seam |
| Campaign planning | Foundation exists |
| Job orchestration | Foundation exists, not durable |
| Asset abstraction | Foundation exists, not canonical across all studios |
| Memory | Not implemented as an engine |
| Routing | Not implemented |
| Workflow convergence | Partial |
| Publishing | Boundary exists, operational engine missing |
| Analytics | Missing |
| Provider expansion readiness | Contract direction is ready; runtime router/adapter work remains |

## 9. Conclusion

The repository is not architecturally misaligned. It is an incremental foundation with the correct major seams already present. The correct strategy is convergence, not rewrite:

1. Introduce the semantic Creative Request boundary.
2. Complete capability/deployment routing.
3. Connect the existing orchestrator to durable jobs and Provider Registry.
4. Make canonical Asset IDs authoritative through dual-write migration.
5. Add scoped Creative Memory projections.
6. Converge workflows and agent packages through adapters.
7. Build publishing and analytics as independent lifecycle domains.

The largest risk is allowing compatibility facades, local histories, and parallel workflow/agent execution paths to become permanent. Each should remain intentionally supported until its replacement is proven, with a documented removal gate.

## 4.9 Creative Asset Library Foundation

**Status:** Service and UI foundation implemented.

**Implemented:** Canonical/legacy asset browsing, metadata search, filters, sorting, favorites, archive filtering, details inspection, and parent/child lineage lookup.

**Remaining:** Durable index, semantic search, collection persistence, thumbnails/variants, signed delivery, and complete history migration.

**Milestone:** Platform 1.0 asset workspace foundation.

### 4.10 Front-End Platform Integration

**Status:** Asset Library navigation and service/UI validation complete.

**Implemented:** Main-shell access, canonical/legacy asset browsing, metadata search/filter/sort, favorites for canonical records, archive filtering, details, lineage display, and loading/error/empty states.

**Remaining:** Legacy-record write actions, durable search indexing, collection UI/persistence, thumbnails/variants, signed delivery, and history migration.

**Milestone:** Platform 1.0 integration validation.
