import test from 'node:test';
import assert from 'node:assert/strict';
import { handleDesignAgentConversationPost } from '../../../../src/lib/designAgentConversationEndpoint.js';

const identity = { creatorId: 'creator-1', accountId: 'account-1', identityKey: 'identity-1' };
const videoUrl = 'https://cdn.example.test/generated.mp4';

function request(payload) { return { json: async () => payload }; }

test('Maven T2V request invokes generator and returns playable result within conversation reply', async () => {
  const calls = [];
  const deps = {
    controlledExecution: true,
    identity,
    ownershipService: { async verifyOwnedSession() { return { ok: true }; } },
    conversationReader: { async read({ conversationId }) { return { conversationId, messages: [], attachments: [] }; } },
    generateMavenVideo: async (_identity, args) => {
      calls.push(args);
      return { url: videoUrl, modelName: 'Seedance 2.5', duration: 5, aspectRatio: '9:16' };
    },
    createTextProvider: () => { throw new Error('text intelligence should not run for T2V'); },
    generateMavenImage: () => { throw new Error('image generation should not run for T2V'); },
  };
  const result = await handleDesignAgentConversationPost(request({
    conversationId: 'owned-conversation',
    message: 'Create a 5-second 9:16 video of a product reveal.',
  }), deps);
  assert.equal(result.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].prompt, 'Create a 5-second 9:16 video of a product reveal.');
  assert.match(result.reply, /Play or download the generated video/);
  assert.ok(result.reply.includes(videoUrl));
  assert.deepEqual(result.persistedMessages.map((message) => message.role), ['user', 'assistant']);
});
