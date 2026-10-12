import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const librarySource = readFileSync(new URL("./AssetLibraryStudio.jsx", import.meta.url), "utf8");

// The measured defect: `downloadSelected` had no in-flight state, so three clicks on one opened
// video started three independent transfers of the same 1,845,462 B object and handed the browser
// three saves with no visible feedback. The Creative Library download action is guarded here; the
// shared `downloadAsset` helper and every other studio keep their existing behaviour.

test("a download in flight is recorded, so a second click cannot start another transfer", () => {
  // The lock is synchronous (a ref), because clicks in one tick would all read the rendered state
  // from the frame still on screen and start a transfer each.
  assert.match(librarySource, /const downloadInFlight = useRef\(null\);/);
  assert.match(librarySource, /if \(!asset \|\| !assetUrl\(asset\) \|\| downloadInFlight\.current\) return;/);
  assert.match(librarySource, /downloadInFlight\.current = asset\.id;/);
  assert.match(librarySource, /finally \{\s*downloadInFlight\.current = null;\s*setDownloadingId\(null\);\s*\}/);
  // ...and the rendered state is what the controls show.
  assert.match(librarySource, /const \[downloadingId, setDownloadingId\] = useState\(null\);/);
  assert.match(librarySource, /setDownloadingId\(asset\.id\);/);
});

test("the download controls report the in-flight transfer instead of silently repeating it", () => {
  // Both surfaces that can start a download — the details panel and the full-size preview — are
  // disabled while any download is in flight and label the asset that is actually downloading.
  const controllers = librarySource.split("void downloadSelected(").slice(1);
  assert.equal(controllers.length, 2);
  for (const controller of controllers) {
    assert.match(controller, /disabled=\{Boolean\(downloadingId\)\}/);
    assert.match(controller, /aria-busy=\{downloadingId === (selected|previewAsset)\.id \? "true" : undefined\}/);
    assert.match(controller, /Downloading…/);
  }
});

test("a failed download still reports itself and one success is still one asset reference", () => {
  assert.match(librarySource, /if \(!result\.ok\) setDownloadError\("This media could not be downloaded\. Please try again\."\);/);
  // No new fetch path: the guard wraps the existing single call with the asset's own reference.
  assert.match(librarySource, /const result = await downloadAsset\(assetUrl\(asset\), \{ id: asset\.id, kind: assetType\(asset\), prefix: assetTitle\(asset\) \}\);/);
  assert.equal((librarySource.match(/downloadAsset\(/g) || []).length, 1);
});
