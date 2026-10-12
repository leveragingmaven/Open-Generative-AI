import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MEDIA_CANDIDATE_TIMEOUT_MS, nextMediaSource } from "./assetMediaSources.js";

const librarySource = readFileSync(new URL("../../components/AssetLibraryStudio.jsx", import.meta.url), "utf8");

// The delivered shape for a stored Creative Library asset: the tile tries the server-resized
// rendering first and the asset's own delivery URL second.
const ASSET = "asset_e21b8f76225de822e3dc7000418beb54cbe666da0b7c4624dbe991b28fad2bb3";
const DELIVERY_URL = `/api/creative-assets/media?assetId=${ASSET}`;
const RESIZED_URL = `${DELIVERY_URL}&variant=thumbnail`;

test("a source that never resolves is abandoned instead of pinning the tile", () => {
  const sources = [RESIZED_URL, DELIVERY_URL];
  assert.equal(nextMediaSource(sources, []), RESIZED_URL);
  // The resized rendering stalled, so the tile moves on to the URL the browser can actually load.
  assert.equal(nextMediaSource(sources, [RESIZED_URL]), DELIVERY_URL);
  // Every source spent is a real answer: the tile reports an unavailable preview, not a blank frame.
  assert.equal(nextMediaSource(sources, [RESIZED_URL, DELIVERY_URL]), null);
  assert.equal(nextMediaSource([], []), null);
});

test("a failed source is never retried in the same attempt", () => {
  const sources = ["/a.png", "/b.png", "/c.png"];
  assert.equal(nextMediaSource(sources, ["/a.png", "/c.png"]), "/b.png");
  assert.equal(nextMediaSource(sources, undefined), "/a.png");
  assert.equal(nextMediaSource(undefined, ["/a.png"]), null);
});

test("the Creative Library tile bounds how long one source may stay pending", () => {
  assert.match(librarySource, /setTimeout\(\(\) => setFailedSources\(\(sources\) => \[\.\.\.sources, imageUrl\]\), MEDIA_CANDIDATE_TIMEOUT_MS\)/);
  assert.match(librarySource, /return \(\) => clearTimeout\(timer\);/);
  assert.match(librarySource, /const imageUrl = nextMediaSource\(candidates, failedSources\);/);
  // Only an image tile with a mounted <img> starts the wait, so the viewport gate cannot expire a
  // source before the tile is on screen and a video tile (which renders no <img>) is untouched.
  assert.match(librarySource, /if \(!kind\.includes\("image"\) \|\| !imageUrl \|\| loadedSource === imageUrl \|\| \(!eager && !nearViewport\)\) return undefined;/);
  // An asset with no usable source says so, instead of rendering an empty frame. Video joined this
  // branch with its own bounded wait, so a video that never resolves reports a failure too.
  assert.match(librarySource, /if \(kind\.includes\("image"\) \|\| kind\.includes\("video"\)\) return frame\(<div className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center">/);
  assert.match(librarySource, /Preview unavailable/);
  assert.ok(MEDIA_CANDIDATE_TIMEOUT_MS > 0 && MEDIA_CANDIDATE_TIMEOUT_MS <= 60_000, "the wait must stay bounded and finite");
});
