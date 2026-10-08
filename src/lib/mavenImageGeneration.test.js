import test from 'node:test';
import assert from 'node:assert/strict';
import { generateMavenImage, buildGeneratedImageReply } from './mavenImageGeneration.js';

const identity = { accountId: 'acc-1', identityKey: 'ai-gency:abc', creatorId: 'creator-1' };
const SECRET = 'customer-secret-key-123';
const FAL_URL = 'https://fal.cdn.example.com/out.jpg';
const MUAPI_URL = 'https://cdn.muapi.example.com/out.png';

function falProviderMock(calls = [], url = FAL_URL) {
  return {
    async execute(args) {
      calls.push(args);
      return { outputReferences: [url] };
    },
  };
}

function muapiProviderMock(calls = [], url = MUAPI_URL) {
  return {
    async generateImage(apiKey, params) {
      calls.push({ apiKey, params });
      return { url };
    },
  };
}

/** Resolver that returns a key only for the listed providers. */
function resolverFor(keys) {
  const calls = [];
  const resolver = async (args) => {
    calls.push(args);
    return keys[args.providerId] || null;
  };
  return { resolver, calls };
}

function unusedFal() {
  return { async execute() { throw new Error('fal must not be called'); } };
}

function unusedMuapi() {
  return { async generateImage() { throw new Error('muapi must not be called'); } };
}

test('automatically selects a catalog MuAPI model and uses the customer muapi BYOK key', async () => {
  const { resolver, calls: resolverCalls } = resolverFor({ muapi: SECRET });
  const muapiCalls = [];
  const image = await generateMavenImage({
    identity,
    prompt: 'Professional Instagram promo for my coaching program',
    credentialResolver: resolver,
    provider: unusedFal(),
    muapiProvider: muapiProviderMock(muapiCalls),
  });

  assert.deepEqual(resolverCalls, [{
    accountId: 'acc-1',
    creatorIdentityKey: 'ai-gency:abc',
    providerId: 'muapi',
    operation: 'image_generation',
  }]);
  assert.equal(muapiCalls.length, 1);
  assert.equal(muapiCalls[0].apiKey, SECRET);
  assert.equal(muapiCalls[0].params.model, 'nano-banana-2');
  assert.equal(muapiCalls[0].params.aspect_ratio, '1:1');
  assert.equal(image.url, MUAPI_URL);
  assert.equal(image.transport, 'muapi');
  assert.equal(image.model, 'nano-banana-2');
});

test('honours an explicitly named model and requested aspect ratio without substitution', async () => {
  const { resolver } = resolverFor({ muapi: SECRET });
  const muapiCalls = [];
  const image = await generateMavenImage({
    identity,
    prompt: 'Use Nano Banana Pro to create a 4:5 Instagram graphic for a spring sale',
    credentialResolver: resolver,
    provider: unusedFal(),
    muapiProvider: muapiProviderMock(muapiCalls),
  });

  assert.equal(muapiCalls[0].params.model, 'nano-banana-pro');
  assert.equal(muapiCalls[0].params.aspect_ratio, '4:5');
  assert.equal(image.modelName, 'Nano Banana Pro');
  // Routing words are removed from the brief sent to the provider.
  assert.doesNotMatch(muapiCalls[0].params.prompt, /Nano Banana|4:5/);
  assert.match(muapiCalls[0].params.prompt, /spring sale/);
});

test('an explicit model without its BYOK key fails closed and never falls back to another provider', async () => {
  const { resolver } = resolverFor({ fal: SECRET });
  await assert.rejects(
    generateMavenImage({
      identity,
      prompt: 'Make a poster with Nano Banana Pro',
      credentialResolver: resolver,
      provider: falProviderMock([]),
      muapiProvider: unusedMuapi(),
    }),
    (error) => error.code === 'image_provider_credential_required'
      && error.status === 400
      && /Nano Banana Pro/.test(error.message)
      && !error.message.includes(SECRET),
  );
});

test('automatic selection falls back to fal.ai for 1:1 when no MuAPI key is stored', async () => {
  const { resolver } = resolverFor({ fal: SECRET });
  const falCalls = [];
  const image = await generateMavenImage({
    identity,
    prompt: 'A simple logo for a bakery',
    credentialResolver: resolver,
    provider: falProviderMock(falCalls),
    muapiProvider: unusedMuapi(),
  });

  assert.equal(falCalls.length, 1);
  assert.equal(falCalls[0].apiKey, SECRET);
  assert.equal(falCalls[0].inputs.model, 'fal-ai/flux/schnell');
  assert.equal(image.transport, 'fal');
  assert.equal(image.url, FAL_URL);
});

test('automatic selection for a non-square ratio does not fall back to fal.ai and fails closed', async () => {
  const { resolver } = resolverFor({ fal: SECRET });
  await assert.rejects(
    generateMavenImage({
      identity,
      prompt: 'A 4:5 Instagram graphic',
      credentialResolver: resolver,
      provider: { async execute() { throw new Error('fal must not be called'); } },
      muapiProvider: unusedMuapi(),
    }),
    (error) => error.code === 'image_provider_credential_required' && !error.message.includes(SECRET),
  );
});

