import test from 'node:test';
import assert from 'node:assert/strict';
import { isVideoGenerationRequest, parseVideoRequestOptions, extractGeneratedVideoUrls } from './mavenVideoIntent.js';

test('detects text-to-video requests, including duration and model settings', () => {
  assert.equal(isVideoGenerationRequest('Create a five-second 9:16 video of a red fox at 720p.'), true);
  assert.equal(isVideoGenerationRequest('Use Seedance 2.5 to generate a video of a product reveal.'), true);
});

test('keeps questions, image-reference requests, and non-video prompts out of T2V', () => {
  assert.equal(isVideoGenerationRequest('What makes a good video prompt?'), false);
  assert.equal(isVideoGenerationRequest('Animate this uploaded image into a video.', { hasImageReference: true }), false);
  assert.equal(isVideoGenerationRequest('Change the background of this image to a studio.'), false);
  assert.equal(isVideoGenerationRequest('Create a static image of a film poster.'), false);
});

test('parses duration, aspect ratio, and resolution', () => {
  assert.deepEqual(parseVideoRequestOptions('Make a 5-second 9:16 1080p video'), {
    aspectRatio: '9:16', duration: 5, resolution: '1080p',
  });
  assert.equal(parseVideoRequestOptions('Create a thirty-second video').duration, 30);
});

test('extracts only the generated video result link from assistant content', () => {
  assert.deepEqual(extractGeneratedVideoUrls('[Play or download the generated video](https://cdn.example.test/movie.mp4)'), ['https://cdn.example.test/movie.mp4']);
  assert.deepEqual(extractGeneratedVideoUrls('[untrusted](https://example.test/x)'), []);
});
