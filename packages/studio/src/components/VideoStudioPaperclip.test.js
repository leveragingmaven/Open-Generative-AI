import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./VideoStudio.jsx", import.meta.url), "utf8");
const chatSource = readFileSync(new URL("./mavensync/MavenChat.jsx", import.meta.url), "utf8");
const composerSource = readFileSync(new URL("./mavensync/MavenComposer.jsx", import.meta.url), "utf8");
const modelsSource = readFileSync(new URL("../models.js", import.meta.url), "utf8");

test("composer exposes the paperclip through onAttach (contract the fix relies on)", () => {
  // The paperclip button is wired to onAttach inside the shared composer...
  assert.match(composerSource, /onClick=\{onAttach\}/);
  // ...and MavenChat forwards onAttach down to the composer unchanged.
  assert.match(chatSource, /onAttach/);
});

test("Video Studio wires the paperclip to an image picker without reusing the + input", () => {
  // The paperclip must actually invoke a file picker.
  assert.match(source, /onAttach=\{openPaperclipImagePicker\}/);
  assert.match(source, /const openPaperclipImagePicker = useCallback\(\(\) => \{[\s\S]*?paperclipImageInputRef\.current\?\.click\(\)/);

  // It uses its own input, so the "+" creative workflow input is untouched.
  const paperclipInput = source.match(/ref=\{paperclipImageInputRef\}[\s\S]*?onChange=\{handlePaperclipImageChange\}/)?.[0];
  assert.ok(paperclipInput, "expected a dedicated hidden image input for the paperclip");
  assert.match(paperclipInput, /type="file"/);
  assert.match(paperclipInput, /accept="image\/\*"/);
  assert.doesNotMatch(paperclipInput, /imageFileInputRef/);

  // The "+" control keeps its original reference-image input.
  assert.match(source, /ref=\{imageFileInputRef\}/);
});

test("paperclip reuses the existing upload plumbing on the normal image-to-video path", () => {
  // Reuses uploadImageReference rather than introducing a second upload system.
  assert.match(source, /paperclipAttachOptionsRef\.current = \{ preferGeneralI2V: true \};[\s\S]*?uploadImageReference\(file\);/);
  assert.match(source, /applyImageReferenceUrl\(url, attachOptions\)/);

  // The request is consumed once and cleared, so the "+" path is unaffected.
  assert.match(source, /paperclipAttachOptionsRef\.current = null;/);
});

test("paperclip selects a normal I2V model instead of the effects fallback", () => {
  // A plain reference attach must skip the creative/effects entry.
  assert.match(source, /preferredModel \|\| sibling \|\| i2vModels\[0\]/);
  assert.match(source, /i2vModels\.find\(\(model\) => model\.family !== "effects"\)/);
  assert.match(source, /options\.preferGeneralI2V/);

  // The creative ("+") path is opt-in only: no flag means the old target.
  assert.match(source, /const preferredModel = options\.preferGeneralI2V\s*\?\s*i2vModels\.find\(\(model\) => model\.family !== "effects"\)\s*:\s*null;/);
});

test("preserved behaviour: text-to-video default and the + effects entry", () => {
  // Text-to-video still opens on the first text-to-video model.
  assert.match(source, /const defaultModel = t2vModels\[0\];/);

  // The effects model remains the first image-to-video entry (the "+" target).
  const i2vStart = modelsSource.indexOf("export const i2vModels = [");
  assert.ok(i2vStart !== -1, "expected the i2vModels array");
  const firstI2VEntry = modelsSource.slice(i2vStart, i2vStart + 800);
  assert.match(firstI2VEntry, /"id":\s*"ai-video-effects"/);
  assert.match(firstI2VEntry, /"family":\s*"effects"/);
});
