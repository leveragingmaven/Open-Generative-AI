import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGeneratedAudioReply, generateMavenAudio } from './mavenAudioGeneration.js';

const identity = { accountId: 'account-1', identityKey: 'creator-1' };
const audioUrl = 'https://cdn.example.test/generated.mp3';
const prompt = 'Narrate this in a warm female voice at speed 1.2x: Welcome to the studio.';

test('runs catalog-validated TTS through existing MuAPI using account BYOK', async () => {
  const credentials = []; const requests = [];
  const result = await generateMavenAudio({ identity, prompt, credentialResolver: async (input) => { credentials.push(input); return 'test-secret'; }, provider: { async generateAudio(key, inputs) { requests.push({ key, inputs }); return { url: audioUrl }; } } });
  assert.deepEqual(credentials, [{ accountId: 'account-1', creatorIdentityKey: 'creator-1', providerId: 'muapi', operation: 'audio_generation' }]);
  assert.equal(requests[0].key, 'test-secret'); assert.equal(requests[0].inputs.prompt, 'Welcome to the studio.');
  assert.equal(requests[0].inputs.voice_id, 'Calm_Woman'); assert.equal(requests[0].inputs.speed, 1.2);
  assert.equal(requests[0].inputs._modelId, 'minimax-speech-2.6-hd'); assert.equal(result.url, audioUrl);
});

test('missing credentials and provider failure are sanitized and fail closed', async () => {
  await assert.rejects(generateMavenAudio({ identity, prompt, credentialResolver: async () => null, provider: { async generateAudio() { assert.fail('provider must not run'); } } }), { code: 'audio_provider_credential_required' });
  await assert.rejects(generateMavenAudio({ identity, prompt, credentialResolver: async () => 'secret', provider: { async generateAudio() { throw new Error('secret upstream detail'); } } }), (error) => error.code === 'audio_generation_failed' && !error.message.includes('secret'));
});

test('audio reply includes a playable/downloadable link and rejects missing/unsupported parameters', async () => {
  assert.match(buildGeneratedAudioReply({ url: audioUrl }), /Play or download the generated audio/);
  assert.equal(buildGeneratedAudioReply({ url: audioUrl }).includes(audioUrl), true);
  await assert.rejects(generateMavenAudio({ identity, prompt: 'Create a professional voiceover for a product demo.', credentialResolver: async () => 'key' }), { code: 'audio_script_required' });
  await assert.rejects(generateMavenAudio({ identity, prompt: 'Narrate at speed 3: “Hello.”', credentialResolver: async () => 'key' }), { code: 'audio_option_unsupported' });
});
