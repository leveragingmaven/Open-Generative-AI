import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const librarySource = readFileSync(new URL("../packages/studio/src/components/AssetLibraryStudio.jsx", import.meta.url), "utf8");
const assetManagerSource = readFileSync(new URL("../packages/studio/src/lib/intelligence/AssetManager.js", import.meta.url), "utf8");
const adapterSource = readFileSync(new URL("../packages/studio/src/lib/intelligence/LocalStorageAdapter.js", import.meta.url), "utf8");

test("Creative Library remove control uses the existing AssetManager storage layer", () => {
  // The existing persistence mechanism (no new architecture) supports removal.
  assert.match(assetManagerSource, /removeAsset\(assetId\) \{\s*\n\s*return this\.adapter\.removeAsset\(assetId\);/);
  assert.match(adapterSource, /removeAsset\(assetId\)/);

  // The card grid wires a per-asset remove control through that mechanism,
  // shown ONLY for assets that have a stored local record. Durable-only cards
  // merged from /api/creative-assets must not display a misleading Remove.
  assert.match(librarySource, /const handleRemove = \(asset\) => \{/);
  assert.match(librarySource, /localAssetManager\.removeAsset\(asset\.id\);/);
  assert.match(librarySource, /localIds\.has\(asset\.id\) && <button/);
  assert.match(librarySource, /setLocalIds\(new Set\(service\.list\(\{ includeLegacy: true \}\)\.map\(\(asset\) => asset\.id\)\)\);/);
  assert.match(librarySource, /Durable-only cards merged/);
  assert.match(librarySource, /Remove this asset from your library\?/);
  assert.match(librarySource, /Remove \$\{assetTitle\(asset\)\} from your library/);
});

test("Creative Library no longer tells customers to Open the create view from the empty grid", () => {
  assert.doesNotMatch(librarySource, />Open Create</);
  assert.match(librarySource, />Start creating</);
});

test("Saved image cards fall back to the stored thumbnail reference and survive broken sources", () => {
  assert.match(librarySource, /asset\?\.thumbnail \|\| assetUrl\(asset\)/);
  assert.match(librarySource, /onError=\{\(\) => setImageFailed\(true\)\}/);
});
