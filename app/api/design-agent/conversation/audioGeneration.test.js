import test from 'node:test';
import assert from 'node:assert/strict';
import { handleDesignAgentConversationPost } from '../../../../src/lib/designAgentConversationEndpoint.js';
const identity = { accountId: 'account-1', identityKey: 'creator-1' };
const audioUrl = 'https://cdn.example.test/speech.mp3';
function request(payload) { return { json: async () => payload }; }
function base(overrides = {}) {
  const calls = { audio: 0, image: 0, video: 0, registered: [] };
  const deps = {
    controlledExecution: true, identity,
    ownershipService: { async verifyOwnedSession() { return { ok: true }; } },
    conversationReader: { async read({ conversationId }) { return { conversationId, messages: [], attachments: [] }; } },
    generateMavenAudio: async (_who, args) => { calls.audio++; calls.audioPrompt = args.prompt; return { url: audioUrl, modelName: 'Minimax Speech HD', voiceId: 'Calm_Woman' }; },
    registerMavenMediaReference: async (_who, args) => { calls.registered.push(args); return { attachmentId: `asset_${args.kind}_1`, kind: args.kind }; },
    generateMavenImage: async () => { calls.image++; throw new Error('image path should not run'); },
    generateMavenVideo: async () => { calls.video++; throw new Error('video path should not run'); },
    createTextProvider: () => { throw new Error('ordinary conversation should not run'); },
    ...overrides,
  };
  return { calls, deps };
}

test('speech requests generate and register playable session audio, without triggering image/video', async () => {
  const { calls, deps } = base();
  const result = await handleDesignAgentConversationPost(request({ conversationId: 'session-1', message: 'Narrate this in a warm female voice: Welcome to Maven.' }), deps);
  assert.equal(result.status, 200); assert.equal(calls.audio, 1); assert.equal(calls.image, 0); assert.equal(calls.video, 0);
  assert.match(result.reply, /Play or download the generated audio/); assert.ok(result.reply.includes(audioUrl));
  assert.deepEqual(calls.registered[0], { conversationId: 'session-1', url: audioUrl, kind: 'audio' });
  assert.deepEqual(result.persistedMessages[1].attachments, [{ attachmentId: 'asset_audio_1', kind: 'audio' }]);
});

test('lip sync resolves session-bound image and audio inputs and persists video result reference', async () => {
  const image = { attachmentId: 'asset_img', kind: 'image', url: 'https://cdn.example.test/person.png' };
  const audio = { attachmentId: 'asset_audio', kind: 'audio', url: audioUrl };
  const calls = { lip: [] };
  const { deps } = base({
    conversationReader: { async read({ conversationId }) { return { conversationId, messages: [], attachments: [image, audio] }; } },
    generateMavenLipSync: async (_who, args) => { calls.lip.push(args); return { url: 'https://cdn.example.test/talking.mp4', modelName: 'Infinite Talk' }; },
  });
  Object.assign(deps, {
    generateMavenLipSync: async (_who, args) => { calls.lip.push(args); return { url: 'https://cdn.example.test/talking.mp4', modelName: 'Infinite Talk' }; },
    registerMavenMediaReference: async (_who, args) => ({ attachmentId: `asset_${args.kind}_result`, kind: args.kind }),
  });
  const result = await handleDesignAgentConversationPost(request({ conversationId: 'session-1', message: 'Make this character say “Welcome”.', attachments: ['asset_img', 'asset_audio'] }), deps);
  assert.equal(result.status, 200); assert.equal(calls.lip.length, 1);
  assert.equal(calls.lip[0].imageUrl, image.url); assert.equal(calls.lip[0].audioUrl, audio.url);
  assert.match(result.reply, /Play or download the generated video/);
  assert.deepEqual(result.persistedMessages[1].attachments, [{ attachmentId: 'asset_video_result', kind: 'video' }]);
});

test('lip sync rejects arbitrary URLs and missing or foreign session media IDs', async () => {
  let called = 0;
  const { deps } = base({ generateMavenLipSync: async () => { called++; return { url: 'https://cdn.test/out.mp4' }; } });
  const arbitrary = await handleDesignAgentConversationPost(request({ conversationId: 'session-1', message: 'Lip sync this avatar to https://evil.test/audio.mp3' }), deps);
  assert.equal(arbitrary.status, 422); assert.equal(called, 0);
  const missing = await handleDesignAgentConversationPost(request({ conversationId: 'session-1', message: 'Lip sync this avatar to audio.', attachments: ['asset_foreign'] }), deps);
  assert.equal(missing.status, 422); assert.equal(missing.code, 'fabricated_design_asset_reference'); assert.equal(called, 0);
});

test('quoted narration is generated and registered before lip sync, without an unsafe fallback', async () => {
  const image = { attachmentId: 'asset_img', kind: 'image', url: 'https://cdn.example.test/person.png' };
  const calls = { audio: 0, lip: [] };
  const { deps } = base({
    conversationReader: { async read({ conversationId }) { return { conversationId, messages: [], attachments: [image] }; } },
    generateMavenLipSync: async (_who, args) => { calls.lip.push(args); return { url: 'https://cdn.example.test/talking.mp4' }; },
  });
  deps.generateMavenLipSync = async (_who, args) => { calls.lip.push(args); return { url: 'https://cdn.example.test/talking.mp4' }; };
  const result = await handleDesignAgentConversationPost(request({ conversationId: 'session-1', message: 'Make this character say “Welcome to Maven.”', attachments: ['asset_img'] }), deps);
  assert.equal(result.status, 200); assert.equal(calls.lip[0].audioUrl, audioUrl);
  const blocked = { ...deps, registerMavenMediaReference: async () => null };
  const fail = await handleDesignAgentConversationPost(request({ conversationId: 'session-1', message: 'Make this character say “Welcome to Maven.”', attachments: ['asset_img'] }), blocked);
  assert.equal(fail.status, 422); assert.equal(fail.code, 'lipsync_audio_required');
});

// Regression: a lip-sync request can also match the image-to-video vocabulary
// ("animate this image ..."). Lip sync must win the intent race so attached audio is
// never silently dropped and the user never sees a misleading image-refinement error.
test('lip sync intent outranks image-to-video intent when only audio is attached', async () => {
  const audio = { attachmentId: 'asset_audio', kind: 'audio', url: audioUrl };
  let imageToVideoCalls = 0; let lipCalls = 0;
  const { deps } = base({
    conversationReader: { async read({ conversationId }) { return { conversationId, messages: [], attachments: [audio] }; } },
    generateMavenImageToVideo: async () => { imageToVideoCalls++; throw new Error('image-to-video must not run for a lip sync request'); },
    generateMavenLipSync: async () => { lipCalls++; return { url: 'https://cdn.example.test/talking.mp4' }; },
  });
  const result = await handleDesignAgentConversationPost(
    request({ conversationId: 'session-1', message: 'Animate this image and add lip sync', attachments: ['asset_audio'] }),
    deps,
  );
  // Fails closed on the *lip-sync* precondition, not the image-reference one.
  assert.equal(result.status, 422);
  assert.equal(result.code, 'lipsync_input_required');
  assert.equal(imageToVideoCalls, 0);
  assert.equal(lipCalls, 0);
});
