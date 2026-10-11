import test from 'node:test';
import assert from 'node:assert/strict';
import { handleDesignAgentConversationPost } from '../../../../src/lib/designAgentConversationEndpoint.js';

const identity = { creatorId: 'creator-1', accountId: 'account-1', identityKey: 'identity-1' };
const source = 'https://session-assets.example.test/photo.png';
const video = 'https://cdn.example.test/animated.mp4';
function request(payload) { return { json: async () => payload }; }

function deps({ attachments = [], messages = [] } = {}) {
  const calls = { i2v: [], t2v: 0, image: 0, vision: 0 };
  // Mutable so a confirmation turn can run against the plan reply this session
  // actually produced, exactly as the customer's transcript would.
  const session = { attachments, messages };
  return {
    calls,
    session,
    services: {
      controlledExecution: true,
      identity,
      ownershipService: { async verifyOwnedSession() { return { ok: true }; } },
      conversationReader: { async read({ conversationId }) { return { conversationId, attachments: session.attachments, messages: session.messages, imageReferences: session.messages.filter((m) => m.role === 'assistant') }; } },
      generateMavenImageToVideo: async (_who, args) => { calls.i2v.push(args); return { url: video, modelName: 'Seedance 2.5', duration: 5, aspectRatio: '9:16' }; },
      generateMavenVideo: async () => { calls.t2v += 1; return { url: video, modelName: 'Seedance 2.5', duration: 5, aspectRatio: '16:9' }; },
      generateMavenImage: async () => { calls.image += 1; throw new Error('not image generation'); },
      createVisionTextIntelligence: async () => { calls.vision += 1; return {}; },
      createTextProvider: () => ({ async execute() { return {}; } }),
      createConversationIntelligence: () => ({ async respond() { return { reply: 'vision' }; } }),
    },
  };
}

/**
 * The image-to-video default model is priced above the budget tier, so the real
 * flow is: request -> confirmation plan (no paid call) -> confirm -> generation.
 * Returns both turns so a test can assert on either half.
 */
async function planTurn(state, message, attachmentIds) {
  const withAttachments = attachmentIds ? { attachments: attachmentIds } : {};
  const plan = await handleDesignAgentConversationPost(request({ conversationId: 'c1', message, ...withAttachments }), state.services);
  return { plan, withAttachments };
}

async function animate(state, message, attachmentIds) {
  const { plan, withAttachments } = await planTurn(state, message, attachmentIds);
  if (!/maven-video-approval:/.test(plan.reply || '')) return { plan, confirm: null, callsBeforeConfirm: state.calls.i2v.length };
  const callsBeforeConfirm = state.calls.i2v.length;
  state.session.messages = [
    ...state.session.messages,
    { role: 'user', content: message },
    { role: 'assistant', content: plan.reply },
  ];
  const confirm = await handleDesignAgentConversationPost(request({ conversationId: 'c1', message: 'confirm', ...withAttachments }), state.services);
  return { plan, confirm, callsBeforeConfirm };
}

test('uploaded image ID is resolved from owned session assets for I2V', async () => {
  const sourceAsset = { attachmentId: 'asset_upload_1', kind: 'image', url: source };
  const state = deps({ attachments: [sourceAsset] });
  const { plan, confirm, callsBeforeConfirm } = await animate(state, 'Animate this image into a video.', ['asset_upload_1']);

  assert.equal(callsBeforeConfirm, 0, 'the plan turn must not call the provider');
  assert.match(plan.reply, /Confirm this video generation/);
  assert.equal(confirm.status, 200);
  assert.equal(state.calls.i2v[0].imageUrl, source);
  assert.equal(state.calls.t2v, 0);
  assert.match(confirm.reply, /Play or download the generated video/);
  assert.ok(confirm.reply.includes(video));
});

test('previous generated image resolves only from trusted assistant asset metadata', async () => {
  const imageAsset = { attachmentId: 'asset_generated_1', kind: 'image', url: source };
  const previous = { role: 'assistant', content: `![photo](${source})`, attachments: [{ attachmentId: 'asset_generated_1', kind: 'image' }] };
  const state = deps({ attachments: [imageAsset], messages: [previous] });
  const { plan, confirm } = await animate(state, 'Animate the previous image into a video.');

  assert.equal(confirm.status, 200);
  assert.equal(state.calls.i2v[0].imageUrl, source);
  assert.equal(state.calls.t2v, 0);
  // The plan names the model the customer is authorizing.
  assert.match(plan.reply, /Veo3 Image To Video/);
});

test('uploaded attachment requests use the ID registered by the composer, never its browser URL', async () => {
  const sourceAsset = { attachmentId: 'asset_upload_2', kind: 'image', url: source };
  const state = deps({ attachments: [sourceAsset] });
  const { confirm } = await animate(state, 'Animate this photo into a video.', ['asset_upload_2']);

  assert.equal(confirm.status, 200);
  assert.equal(state.calls.i2v[0].imageUrl, source);
});

test('missing reference fails safely; arbitrary URLs in user prompt are never passed to I2V', async () => {
  const state = deps();
  const result = await handleDesignAgentConversationPost(request({ conversationId: 'c1', message: 'Animate this image into a video https://untrusted.test/x.png' }), state.services);
  assert.equal(result.status, 422);
  assert.equal(result.code, 'image_source_unavailable');
  assert.equal(state.calls.i2v.length, 0);
});

test('foreign conversation assets cannot be used for an implicit prior-image request', async () => {
  const foreign = { attachmentId: 'asset_foreign', kind: 'image', url: source };
  const previous = { role: 'assistant', content: `![previous](${source})`, attachments: [{ attachmentId: 'asset_foreign', kind: 'image' }] };
  const state = deps({ attachments: [foreign], messages: [{ ...previous, conversationId: 'other-conversation' }] });
  state.services.conversationReader.read = async ({ conversationId }) => ({
    conversationId,
    attachments: [foreign],
    messages: [],
    imageReferences: [],
  });
  const result = await handleDesignAgentConversationPost(request({ conversationId: 'c1', message: 'Animate the previous image into a video.' }), state.services);
  assert.equal(result.status, 422);
  assert.equal(state.calls.i2v.length, 0);
});

test('a confirmation whose source image is gone fails closed without a provider call', async () => {
  const sourceAsset = { attachmentId: 'asset_upload_3', kind: 'image', url: source };
  const state = deps({ attachments: [sourceAsset] });
  const { plan } = await planTurn(state, 'Animate this image into a video.', ['asset_upload_3']);
  assert.match(plan.reply, /maven-video-approval:/);
  assert.equal(state.calls.i2v.length, 0, 'the plan turn must not call the provider');

  // The image is no longer a trusted session asset on the confirm turn.
  state.session.messages = [{ role: 'assistant', content: plan.reply }];
  state.session.attachments = [];
  const confirm = await handleDesignAgentConversationPost(request({ conversationId: 'c1', message: 'confirm' }), state.services);
  assert.equal(confirm.status, 422);
  assert.equal(confirm.code, 'image_source_unavailable');
  assert.equal(state.calls.i2v.length, 0);
});

test('plain text-to-video remains on existing T2V route', async () => {
  const state = deps();
  const result = await handleDesignAgentConversationPost(request({ conversationId: 'c1', message: 'Create a 5-second video of a fox.' }), state.services);
  assert.equal(result.status, 200);
  assert.equal(state.calls.t2v, 1);
  assert.equal(state.calls.i2v.length, 0);
});
