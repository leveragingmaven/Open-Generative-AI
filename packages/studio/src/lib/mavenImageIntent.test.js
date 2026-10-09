import test from 'node:test';
import assert from 'node:assert/strict';
import { isImageGenerationRequest, extractImagePrompt, extractGeneratedImageUrls, referencesAttachedImage } from './mavenImageIntent.js';

test('routes explicit image-creation requests to generation', () => {
  assert.equal(isImageGenerationRequest('Create a professional Instagram promotional image for my coaching program using my brand colors.'), true);
  assert.equal(isImageGenerationRequest('Generate a poster for my spring sale'), true);
  assert.equal(isImageGenerationRequest('make me a logo for a bakery'), true);
});

test('does not route conversation, questions, or other media to image generation', () => {
  assert.equal(isImageGenerationRequest('What image should I create for Instagram?'), false);
  assert.equal(isImageGenerationRequest('Describe exactly what you see in this image.'), false);
  assert.equal(isImageGenerationRequest('Create a video ad for my course'), false);
  assert.equal(isImageGenerationRequest('Make a voiceover audio for this'), false);
  assert.equal(isImageGenerationRequest('   '), false);
  assert.equal(isImageGenerationRequest(undefined), false);
});

test('extracts a bounded single-line prompt', () => {
  assert.equal(extractImagePrompt('  Create\n\nan   image  '), 'Create an image');
  assert.equal(extractImagePrompt('x'.repeat(5000)).length, 1000);
  assert.equal(extractImagePrompt(null), '');
});

test('recognises turns that refer to an image already attached to the conversation', () => {
  assert.equal(referencesAttachedImage('What is in this image?'), true);
  assert.equal(referencesAttachedImage('Describe exactly what you see in this image.'), true);
  assert.equal(referencesAttachedImage('What did you see in the photo I attached earlier?'), true);
  assert.equal(referencesAttachedImage('Can you see the image I just uploaded?'), true);
  assert.equal(referencesAttachedImage('tell me about @asset_1'), true);
  assert.equal(referencesAttachedImage('summarise my last screenshot'), true);
});

test('does not claim an attached image for unrelated or other-media turns', () => {
  assert.equal(referencesAttachedImage('Thanks, that helps. What should I do next?'), false);
  assert.equal(referencesAttachedImage('Write a launch caption for my membership.'), false);
  assert.equal(referencesAttachedImage('What image model should I use?'), false);
  assert.equal(referencesAttachedImage('Make a video from this moment'), false);
  assert.equal(referencesAttachedImage(''), false);
  assert.equal(referencesAttachedImage(undefined), false);
  assert.equal(referencesAttachedImage(`the image ${'x'.repeat(4000)}`), false);
});

test('extracts only https generated-image links from markdown', () => {
  const content = "Here's your image.\n\n![a cat](https://cdn.example.com/a.jpg)\n\n![x](javascript:alert(1))";
  assert.deepEqual(extractGeneratedImageUrls(content), ['https://cdn.example.com/a.jpg']);
  assert.deepEqual(extractGeneratedImageUrls('plain text'), []);
  assert.deepEqual(extractGeneratedImageUrls(undefined), []);
});
