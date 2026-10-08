import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGeneratedLipSyncReply, generateMavenLipSync, selectMavenLipSyncRoute } from './mavenLipSyncGeneration.js';
const identity = { accountId: 'account-1', identityKey: 'creator-1' };
const imageUrl = 'https://cdn.example.test/portrait.png';
const videoUrl = 'https://cdn.example.test/source.mp4';
const audioUrl = 'https://cdn.example.test/voice.mp3';
test('selects only image/video-compatible catalog models and validates settings', () => {
  assert.equal(selectMavenLipSyncRoute('LTX 2.3 Lipsync 1080p', { inputKind: 'image' }).model.id, 'ltx-2.3-lipsync');
  assert.throws(() => selectMavenLipSyncRoute('Sync Lipsync', { inputKind: 'image' }), { code: 'lipsync_model_unavailable' });
  assert.throws(() => selectMavenLipSyncRoute('LTX 2.3 Lipsync 360p', { inputKind: 'image' }), { code: 'lipsync_option_unsupported' });
});
test('reuses existing MuAPI provider with trusted image/audio and account BYOK', async () => {
  const credentials = []; const calls = [];
  const result = await generateMavenLipSync({ identity, imageUrl, audioUrl, prompt: 'Make this character speak.', credentialResolver: async (input) => { credentials.push(input); return 'test-key'; }, provider: { async processLipSync(key, params) { calls.push({ key, params }); return { url: videoUrl }; } } });
  assert.deepEqual(credentials[0], { accountId: 'account-1', creatorIdentityKey: 'creator-1', providerId: 'muapi', operation: 'lip_sync' });
  assert.equal(calls[0].key, 'test-key'); assert.equal(calls[0].params.model, 'infinitetalk-image-to-video');
  assert.equal(calls[0].params.image_url, imageUrl); assert.equal(calls[0].params.audio_url, audioUrl); assert.equal(result.url, videoUrl);
});
test('supports existing video plus audio and safely rejects missing inputs and provider failures', async () => {
  const result = await generateMavenLipSync({ identity, videoUrl, audioUrl, credentialResolver: async () => 'test-key', provider: { async processLipSync(_key, params) { assert.equal(params.video_url, videoUrl); return { url: 'https://cdn.example.test/lipsync.mp4' }; } } });
  assert.equal(result.inputKind, 'video');
  await assert.rejects(generateMavenLipSync({ identity, imageUrl, credentialResolver: async () => 'test-key' }), { code: 'lipsync_audio_required' });
  await assert.rejects(generateMavenLipSync({ identity, imageUrl, audioUrl, credentialResolver: async () => 'test-key', provider: { async processLipSync() { throw new Error('secret internal'); } } }), (error) => error.code === 'lipsync_generation_failed' && !error.message.includes('secret'));
  assert.match(buildGeneratedLipSyncReply({ url: result.url }), /Play or download the generated video/);
});
