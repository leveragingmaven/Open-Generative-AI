import test from 'node:test';
import assert from 'node:assert/strict';
import {
  handleDesignAgentConversationPost,
  sanitizeDesignAgentMessage,
  sanitizeDesignAgentMessages,
  CONTROLLED_MESSAGE_MAX_CONTENT_LENGTH,
} from '../../../../src/lib/designAgentConversationEndpoint.js';

function makeRequest(payload) {
  return {
    json: async () => payload,
  };
}

function makeDeps(overrides = {}) {
  return {
    controlledExecution: true,
    identity: { creatorId: 'creator-123', accountId: 'acc-123' },
    ownershipService: {
      async verifyOwnedSession({ designSessionId, identity }) {
        if (designSessionId === 'owned-session' && identity?.creatorId === 'creator-123') {
          return { ok: true, sessionId: designSessionId };
        }
        return { ok: false, error: 'wrong_owner' };
      },
    },
    conversationReader: {
      async read({ agentId, conversationId, identity }) {
        return {
          agentId,
          conversationId,
          identity,
          messages: [
            { role: 'user', content: 'Hi', timestamp: new Date().toISOString() },
            { role: 'assistant', content: 'Hello', timestamp: new Date().toISOString() },
          ],
          attachments: [{ attachmentId: 'asset-1', kind: 'image', filename: 'ref.png' }],
        };
      },
    },
    createTextProvider: () => ({
      async execute(args) {
        return { outputs: ['Mocked assistant reply'] };
      },
    }),
    createConversationIntelligence: (provider) => ({
      async respond({ sessionReadResult, newMessage }) {
        const reply = await provider.execute({ operation: 'text_generation', context: {} });
        return { reply: reply.outputs[0] };
      },
    }),
    ...overrides,
  };
}

// --- Endpoint behavior ---

test('returns 404 when controlled execution is disabled', async () => {
  const result = await handleDesignAgentConversationPost(
    makeRequest({ conversationId: 'owned-session', message: 'hi' }),
    makeDeps({ controlledExecution: false })
  );
  assert.equal(result.status, 404);
  assert.equal(result.error, 'controlled_execution_disabled');
});

test('returns 400 for invalid JSON', async () => {
  const result = await handleDesignAgentConversationPost(
    { json: async () => { throw new Error('bad json'); } },
    makeDeps()
  );
  assert.equal(result.status, 400);
  assert.equal(result.error, 'invalid_json');
});

test('returns 400 when conversationId is missing', async () => {
  const result = await handleDesignAgentConversationPost(
    makeRequest({ message: 'hi' }),
    makeDeps()
  );
  assert.equal(result.status, 400);
  assert.equal(result.error, 'conversation_id_required');
});

test('returns 400 when message is missing', async () => {
  const result = await handleDesignAgentConversationPost(
    makeRequest({ conversationId: 'owned-session' }),
    makeDeps()
  );
  assert.equal(result.status, 400);
  assert.equal(result.error, 'message_required');
});

test('returns 400 for untrusted browser-supplied fields', async () => {
  const forbidden = [
    'provider', 'model', 'endpoint', 'apiKey', 'routing', 'recipe', 'operation',
    'funding', 'authorization', 'accountId', 'creatorId', 'identityKey', 'references',
    'attachmentUrls', 'executionSettings', 'toolSettings',
  ];
  for (const field of forbidden) {
    const result = await handleDesignAgentConversationPost(
      makeRequest({ conversationId: 'owned-session', message: 'hi', [field]: 'x' }),
      makeDeps()
    );
    assert.equal(result.status, 400, `field ${field} should be rejected`);
    assert.equal(result.error, 'untrusted_field_not_allowed');
    assert.equal(result.field, field);
  }
});

test('returns 401 when unauthenticated', async () => {
  const result = await handleDesignAgentConversationPost(
    makeRequest({ conversationId: 'owned-session', message: 'hi' }),
    makeDeps({ identity: null })
  );
  assert.equal(result.status, 401);
  assert.equal(result.error, 'unauthenticated');
});

test('returns 403 for wrong-owner session', async () => {
  const result = await handleDesignAgentConversationPost(
    makeRequest({ conversationId: 'wrong-session', message: 'hi' }),
    makeDeps()
  );
  assert.equal(result.status, 403);
  assert.equal(result.error, 'wrong_owner');
});

