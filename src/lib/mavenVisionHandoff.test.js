// Behavioral proof of Maven's vision handoff.
//
// These tests drive the REAL customer path — POST /api/design-agent/conversation
// through the controlled conversation intelligence, the server vision adapter,
// and the customer model broker — and assert on the provider request that is
// actually sent upstream. Only `globalThis.fetch` (the OpenRouter HTTP call) is
// stubbed, so a passing test means an authorized image really left Creator OS as
// a multimodal `image_url` content part rather than a text-only reference.
//
// The failure this guards was observed live: an authorized image that was
// attached to the conversation was never handed to the model, so Maven answered
// that it could not view the image.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  handleDesignAgentConversationPost,
  createControlledConversationIntelligence,
} from './designAgentConversationEndpoint.js';
import { createServerVisionTextIntelligence } from './serverVisionTextIntelligence.js';
import { handleModelBrokerChatCompletions, OPENROUTER_CHAT_COMPLETIONS_URL } from '../../app/api/model-broker/chat/completions/route.js';

const SECRET = 'vision-handoff-test-secret';
const SERVICE_TOKEN_ENV = { MAVENSYNC_SERVICE_AUTH_SECRET: SECRET };
const CREDENTIAL = 'sk-or-vision-handoff-test';
const IMAGE = { attachmentId: 'asset_1', kind: 'image', filename: 'mug.png', url: 'https://cdn.muapi.ai/outputs/asset_1.png' };

/** Shape produced by the ownership-verified Design Agent reader. */
function reader({ messages = [], imageReferences = [], attachments = [IMAGE] } = {}) {
  return { async read() { return { agentId: 'design-agent', conversationId: 'session-1', messages, imageReferences, attachments }; } };
}

/** A user turn whose image is already part of this session's history. */
function attachedTurn() {
  const message = { role: 'user', content: 'Can you look at this?', attachments: [{ attachmentId: IMAGE.attachmentId, kind: 'image', filename: IMAGE.filename }] };
  return {
    messages: [message, { role: 'assistant', content: 'Here is what I can suggest.' }],
    imageReferences: [message],
  };
}

function sseRequest(body) {
  return { headers: { get: (name) => (name.toLowerCase() === 'accept' ? 'text/event-stream' : null) }, async json() { return body; } };
}

function jsonRequest(body) {
  return { headers: { get: () => 'application/json' }, async json() { return body; } };
}

function parseFrames(text) {
  return text
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => { try { return JSON.parse(line.slice(5).trim()); } catch { return null; } })
    .filter(Boolean);
}

/**
 * Runs the endpoint with every collaborator except the network real. Records
 * the outbound OpenRouter request so tests can assert on the provider payload.
 */
