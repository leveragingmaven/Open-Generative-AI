import test from 'node:test';
import assert from 'node:assert/strict';
import { POST } from './route.js';

// Production regression coverage: this route previously wrapped EVERY handler
// result in NextResponse.json(), which serialized a streaming SSE Response as
// "{}" (application/json). The browser then received no data frames and the
// UI surfaced "Conversation ended without a final response." These tests pin
// the pass-through contract at the route layer.

function makeStreamRequest(payload) {
  return {
    json: async () => payload,
    headers: {
      get: (name) => (String(name).toLowerCase() === 'accept' ? 'text/event-stream' : null),
    },
  };
}

function makeJsonRequest(payload) {
  return {
    json: async () => payload,
  };
}

function makeDeps(overrides = {}) {
  const providerCalls = [];
  const base = {
    controlledExecution: true,
    identity: { creatorId: 'creator-123', accountId: 'acc-123' },
    ownershipService: {
      async verifyOwnedSession({ designSessionId, identity }) {
        if (designSessionId === 'owned-session' && identity?.creatorId === 'creator-123') {
          return { ok: true };
        }
        return { ok: false, error: 'wrong_owner' };
      },
    },
    conversationReader: {
      async read() {
        return { messages: [], attachments: [] };
      },
    },
    createTextProvider: () => ({
      async execute() {
        throw new Error('non-streaming execute must not be used while streaming');
      },
      streamText: async function* streamText(args) {
        providerCalls.push(args);
        yield 'Hello';
        yield ' from the stream.';
      },
    }),
    createConversationIntelligence: undefined,
  };
  return Object.assign({}, base, overrides, { __providerCalls: providerCalls });
}

async function readSseEvents(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let raw = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    raw += decoder.decode(value, { stream: true });
  }
  raw += decoder.decode();
  return raw
    .split('\n\n')
    .filter(Boolean)
    .map((frame) => {
      const line = frame.split(/\r?\n/).find((l) => l.startsWith('data:'));
      return JSON.parse(line.slice(5).trim());
    });
}

test('route passes a streaming SSE Response through untouched', async () => {
  const deps = makeDeps({
    createConversationIntelligence: (provider) => ({
      async respondStreaming({ onDelta }) {
        let acc = '';
        for await (const d of provider.streamText()) {
          acc += d;
          onDelta(d);
        }
        return { reply: acc };
      },
    }),
  });

  const response = await POST(
    makeStreamRequest({ conversationId: 'owned-session', message: 'hi' }),
    deps
  );

  assert.ok(response instanceof Response, 'streaming result must not be JSON-wrapped');
  assert.equal(response.status, 200);
  assert.match(String(response.headers.get('content-type')), /text\/event-stream/);

  const events = await readSseEvents(response);
  assert.deepEqual(events.map((e) => e.type), ['delta', 'delta', 'done']);
  assert.equal(events[2].reply, 'Hello from the stream.');
});

test('route emits exactly one app-level done event per stream', async () => {
  const deps = makeDeps({
    createConversationIntelligence: (provider) => ({
      async respondStreaming({ onDelta }) {
        let acc = '';
        for await (const d of provider.streamText()) {
          acc += d;
          onDelta(d);
        }
        return { reply: acc };
      },
    }),
  });

  const response = await POST(
    makeStreamRequest({ conversationId: 'owned-session', message: 'hi' }),
    deps
  );
  const events = await readSseEvents(response);

  assert.equal(events.filter((e) => e.type === 'done').length, 1);
});

test('route still JSON-wraps plain results for the non-streaming contract', async () => {
  const deps = makeDeps({
    createConversationIntelligence: () => ({
      async respond() {
        return { reply: 'Mocked assistant reply' };
      },
    }),
  });

  const response = await POST(
    makeJsonRequest({ conversationId: 'owned-session', message: 'hi' }),
    deps
  );

  assert.ok(!(response instanceof Response) || String(response.headers.get('content-type')).includes('application/json'));
  assert.equal(typeof response.status, 'number');
  const body = await response.json();
  assert.equal(body.reply, 'Mocked assistant reply');
  assert.equal(body.status, 200);
  assert.ok(Array.isArray(body.persistedMessages));
});

test('route returns JSON error statuses before any stream opens', async () => {
  let providerBuilt = false;
  const deps = makeDeps({
    ownershipService: {
      async verifyOwnedSession() {
        return { ok: false, error: 'wrong_owner' };
      },
    },
    createTextProvider: () => {
      providerBuilt = true;
      return {};
    },
  });

  const response = await POST(
    makeStreamRequest({ conversationId: 'wrong-session', message: 'hi' }),
    deps
  );

  const body = await response.json();
  assert.equal(body.status ?? response.status, 403);
  assert.equal(body.error, 'wrong_owner');
  assert.equal(providerBuilt, false);
});
