# Creative Asset Library

## Architecture

The Creative Asset Library is a platform workspace over canonical `CreativeAsset` records. It does not create a second asset format and does not own provider execution.

```text
CreativeAsset Repository
  -> AssetLibraryService
  -> Search / Filter / Sort / Lineage
  -> AssetLibraryStudio
```

Legacy per-studio histories are read through compatibility normalization only. They are not migrated or deleted.

## Service Layer

`AssetLibraryService` provides canonical and legacy-compatible retrieval, metadata search, filters, sorting, favorite/archive updates, and parent/child lineage lookup.

## Browser Workspace

`AssetLibraryStudio` provides left navigation, grid browsing, global search, sort controls, previews, a details panel, favorite actions, and empty-state handling using the existing MavenSync visual language.

## Search Architecture

Current search is metadata-based and local behind `AssetLibraryService`. Future semantic search can replace or augment the query implementation without changing the UI contract.

## Collections and Lineage

Collections reference asset IDs. Lineage uses existing asset identifiers, parent versions, relationships, and metadata for generated, edited, upscaled, extended, remixed, varied, and published derivatives.

## Compatibility

Canonical repository records display directly. Legacy histories are normalized on read without historical migration or deletion.