async function run({ request, session = reader(), wantsStream = true }) {
  const captured = { url: null, headers: null, body: null, upstream: 0, textProvider: null, visionConfigured: false };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    captured.url = String(url);
    captured.headers = options.headers;
    captured.body = JSON.parse(options.body);
    captured.upstream += 1;
    return new Response(JSON.stringify({ choices: [{ message: { content: 'A red mug on a wooden desk.' } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const result = await handleDesignAgentConversationPost(request, {
      controlledExecution: true,
      identity: { email: 'customer@example.com', accountId: 'account-1', creatorId: 'creator-123' },
      wantsStream,
      ownershipService: { verifyOwnedSession: async () => ({ ok: true }) },
      conversationReader: session,
      createTextProvider: () => ({
        async execute(value) { captured.textProvider = value; return { outputs: ['text reply'] }; },
        async *streamText(value) { captured.textProvider = value; yield 'text reply'; },
      }),
      createConversationIntelligence: (provider, vision) => createControlledConversationIntelligence(provider, vision),
      createVisionTextIntelligence: (identity) => {
        captured.visionConfigured = true;
        return createServerVisionTextIntelligence(identity, {
          env: SERVICE_TOKEN_ENV,
          broker: (brokerRequest) => handleModelBrokerChatCompletions(brokerRequest, {
            authenticate: async () => ({ identity: { authSource: 'service', accountId: 'account-1', identityKey: 'key-1' } }),
            resolveCredential: async () => CREDENTIAL,
          }),
        });
      },
    });

    if (result instanceof Response) {
      const frames = parseFrames(await result.text());
      captured.done = frames.find((frame) => frame.type === 'done');
      captured.error = frames.find((frame) => frame.type === 'error');
      captured.deltas = frames.filter((frame) => frame.type === 'delta').map((frame) => frame.text);
    } else {
      captured.result = result;
      captured.error = { code: result.code, error: result.error, status: result.status };
    }
    return captured;
  } finally {
    globalThis.fetch = realFetch;
  }
}

function lastUserMessage(captured) {
  return captured.body?.messages?.at(-1);
}

function imageParts(captured) {
  const content = lastUserMessage(captured)?.content;
  return Array.isArray(content) ? content.filter((part) => part?.type === 'image_url') : [];
}

test('an image selected for the turn reaches the provider as a multimodal content part', async () => {
  const captured = await run({
    request: sseRequest({ conversationId: 'session-1', message: 'Describe exactly what you see in this image.', attachments: ['asset_1'] }),
  });

  assert.equal(captured.done?.reply, 'A red mug on a wooden desk.');
  // The request that left Creator OS for the provider.
  assert.equal(captured.url, OPENROUTER_CHAT_COMPLETIONS_URL);
  assert.equal(captured.headers.authorization, `Bearer ${CREDENTIAL}`);
  assert.deepEqual(imageParts(captured), [{ type: 'image_url', image_url: { url: IMAGE.url } }]);
  assert.match(lastUserMessage(captured).content[0].text, /Describe exactly what you see in this image\./);
  // The provider gets the image itself; the text part carries no URL, and the
  // customer credential is injected server-side and never echoed into the body.
  assert.doesNotMatch(lastUserMessage(captured).content[0].text, /https?:\/\//);
  assert.doesNotMatch(JSON.stringify(captured.body), /sk-or-/);
});

test('an image already trusted in the session is inspected when the turn refers to it', async () => {
  // The image is in the conversation but the turn carries no attachment ID:
  // this is the turn that previously answered "I cannot view the image".
  const captured = await run({
    request: sseRequest({ conversationId: 'session-1', message: 'What did you see in the photo I attached earlier?' }),
    session: reader(attachedTurn()),
  });

  assert.equal(captured.visionConfigured, true, 'the vision provider must be created for an attached-image question');
  assert.equal(captured.textProvider, null, 'the text-only provider must not answer an image question');
  assert.deepEqual(imageParts(captured), [{ type: 'image_url', image_url: { url: IMAGE.url } }]);
  assert.equal(captured.done?.reply, 'A red mug on a wooden desk.');
  // The transcript stays honest: the customer did not attach anything this turn.
  assert.equal(captured.done.persistedMessages[0].attachments, undefined);
  assert.doesNotMatch(JSON.stringify(captured.done.persistedMessages), /https?:\/\//);
});

test('the session image handoff also holds on the non-streaming path', async () => {
  const captured = await run({
    request: jsonRequest({ conversationId: 'session-1', message: 'What is in this image?' }),
    session: reader(attachedTurn()),
    wantsStream: false,
  });

  assert.equal(captured.result.status, 200);
  assert.equal(captured.result.reply, 'A red mug on a wooden desk.');
  assert.deepEqual(imageParts(captured), [{ type: 'image_url', image_url: { url: IMAGE.url } }]);
  assert.doesNotMatch(JSON.stringify(captured.result.persistedMessages), /https?:\/\//);
});

test('a plain text turn keeps the text provider and sends no image content', async () => {
  const captured = await run({
    request: sseRequest({ conversationId: 'session-1', message: 'Thanks, that helps. What should I do next?' }),
    session: reader(attachedTurn()),
  });

  assert.equal(captured.upstream, 0, 'no provider call may carry an image for a text-only turn');
  assert.ok(captured.textProvider, 'the text provider answers text-only turns');
  assert.equal(captured.done?.reply, 'text reply');
  assert.doesNotMatch(JSON.stringify(captured.textProvider), /image_url/);
});

test('a turn about something else never inspects the session image', async () => {
  const captured = await run({
    request: sseRequest({ conversationId: 'session-1', message: 'Write a launch caption for my membership.' }),
    session: reader(attachedTurn()),
  });

  assert.equal(captured.upstream, 0);
  assert.ok(captured.textProvider);
});

test('fabricated or foreign attachment IDs never reach the provider', async () => {
  for (const ids of [['asset_foreign'], ['asset_unknown']]) {
    const captured = await run({
      request: sseRequest({ conversationId: 'session-1', message: 'Describe this image.', attachments: ids }),
    });
    assert.equal(captured.error?.code, 'fabricated_design_asset_reference');
    assert.equal(captured.error?.status, 422);
    assert.equal(captured.upstream, 0);
    assert.equal(captured.visionConfigured, false);
  }
});

test('an image that is no longer a trusted session asset is never substituted', async () => {
  // The conversation references asset_1 but the session catalog no longer owns it.
  const captured = await run({
    request: sseRequest({ conversationId: 'session-1', message: 'What is in this image?' }),
    session: reader({ ...attachedTurn(), attachments: [] }),
  });

  assert.equal(imageParts(captured).length, 0);
  assert.equal(captured.upstream, 0);
  assert.equal(captured.done?.reply, 'text reply');
  assert.doesNotMatch(JSON.stringify(captured.done ?? {}), /https?:\/\//);
});

test('an image URL that is not provider-addressable fails safely without leaking it', async () => {
  const captured = await run({
    request: sseRequest({ conversationId: 'session-1', message: 'Describe this image.', attachments: ['asset_1'] }),
    session: reader({ attachments: [{ ...IMAGE, url: 'javascript:alert(document.cookie)' }] }),
  });

  assert.equal(captured.error?.code, 'fabricated_design_asset_reference');
  assert.equal(captured.upstream, 0);
  assert.doesNotMatch(JSON.stringify(captured.error), /javascript:|document\.cookie/);
});

test('an over-long image URL fails safely with a typed, sanitized error', async () => {
  const captured = await run({
    request: sseRequest({ conversationId: 'session-1', message: 'Describe this image.', attachments: ['asset_1'] }),
    session: reader({ attachments: [{ ...IMAGE, url: `https://cdn.muapi.ai/${'a'.repeat(5000)}.png` }] }),
  });

  // Failures raised while streaming surface as a sanitized SSE error frame.
  assert.equal(captured.error?.code, 'vision_image_unavailable');
  assert.equal(captured.upstream, 0, 'an unusable image URL must not produce a provider request');
  assert.match(captured.error?.error || '', /not available for analysis/i);
  assert.doesNotMatch(captured.error?.error || '', /https?:\/\//);
});
