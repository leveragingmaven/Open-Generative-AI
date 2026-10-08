import test from 'node:test';
import assert from 'node:assert/strict';
import { generateMavenImageToVideo } from './mavenImageToVideoGeneration.js';

const identity = { accountId: 'account-1', identityKey: 'identity-1' };
const key = 'fake-i2v-key';
const source = 'https://session-assets.example.test/asset_1.png';
const resultUrl = 'https://cdn.example.test/animated.mp4';

test('executes through existing generateI2V with BYOK and trusted image reference', async () => {
  const calls = [];
  const credentials = [];
  const result = await generateMavenImageToVideo({
    identity,
    prompt: 'Use Seedance 2.5 to animate this image into a 9:16 video of a person waving.',
    imageUrl: source,
    credentialResolver: async (args) => { credentials.push(args); return key; },
    provider: { async generateI2V(apiKey, args) { calls.push({ apiKey, args }); return { url: resultUrl }; } },
  });
  assert.deepEqual(credentials, [{ accountId: 'account-1', creatorIdentityKey: 'identity-1', providerId: 'muapi', operation: 'video_generation' }]);
  assert.equal(calls[0].apiKey, key);
  assert.equal(calls[0].args.model, 'seedance-2.5-image-to-video');
  assert.equal(calls[0].args.image_url, source);
  assert.equal(calls[0].args.aspect_ratio, '9:16');
  assert.equal(result.url, resultUrl);
  assert.equal(result.operation, 'image_to_video');
});

test('fails closed for missing credentials and does not call provider', async () => {
  let invoked = false;
  await assert.rejects(generateMavenImageToVideo({
    identity, prompt: 'Animate this image into a video.', imageUrl: source,
    credentialResolver: async () => null,
    provider: { async generateI2V() { invoked = true; } },
  }), (error) => error.code === 'video_provider_credential_required');
  assert.equal(invoked, false);
});

test('rejects browser-style or insecure arbitrary image URLs', async () => {
  for (const imageUrl of ['http://untrusted.test/image.png', 'javascript:alert(1)', 'not a URL']) {
    await assert.rejects(generateMavenImageToVideo({
      identity, prompt: 'Animate this image into a video.', imageUrl,
      credentialResolver: async () => key,
      provider: { async generateI2V() { assert.fail('provider must not be invoked'); } },
    }), (error) => error.code === 'image_source_unavailable');
  }
});

test('sanitizes provider failures and invalid result URLs', async () => {
  await assert.rejects(generateMavenImageToVideo({
    identity, prompt: 'Animate this image into a video.', imageUrl: source,
    credentialResolver: async () => key,
    provider: { async generateI2V() { throw new Error(`provider leaked ${key}`); } },
  }), (error) => error.code === 'video_generation_failed' && !error.message.includes(key));
  await assert.rejects(generateMavenImageToVideo({
    identity, prompt: 'Animate this image into a video.', imageUrl: source,
    credentialResolver: async () => key,
    provider: { async generateI2V() { return { url: 'http://insecure.test/video.mp4' }; } },
  }), (error) => error.code === 'video_generation_failed');
});
