import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Lip Sync Studio has no renderer in this suite, so the added affordance is
// asserted against the component source, in the same style as the Audio Studio
// component tests.
const studioSource = readFileSync(new URL("./LipSyncStudio.jsx", import.meta.url), "utf8");

test("existing Creative Library audio can be selected instead of uploading", () => {
  assert.match(studioSource, /import \{ listLibraryMedia \} from "\.\.\/lib\/character\/CharacterMediaTypes\.js"/);
  // Loaded once on mount in an effect (never during render), like the Character
  // panels' pickers.
  assert.match(studioSource, /setLibraryAudio\(listLibraryMedia\("audio"\)\)/);
  assert.doesNotMatch(studioSource, /useMemo\(/);
  assert.match(studioSource, /Library audio/);
  assert.match(studioSource, /libraryAudioPickerItems/);
  // The Dropdown is keyed by media URL, so its selection value can only ever be
  // that URL — never the asset's identity.
  assert.match(studioSource, /id: entry\.url,/);
  assert.match(studioSource, /setAudioUrl\(item\.id\)/);
  assert.match(studioSource, /setAudioState\(UPLOAD_STATE\.READY\)/);
});

test("the upload and drag-drop paths are preserved, not replaced", () => {
  assert.match(studioSource, /onUpload=\{handleAudioPick\}/);
  assert.match(studioSource, /accept="audio\/\*"/);
  assert.match(studioSource, /handleAudioPick\(audioFiles\[0\]\)/);
  assert.match(studioSource, /if \(file\.size > 10 \* 1024 \* 1024\)/);
});

test("the selected track persists through the existing studio state", () => {
  assert.match(studioSource, /audioUrl,\s+audioName,/);
  assert.match(studioSource, /if \(data\.audioUrl\) \{\s+setAudioUrl\(data\.audioUrl\);/);
});

test("generation and history behavior is untouched", () => {
  assert.match(studioSource, /audio_url: audioUrl,/);
  assert.match(studioSource, /processLipSync\(apiKey, lipsyncParams\)/);
  assert.match(studioSource, /withCampaignMetadata\(\{/);
  assert.match(studioSource, /if \(!historyItems\) addToInternalHistory\(entry\)/);
});
