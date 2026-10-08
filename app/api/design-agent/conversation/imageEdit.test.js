import test from 'node:test';
import assert from 'node:assert/strict';
import { handleDesignAgentConversationPost } from '../../../../src/lib/designAgentConversationEndpoint.js';

const identity = { creatorId: 'creator-123', accountId: 'acc-123', identityKey: 'ai-gency:abc' };
const EDITED_URL = 'https://cdn.muapi.example.com/edited.png';
const SOURCE_URL = 'https://storage.example.com/source-photo.jpg';
const EDIT_REQUEST = 'Use Nano Banana Pro Edit to change the background of this image to a modern office.';

function jsonRequest(payload) {
  return { json: async () => payload };
}

function makeDeps(overrides = {}) {
  const state = { textCalls: 0, editCalls: [], generateCalls: 0 };
  const deps = {
    controlledExecution: true,
    identity,
    ownershipService: { async verifyOwnedSession() { return { ok: true }; } },
    conversationReader: {
      async read() {
        return {
          messages: [],
          attachments: [{ attachmentId: 'asset_1', kind: 'image', url: SOURCE_URL, filename: 'photo.jpg' }],
        };
      },
    },
    createTextProvider: () => { state.textCalls += 1; return { async execute() { return { outputs: ['text'] }; } }; },
    createConversationIntelligence: () => ({
      async respond() { return { reply: 'text reply' }; },
      async respondStreaming() { return { reply: 'text reply' }; },
    }),
    generateMavenImage: async () => { state.generateCalls += 1; throw new Error('text-to-image must not run for an edit'); },
    generateMavenImageEdit: async (who, args) => {
      state.editCalls.push({ who, args });
      return { url: EDITED_URL, prompt: args.prompt, model: 'nano-banana-pro-edit', modelName: 'Nano Banana Pro Edit', transport: 'muapi', operation: 'image_editing' };
    },
    ...overrides,
  };
  return { deps, state };
}

test('an edit request with one trusted reference image returns the edited image in the conversation', async () => {
  const { deps, state } = makeDeps();
  const result = await handleDesignAgentConversationPost(
    jsonRequest({ conversationId: 'owned-session', message: EDIT_REQUEST, attachments: ['asset_1'] }),
    deps,
  );

  assert.equal(result.status, 200);
  assert.equal(state.editCalls.length, 1);
  assert.equal(state.editCalls[0].who.accountId, 'acc-123');
  assert.equal(state.editCalls[0].args.imageUrl, SOURCE_URL, 'the edit must use the session-verified attachment URL');
  assert.equal(state.textCalls, 0, 'the text provider must not run for an edit request');
  assert.equal(state.generateCalls, 0, 'an edit must not fall through to text-to-image');
  assert.match(result.reply, /edited image made with Nano Banana Pro Edit/);
  assert.ok(result.reply.includes(`](${EDITED_URL})`));
  assert.deepEqual(result.persistedMessages.map((m) => m.role), ['user', 'assistant']);
});

test('an edit request without a session-verified attachment is not sent to the editing service', async () => {
  const { deps, state } = makeDeps({
    conversationReader: { async read() { return { messages: [], attachments: [] }; } },
  });
  // Without a reference image the service fails safely rather than falling through to text-only generation.
  const result = await handleDesignAgentConversationPost(jsonRequest({ conversationId: 'owned-session', message: EDIT_REQUEST }), deps);
  assert.equal(result.status, 422);
  assert.equal(result.code, 'image_reference_unavailable');
  assert.equal(state.editCalls.length, 0);
});
