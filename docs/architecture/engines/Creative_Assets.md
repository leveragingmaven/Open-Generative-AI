# Creative Assets

## Purpose

Provide canonical, reusable, versioned identity for creative inputs, outputs, intermediates, and variants.

## Responsibilities

- Normalize asset metadata.
- Store lineage, parent versions, roles, tags, collections, and provenance.
- Materialize provider outputs into owned storage when enabled.
- Manage thumbnails, frames, and variants.
- Resolve secure delivery references.
- Support search, filtering, archiving, and retention.

## Inputs and Outputs

**Inputs:** Uploads, provider outputs, job results, campaign relationships, edits.

**Outputs:** Asset records, variants, delivery URLs, comparison/lineage data.

## Internal Workflow

```text
Input/output -> validate -> canonicalize -> persist -> materialize -> index -> deliver
```

## Data Ownership

Asset Library owns asset identity and metadata. Storage adapters own physical persistence. Campaigns and Publishing reference assets.

## Dependencies

Storage Registry, object storage, metadata processors, Job Manager, Campaigns, Publishing.

## API Boundary

`/creative/assets` CRUD, clone, download, search, collection, and version operations.

## Caching

Metadata, thumbnails, search index, and signed delivery references within expiry.

## Failure Handling

Retain metadata if materialization fails, retry storage operations, and never make a provider URL the sole durable identity.

## Extension Points

R2/S3/filesystem adapters, semantic search, moderation, transformation variants, and Knowledge Center projection.

## Current Implementation Foundation

The first Asset Engine foundation is under `packages/studio/src/lib/intelligence`:

- `AssetFactory.js` transforms a successful normalized Execution Result into a canonical Creative Asset without copying the full execution plan.
- `AssetLineage.js`, `AssetVersion.js`, `AssetReference.js`, and `AssetMetadata.js` define extensible provenance, version, input-reference, relationship, and metadata contracts.
- `AssetRepository.js` and `AssetIndexer.js` define injectable persistence and search seams with in-memory implementations.
- `CreativeExecutionEngine.materializeResult()` can persist a successful result through the injected repository.

Materialization stores references to execution context, plan, job, memory provenance, recipe, provider, and deployment metadata. It does not upload files or change storage adapters. Existing `AssetManager` and studio histories remain compatible.

## Durable Storage Foundation

- `AssetStorage.js` defines provider-independent object operations: put, metadata, existence, delete, delivery, and signed delivery references.
- `InMemoryAssetStorage.js` is the automated-test implementation.
- `S3AssetStorage.js` is an injected S3-compatible seam suitable for Cloudflare R2 without bundling credentials or an SDK into browser code.
- `AssetMaterializer.js` validates remote references, downloads bounded outputs, computes SHA-256 checksums, generates collision-safe keys, stores technical metadata, and preserves per-output partial failures.

The repository currently has no R2 SDK/configuration runtime, so production R2 activation remains an explicit deployment task. Existing studio uploads and histories are unchanged.

### Opt-in R2 Smoke Test

No smoke test is run automatically. When an S3-compatible SDK/client and server-only environment are configured, an explicit test harness may exercise:

```text
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET
R2_ENDPOINT
```

The harness must upload a small object, verify metadata, create a bounded delivery reference, delete the object, and never print credential values. The current repository does not include or execute this harness because no R2 runtime is configured.

## Related Documents

[Creative Jobs](Creative_Jobs.md), [Publishing Engine](Publishing_Engine.md), [Domain Model](../Domain_Model.md), [Asset Architecture Audit](../../ASSET_ARCHITECTURE.md).