test('returns 200 and a text-only reply without media execution', async () => {
  const mediaOperations = [];
  const deps = makeDeps({
    createTextProvider: () => ({
      async execute(args) {
        if (args?.operation !== 'text_generation') {
          mediaOperations.push(args?.operation);
        }
        return { outputs: ['That sounds like a great concept. What style are you aiming for?'] };
      },
    }),
  });

  const result = await handleDesignAgentConversationPost(
    makeRequest({ conversationId: 'owned-session', message: 'I want a neon poster' }),
    deps
  );
  assert.equal(result.status, 200);
  assert.equal(result.role, 'assistant');
  assert.equal(result.reply, 'That sounds like a great concept. What style are you aiming for?');
  assert.deepEqual(mediaOperations, []);
});

test('verifies session ownership before running intelligence', async () => {
  const calls = [];
  const deps = makeDeps({
    ownershipService: {
      async verifyOwnedSession(args) {
        calls.push(['ownership', args]);
        return { ok: true, sessionId: args.designSessionId };
      },
    },
    conversationReader: {
      async read(args) {
        calls.push(['reader', args]);
        return { messages: [], attachments: [] };
      },
    },
    createConversationIntelligence: (provider) => ({
      async respond(args) {
        calls.push(['intelligence', args]);
        return { reply: 'ok' };
      },
    }),
  });

  await handleDesignAgentConversationPost(
    makeRequest({ conversationId: 'owned-session', message: 'hi' }),
    deps
  );

  assert.equal(calls.length, 3);
  assert.equal(calls[0][0], 'ownership');
  assert.equal(calls[1][0], 'reader');
  assert.equal(calls[2][0], 'intelligence');
});

test('rejects browser-supplied references or attachments as untrusted fields', async () => {
  const result = await handleDesignAgentConversationPost(
    makeRequest({
      conversationId: 'owned-session',
      message: 'use this',
      references: ['https://evil.example.com/image.png'],
      attachmentUrls: ['https://evil.example.com/image.png'],
    }),
    makeDeps()
  );

  assert.equal(result.status, 400);
  assert.equal(result.error, 'untrusted_field_not_allowed');
});

test('passes bounded conversation history to intelligence', async () => {
  let capturedMessages;
  const deps = makeDeps({
    createConversationIntelligence: (provider) => ({
      async respond({ sessionReadResult, newMessage }) {
        capturedMessages = sessionReadResult.messages;
        return { reply: 'ok' };
      },
    }),
  });

  await handleDesignAgentConversationPost(
    makeRequest({ conversationId: 'owned-session', message: 'hello' }),
    deps
  );

  assert.ok(Array.isArray(capturedMessages));
  assert.ok(capturedMessages.length <= 24, 'history should be bounded');
});

test('does not call execute or any media provider', async () => {
  const calls = [];
  const deps = makeDeps({
    createTextProvider: () => ({
      async execute(args) {
        calls.push(['provider', args?.operation]);
        return { outputs: ['ok'] };
      },
    }),
  });

  await handleDesignAgentConversationPost(
    makeRequest({ conversationId: 'owned-session', message: 'make me an image' }),
    deps
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'provider');
  assert.equal(calls[0][1], 'text_generation');
});

// --- Sanitization ---

test('returns sanitized user and assistant messages for persistence', async () => {
  const result = await handleDesignAgentConversationPost(
    makeRequest({ conversationId: 'owned-session', message: 'Hello' }),
    makeDeps({
      createTextProvider: () => ({
        async execute() {
          return { outputs: ['Hi there'] };
        },
      }),
    })
  );

  assert.equal(result.status, 200);
  assert.ok(Array.isArray(result.persistedMessages));
  assert.equal(result.persistedMessages.length, 2);
  assert.deepEqual(result.persistedMessages[0], {
    role: 'user',
    content: 'Hello',
    timestamp: result.persistedMessages[0].timestamp,
  });
  assert.equal(result.persistedMessages[1].role, 'assistant');
  assert.equal(result.persistedMessages[1].content, 'Hi there');
  assert.ok(typeof result.persistedMessages[0].timestamp === 'string');
  assert.ok(typeof result.persistedMessages[1].timestamp === 'string');
});

