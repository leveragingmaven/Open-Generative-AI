import test from 'node:test';
import assert from 'node:assert/strict';
import {
  handleDesignAgentConversationPost,
  loadEndpointServices,
  sanitizeDesignAgentMessage,
  sanitizeDesignAgentMessages,
  CONTROLLED_MESSAGE_MAX_CONTENT_LENGTH,
} from '../../../../src/lib/designAgentConversationEndpoint.js';
import { DesignAgentSessionOwnershipError } from '../../../../src/lib/designAgentSessionOwnership.js';
import { ConversationProposalError } from '../../../../src/lib/conversationProposalBuilder.js';

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

// --- Production 500 regression: requireCreatorIdentity wrapper contract ---

function withEnv(changes, fn) {
  const managedKeys = [
    ...Object.keys(changes),
    'OPENAI_COMPATIBLE_BASE_URL', 'OPENAI_BASE_URL',
    'MAVENSYNC_OPENAI_MODEL', 'OPENAI_MODEL',
    'OPENAI_API_KEY', 'MAVENSYNC_OPENAI_API_KEY',
    'MUAPI_BASE_URL', 'MUAPI_API_KEY',
    'DB_HOST', 'DB_USER', 'DB_NAME',
  ];
  const saved = new Map(managedKeys.map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [key, value] of saved) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
}

// Dummy database coordinates: mysql2 pool creation is lazy (no connection is
// opened until the first query), so these only satisfy configuration checks
// while constructing default endpoint services in tests.
const TEST_DB_ENV = { DB_HOST: 'db.test', DB_USER: 'tester', DB_NAME: 'testdb' };

test('unwraps the { identity, response } auth contract instead of passing the wrapper as identity', async () => {
  // Production regression: requireCreatorIdentity resolves to
  // { identity, response }. The endpoint previously treated the whole wrapper
  // as the identity, so ownership scope validation threw accountId_required
  // and every authenticated request surfaced as an opaque HTTP 500.
  const seenIdentities = [];
  const deps = makeDeps({
    identity: undefined,
    authenticate: async () => ({
      identity: { creatorId: 'creator-123', accountId: 'acc-123', identityKey: 'ai-gency:abc' },
      response: null,
    }),
    ownershipService: {
      async verifyOwnedSession({ designSessionId, identity }) {
        seenIdentities.push(identity);
        if (designSessionId === 'owned-session' && identity?.accountId === 'acc-123') return { ok: true };
        return { ok: false, error: 'wrong_owner' };
      },
    },
  });

  const result = await handleDesignAgentConversationPost(
    makeRequest({ conversationId: 'owned-session', message: 'hi' }),
    deps
  );

  assert.equal(result.status, 200);
  assert.equal(result.reply, 'Mocked assistant reply');
  assert.equal(seenIdentities.length, 1);
  assert.equal(seenIdentities[0].accountId, 'acc-123');
  assert.equal(seenIdentities[0].creatorId, 'creator-123');
});

test('maps an auth response (401/503) to a sanitized status instead of crashing', async () => {
  for (const [status, code] of [[401, 'creator_os_auth_required'], [503, 'creator_account_schema_missing']]) {
    const deps = makeDeps({
      identity: undefined,
      authenticate: async () => ({
        identity: null,
        response: Response.json({ error: 'denied', code }, { status }),
      }),
    });
    const result = await handleDesignAgentConversationPost(
      makeRequest({ conversationId: 'owned-session', message: 'hi' }),
      deps
    );
    assert.equal(result.status, status);
    assert.equal(result.error, code);
  }
});

// --- Ownership service real-world contracts ---

test('maps a typed ownership rejection to its sanitized status instead of a 500', async () => {
  const deps = makeDeps({
    ownershipService: {
      async verifyOwnedSession() {
        throw new DesignAgentSessionOwnershipError('design_session_ownership_unverified', 403);
      },
    },
  });

  const result = await handleDesignAgentConversationPost(
    makeRequest({ conversationId: 'owned-session', message: 'hi' }),
    deps
  );

  assert.equal(result.status, 403);
  assert.equal(result.code, 'design_session_ownership_unverified');
});

test('proceeds when the real ownership service returns an ownership record without { ok }', async () => {
  // Regression: the real service returns the raw ownership record on success.
  // The previous `if (!owned.ok)` check rejected rightful owners with 403.
  const deps = makeDeps({
    ownershipService: {
      async verifyOwnedSession() {
        return {
          designSessionId: 'owned-session',
          accountId: 'acc-123',
          creatorIdentityKey: 'ai-gency:abc',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        };
      },
    },
  });

  const result = await handleDesignAgentConversationPost(
    makeRequest({ conversationId: 'owned-session', message: 'hi' }),
    deps
  );

  assert.equal(result.status, 200);
});

// --- Reader / provider failure sanitization ---

