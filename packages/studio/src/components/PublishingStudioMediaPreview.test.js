import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./PublishingStudio.jsx", import.meta.url), "utf8");

test("every publishing preview surface renders the shared thumbnail/poster component", () => {
  // Library picker, "Choose creative work" grid, composer Live Preview, and Calendar detail panel.
  assert.match(source, /<QueueMediaThumbnail media=\{publishingQueueMedia\(entry\.asset\)\} \/>/);
  assert.match(source, /<QueueMediaThumbnail media=\{publishingQueueMedia\(asset\)\} \/>/);
  assert.match(source, /<QueueMediaThumbnail media=\{publishingQueueMedia\(focusedPreviewAsset\)\} eager \/>/);
  assert.match(source, /<QueueMediaThumbnail media=\{publishingQueueMedia\(details\.media\)\} \/>/);
  assert.match(source, /<QueueMediaThumbnail media=\{card\.media\} \/>/);
  assert.doesNotMatch(source, /AssetPreview/);
});

test("an image preview is the resized server rendering, never the original or a private key", () => {
  // `publishingQueueMedia` adds `variant=thumbnail` for same-origin proxied images only.
  assert.match(source, /publishingQueueMedia\(asset\)/);
  assert.doesNotMatch(source, /AssetPreview/);
  assert.doesNotMatch(source, /storage:\/\//);
});

test("a video preview is a poster with a play control, and the file loads only on request", () => {
  assert.match(source, /function QueueMediaThumbnail\(\{ media, eager = false \}\)/);
  assert.match(source, /if \(videoUrl && !playing\) return frame\(<button type="button" onClick=\{\(\) => setPlaying\(true\)\} aria-label=\{`Play \$\{label\}`\}/);
  assert.match(source, /video · play/);
  assert.match(source, /if \(videoUrl\) return <video key=\{`\$\{videoUrl\}#\$\{attempt\}`\}/);
  // The previous always-mounted poster frame (a `poster`-labelled `<video>` at `#t=0.1`) is gone.
  assert.doesNotMatch(source, /aria-label=\{`\$\{label\} poster`\}/);
  assert.doesNotMatch(source, /\$\{videoUrl\}#t=0\.1/);
});

test("an offscreen preview waits, and a failed preview can be retried", () => {
  assert.match(source, /const \[frameRef, nearViewport\] = useNearViewport\(\{ enabled: !eager \}\);/);
  assert.match(source, /if \(!eager && !nearViewport\) return frame\(<span role="status" aria-label=\{`Waiting to load \$\{label\}`\}/);
  assert.match(source, /preview failed/);
  assert.match(source, /const retry = \(\) => \{ setFailedSources\(\[\]\); setImageLoaded\(false\); setPlaying\(false\); setAttempt\(\(value\) => value \+ 1\); \};/);
  assert.match(source, /onError=\{\(\) => fail\(imageUrl\)\}/);
  assert.match(source, /onClick=\{retry\}/);
});

test("attaching library media still goes through the existing draft path", () => {
  assert.match(source, /onClick=\{\(\) => attachLibraryMedia\(entry\.asset\)\}/);
  assert.match(source, /onClick=\{\(\) => focusedDraft \? attachLibraryMedia\(asset\) : createDraft\(asset\)\}/);
  assert.match(source, /attachmentFromLibraryAsset\(asset,/);
});
