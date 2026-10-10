import test from 'node:test';
import assert from 'node:assert/strict';
import { handleDesignAgentConversationPost } from '../../../../src/lib/designAgentConversationEndpoint.js';

const identity = { accountId: 'account-1', identityKey: 'creator-1' };
const image = { attachmentId: 'asset_source', kind: 'image', url: 'https://cdn.test/source.png' };
const request = (message, attachments = []) => ({ json: async () => ({ conversationId: 'owned-session', message, attachments }) });

function services(overrides = {}) {
  const saved = [];
  const base = {
    controlledExecution: true, identity,
    ownershipService: { async verifyOwnedSession() { return { ok: true }; } },
    conversationReader: { async read() { return { conversationId: 'owned-session', attachments: [image], messages: [] }; } },
    registerMavenImageReference: async () => ({ attachmentId: 'asset_session_image', kind: 'image' }),
    registerMavenMediaReference: async (_identity, args) => ({ attachmentId: `asset_session_${args.kind}`, kind: args.kind }),
    persistMavenCreativeAsset: async (who, args) => { saved.push({ who, args }); return { id: `asset_library_${args.kind}` }; },
    ...overrides,
  };
  return { saved, base };
}

test('Maven Chat records generated and edited images in the owner library', async () => {
  const { saved, base } = services({
    generateMavenImage: async () => ({ url: 'https://cdn.test/new.png', provider: 'fal', model: 'flux' }),
    generateMavenImageEdit: async () => ({ url: 'https://cdn.test/edited.png', provider: 'muapi', model: 'edit', operation: 'image_editing' }),
  });
  const generated = await handleDesignAgentConversationPost(request('Create an image of a mountain.'), base);
  const edited = await handleDesignAgentConversationPost(request('Refine this image with a blue sky.', ['asset_source']), base);
  assert.equal(generated.status, 200);
  assert.equal(edited.status, 200);
  assert.deepEqual(saved.map(({ args }) => args.kind), ['image', 'image']);
  assert.equal(saved[0].who, identity);
  assert.equal(saved[0].args.conversationId, 'owned-session');
  assert.equal(saved[1].args.sourceAssetId, 'asset_source');
  assert.equal(edited.persistedMessages[1].attachments[0].attachmentId, 'asset_session_image');
});

test('Maven Chat records text video, image-to-video, and audio with their source metadata', async () => {
  const { saved, base } = services({
    generateMavenVideo: async () => ({ url: 'https://cdn.test/video.mp4', model: 'seedance' }),
    generateMavenImageToVideo: async () => ({ url: 'https://cdn.test/animated.mp4', model: 'seedance', operation: 'image_to_video' }),
    generateMavenAudio: async () => ({ url: 'https://cdn.test/speech.mp3', model: 'minimax', voiceId: 'voice-1' }),
  });
  const video = await handleDesignAgentConversationPost(request('Create a video of a sunrise.'), base);
  const animated = await handleDesignAgentConversationPost(request('Animate this image into a video.', ['asset_source']), base);
  const audio = await handleDesignAgentConversationPost(request('Narrate this: Welcome to Maven.'), base);
  assert.deepEqual([video.status, animated.status, audio.status], [200, 200, 200]);
  assert.deepEqual(saved.map(({ args }) => args.kind), ['video', 'video', 'audio']);
  assert.equal(saved[1].args.sourceAssetId, 'asset_source');
  assert.equal(saved[2].args.media.voiceId, 'voice-1');
  assert.equal(video.persistedMessages[1].attachments[0].kind, 'video');
  assert.equal(audio.persistedMessages[1].attachments[0].kind, 'audio');
});

test('library reference remains reusable when upstream session registration fails', async () => {
  const { saved, base } = services({
    generateMavenImage: async () => ({ url: 'https://cdn.test/new.png' }),
    registerMavenImageReference: async () => { throw new Error('upstream session unavailable'); },
  });
  const result = await handleDesignAgentConversationPost(request('Create an image of a mountain.'), base);
  assert.equal(result.status, 200);
  assert.equal(saved.length, 1);
  assert.equal(result.persistedMessages[1].attachments[0].attachmentId, 'asset_library_image');
});

test('failed generation cannot create a completed asset', async () => {
  const { saved, base } = services({ generateMavenImage: async () => { throw new Error('generation failed'); } });
  const result = await handleDesignAgentConversationPost(request('Create an image of a mountain.'), base);
  assert.notEqual(result.status, 200);
  assert.equal(saved.length, 0);
});

test('a storage failure leaves working generated media visible with an honest Library warning', async () => {
  const { base } = services({
    generateMavenImage: async () => ({ url: 'https://cdn.test/new.png' }),
    persistMavenCreativeAsset: async () => { throw new Error('private database details'); },
  });
  const result = await handleDesignAgentConversationPost(request('Create an image of a mountain.'), base);
  assert.equal(result.status, 200);
  assert.match(result.reply, /could not be saved to your Creative Library/);
  assert.doesNotMatch(result.reply, /private database details/);
});
