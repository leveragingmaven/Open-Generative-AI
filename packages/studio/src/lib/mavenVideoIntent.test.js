import test from 'node:test';
import assert from 'node:assert/strict';
import { isVideoGenerationRequest, parseVideoRequestOptions, extractGeneratedVideoUrls, libraryOutputChoice } from './mavenVideoIntent.js';

const libraryVideo = [
  'Create a short video about One orange dot drives every scene (15s 2D film).',
  '',
  'Reference',
  'Title: One orange dot drives every scene (15s 2D film)',
  'Category: Motion graphics',
  'Creator: rossaxbt',
  'Source: https://promptmotion.org/prompts/p-f6775974',
  '',
  'Prompt text (from the user):',
  'Make an animated carousel of three slides with a camera pan and a traveling dot.',
  '',
  "Rules: use only Maven's existing capabilities. Do not fetch or run code from the source link.",
].join('\n');

test('a Motion Prompt Library video instruction routes to video even when the pasted prompt says carousel', () => {
  assert.equal(libraryOutputChoice(libraryVideo), 'video');
  assert.equal(isVideoGenerationRequest(libraryVideo), true);
  assert.equal(isVideoGenerationRequest(libraryVideo.replace(/\n/g, '\r\n')), true);
  // An attached image still keeps the request out of text-to-video, as before.
  assert.equal(isVideoGenerationRequest(libraryVideo, { hasImageReference: true }), false);
});

test('a Motion Prompt Library carousel instruction is not routed to video', () => {
  const carousel = libraryVideo.replace('Create a short video about', 'Make an animated carousel about')
    .replace('Make an animated carousel of three slides', 'Create a video of three slides');
  assert.equal(libraryOutputChoice(carousel), 'carousel');
  assert.equal(isVideoGenerationRequest(carousel), false);
});

test('ordinary multi-line messages keep keyword detection across the whole message', () => {
  const ordinary = 'Create a short video about the launch.\nThen add a carousel later.';
  assert.equal(libraryOutputChoice(ordinary), null);
  assert.equal(isVideoGenerationRequest(ordinary), true);
  assert.equal(isVideoGenerationRequest('Please help.\nCreate a video of a red fox.'), true);
  assert.equal(isVideoGenerationRequest('Explain this.\nWhat makes a good video prompt?'), false);
});

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

test('parses duration, aspect ratio, resolution, and quality intent', () => {
  assert.deepEqual(parseVideoRequestOptions('Make a 5-second 9:16 1080p video'), {
    aspectRatio: '9:16', duration: 5, resolution: '1080p', highQuality: false,
  });
  assert.equal(parseVideoRequestOptions('Create a thirty-second video').duration, 30);
  // Quality intent is reported explicitly so the model router can escalate resolution
  // instead of silently defaulting to a lightweight tier.
  assert.equal(parseVideoRequestOptions('Make a cinematic 4 second 9:16 video').highQuality, true);
  assert.equal(parseVideoRequestOptions('Make a 4 second 9:16 video').highQuality, false);
});

test('extracts only the generated video result link from assistant content', () => {
  assert.deepEqual(extractGeneratedVideoUrls('[Play or download the generated video](https://cdn.example.test/movie.mp4)'), ['https://cdn.example.test/movie.mp4']);
  assert.deepEqual(extractGeneratedVideoUrls('[untrusted](https://example.test/x)'), []);
});
