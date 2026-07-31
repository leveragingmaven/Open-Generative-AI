# Creative Memory Engine

## Purpose

Provide reusable, scoped creative context without repeatedly transmitting entire business profiles or raw documents.

## Responsibilities

- Maintain Brand, Voice, Audience, Offer, Visual, Character, Product, Campaign, Platform, Claims, and Writing memory.
- Version and confidence-score memory facts.
- Resolve recipe-specific context projections.
- Enforce scope, permissions, retention, and invalidation.
- Promote explicitly approved creative decisions into memory.

## Inputs and Outputs

**Inputs:** Knowledge projections, approved assets, campaign decisions, user corrections, policy.

**Outputs:** Minimal recipe-scoped memory projection, provenance, confidence, version, freshness.

## Internal Workflow

```text
Resolve scope -> select memory domains -> filter permissions -> rank confidence -> project -> cache
```

## Data Ownership

Memory owns reusable creative facts and projections. Knowledge Engine owns source documents; Campaign owns campaign-specific state.

## Dependencies

Knowledge Engine, Recipe Engine, Asset Library, policy, cache, audit.

## API Boundary

`/memory`, `/memory/facts`, `/memory/project`, `/memory/invalidate`.

## Caching

Cache by organization/workspace/project/campaign scope, recipe version, projection schema, locale, and policy version.

## Failure Handling

Use the last approved projection when optional sources are unavailable. Never cross tenant boundaries or silently apply low-confidence facts as hard constraints.

## Extension Points

Memory promotion workflows, feedback learning, vector retrieval, multilingual projections, and confidence calibration.

## Current Implementation Foundation

The first implementation milestone is under `packages/studio/src/lib/intelligence`:

- `CreativeMemoryEngine` provides create, retrieve, list, update, archive, projection, and invalidation operations.
- `CreativeMemory` defines extensible typed, scoped, versioned, confidence-scored memory records.
- `MemoryRegistry` supports additional memory types without changing the engine.
- `MemoryStorageAdapter` provides local persistence through the existing storage boundary.
- `MemoryCache` provides an injectable cache seam without prescribing infrastructure.

This foundation is intentionally local and provider-independent. Knowledge Engine integration, durable persistence, approval workflows, and advanced synchronization remain future milestones.

## Related Documents

[Knowledge Engine](Knowledge_Engine.md), [Recipe Engine](Recipe_Engine.md), [Creative Jobs](Creative_Jobs.md), [Domain Model](../Domain_Model.md).
