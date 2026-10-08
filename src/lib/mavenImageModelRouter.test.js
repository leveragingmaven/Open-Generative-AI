import test from 'node:test';
import assert from 'node:assert/strict';
import {
  selectMavenImageRoute,
  parseRequestedAspectRatio,
  stripRoutingFromPrompt,
  MAVEN_FAL_FLUX_SCHNELL_ID,
} from './mavenImageModelRouter.js';

test('parses only known aspect ratios and ignores times and other numbers', () => {
  assert.equal(parseRequestedAspectRatio('a 4:5 Instagram graphic'), '4:5');
  assert.equal(parseRequestedAspectRatio('meet at 10:30 for a poster'), null);
  assert.equal(parseRequestedAspectRatio('no ratio here'), null);
});

test('resolves an explicit catalog model by its name, preferring the longest match', () => {
  const route = selectMavenImageRoute('Use Nano Banana Pro for a poster');
  assert.equal(route.mode, 'explicit');
  assert.equal(route.transport, 'muapi');
  assert.equal(route.model.id, 'nano-banana-pro');
});

test('automatic selection returns catalog candidates that support the requested ratio', () => {
  const route = selectMavenImageRoute('Create a 4:5 Instagram graphic');
  assert.equal(route.mode, 'auto');
  assert.equal(route.aspectRatio, '4:5');
  assert.equal(route.fallbackFal, false);
  assert.ok(route.candidates.length > 0);
  for (const model of route.candidates) {
    assert.ok(model.inputs.aspect_ratio.enum.includes('4:5'), `${model.id} must support 4:5`);
  }
});

test('automatic 1:1 selection allows the fal.ai fallback', () => {
  const route = selectMavenImageRoute('Make an image of a lighthouse');
  assert.equal(route.mode, 'auto');
  assert.equal(route.aspectRatio, '1:1');
  assert.equal(route.fallbackFal, true);
});

test('explicit FLUX Schnell routes to fal.ai only at 1:1', () => {
  const route = selectMavenImageRoute('Create an image with FLUX Schnell');
  assert.equal(route.transport, 'fal');
  assert.equal(route.model.id, MAVEN_FAL_FLUX_SCHNELL_ID);
  assert.throws(() => selectMavenImageRoute('FLUX Schnell at 9:16'), (e) => e.code === 'image_aspect_ratio_unsupported');
});

test('a catalog model that cannot generate images from text is reported as unavailable', () => {
  assert.throws(
    () => selectMavenImageRoute('Use Nano Banana Edit on my image'),
    (e) => e.code === 'image_model_unavailable' && e.status === 422,
  );
});

test('stripRoutingFromPrompt removes the model name and ratio but keeps the brief', () => {
  const route = selectMavenImageRoute('Use Nano Banana Pro to make a 4:5 poster of a river');
  assert.equal(stripRoutingFromPrompt('Use Nano Banana Pro to make a 4:5 poster of a river', route), 'Use to make a poster of a river');
});
