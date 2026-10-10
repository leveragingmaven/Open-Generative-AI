import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Lip Sync Studio has no renderer in this suite, so the control contract is
// asserted against the component source, as in LipSyncStudioLibraryAudio.test.js.
const studioSource = readFileSync(new URL("./LipSyncStudio.jsx", import.meta.url), "utf8");

test("an empty upload slot is a labelled control, not a bare icon", () => {
  // The defect was that `label` reached only the tooltip and the hidden input,
  // so an unloaded slot rendered as a 40px glyph with no text.
  assert.match(studioSource, /const isIdle = uploadState === UPLOAD_STATE\.IDLE;/);
  assert.match(studioSource, /isIdle\s+\? promptControlClassName\(\{ active: false, className: "shrink-0" \}\)/);
  assert.match(studioSource, /Upload \{label\.toLowerCase\(\)\}/);
  // The visible label uses the studio's shared control label treatment.
  assert.match(studioSource, /<span className=\{PROMPT_CONTROL_LABEL_CLASS\}>\s+Upload \{label\.toLowerCase\(\)\}/);
  // ...and the button still explains itself on hover and on clear.
  assert.match(studioSource, /`\$\{fileName\} — click to clear`/);
  assert.match(studioSource, /`Upload \$\{label\.toLowerCase\(\)\} file`/);
});

test("a loaded slot stays the compact preview chip", () => {
  assert.match(studioSource, /: promptMediaButtonClassName\(\{\s+active: uploadState === UPLOAD_STATE\.READY,/);
  assert.match(studioSource, /\{uploadState === UPLOAD_STATE\.READY && \(/);
  assert.match(studioSource, /isVideo \? \(/);
});

test("all three uploads stay reachable and correctly labelled", () => {
  const pickers = [
    { accept: 'accept="image/*"', label: 'label="Image"' },
    { accept: 'accept="video/*"', label: 'label="Video"' },
    { accept: 'accept="audio/*"', label: 'label="Audio"' },
  ];
  for (const picker of pickers) {
    assert.ok(studioSource.includes(picker.accept), `missing ${picker.accept}`);
    assert.ok(studioSource.includes(picker.label), `missing ${picker.label}`);
  }

  // The image picker is image-mode only and the video picker video-mode only, so
  // no incompatible image/video combination can be assembled.
  assert.match(studioSource, /\{inputMode === "image" && \(\s+<MediaPickerButton/);
  assert.match(studioSource, /\{inputMode === "video" && \(\s+<MediaPickerButton/);
  // The audio picker is always rendered.
  assert.match(studioSource, /\{\/\* Audio picker — always visible \*\/\}\s+<MediaPickerButton/);

  // Handlers, limits and routing are unchanged.
  assert.match(studioSource, /onUpload=\{handleImageUpload\}/);
  assert.match(studioSource, /onUpload=\{handleVideoPick\}/);
  assert.match(studioSource, /onUpload=\{handleAudioPick\}/);
  assert.match(studioSource, /if \(file\.size > 10 \* 1024 \* 1024\)/);
  assert.match(studioSource, /if \(file\.size > 50 \* 1024 \* 1024\)/);
  assert.match(studioSource, /processLipSync\(apiKey, lipsyncParams\)/);
});

test("the mode switch states what the mode needs", () => {
  assert.match(studioSource, /A still portrait \+ an audio track\. Switch to Video to sync a face video\./);
  assert.match(studioSource, /A face video \+ an audio track\./);
  assert.match(studioSource, /className="flex items-center flex-wrap gap-1 px-1"/);
  assert.match(studioSource, /className="flex items-center gap-2 flex-wrap"/);
});

test("the Creative Library audio picker is prominent", () => {
  assert.match(studioSource, /Library audio/);
  assert.match(studioSource, /\{libraryAudioPickerItems\.length\}/);
  assert.match(studioSource, /border-\[#22d3ee\]\/35 text-\[#22d3ee\]\/90 hover:bg-\[#22d3ee\]\/10/);
  // Selecting a library entry still only ever moves its media URL into state.
  assert.match(studioSource, /setAudioUrl\(item\.id\)/);
  assert.match(studioSource, /setAudioState\(UPLOAD_STATE\.READY\)/);
});