test('routes an explicitly named FLUX Schnell request to fal.ai', async () => {
  const { resolver, calls } = resolverFor({ fal: SECRET });
  const falCalls = [];
  const image = await generateMavenImage({
    identity,
    prompt: 'Using FLUX Schnell, draw a red fox',
    credentialResolver: resolver,
    provider: falProviderMock(falCalls),
    muapiProvider: unusedMuapi(),
  });
  assert.equal(calls[0].providerId, 'fal');
  assert.equal(falCalls[0].inputs.model, 'fal-ai/flux/schnell');
  assert.equal(image.transport, 'fal');
});

test('rejects an explicit aspect ratio the named model does not support instead of changing it', async () => {
  const { resolver } = resolverFor({ fal: SECRET });
  await assert.rejects(
    generateMavenImage({
      identity,
      prompt: 'FLUX Schnell poster at 4:5',
      credentialResolver: resolver,
      provider: { async execute() { throw new Error('fal must not be called'); } },
      muapiProvider: unusedMuapi(),
    }),
    (error) => error.code === 'image_aspect_ratio_unsupported' && error.status === 422,
  );
});

test('reports a named model that exists but cannot create images from text', async () => {
  const { resolver } = resolverFor({ muapi: SECRET });
  await assert.rejects(
    generateMavenImage({
      identity,
      prompt: 'Use Nano Banana Edit on my photo',
      credentialResolver: resolver,
      provider: unusedFal(),
      muapiProvider: unusedMuapi(),
    }),
    (error) => error.code === 'image_model_unavailable' && error.status === 422,
  );
});

test('fails closed with a clear error when no key is stored, without calling any provider', async () => {
  const { resolver } = resolverFor({});
  await assert.rejects(
    generateMavenImage({
      identity,
      prompt: 'A logo',
      credentialResolver: resolver,
      provider: unusedFal(),
      muapiProvider: unusedMuapi(),
    }),
    (error) => error.code === 'image_provider_credential_required' && error.status === 400,
  );
});

test('propagates non-credential resolver failures instead of masking them as a missing key', async () => {
  await assert.rejects(
    generateMavenImage({
      identity,
      prompt: 'A logo',
      credentialResolver: async () => { throw Object.assign(new Error('db down'), { code: 'db_unavailable' }); },
      provider: unusedFal(),
      muapiProvider: unusedMuapi(),
    }),
    (error) => error.code === 'db_unavailable',
  );
});

test('maps MuAPI failures to a sanitized error without leaking the key', async () => {
  await assert.rejects(
    generateMavenImage({
      identity,
      prompt: 'Nano Banana Pro poster',
      credentialResolver: async () => SECRET,
      provider: unusedFal(),
      muapiProvider: { async generateImage() { throw new Error(`upstream rejected ${SECRET}`); } },
    }),
    (error) => error.code === 'image_generation_failed' && error.status === 502 && !error.message.includes(SECRET),
  );
});

test('maps fal.ai failures to a sanitized error without leaking the key', async () => {
  await assert.rejects(
    generateMavenImage({
      identity,
      prompt: 'FLUX Schnell logo',
      credentialResolver: async () => SECRET,
      provider: { async execute() { throw Object.assign(new Error(`upstream rejected ${SECRET}`), { code: 'provider_execution_failed' }); } },
      muapiProvider: unusedMuapi(),
    }),
    (error) => error.code === 'image_generation_failed' && error.status === 502 && !error.message.includes(SECRET),
  );
});

test('reports unsupported fal model/operation errors distinctly', async () => {
  await assert.rejects(
    generateMavenImage({
      identity,
      prompt: 'FLUX Schnell logo',
      credentialResolver: async () => SECRET,
      provider: { async execute() { throw Object.assign(new Error('x'), { code: 'provider_model_unsupported' }); } },
      muapiProvider: unusedMuapi(),
    }),
    (error) => error.code === 'image_generation_unsupported' && error.status === 422,
  );
});

test('times out a hung generation and reports it as a timeout', async () => {
  await assert.rejects(
    generateMavenImage({
      identity,
      prompt: 'FLUX Schnell logo',
      timeoutMs: 20,
      credentialResolver: async () => SECRET,
      provider: { execute: ({ signal }) => new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { code: 'provider_execution_failed' })));
      }) },
      muapiProvider: unusedMuapi(),
    }),
    (error) => error.code === 'image_generation_timeout' && error.status === 504,
  );
});

test('rejects provider output that is not an https image URL', async () => {
  await assert.rejects(
    generateMavenImage({
      identity,
      prompt: 'FLUX Schnell logo',
      credentialResolver: async () => SECRET,
      provider: falProviderMock([], 'javascript:alert(1)'),
      muapiProvider: unusedMuapi(),
    }),
    (error) => error.code === 'image_generation_failed',
  );
});

test('requires a prompt and an authenticated identity', async () => {
  await assert.rejects(generateMavenImage({ identity, prompt: '   ', credentialResolver: async () => SECRET }), (e) => e.code === 'image_prompt_required');
  await assert.rejects(generateMavenImage({ identity: null, prompt: 'A logo' }), (e) => e.code === 'creator_os_auth_required');
});

test('formats the generated image as a markdown reply that names the model', () => {
  const reply = buildGeneratedImageReply({ url: FAL_URL, prompt: 'Promo [spring] sale', modelName: 'Nano Banana Pro' });
  assert.match(reply, /made with Nano Banana Pro/);
  assert.match(reply, /!\[Promo spring sale\]\(https:\/\/fal\.cdn\.example\.com\/out\.jpg\)/);
});
