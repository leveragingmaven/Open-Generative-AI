import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./VideoStudio.jsx", import.meta.url), "utf8");

test("Video Studio removes the large welcome message but preserves composer wiring", () => {
  assert.doesNotMatch(source, /Welcome to Video Studio\. Describe the video/);
  assert.match(source, /onSendMessage=\{handleGenerate\}/);
  assert.match(source, /composerControls=\{composerGenerationControls\}/);
  assert.match(source, /previews=\{composerPreviews\}/);
  assert.match(source, /mediaActions=\{composerMediaActions\}/);
  assert.match(source, /allowEmptySubmit/);
});

test("Video Studio retains its existing two-column canvas structure", () => {
  assert.match(source, /grid-cols-1 lg:grid-cols-12 gap-6/);
  assert.match(source, /lg:col-span-4 h-full min-h-0/);
  assert.match(source, /lg:col-span-8 h-full min-h-0/);
  assert.match(source, /<MavenCanvas[\s\S]*?contentOverride=/);
});
