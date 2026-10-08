import test from 'node:test';
import assert from 'node:assert/strict';
import { generateMavenImage, buildGeneratedImageReply } from './mavenImageGeneration.js';

const identity = { accountId: 'acc-1', identityKey: 'ai-gency:abc', creatorId: 'creator-1' };
const SECRET = 'fal-customer-secret-key-123';

function okProvider(calls = [], url = 'https://fal.cdn.example.com/out.jpg') {
  return {
    async execute(args) {
      calls.push(args);
      return { outputReferences: [url] };
    },
  };
}

test('uses the customer BYOK credential resolved for fal and the existing text-to-image model', async () => {
  const resolverCalls = [];
  const providerCalls = [];
  const image = await generateMavenImage({
    identity,
    prompt: 'Professional Instagram promo for my coaching program',
    credentialResolver: async (args) => { resolverCalls.push(args); return SECRET; },
    provider: okProvider(providerCalls),
  });

  assert.deepEqual(resolverCalls, [{
    accountId: 'acc-1',
    creatorIdentityKey: 'ai-gency:abc',
    providerId: 'fal',
    operation: 'image_generation',
  }]);
  assert.equal(providerCalls.length, 1);
  assert.equal(providerCalls[0].operation, 'image_generation');
  assert.equal(providerCalls[0].apiKey, SECRET);
  assert.equal(providerCalls[0].inputs.model, 'fal-ai/flux/schnell');
  assert.equal(providerCalls[0].inputs.prompt, 'Professional Instagram promo for my coaching program');
  assert.deepEqual(image, {
    url: 'https://fal.cdn.example.com/out.jpg',
    prompt: 'Professional Instagram promo for my coaching program',
    model: 'fal-ai/flux/schnell',
    aspectRatio: '1:1',
  });
});

test('fails closed with a clear error when the customer has no fal key, without calling the provider', async () => {
  let called = false;
  await assert.rejects(
    generateMavenImage({
      identity,
      prompt: 'A logo',
      credentialResolver: async () => null,
      provider: { async execute() { called = true; } },
    }),
    (error) => error.code === 'image_provider_credential_required' && error.status === 400 && !error.message.includes(SECRET),
  );
  assert.equal(called, false);
});

test('maps a missing stored credential from the resolver to the same credential error', async () => {
  await assert.rejects(
    generateMavenImage({
      identity,
      prompt: 'A logo',
      credentialResolver: async () => { throw Object.assign(new Error('x'), { code: 'provider_credential_required:fal' }); },
      provider: okProvider(),
    }),
    (error) => error.code === 'image_provider_credential_required',
  );
});

test('propagates non-credential resolver failures instead of masking them as a missing key', async () => {
  await assert.rejects(
    generateMavenImage({
      identity,
      prompt: 'A logo',
      credentialResolver: async () => { throw Object.assign(new Error('db down'), { code: 'db_unavailable' }); },
      provider: okProvider(),
    }),
    (error) => error.code === 'db_unavailable',
  );
});

test('maps provider failures to a sanitized error without leaking the key', async () => {
  await assert.rejects(
    generateMavenImage({
      identity,
      prompt: 'A logo',
      credentialResolver: async () => SECRET,
      provider: { async execute() { throw Object.assign(new Error(`upstream rejected ${SECRET}`), { code: 'provider_execution_failed' }); } },
    }),
    (error) => error.code === 'image_generation_failed' && error.status === 502 && !error.message.includes(SECRET),
  );
});

test('reports unsupported model/operation errors distinctly', async () => {
  await assert.rejects(
    generateMavenImage({
      identity,
      prompt: 'A logo',
      credentialResolver: async () => SECRET,
      provider: { async execute() { throw Object.assign(new Error('x'), { code: 'provider_model_unsupported' }); } },
    }),
    (error) => error.code === 'image_generation_unsupported' && error.status === 422,
  );
});

test('times out a hung generation and reports it as a timeout', async () => {
  await assert.rejects(
    generateMavenImage({
      identity,
      prompt: 'A logo',
      timeoutMs: 20,
      credentialResolver: async () => SECRET,
      provider: { execute: ({ signal }) => new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { code: 'provider_execution_failed' })));
      }) },
    }),
    (error) => error.code === 'image_generation_timeout' && error.status === 504,
  );
});

test('rejects provider output that is not an https image URL', async () => {
  await assert.rejects(
    generateMavenImage({
      identity,
      prompt: 'A logo',
      credentialResolver: async () => SECRET,
      provider: okProvider([], 'javascript:alert(1)'),
    }),
    (error) => error.code === 'image_generation_failed',
  );
});

test('requires a prompt and an authenticated identity', async () => {
  await assert.rejects(generateMavenImage({ identity, prompt: '   ', credentialResolver: async () => SECRET, provider: okProvider() }), (e) => e.code === 'image_prompt_required');
  await assert.rejects(generateMavenImage({ identity: null, prompt: 'A logo' }), (e) => e.code === 'creator_os_auth_required');
});

test('formats the generated image as a markdown reply that the Maven transcript can render', () => {
  const reply = buildGeneratedImageReply({ url: 'https://fal.cdn.example.com/out.jpg', prompt: 'Promo [spring] sale' });
  assert.match(reply, /!\[Promo spring sale\]\(https:\/\/fal\.cdn\.example\.com\/out\.jpg\)/);
});
