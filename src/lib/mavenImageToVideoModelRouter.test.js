import test from 'node:test';
import assert from 'node:assert/strict';
import { selectMavenImageToVideoRoute } from './mavenImageToVideoModelRouter.js';

test('automatically chooses catalog I2V model and passes model defaults', () => {
  const route = selectMavenImageToVideoRoute('Animate this image into a video of a person waving.');
  assert.equal(route.providerId, 'muapi');
  assert.equal(route.model.id, 'veo3-image-to-video');
  assert.equal(route.imageField, 'images_list');
  assert.equal(route.inputs.aspect_ratio, '16:9');
});

test('honors explicit Seedance 2.5 I2V model', () => {
  const route = selectMavenImageToVideoRoute('Use Seedance 2.5 to animate this image into a 9:16 video.');
  assert.equal(route.mode, 'explicit');
  assert.equal(route.model.id, 'seedance-2.5-image-to-video');
  assert.equal(route.inputs.aspect_ratio, '9:16');
});

test('rejects explicit image-to-video model settings without substituting', () => {
  assert.throws(
    () => selectMavenImageToVideoRoute('Use Wan2.1 Image To Video to animate this 4:3 image.'),
    (error) => error.code === 'video_option_unsupported' && /Wan2.1/.test(error.message),
  );
});

test('does not choose effect or reference-only routes automatically', () => {
  const route = selectMavenImageToVideoRoute('Animate this image into a video.');
  assert.notEqual(route.model.family, 'effects');
  assert.doesNotMatch(`${route.model.id} ${route.model.name}`, /reference|first.last|transition/i);
});
