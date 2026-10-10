import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const librarySource = readFileSync(new URL("../packages/studio/src/components/AssetLibraryStudio.jsx", import.meta.url), "utf8");
const assetManagerSource = readFileSync(new URL("../packages/studio/src/lib/intelligence/AssetManager.js", import.meta.url), "utf8");
const adapterSource = readFileSync(new URL("../packages/studio/src/lib/intelligence/LocalStorageAdapter.js", import.meta.url), "utf8");
const serviceSource = readFileSync(new URL("../packages/studio/src/lib/intelligence/AssetLibraryService.js", import.meta.url), "utf8");

test("Creative Library remove control uses the existing AssetManager storage layer", () => {
  // The existing persistence mechanism (no new architecture) supports removal.
  assert.match(assetManagerSource, /removeAsset\(assetId\) \{\s*\n\s*return this\.adapter\.removeAsset\(assetId\);/);
  assert.match(adapterSource, /removeAsset\(assetId\)/);

  // Local canonical records and durable API records are removable; legacy
  // history entries without a supported persistence delete remain read-only.
  assert.match(librarySource, /const handleRemove = async \(asset\) => \{/);
  assert.match(librarySource, /deleteCreativeLibraryAsset\(asset\.id, \{ service, localAssetManager, localIds, durableIds \}\)/);
  assert.match(serviceSource, /localAssetManager\?\.removeAsset\(assetId\)/);
  assert.match(librarySource, /\(localIds\.has\(asset\.id\) \|\| durableIds\.has\(asset\.id\)\) && <button/);
  assert.match(librarySource, /setLocalIds\(new Set\(service\.list\(\{ includeLegacy: false \}\)\.map\(\(asset\) => asset\.id\)\)\);/);
  assert.match(librarySource, /Legacy history-only entries have no/);
  assert.match(librarySource, /Remove this asset from your library\?/);
  assert.match(librarySource, /Remove \$\{assetTitle\(asset\)\} from your library/);
});

test("Creative Library rename is local-only and removal refuses publishing-referenced assets", () => {
  assert.match(librarySource, /isAssetReferencedByPublishingDrafts\(assetId, center\.getDrafts\(\)\)/);
  assert.match(librarySource, /if \(isReferencedByDraft\(asset\.id\)\)/);
  assert.match(librarySource, /durableIds\.has\(selected\.id\).*localIds\.has\(selected\.id\)/s);
  assert.match(librarySource, /localAssetManager\.updateAsset\(asset\.id, \{ title \}\)/);
  assert.match(librarySource, /if \(durableIds\.has\(asset\.id\)\)/);
  assert.match(librarySource, /Asset title/);
});

test("Creative Library no longer tells customers to Open the create view from the empty grid", () => {
  assert.doesNotMatch(librarySource, />Open Create</);
  assert.match(librarySource, />Start creating</);
});

test("Asset preview and Use for Publishing handoff keep their existing paths", () => {
  assert.match(librarySource, /<AssetMedia asset=\{asset\} \/>/);
  assert.match(librarySource, /assetPreviewKind\(asset\)/);
  assert.match(librarySource, /Use for Publishing/);
  assert.match(librarySource, /center\.createDraftFromAsset\(asset/);
  assert.match(librarySource, /router\.push\(`\/studio\/publishing\?draft=/);
});

test("Saved image cards fall back to the stored thumbnail reference and survive broken sources", () => {
  assert.match(librarySource, /const thumbnail = asset\?\.thumbnail \|\| asset\?\.thumbnails\?\.\[0\]/);
  assert.match(librarySource, /onError=\{\(\) => setFailedSources\(\(sources\) => \[\.\.\.sources, imageUrl\]\)\}/);
});

test("Creative Library image cards reserve their frame and open a full-size preview", () => {
  assert.match(librarySource, /params\.set\('variant', 'thumbnail'\)/);
  assert.match(librarySource, /loading=\{eager \? "eager" : "lazy"\}/);
  assert.match(librarySource, /object-contain/);
  assert.match(librarySource, /loadedSource === imageUrl \? "opacity-100" : "opacity-0"/);
  assert.match(librarySource, /h-72 overflow-hidden.*sm:h-96 lg:h-\[30rem\]/);
  assert.match(librarySource, /setPreviewAsset\(asset\)/);
  assert.match(librarySource, /role="dialog" aria-modal="true"/);
  assert.match(librarySource, /<AssetMedia asset=\{previewAsset\} fullSize eager \/>/);
  assert.match(librarySource, /downloadSelected\(previewAsset\)/);
});
