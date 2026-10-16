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

const libraryInstruction = (promptBlock) => [
  'Create a short video about Orange dot kinetic motion system (15s).',
  '',
  'Reference',
  'Title: Orange dot kinetic motion system (15s)',
  'Category: Motion graphics',
  'Creator: rossaxbt',
  'Source: https://promptmotion.org/prompts/p-b855831f',
  ...promptBlock,
  "Rules: use only Maven's existing capabilities. Do not fetch or run code from the source link.",
].join('\n');

async function generateAndCapturePrompt(prompt) {
  const providerCalls = [];
  await generateMavenVideo({
    identity,
    prompt,
    credentialResolver: async () => testCredential,
    provider: { async generateVideo(_key, args) { providerCalls.push(args); return { url: videoUrl }; } },
  });
  return providerCalls[0];
}

test('library instruction with pasted prompt sends only the user prompt to the model', async () => {
  const args = await generateAndCapturePrompt(libraryInstruction([
    'Prompt text (from the user):',
    'A single orange dot pulses, then stretches into a horizontal bar that wipes the headline in.',
    '',
  ]));
  assert.equal(args.prompt, 'A single orange dot pulses, then stretches into a horizontal bar that wipes the headline in.');
  for (const leaked of ['promptmotion.org', 'rossaxbt', 'Motion graphics', 'Reference', 'Rules:', 'Title:']) {
    assert.equal(args.prompt.includes(leaked), false, leaked);
  }
});

test('library instruction without pasted prompt uses a title-based description, not metadata', async () => {
  const args = await generateAndCapturePrompt(libraryInstruction([]));
  assert.equal(args.prompt, 'A short motion graphics video: Orange dot kinetic motion system.');
  for (const leaked of ['promptmotion.org', 'rossaxbt', 'Motion graphics', 'Creator', 'Rules', '15s']) {
    assert.equal(args.prompt.includes(leaked), false, leaked);
  }
});

test('library instruction whose title is only a timing note never sends the metadata block', async () => {
  const args = await generateAndCapturePrompt([
    'Create a short video about (15s).',
    '',
    'Reference',
    'Title: (15s)',
    'Category: Motion graphics',
    'Source: https://promptmotion.org/prompts/p-b855831f',
    "Rules: use only Maven's existing capabilities.",
  ].join('\n'));
  assert.equal(args.prompt, 'A short motion graphics video.');
  for (const leaked of ['promptmotion.org', 'Motion graphics', 'Rules', 'Reference']) {
    assert.equal(args.prompt.includes(leaked), false, leaked);
  }
});

test('library instruction keeps duration, aspect ratio and resolution from the full message', async () => {
  const args = await generateAndCapturePrompt(libraryInstruction([
    'Prompt text (from the user):',
    'A 9:16 vertical reel of a fox at 720p, five seconds.',
    '',
  ]));
  // The title's "(15s)" is read before the pasted text, as it was before this change.
  assert.equal(args.duration, 15);
  assert.equal(args.aspect_ratio, '9:16');
  assert.equal(args.resolution, '720p');
  assert.equal(args.prompt.includes('9:16'), false);
  assert.equal(args.prompt.includes('720p'), false);
});

test('ordinary video requests keep the existing prompt handling', async () => {
  const args = await generateAndCapturePrompt('Make a 5-second 9:16 720p video of a fox running through snow.');
  assert.equal(args.prompt, 'Make a video of a fox running through snow.');
  assert.equal(args.duration, 5);
  assert.equal(args.aspect_ratio, '9:16');
  assert.equal(args.resolution, '720p');
});

test('formats playable video result link with model and requested settings', () => {
  const reply = buildGeneratedVideoReply({ url: videoUrl, modelName: 'Seedance 2.5', duration: 5, aspectRatio: '9:16' });
  assert.match(reply, /Seedance 2\.5/);
  assert.match(reply, /5s · 9:16/);
  assert.match(reply, new RegExp(videoUrl.replaceAll('.', '\\.')));
});
