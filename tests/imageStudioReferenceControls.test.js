import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../packages/studio/src/components/ImageStudio.jsx', import.meta.url),
  'utf8',
);

test('reference trigger shows the selected image for every upload, not only Swap Face', () => {
  assert.match(source, /hasSelection && selectedEntries\[0\]\?\.url \? \(/);
});

test('drag-and-drop reference uploads use their own state, not the generation flag', () => {
  assert.match(source, /setReferenceUploading\(true\)/);
  assert.match(source, /setReferenceUploading\(false\)/);
  const dropFn = source.slice(source.indexOf('const processDroppedImages'), source.indexOf('// ── Handle Dropped Files'));
  assert.doesNotMatch(dropFn, /setGenerating/);
});

test('reference upload failures are shown inline instead of through alert()', () => {
  const dropFn = source.slice(source.indexOf('const processDroppedImages'), source.indexOf('// ── Handle Dropped Files'));
  assert.doesNotMatch(dropFn, /alert\(/);
  assert.match(source, /role="alert"[^>]*>\{referenceError\}/);
  assert.match(source, /Reference upload failed:/);
});
