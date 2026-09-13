import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const imageStudio = readFileSync(new URL("./ImageStudio.jsx", import.meta.url), "utf8");
const composer = readFileSync(new URL("./mavensync/MavenComposer.jsx", import.meta.url), "utf8");
const chat = readFileSync(new URL("./mavensync/MavenChat.jsx", import.meta.url), "utf8");

test("Image Studio wires the paperclip to its existing reference-image picker", () => {
  assert.match(imageStudio, /onOpenPickerReady=\{handleAttachmentPickerReady\}/);
  assert.match(imageStudio, /onAttach=\{\(\) => attachmentPickerRef\.current\?\.\(\)\}/);
  assert.match(composer, /onClick=\{onAttach\}/);
  assert.match(chat, /onAttach=\{onAttach\}/);
  assert.match(imageStudio, /const openPicker = \(\) => fileInputRef\.current\?\.click\(\);/);
});
