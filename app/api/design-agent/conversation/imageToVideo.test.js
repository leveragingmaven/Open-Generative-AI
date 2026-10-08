import test from 'node:test';
import assert from 'node:assert/strict';
import { handleDesignAgentConversationPost } from '../../../../src/lib/designAgentConversationEndpoint.js';

const identity = { creatorId: 'creator-1', accountId: 'account-1', identityKey: 'identity-1' };
const source = 'https://session-assets.example.test/photo.png';
const video = 'https://cdn.example.test/animated.mp4';
function request(payload) { return { json: async () => payload }; }

function deps({ attachments = [], messages = [] } = {}) {
  const calls = { i2v: [], t2v: 0, image: 0, vision: 0 };
  return {
    calls,
    services: {
      controlledExecution: true,
      identity,
      ownershipService: { async verifyOwnedSession() { return { ok: true }; } },
      conversationReader: { async read({ conversationId }) { return { conversationId, attachments, messages, imageReferences: messages.filter((m) => m.role === 'assistant') }; } },
      generateMavenImageToVideo: async (_who, args) => { calls.i2v.push(args); return { url: video, modelName: 'Seedance 2.5', duration: 5, aspectRatio: '9:16' }; },
      generateMavenVideo: async () => { calls.t2v += 1; return { url: video, modelName: 'Seedance 2.5', duration: 5, aspectRatio: '16:9' }; },
      generateMavenImage: async () => { calls.image += 1; throw new Error('not image generation'); },
      createVisionTextIntelligence: async () => { calls.vision += 1; return {}; },
      createTextProvider: () => ({ async execute() { return {}; } }),
      createConversationIntelligence: () => ({ async respond() { return { reply: 'vision' }; } }),
    },
  };
}

test('uploaded image ID is resolved from owned session assets for I2V', async () => {
  const sourceAsset = { attachmentId: 'asset_upload_1', kind: 'image', url: source };
  const { calls, services } = deps({ attachments: [sourceAsset] });
  const result = await handleDesignAgentConversationPost(request({ conversationId: 'c1', message: 'Animate this image into a video.', attachments: ['asset_upload_1'] }), services);
  assert.equal(result.status, 200);
  assert.equal(calls.i2v[0].imageUrl, source);
  assert.equal(calls.t2v, 0);
  assert.match(result.reply, /Play or download the generated video/);
  assert.ok(result.reply.includes(video));
});

test('previous generated image resolves only from trusted assistant asset metadata', async () => {
  const imageAsset = { attachmentId: 'asset_generated_1', kind: 'image', url: source };
  const previous = { role: 'assistant', content: `![photo](${source})`, attachments: [{ attachmentId: 'asset_generated_1', kind: 'image' }] };
  const { calls, services } = deps({ attachments: [imageAsset], messages: [previous] });
  const result = await handleDesignAgentConversationPost(request({ conversationId: 'c1', message: 'Animate the previous image into a video.' }), services);
  assert.equal(result.status, 200);
  assert.equal(calls.i2v[0].imageUrl, source);
  assert.equal(calls.t2v, 0);
});

test('uploaded attachment requests use the ID registered by the composer, never its browser URL', async () => {
  const sourceAsset = { attachmentId: 'asset_upload_2', kind: 'image', url: source };
  const { calls, services } = deps({ attachments: [sourceAsset] });
  const result = await handleDesignAgentConversationPost(request({ conversationId: 'c1', message: 'Animate this photo into a video.', attachments: ['asset_upload_2'] }), services);
  assert.equal(result.status, 200);
  assert.equal(calls.i2v[0].imageUrl, source);
});

test('missing reference fails safely; arbitrary URLs in user prompt are never passed to I2V', async () => {
  const { calls, services } = deps();
  const result = await handleDesignAgentConversationPost(request({ conversationId: 'c1', message: 'Animate this image into a video https://untrusted.test/x.png' }), services);
  assert.equal(result.status, 422);
  assert.equal(result.code, 'image_source_unavailable');
  assert.equal(calls.i2v.length, 0);
});

test('foreign conversation assets cannot be used for an implicit prior-image request', async () => {
  const foreign = { attachmentId: 'asset_foreign', kind: 'image', url: source };
  const previous = { role: 'assistant', content: `![previous](${source})`, attachments: [{ attachmentId: 'asset_foreign', kind: 'image' }] };
  const { calls, services } = deps({
    attachments: [foreign],
    messages: [{ ...previous, conversationId: 'other-conversation' }],
  });
  services.conversationReader.read = async ({ conversationId }) => ({
    conversationId,
    attachments: [foreign],
    messages: [],
    imageReferences: [],
  });
  const result = await handleDesignAgentConversationPost(request({ conversationId: 'c1', message: 'Animate the previous image into a video.' }), services);
  assert.equal(result.status, 422);
  assert.equal(calls.i2v.length, 0);
});

test('plain text-to-video remains on existing T2V route', async () => {
  const { calls, services } = deps();
  const result = await handleDesignAgentConversationPost(request({ conversationId: 'c1', message: 'Create a 5-second video of a fox.' }), services);
  assert.equal(result.status, 200);
  assert.equal(calls.t2v, 1);
  assert.equal(calls.i2v.length, 0);
});
