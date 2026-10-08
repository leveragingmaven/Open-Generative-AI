import test from 'node:test';
import assert from 'node:assert/strict';
import { handleDesignAgentConversationPost, resolveLastTrustedImageReference } from './designAgentConversationEndpoint.js';

const identity = { creatorId: 'creator-1', accountId: 'account-1', identityKey: 'identity-1' };
const URL1 = 'https://cdn.example.test/generated-1.png';
const URL2 = 'https://cdn.example.test/generated-2.png';
const URL3 = 'https://cdn.example.test/generated-3.png';

function request(payload) { return { json: async () => payload }; }

function makeHarness({ owner = identity, initialAssets = [], initialMessages = [] } = {}) {
  const state = {
    assets: [...initialAssets], messages: [...initialMessages], generated: 0, edited: [], reads: 0, registrations: [],
  };
  const deps = {
    controlledExecution: true,
    identity,
    ownershipService: {
      async verifyOwnedSession({ identity: requester }) {
        if (requester.accountId !== owner.accountId || requester.identityKey !== owner.identityKey) {
          throw Object.assign(new Error('not owner'), { code: 'design_session_scope_mismatch', status: 403 });
        }
        return { ok: true };
      },
    },
    conversationReader: {
      async read({ conversationId }) {
        state.reads += 1;
        return {
          conversationId,
          messages: [...state.messages],
          imageReferences: state.messages.filter((message) => message.role === 'assistant' && Array.isArray(message.attachments)),
          attachments: [...state.assets],
        };
      },
    },
    generateMavenImage: async () => {
      state.generated += 1;
      return { url: URL1, prompt: 'A portrait', model: 'nano-banana-2', modelName: 'Nano Banana 2' };
    },
    generateMavenImageEdit: async (_identity, args) => {
      state.edited.push(args);
      return { url: state.edited.length === 1 ? URL2 : URL3, prompt: args.prompt, model: 'nano-banana-pro-edit', modelName: 'Nano Banana Pro Edit', transport: 'muapi' };
    },
    registerMavenImageReference: async (_identity, { conversationId, url }) => {
      const id = `asset_generated_${state.registrations.length + 1}`;
      const asset = { attachmentId: id, kind: 'image', url, sessionId: conversationId };
      state.registrations.push(asset);
      state.assets.push(asset);
      return { attachmentId: id, kind: 'image' };
    },
    createTextProvider: () => ({ async execute() { throw new Error('vision/text service must not run for image edits'); } }),
    createConversationIntelligence: () => ({ async respond() { throw new Error('not expected'); } }),
  };
  return { state, deps };
}

async function send(deps, message, attachments = []) {
  return handleDesignAgentConversationPost(request({ conversationId: 'conversation-1', message, attachments }), deps);
}

test('generated image -> Another Variation uses its registered session asset and preserves the original', async () => {
  const { state, deps } = makeHarness();
  const generated = await send(deps, 'Create an image of a person in a garden');
  assert.equal(generated.status, 200);
  assert.equal(generated.persistedMessages[1].attachments[0].attachmentId, 'asset_generated_1');    state.messages.push({ role: 'assistant', content: generated.reply, attachments: generated.persistedMessages[1].attachments });

  const variation = await send(deps, 'Make another variation of this image while preserving its subject and style.');
  assert.equal(variation.status, 200);
  assert.equal(state.edited.length, 1);
  assert.equal(state.edited[0].imageUrl, URL1);
  assert.equal(variation.persistedMessages[1].attachments[0].attachmentId, 'asset_generated_2');
  assert.equal(state.assets.length, 2, 'original and variation are both retained in session assets');
});

test('generated image -> Refine -> refined image -> Refine again carries forward each latest asset', async () => {
  const { state, deps } = makeHarness();
  const first = await send(deps, 'Create an image of a person in a garden');
  state.messages.push({ role: 'assistant', content: first.reply, attachments: first.persistedMessages[1].attachments });
  const refined = await send(deps, 'Change the background of that image to a modern office.');
  assert.equal(state.edited[0].imageUrl, URL1);
  state.messages.push({ role: 'assistant', content: refined.reply, attachments: refined.persistedMessages[1].attachments });

  const refinedAgain = await send(deps, 'Keep the same person but change her outfit to a red coat.');
  assert.equal(refinedAgain.status, 200);
  assert.equal(state.edited[1].imageUrl, URL2);
  assert.equal(refinedAgain.persistedMessages[1].attachments[0].attachmentId, 'asset_generated_3');
  assert.equal(state.assets.length, 3);
});

test('explicit attachment IDs are still resolved by the authorized session before editing', async () => {
  const source = { attachmentId: 'asset_upload_1', kind: 'image', url: 'https://cdn.example.test/upload.png' };
  const { state, deps } = makeHarness({ initialAssets: [source] });
  const result = await send(deps, 'Use Nano Banana Pro Edit to change the background of this image.', ['asset_upload_1']);
  assert.equal(result.status, 200);
  assert.equal(state.edited[0].imageUrl, source.url);
  assert.equal(result.persistedMessages[1].attachments[0].attachmentId, 'asset_generated_1');
});

test('asset resolution is bound to the expected conversation and customer ownership', async () => {
  const reference = { attachmentId: 'asset_1', kind: 'image', url: URL1 };
  const valid = { conversationId: 'conversation-1', imageReferences: [{ role: 'assistant', content: `![x](${URL1})`, attachments: [reference] }], attachments: [reference] };
  assert.equal(resolveLastTrustedImageReference(valid, 'conversation-1'), reference);
  assert.equal(resolveLastTrustedImageReference(valid, 'other-conversation'), null);

  const { state, deps } = makeHarness({ owner: { accountId: 'other-account', identityKey: 'other-identity' } });
  const response = await send(deps, 'Change the lighting of that image.');
  assert.equal(response.status, 403);
  assert.equal(state.reads, 0, 'unauthorized identities cannot read or resolve conversation assets');
  assert.equal(state.edited.length, 0);
});

test('missing or expired latest generated asset fails clearly without falling back to an older image', async () => {
  const older = { attachmentId: 'asset_old', kind: 'image', url: URL1 };
  const session = {
    conversationId: 'conversation-1',
    imageReferences: [
      { role: 'assistant', content: `![old](${URL1})`, attachments: [older] },
      { role: 'assistant', content: '![latest](https://cdn.example.test/expired.png)', attachments: [{ attachmentId: 'asset_expired', kind: 'image' }] },
    ],
    attachments: [older],
  };
  assert.equal(resolveLastTrustedImageReference(session, 'conversation-1'), null);

  const { state, deps } = makeHarness({ initialAssets: [older], initialMessages: session.imageReferences });
  const response = await send(deps, 'Change the lighting of that image.');
  assert.equal(response.status, 422);
  assert.equal(response.code, 'image_reference_unavailable');
  assert.equal(state.edited.length, 0);
});
