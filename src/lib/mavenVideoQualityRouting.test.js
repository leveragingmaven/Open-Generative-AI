// Handler-level proof that Maven dashboard video requests are routed to the
// real provider call with the expected providerId, model and inputs.
//
// The controlled conversation handler is the customer entry point. Existing
// tests either stub `generateMavenVideo` (so routing is never exercised) or call
// the generator directly (so the handler boundary is never exercised). These
// tests close that gap: the handler runs the REAL generator, which runs the REAL
// model router, and only the customer credential resolver and the provider
// adapter are observed as spies — so a passing test means the settings the
// customer asked for (model, aspect ratio, duration, resolution) actually
// reached the provider request.

import test from 'node:test';
import assert from 'node:assert/strict';

import { handleDesignAgentConversationPost } from './designAgentConversationEndpoint.js';
import { generateMavenVideo } from './mavenVideoGeneration.js';

const IDENTITY = { creatorId: 'creator-1', accountId: 'account-1', identityKey: 'identity-1' };
const VIDEO_URL = 'https://cdn.example.test/generated.mp4';
const CREDENTIAL = 'customer-muapi-key';

/**
 * Runs the handler with the real generator. Records the credential lookup (the
 * providerId/operation routing authority) and the provider request.
 *
 * Video turns whose model sits above the budget tier are answered with a
 * confirmation plan, so these tests pass the transcript that the plan turn
 * produced via `messages` to drive the confirming turn.
 */
async function runVideoTurn(message, { credentialResult = CREDENTIAL, credentialError = null, messages = [] } = {}) {
  const captured = { credential: null, provider: null, providerCalls: 0, textProvider: false };
  const result = await handleDesignAgentConversationPost(
    { async json() { return { conversationId: 'owned-session', message }; } },
    {
      controlledExecution: true,
      identity: IDENTITY,
      ownershipService: { async verifyOwnedSession() { return { ok: true }; } },
      conversationReader: { async read({ conversationId }) { return { conversationId, messages, attachments: [] }; } },
      generateMavenVideo: (identity, args) => generateMavenVideo({
        ...args,
        identity,
        credentialResolver: async (input) => {
          captured.credential = input;
          if (credentialError) throw Object.assign(new Error('credential'), { code: credentialError });
          return credentialResult;
        },
        provider: {
          async generateVideo(apiKey, args) {
            captured.providerCalls += 1;
            captured.provider = { apiKey, args };
            return { url: VIDEO_URL };
          },
        },
      }),
      createTextProvider: () => ({
        execute: async () => { captured.textProvider = true; return { outputs: ['text reply'] }; },
        streamText: async function* () { captured.textProvider = true; yield 'text reply'; },
      }),
      createMavenImage: () => { throw new Error('image generation must not run for a video turn'); },
    },
  );
  return { result, captured };
}

test('a high-quality video request is confirmed first, then reaches the provider with the resolution-bearing catalog model', async () => {
  const prompt = 'Create a cinematic, high-quality 10-second 16:9 video of a product reveal on a marble counter.';

  // Turn 1: the premium selection is described and NOT executed.
  const planned = await runVideoTurn(prompt);
  assert.equal(planned.result.status, 200);
  assert.equal(planned.captured.providerCalls, 0, 'no paid request may happen before approval');
  assert.equal(planned.captured.credential, null, 'the credential is not even resolved before approval');
  assert.match(planned.result.reply, /Google · Gemini Omni · 16:9 · 10s · 1080p/);

  // Turn 2: the customer confirms, and the approved settings reach the provider.
  const { result, captured } = await runVideoTurn('confirm', {
    messages: [
      { role: 'user', content: prompt },
      { role: 'assistant', content: planned.result.reply },
    ],
  });

  assert.equal(result.status, 200);
  // Routing authority stays server-side: the customer credential is resolved for
  // the muapi video_generation lane, never chosen by the browser.
  assert.deepEqual(captured.credential, {
    accountId: 'account-1',
    creatorIdentityKey: 'identity-1',
    providerId: 'muapi',
    operation: 'video_generation',
  });
  assert.equal(captured.providerCalls, 1);
  assert.equal(captured.provider.apiKey, CREDENTIAL);
  assert.equal(captured.provider.args.model, 'gemini-omni-text-to-video');
  assert.equal(captured.provider.args.aspect_ratio, '16:9');
  assert.equal(captured.provider.args.duration, 10);
  assert.equal(captured.provider.args.resolution, '1080p');
  assert.equal(captured.textProvider, false, 'a video turn must not be answered by the text lane');
  assert.equal(JSON.stringify(result.persistedMessages).includes(CREDENTIAL), false);
});

