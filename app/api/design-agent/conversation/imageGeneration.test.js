import test from 'node:test';
import assert from 'node:assert/strict';
import { handleDesignAgentConversationPost } from '../../../../src/lib/designAgentConversationEndpoint.js';

const identity = { creatorId: 'creator-123', accountId: 'acc-123', identityKey: 'ai-gency:abc' };
const IMAGE_URL = 'https://fal.cdn.example.com/out.jpg';

function jsonRequest(payload) {
  return { json: async () => payload };
}

function streamRequest(payload) {
  return {
    json: async () => payload,
    headers: { get: (name) => (String(name).toLowerCase() === 'accept' ? 'text/event-stream' : null) },
  };
}

async function readSseEvents(response) {
  assert.equal(response.status, 200);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let raw = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    raw += decoder.decode(value, { stream: true });
  }
  return raw.split('\n\n').filter(Boolean).map((frame) => JSON.parse(frame.split('\n').find((l) => l.startsWith('data:')).slice(5).trim()));
}

function makeDeps(overrides = {}) {
  const state = { textCalls: 0, generateCalls: [] };
  const deps = {
    controlledExecution: true,
    identity,
    ownershipService: { async verifyOwnedSession() { return { ok: true }; } },
    conversationReader: { async read() { return { messages: [], attachments: [] }; } },
    createTextProvider: () => { state.textCalls += 1; return { async execute() { return { outputs: ['text'] }; } }; },
    createConversationIntelligence: () => ({
      async respond() { return { reply: 'text reply' }; },
      async respondStreaming() { return { reply: 'text reply' }; },
    }),
    generateMavenImage: async (who, args) => {
      state.generateCalls.push({ who, args });
      return { url: IMAGE_URL, prompt: args.prompt, model: 'fal-ai/flux/schnell', aspectRatio: '1:1' };
    },
    registerMavenImageReference: async (_who) => ({ attachmentId: 'asset_generated_1', kind: 'image' }),
    ...overrides,
  };
  return { deps, state };
}

const IMAGE_REQUEST = 'Create a professional Instagram promotional image for my coaching program using my brand colors.';

test('an image request is executed by Maven and returns the generated image in the conversation reply', async () => {
  const { deps, state } = makeDeps();
  const result = await handleDesignAgentConversationPost(jsonRequest({ conversationId: 'owned-session', message: IMAGE_REQUEST }), deps);

  assert.equal(result.status, 200);
  assert.equal(result.role, 'assistant');
  assert.ok(result.reply.includes(`](${IMAGE_URL})`), 'reply must embed the generated image as markdown');
  assert.equal(state.generateCalls.length, 1);
  assert.equal(state.generateCalls[0].who.accountId, 'acc-123');
  assert.equal(state.generateCalls[0].args.prompt, IMAGE_REQUEST);
  assert.equal(state.textCalls, 0, 'the text intelligence provider must not run for an image request');
  assert.deepEqual(result.persistedMessages.map((m) => m.role), ['user', 'assistant']);
  assert.equal(result.persistedMessages[1].content, result.reply);
});

test('an image request streams progress and a single sanitized done event', async () => {
  const { deps, state } = makeDeps();
  const events = await readSseEvents(await handleDesignAgentConversationPost(streamRequest({ conversationId: 'owned-session', message: IMAGE_REQUEST }), deps));

  assert.deepEqual(events.map((e) => e.type), ['delta', 'done']);
  assert.match(events[1].reply, /fal\.cdn\.example\.com\/out\.jpg/);
  assert.equal(events[1].persistedMessages.length, 2);
  assert.equal(state.textCalls, 0);
});

test('non-image messages never trigger image generation', async () => {
  const { deps, state } = makeDeps();
  const result = await handleDesignAgentConversationPost(jsonRequest({ conversationId: 'owned-session', message: 'What image should I create for Instagram?' }), deps);

  assert.equal(result.status, 200);
  assert.equal(result.reply, 'text reply');
  assert.equal(state.generateCalls.length, 0);
  assert.equal(state.textCalls, 1);
});

test('image requests with attached references keep the vision path and do not generate', async () => {
  const attachments = [{ attachmentId: 'asset_1', kind: 'image', filename: 'ref.png', url: 'https://cdn.test/ref.png' }];
  const { deps, state } = makeDeps({
    conversationReader: { async read() { return { messages: [], attachments }; } },
    createVisionTextIntelligence: () => ({ async complete() { return 'vision reply'; } }),
    createConversationIntelligence: (provider, vision) => ({
      async respond() { return { reply: await vision.complete({ messages: [] }) }; },
    }),
  });
  const result = await handleDesignAgentConversationPost(jsonRequest({ conversationId: 'owned-session', message: IMAGE_REQUEST, attachments: ['asset_1'] }), deps);

  assert.equal(result.status, 200);
  assert.equal(result.reply, 'vision reply');
  assert.equal(state.generateCalls.length, 0);
});

test('a missing customer fal key surfaces a clear, safe error code and message', async () => {
  const { deps } = makeDeps({
    generateMavenImage: async () => {
      throw Object.assign(new Error('Connect your fal.ai API key in Settings to generate images.'), { code: 'image_provider_credential_required', status: 400 });
    },
  });
  const result = await handleDesignAgentConversationPost(jsonRequest({ conversationId: 'owned-session', message: IMAGE_REQUEST }), deps);

  assert.equal(result.status, 400);
  assert.equal(result.code, 'image_provider_credential_required');
  assert.match(result.error, /Connect your fal\.ai API key/);
});

test('a generation failure returns a sanitized error with no provider details', async () => {
  const { deps } = makeDeps({
    generateMavenImage: async () => {
      throw Object.assign(new Error('Image generation failed. Please try again.'), { code: 'image_generation_failed', status: 502 });
    },
  });
  const result = await handleDesignAgentConversationPost(jsonRequest({ conversationId: 'owned-session', message: IMAGE_REQUEST }), deps);

  assert.equal(result.status, 502);
  assert.equal(result.code, 'image_generation_failed');
  assert.doesNotMatch(result.error, /https?:\/\/|sk-live/);
});
