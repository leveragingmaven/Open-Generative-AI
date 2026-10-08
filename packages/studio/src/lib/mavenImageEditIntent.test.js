import test from 'node:test';
import assert from 'node:assert/strict';
import { isImageEditRequest } from './mavenImageIntent.js';

test('recognizes edit requests that refer to an existing image', () => {
  assert.equal(isImageEditRequest('Use Nano Banana Pro Edit to change the background of this image to a modern office.'), true);
  assert.equal(isImageEditRequest('Remove the watermark from this photo'), true);
  assert.equal(isImageEditRequest('Make the sky more dramatic in the picture'), true);
  assert.equal(isImageEditRequest('Recolor it to navy blue'), true);
});

test('keeps describe, analyze, and question requests on the vision path', () => {
  assert.equal(isImageEditRequest('Describe this image'), false);
  assert.equal(isImageEditRequest('What is in this photo?'), false);
  assert.equal(isImageEditRequest('Analyze this image for brand colors'), false);
  assert.equal(isImageEditRequest('How would I edit this image in Photoshop?'), false);
  assert.equal(isImageEditRequest('Tell me about this picture'), false);
});

test('does not treat generic text-to-image requests without a reference as edits', () => {
  assert.equal(isImageEditRequest('Create a poster for my coaching program'), false);
  assert.equal(isImageEditRequest(''), false);
  assert.equal(isImageEditRequest(null), false);
});
