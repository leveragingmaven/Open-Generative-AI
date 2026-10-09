import test from 'node:test';
import assert from 'node:assert/strict';
import { selectMavenVideoRoute, stripVideoRoutingFromPrompt } from './mavenVideoModelRouter.js';

test('automatic video model selection uses a compatible existing catalog entry', () => {
  const route = selectMavenVideoRoute('Create a 5-second 9:16 720p video of a fox running through snow.');
  assert.equal(route.providerId, 'muapi');
  assert.ok(route.model.inputs);
  assert.ok(route.model.inputs.aspect_ratio.enum.includes('9:16'));
  assert.deepEqual(route.inputs, { aspect_ratio: '9:16', duration: 5, resolution: '720p' });
});

test('honors explicit model name and uses that model defaults', () => {
  const route = selectMavenVideoRoute('Use Seedance 2.5 to generate a video of a product reveal.');
  assert.equal(route.mode, 'explicit');
  assert.equal(route.model.id, 'seedance-2.5-text-to-video');
  assert.equal(route.inputs.duration, route.model.inputs.duration.default);
  assert.equal(route.inputs.resolution, route.model.inputs.resolution.default);
});

test('rejects unsupported settings for an explicitly requested model without substituting', () => {
  assert.throws(
    () => selectMavenVideoRoute('Use Seedance 2.5 to create a 30-second video.'),
    (error) => error.code === 'video_option_unsupported' && /Seedance 2.5/.test(error.message),
  );
});

test('prompt cleanup removes routing parameters and named model', () => {
  assert.equal(stripVideoRoutingFromPrompt('Use Seedance 2.5 to make a 5-second 9:16 720p video of a fox.', { name: 'Seedance 2.5' }), 'Use to make a video of a fox.');
});

test('high quality or cinematic requests without a pinned resolution escalate to a higher-resolution model', () => {
  const base = selectMavenVideoRoute('Make a video of a fox in a forest.');
  const cinematic = selectMavenVideoRoute('Make a cinematic video of a fox in a forest.');

  // A plain request stays on the lightweight entry model at its lowest declared resolution.
  assert.equal(base.inputs.resolution, '480p');
  assert.deepEqual(base.model.inputs.resolution.enum, ['480p', '720p', '1080p']);

  // A cinematic/high-quality request must not stay on the 480p entry model.
  assert.notEqual(cinematic.model.id, base.model.id);
  assert.equal(cinematic.inputs.resolution, '1080p');
  assert.ok(cinematic.model.inputs.resolution.enum.includes('1080p'));
});

test('cinematic requests that pin a resolution keep that resolution on the lightweight model', () => {
  const route = selectMavenVideoRoute('Make a cinematic 720p video of a fox.');
  assert.equal(route.inputs.resolution, '720p');
  assert.deepEqual(route.model.inputs.resolution.enum, ['480p', '720p', '1080p']);
});
