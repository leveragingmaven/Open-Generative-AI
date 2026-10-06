import assert from 'node:assert/strict';
import test from 'node:test';
import { assetPreviewKind } from './assetPreview.js';

test('saved generated assets use modality for image and video previews', () => {
  assert.equal(assetPreviewKind({ metadata: { assetType: 'generated', modality: 'image' }, generatedFiles: ['https://cdn.test/a.png'] }), 'image');
  assert.equal(assetPreviewKind({ metadata: { assetType: 'generated', modality: 'video' }, generatedFiles: ['https://cdn.test/a.mp4'] }), 'video');
  assert.equal(assetPreviewKind({ metadata: { assetType: 'generated' } }), null);
});