test('requested duration, ratio and resolution reach the provider unchanged', async () => {
  const { captured } = await runVideoTurn('Create a 5-second 9:16 720p video of a product reveal.');

  assert.equal(captured.provider.args.model, 'seedance-lite-t2v');
  assert.equal(captured.provider.args.aspect_ratio, '9:16');
  assert.equal(captured.provider.args.duration, 5);
  assert.equal(captured.provider.args.resolution, '720p');
});

test('a default video request uses the catalog defaults and strips routing tokens from the prompt', async () => {
  const { result, captured } = await runVideoTurn('Create a short video of a fox in tall grass.');

  assert.equal(captured.provider.args.model, 'seedance-lite-t2v');
  assert.equal(captured.provider.args.duration, 5);
  assert.equal(captured.provider.args.aspect_ratio, '16:9');
  // Routing tokens are steering signals, not scene description.
  assert.match(captured.provider.args.prompt, /fox in tall grass/);
  assert.doesNotMatch(captured.provider.args.prompt, /\b16:9\b|\b5-second\b|seedance/i);
  assert.match(result.reply, /Play or download the generated video/);
});

test('an unsatisfiable video option fails before any paid provider call', async () => {
  // No catalog text-to-video model declares a 99:9 aspect ratio.
  const { result, captured } = await runVideoTurn('Create a 99:9 video of a fox.');

  assert.equal(result.status, 422);
  assert.equal(result.code, 'video_model_unavailable');
  assert.equal(captured.providerCalls, 0, 'no provider request may be made for an unsatisfiable request');
  assert.equal(captured.textProvider, false);
});

test('a missing customer credential fails before any paid provider call', async () => {
  const { result, captured } = await runVideoTurn('Create a video of a fox.', {
    credentialResult: null,
  });

  assert.equal(result.status, 400);
  assert.equal(result.code, 'video_provider_credential_required');
  assert.equal(captured.providerCalls, 0);
  assert.doesNotMatch(JSON.stringify(result), /customer-muapi-key|provider_credential_required:muapi/);
});

test('a text turn never reaches the video provider', async () => {
  const captured = { providerCalls: 0 };
  const result = await handleDesignAgentConversationPost(
    { async json() { return { conversationId: 'owned-session', message: 'What should I film first?' }; } },
    {
      controlledExecution: true,
      identity: IDENTITY,
      ownershipService: { async verifyOwnedSession() { return { ok: true }; } },
      conversationReader: { async read({ conversationId }) { return { conversationId, messages: [], attachments: [] }; } },
      generateMavenVideo: () => { captured.providerCalls += 1; throw new Error('video lane must not run'); },
      createTextProvider: () => ({
        execute: async () => ({ outputs: ['Start with the product reveal.'] }),
        streamText: async function* () { yield 'Start with the product reveal.'; },
      }),
      createConversationIntelligence: (provider) => ({
        async respond() { return { reply: await provider.execute({}) .then((r) => r.outputs[0]) }; },
      }),
    },
  );

  assert.equal(captured.providerCalls, 0);
  assert.equal(result.status, 200);
  assert.equal(result.reply, 'Start with the product reveal.');
});
