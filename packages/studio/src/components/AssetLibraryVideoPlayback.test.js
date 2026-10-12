import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const librarySource = readFileSync(new URL("./AssetLibraryStudio.jsx", import.meta.url), "utf8");

// The measured defect: with a video source that never settles, the player mounted `readyState 0`,
// `networkState 2 (LOADING)`, `error null` and no failure text — the browser's spinner over a black
// frame, indefinitely, with nothing to retry against. A `<video>` reports `loadedmetadata` or
// `error`; a response that reports neither is what these assertions pin.

test("a video source that never settles expires instead of spinning forever", () => {
  assert.match(librarySource, /const videoMounted = Boolean\(fullSize && videoUrl\) && \(playOnOpen \|\| videoPressed\);/);
  assert.match(librarySource, /if \(!videoMounted \|\| loadedSource === videoUrl\) return undefined;/);
  assert.match(librarySource, /setTimeout\(\(\) => setFailedSources\(\(sources\) => \[\.\.\.sources, videoUrl\]\), MEDIA_CANDIDATE_TIMEOUT_MS\)/);
  assert.match(librarySource, /return \(\) => clearTimeout\(timer\);/);
  // Metadata — not the whole file — disarms the wait, so a slow-but-healthy video is never expired.
  assert.match(librarySource, /onLoadedMetadata=\{\(\) => setLoadedSource\(videoUrl\)\}/);
  assert.match(librarySource, /onError=\{\(\) => setFailedSources\(\(sources\) => \[\.\.\.sources, videoUrl\]\)\}/);
});

test("a video the player cannot load reports a failure instead of an empty frame", () => {
  assert.match(librarySource, /if \(kind\.includes\("image"\) \|\| kind\.includes\("video"\)\) return frame\(<div className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center">/);
  assert.match(librarySource, /Preview unavailable/);
  assert.match(librarySource, /Open the asset to retry/);
  // The existing recovery control remounts the media, which is what a failed video needs.
  assert.match(librarySource, /onClick=\{\(\) => setMediaAttempt\(\(value\) => value \+ 1\)\}/);
});

test("one opened asset is never two players downloading the file", () => {
  // The details panel keeps its poster until the creator presses play; only the surface opened for
  // playback (the full-size preview) mounts a `<video>` immediately.
  assert.match(librarySource, /<AssetMedia asset=\{selected\} fullSize eager playOnOpen=\{false\} \/>/);
  assert.match(librarySource, /<AssetMedia asset=\{previewAsset\} fullSize eager \/>/);
  assert.match(librarySource, /if \(!videoMounted\) return <button type="button" onClick=\{\(\) => setVideoPressed\(true\)\}/);
  assert.match(librarySource, /aria-label=\{`Play \$\{assetTitle\(asset\)\}`\}/);
  // The unplayed surface shows the stored poster frame (or the drawn placeholder when there is
  // none) under the Play mark, and mounts no element either way.
  assert.match(librarySource, /frame\(<VideoPosterArt src=\{posterUrl\} note="Press play" \/>\)\}<\/button>;/);
});

test("the grid keeps its poster and the player keeps native controls", () => {
  // A tile mounts no media element at all, and opening the library still transfers no video bytes:
  // the tile is the stored poster frame, with the drawn placeholder as its fallback.
  assert.match(librarySource, /if \(!fullSize\) return frame\(<VideoPosterArt src=\{posterUrl\} \/>\);/);
  assert.match(librarySource, /function MediaPoster\(\{ kind, note \}\)/);
  assert.match(librarySource, /: <MediaPoster kind="video" note=\{note\} \/>/);
  assert.match(librarySource, /\baria-label=\{`\$\{assetTitle\(asset\)\} preview`\} controls preload="metadata"/);
});