test('returns a sanitized error when session reading fails', async () => {
  const deps = makeDeps({
    conversationReader: {
      async read() {
        throw new ConversationProposalError(
          'fabricated_design_asset_reference',
          'The Design Agent conversation references an unavailable session asset.',
          422,
        );
      },
    },
  });

  const result = await handleDesignAgentConversationPost(
    makeRequest({ conversationId: 'owned-session', message: 'hi' }),
    deps
  );

  assert.equal(result.status, 422);
  assert.equal(result.code, 'fabricated_design_asset_reference');
  assert.match(result.error, /unavailable session asset/);
});

test('returns a sanitized 502 when text intelligence execution fails', async () => {
  const deps = makeDeps({
    createTextProvider: () => ({
      async execute() {
        const failure = new Error('Provider execution failed.');
        failure.code = 'provider_execution_failed';
        throw failure;
      },
    }),
  });

  const result = await handleDesignAgentConversationPost(
    makeRequest({ conversationId: 'owned-session', message: 'hi' }),
    deps
  );

  assert.equal(result.status, 502);
  assert.equal(result.code, 'provider_execution_failed');
  assert.doesNotMatch(result.error, /https?:\/\//);
  assert.doesNotMatch(result.error, /sk-/);
});

// --- Server-owned configuration reuse (preparation-path factory) ---

test('default services build an absolute MuAPI base path and inject the x-api-key', async () => {
  await withEnv({ MUAPI_BASE_URL: 'https://muapi.example.test', MUAPI_API_KEY: 'k-test', ...TEST_DB_ENV }, async () => {
    const services = await loadEndpointServices();
    const reader = services.conversationReader;
    const provider = reader.designAgentProvider;

    assert.match(provider.basePath, /^https:\/\/muapi\.example\.test\/api\/v1\/creative-agent$/);

    const seen = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      seen.push([String(url), options]);
      return new Response(JSON.stringify({ messages: [] }), { status: 200 });
    };
    try {
      await provider.getSession('session-1');
    } finally {
      globalThis.fetch = originalFetch;
    }
    assert.match(seen[0][0], /^https:\/\/muapi\.example\.test\/api\/v1\/creative-agent\/sessions\/session-1\/messages$/);
    assert.equal(seen[0][1].headers.get('x-api-key'), 'k-test');
  });
});

test('default services fail closed with muapi_server_key_required when no MuAPI key is configured', async () => {
  await withEnv({ MUAPI_BASE_URL: 'https://muapi.example.test', MUAPI_API_KEY: undefined, ...TEST_DB_ENV }, async () => {
    const services = await loadEndpointServices();
    const provider = services.conversationReader.designAgentProvider;

    await assert.rejects(
      () => provider.getSession('session-1'),
      (error) => error.code === 'muapi_server_key_required'
    );
  });
});

test('default text provider reuses the validated preparation config and fails closed when unconfigured', async () => {
  await withEnv({
    OPENAI_COMPATIBLE_BASE_URL: undefined,
    OPENAI_BASE_URL: undefined,
    MAVENSYNC_OPENAI_MODEL: undefined,
    OPENAI_MODEL: undefined,
    OPENAI_API_KEY: undefined,
    MAVENSYNC_OPENAI_API_KEY: undefined,
  }, async () => {
    const services = await loadEndpointServices();
    assert.throws(() => services.createTextProvider(), (error) => error.code === 'creative_intelligence_not_configured');
  });
});

test('default text provider is configured from the same environment variables as preparation', async () => {
  await withEnv({
    OPENAI_COMPATIBLE_BASE_URL: 'https://llm.example.test/v1',
    MAVENSYNC_OPENAI_MODEL: 'mavensync-model-x',
    OPENAI_API_KEY: 'sk-test',
  }, async () => {
    const services = await loadEndpointServices();
    const provider = services.createTextProvider();
    assert.equal(provider.config.endpoint, 'https://llm.example.test/v1');
    assert.equal(provider.config.model, 'mavensync-model-x');
    assert.equal(provider.config.serverKey, 'sk-test');
  });
});

test('end-to-end default wiring returns a sanitized 503 instead of an opaque 500 when intelligence is unconfigured', async () => {
  await withEnv({
    OPENAI_COMPATIBLE_BASE_URL: undefined,
    OPENAI_BASE_URL: undefined,
    MAVENSYNC_OPENAI_MODEL: undefined,
    OPENAI_MODEL: undefined,
    OPENAI_API_KEY: undefined,
    MAVENSYNC_OPENAI_API_KEY: undefined,
    MUAPI_BASE_URL: 'https://muapi.example.test',
    MUAPI_API_KEY: 'k-test',
    ...TEST_DB_ENV,
  }, async () => {
    const deps = makeDeps({
      createTextProvider: undefined,
      createConversationIntelligence: undefined,
    });

    const result = await handleDesignAgentConversationPost(
      makeRequest({ conversationId: 'owned-session', message: 'hi' }),
      deps
    );

    assert.equal(result.status, 503);
    assert.equal(result.code, 'creative_intelligence_not_configured');
  });
});
