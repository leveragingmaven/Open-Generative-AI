import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const librarySource = readFileSync(new URL("../packages/studio/src/components/AssetLibraryStudio.jsx", import.meta.url), "utf8");
const pagingSource = readFileSync(new URL("../packages/studio/src/lib/assets/libraryPaging.js", import.meta.url), "utf8");
const gateSource = readFileSync(new URL("../packages/studio/src/lib/assets/useNearViewport.js", import.meta.url), "utf8");

test("the Creative Library shows twelve assets and reveals the next twelve on request", () => {
  assert.match(pagingSource, /export const CREATIVE_LIBRARY_PAGE_SIZE = 12;/);
  assert.match(librarySource, /const \[visibleCount, setVisibleCount\] = useState\(CREATIVE_LIBRARY_PAGE_SIZE\);/);
  assert.match(librarySource, /libraryPageWindow\(scopedAssets, visibleCount\)/);
  assert.match(librarySource, /libraryPageRemaining\(scopedAssets, visibleCount\)/);
  assert.match(librarySource, /onClick=\{\(\) => setVisibleCount\(\(count\) => count \+ CREATIVE_LIBRARY_PAGE_SIZE\)\}/);
  assert.match(librarySource, /Load \{Math\.min\(CREATIVE_LIBRARY_PAGE_SIZE, remainingAssets\)\} more assets/);
  assert.match(librarySource, /\{remainingAssets > 0 \? \(/);
  // Only the visible window is mapped, so the grid cannot mount every asset at once.
  assert.match(librarySource, /\{visibleAssets\.map\(\(asset\) =>/);
  assert.doesNotMatch(librarySource, /\{scopedAssets\.map\(/);
});

test("a new filter view restarts at the first page so batches never mix two result sets", () => {
  assert.match(librarySource, /useEffect\(\(\) => \{ setVisibleCount\(CREATIVE_LIBRARY_PAGE_SIZE\); \}, \[query, sort, typeFilter, favoriteFilter, archiveFilter, activeCampaign\?\.id\]\);/);
});

test("offscreen tiles never fetch their media", () => {
  assert.match(librarySource, /const \[frameRef, nearViewport\] = useNearViewport\(\{ enabled: !eager \}\);/);
  assert.match(librarySource, /if \(!eager && !nearViewport\) return frame\(<MediaSkeleton \/>\);/);
  assert.match(gateSource, /observer\.disconnect\(\)/);
  assert.match(gateSource, /typeof Observer !== "function"/);
});

test("a preview shows a skeleton and reports a failure instead of an empty frame", () => {
  assert.match(librarySource, /function MediaSkeleton\(\{ label = "Loading media" \}\)/);
  assert.match(librarySource, /animate-pulse/);
  assert.match(librarySource, /Preview unavailable/);
  assert.match(librarySource, /Open the asset to retry/);
});

test("a recoverable preview failure can be retried", () => {
  assert.match(librarySource, /const \[mediaAttempt, setMediaAttempt\] = useState\(0\);/);
  assert.match(librarySource, /onClick=\{\(\) => setMediaAttempt\(\(value\) => value \+ 1\)\}/);
  assert.match(librarySource, /key=\{mediaAttempt\}/);
  assert.match(librarySource, /setMediaAttempt\(0\);/);
});

test("a video tile is a poster until the asset is opened, so opening the library downloads no video", () => {
  assert.match(librarySource, /function MediaPoster\(\{ kind, note \}\)/);
  assert.match(librarySource, /return frame\(<MediaPoster kind="video" note="Open to play" \/>\);/);
  assert.match(librarySource, /if \(fullSize\) return <video src=\{videoUrl\}/);
  assert.doesNotMatch(librarySource, /kind\.includes\("video"\)\) return <video/);
});

test("an older externally hosted image is never routed through the R2 thumbnail endpoint", () => {
  // The resize endpoint only exists for stored objects, so a legacy external URL is used exactly as stored.
  assert.match(librarySource, /if \(!url\?\.startsWith\('\/api\/creative-assets\/media\?'\)\) return null;/);
  assert.match(librarySource, /assetThumbnailUrl\(asset\), primaryUrl\]\.filter\(Boolean\)/);
  // Download and open-studio still use the asset's own reference, stored or external.
  assert.match(librarySource, /downloadAsset\(assetUrl\(asset\)/);
});

test("library workflows the loading work must not change are still wired", () => {
  for (const pattern of [
    /Use for Publishing/,
    /center\.createDraftFromAsset\(asset/,
    /const handleRemove = async \(asset\) => \{/,
    /localAssetManager\.updateAsset\(asset\.id, \{ title \}\)/,
    /downloadSelected/,
    /setPreviewAsset\(asset\)/,
    /<AssetMedia asset=\{previewAsset\} fullSize eager \/>/,
    /openStudioWithAsset\(selected\)/,
  ]) {
    assert.match(librarySource, pattern);
  }
});
