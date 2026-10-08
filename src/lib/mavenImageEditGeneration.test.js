import test from 'node:test';
import assert from 'node:assert/strict';
import { generateMavenImageEdit, enhanceMavenImageEditPrompt } from './mavenImageGeneration.js';

const identity = { accountId: 'acc-1', identityKey: 'ai-gency:abc', creatorId: 'creator-1' };
const testCredential = 'fake-key';
const SOURCE = 'https://storage.example.com/source-photo.jpg';
const EDITED = 'https://cdn.muapi.example.com/edited.png';

function muapiMock(calls = [], url = EDITED) {
  return {
    async generateI2I(apiKey, params) {
      calls.push({ apiKey, params });
      return { url };
    },
  };
}

test('edits the trusted reference image with the customer muapi key and the explicitly named model', async () => {
  const resolverCalls = [];
  const calls = [];
  const result = await generateMavenImageEdit({
    identity,
    prompt: 'Use Nano Banana Pro Edit to change the background of this image to a modern office.',
    imageUrl: SOURCE,
    credentialResolver: async (args) => { resolverCalls.push(args); return testCredential; },
    muapiProvider: muapiMock(calls),
  });

  assert.deepEqual(resolverCalls, [{
    accountId: 'acc-1',
    creatorIdentityKey: 'ai-gency:abc',
    providerId: 'muapi',
    operation: 'image_editing',
  }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].apiKey, testCredential);
  assert.equal(calls[0].params.model, 'nano-banana-pro-edit');
  assert.equal(calls[0].params.image_url, SOURCE);
  assert.doesNotMatch(calls[0].params.prompt, /Nano Banana Pro Edit/);
  assert.match(calls[0].params.prompt, /change the background/);
  for (const attribute of ["identity and facial features", "hairstyle and hair color", "clothing or outfit", "glasses and accessories", "body proportions", "pose", "original photographic or illustration style"]) {
    assert.ok(calls[0].params.prompt.includes(attribute), `preservation prompt should include ${attribute}`);
  }
  assert.equal(result.url, EDITED);
  assert.equal(result.operation, 'image_editing');
  assert.equal(result.modelName, 'Nano Banana Pro Edit');
});

test('localized edit prompt enhancement protects subject identity and style without another model call', () => {
  const enhanced = enhanceMavenImageEditPrompt('Change only the background to a luxury office.');
  assert.match(enhanced, /Preserve the original subject's identity/);
  assert.match(enhanced, /original photographic or illustration style/);
  assert.match(enhanced, /Do not change anything else/);
});

test('explicit subject changes are not contradicted while unrelated details remain protected', () => {
  const prompt = 'Change the outfit to a blue coat and change the background to a city street.';
  const enhanced = enhanceMavenImageEditPrompt(prompt);
  assert.match(enhanced, /Change the outfit to a blue coat/);
  assert.doesNotMatch(enhanced, /Preserve the original subject's clothing or outfit/);
  assert.match(enhanced, /Preserve the original subject's identity and facial features/);
});

test('fails closed without the muapi key and never calls the provider', async () => {
  let called = false;
  await assert.rejects(
    generateMavenImageEdit({
      identity,
      prompt: 'Change the background of this image',
      imageUrl: SOURCE,
      credentialResolver: async () => null,
      muapiProvider: { async generateI2I() { called = true; } },
    }),
    (e) => e.code === 'image_provider_credential_required' && e.status === 400 && !e.message.includes(testCredential),
  );
  assert.equal(called, false);
});

test('rejects a missing or non-http reference image without calling the provider', async () => {
  for (const imageUrl of [undefined, '', 'javascript:alert(1)', 'not a url']) {
    await assert.rejects(
      generateMavenImageEdit({
        identity,
        prompt: 'Change the background of this image',
        imageUrl,
        credentialResolver: async () => testCredential,
        muapiProvider: { async generateI2I() { throw new Error('must not be called'); } },
      }),
      (e) => e.code === 'image_source_unavailable' && e.status === 422,
    );
  }
});

test('reports a generation-only model named for an edit as unavailable, without calling the provider', async () => {
  await assert.rejects(
    generateMavenImageEdit({
      identity,
      prompt: 'Use Nano Banana Pro to edit this photo',
      imageUrl: SOURCE,
      credentialResolver: async () => testCredential,
      muapiProvider: { async generateI2I() { throw new Error('must not be called'); } },
    }),
    (e) => e.code === 'image_model_unavailable',
  );
});

test('maps provider failures to a sanitized error without leaking the key', async () => {
  await assert.rejects(
    generateMavenImageEdit({
      identity,
      prompt: 'Change the background of this image',
      imageUrl: SOURCE,
      credentialResolver: async () => testCredential,
      muapiProvider: { async generateI2I() { throw new Error(`upstream rejected ${testCredential}`); } },
    }),
    (e) => e.code === 'image_generation_failed' && e.status === 502 && !e.message.includes(testCredential),
  );
});

test('rejects provider output that is not an https image URL', async () => {
  await assert.rejects(
    generateMavenImageEdit({
      identity,
      prompt: 'Change the background of this image',
      imageUrl: SOURCE,
      credentialResolver: async () => testCredential,
      muapiProvider: muapiMock([], 'javascript:alert(1)'),
    }),
    (e) => e.code === 'image_generation_failed',
  );
});
