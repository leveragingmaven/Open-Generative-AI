import test from 'node:test';
import assert from 'node:assert/strict';
import { handleFalGenerationPost } from './falGenerationEndpoint.js';

const request = (body) => ({ signal: undefined, async json() { return body; } });

test('fal generation endpoint resolves the authenticated account credential and returns safe output', async () => {
  let received;
  const result = await handleFalGenerationPost(request({ operation: 'image_generation', inputs: { model: 'fal-ai/flux/schnell', prompt: 'x' } }), {
    identity: { accountId: 'account-1', identityKey: 'creator-1' },
    credentialResolver: async (input) => { received = input; return 'server-fal-secret'; },
    provider: { execute: async (input) => { assert.equal(input.apiKey, 'server-fal-secret'); return { providerResponseRef: 'req-1', outputReferences: ['https://fal.media/x.png'], providerMetadata: { model: 'fal-ai/flux/schnell' } }; }, },
  });
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { ok: true, provider: 'fal', requestId: 'req-1', outputReferences: ['https://fal.media/x.png'], providerMetadata: { model: 'fal-ai/flux/schnell' } });
  assert.deepEqual(received, { accountId: 'account-1', creatorIdentityKey: 'creator-1', providerId: 'fal', operation: 'image_generation' });
});

test('fal generation endpoint rejects browser credential and identity overrides', async () => {
  const result = await handleFalGenerationPost(request({ accountId: 'other', apiKey: 'browser-secret', inputs: {} }), { identity: { accountId: 'account-1' } });
  assert.equal(result.status, 400);
  const body = await result.json();
  assert.equal(body.error, 'Invalid request.');
  assert.doesNotMatch(JSON.stringify(body), /browser-secret/);
});

// A fal.ai customer who has not stored a fal key needs the fixable instruction,
// not a generic unavailability line: the studio gate admits any launch-available
// provider, so selecting a fal model without a fal credential is reachable.
test('fal generation endpoint names the fal.ai key and Settings when the credential is missing', async () => {
  const result = await handleFalGenerationPost(request({ operation: 'image_generation', inputs: { model: 'fal-ai/flux/schnell', prompt: 'x' } }), {
    identity: { accountId: 'account-1', identityKey: 'creator-1' },
    credentialResolver: async () => { throw Object.assign(new Error('missing'), { code: 'provider_credential_required:fal' }); },
    provider: { execute: async () => { assert.fail('the provider must not run without a credential'); } },
  });
  assert.equal(result.status, 400);
  const body = await result.json();
  assert.equal(body.error, 'Connect your fal.ai API key in Settings to generate images.');
  assert.equal(body.code, 'provider_credential_required:fal');
});
