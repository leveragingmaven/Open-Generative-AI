import test from 'node:test';
import assert from 'node:assert/strict';
import { selectMavenImageEditRoute } from './mavenImageModelRouter.js';

test('explicit Nano Banana Pro Edit resolves to that exact editing model', () => {
  const route = selectMavenImageEditRoute('Use Nano Banana Pro Edit to change the background of this image');
  assert.equal(route.mode, 'explicit');
  assert.equal(route.transport, 'muapi');
  assert.equal(route.model.id, 'nano-banana-pro-edit');
});

test('automatic edit selection uses a catalog editing model', () => {
  const route = selectMavenImageEditRoute('Change the background of this image to a beach');
  assert.equal(route.mode, 'auto');
  assert.ok(['nano-banana-pro-edit', 'nano-banana-edit'].includes(route.model.id));
});

test('a generation-only model named for an edit is an error, never silently swapped', () => {
  assert.throws(
    () => selectMavenImageEditRoute('Use Nano Banana Pro to edit this photo'),
    (e) => e.code === 'image_model_unavailable' && e.status === 422 && /cannot edit/.test(e.message),
  );
});

test('an explicit editing model carries a requested ratio it supports', () => {
  const route = selectMavenImageEditRoute('Use Nano Banana Pro Edit to make this image 4:5');
  assert.equal(route.aspectRatio, '4:5');
});
