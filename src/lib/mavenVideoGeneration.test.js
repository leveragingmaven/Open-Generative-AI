import test from 'node:test';
import assert from 'node:assert/strict';
import { generateMavenVideo, buildGeneratedVideoReply } from './mavenVideoGeneration.js';

const identity = { accountId: 'account-1', identityKey: 'identity-1' };
const testCredential = 'mock-video-key';
const videoUrl = 'https://cdn.example.test/generated.mp4';

test('invokes existing MuAPI generateVideo with stored credential and catalog settings', async () => {
  const credentialCalls = [];
  const providerCalls = [];
  const result = await generateMavenVideo({
    identity,
    prompt: 'Use Seedance 2.5 to create a 5-second 9:16 720p video of a product reveal.',
    credentialResolver: async (args) => { credentialCalls.push(args); return testCredential; },
    provider: { async generateVideo(key, args) { providerCalls.push({ key, args }); return { url: videoUrl }; } },
  });
  assert.deepEqual(credentialCalls, [{ accountId: 'account-1', creatorIdentityKey: 'identity-1', providerId: 'muapi', operation: 'video_generation' }]);
  assert.equal(providerCalls[0].key, testCredential);
  assert.equal(providerCalls[0].args.model, 'seedance-2.5-text-to-video');
  assert.equal(providerCalls[0].args.duration, 5);
  assert.equal(providerCalls[0].args.aspect_ratio, '9:16');
  assert.equal(providerCalls[0].args.resolution, '720p');
  assert.equal(result.url, videoUrl);
  assert.equal(result.provider, 'muapi');
});

test('fails clearly and does not call MuAPI when customer credential is missing', async () => {
  let called = false;
  await assert.rejects(generateMavenVideo({
    identity,
    prompt: 'Create a video of a fox.',
    credentialResolver: async () => null,
    provider: { async generateVideo() { called = true; } },
  }), (error) => error.code === 'video_provider_credential_required' && error.status === 400);
  assert.equal(called, false);
});

test('maps provider errors to sanitized video generation failure', async () => {
  await assert.rejects(generateMavenVideo({
    identity,
    prompt: 'Create a video of a fox.',
    credentialResolver: async () => testCredential,
    provider: { async generateVideo() { throw new Error(`failed ${testCredential}`); } },
  }), (error) => error.code === 'video_generation_failed' && error.status === 502 && !error.message.includes(testCredential));
});

test('rejects unsafe or missing provider video URLs', async () => {
  for (const url of ['javascript:alert(1)', 'http://insecure.example.test/video.mp4', null]) {
    await assert.rejects(generateMavenVideo({
      identity,
      prompt: 'Create a video of a fox.',
      credentialResolver: async () => testCredential,
      provider: { async generateVideo() { return { url }; } },
    }), (error) => error.code === 'video_generation_failed');
  }
});

test('formats playable video result link with model and requested settings', () => {
  const reply = buildGeneratedVideoReply({ url: videoUrl, modelName: 'Seedance 2.5', duration: 5, aspectRatio: '9:16' });
  assert.match(reply, /Seedance 2\.5/);
  assert.match(reply, /5s · 9:16/);
  assert.match(reply, new RegExp(videoUrl.replaceAll('.', '\\.')));
});