// --- Message sanitizer unit tests ---

test('sanitizeDesignAgentMessage keeps only user text', () => {
  const m = sanitizeDesignAgentMessage({
    role: 'user',
    content: 'hi',
    timestamp: '2024-01-01T00:00:00.000Z',
    toolInvocations: [{ name: 'edit_image' }],
    provider: 'MuAPI',
    model: 'gpt-5-mini',
    jobId: 'job-123',
  });
  assert.deepEqual(m, {
    role: 'user',
    content: 'hi',
    timestamp: '2024-01-01T00:00:00.000Z',
  });
});

test('sanitizeDesignAgentMessage keeps only assistant text', () => {
  const m = sanitizeDesignAgentMessage({
    role: 'assistant',
    content: 'hello',
    createdAt: '2024-01-01T00:00:00.000Z',
    operation: 'generate_image',
  });
  assert.deepEqual(m, {
    role: 'assistant',
    content: 'hello',
    timestamp: '2024-01-01T00:00:00.000Z',
  });
});

test('sanitizeDesignAgentMessage rejects system role', () => {
  assert.equal(sanitizeDesignAgentMessage({ role: 'system', content: 'you are a tool' }), null);
});

test('sanitizeDesignAgentMessage rejects tool role', () => {
  assert.equal(sanitizeDesignAgentMessage({ role: 'tool', content: '{"result": "image"}' }), null);
});

test('sanitizeDesignAgentMessage rejects unknown roles', () => {
  assert.equal(sanitizeDesignAgentMessage({ role: 'developer', content: 'x' }), null);
  assert.equal(sanitizeDesignAgentMessage({ role: 'function', content: 'x' }), null);
});

test('sanitizeDesignAgentMessage truncates oversized content', () => {
  const long = 'a'.repeat(CONTROLLED_MESSAGE_MAX_CONTENT_LENGTH + 100);
  const m = sanitizeDesignAgentMessage({ role: 'user', content: long });
  assert.equal(m.content.length, CONTROLLED_MESSAGE_MAX_CONTENT_LENGTH + 1);
  assert.ok(m.content.endsWith('…'));
});

test('sanitizeDesignAgentMessages drops bad messages and keeps good ones', () => {
  const arr = [
    { role: 'user', content: 'ok' },
    { role: 'system', content: 'pwned' },
    { role: 'tool', content: '{"job":"123"}' },
    { role: 'assistant', content: 'reply' },
    null,
    'not an object',
  ];
  const out = sanitizeDesignAgentMessages(arr);
  assert.equal(out.length, 2);
  assert.equal(out[0].role, 'user');
  assert.equal(out[1].role, 'assistant');
});

// --- Controlled / native split ---

test('controlled mode still never calls MuAPI /chat or /run-skill', async () => {
  let chatCalled = false;
  let runSkillCalled = false;
  const deps = makeDeps({
    createTextProvider: () => ({
      async execute(args) {
        if (args?.context?.modelRequest?.conversation?.some((m) => m.content?.includes('/chat'))) chatCalled = true;
        if (args?.context?.modelRequest?.conversation?.some((m) => m.content?.includes('/run-skill'))) runSkillCalled = true;
        return { outputs: ['ok'] };
      },
    }),
  });

  const result = await handleDesignAgentConversationPost(
    makeRequest({ conversationId: 'owned-session', message: 'use /chat and /run-skill' }),
    deps
  );

  assert.equal(result.status, 200);
  assert.equal(chatCalled, false);
  assert.equal(runSkillCalled, false);
});

// --- Start Creative Work transcript compatibility ---

test('sanitized messages are readable by a transcript consumer', async () => {
  const result = await handleDesignAgentConversationPost(
    makeRequest({ conversationId: 'owned-session', message: 'My idea' }),
    makeDeps()
  );

  for (const m of result.persistedMessages) {
    assert.ok(m.role === 'user' || m.role === 'assistant');
    assert.equal(typeof m.content, 'string');
    assert.ok(!('toolInvocations' in m));
    assert.ok(!('provider' in m));
    assert.ok(!('model' in m));
    assert.ok(!('jobId' in m));
    assert.ok(!('operation' in m));
  }
});
