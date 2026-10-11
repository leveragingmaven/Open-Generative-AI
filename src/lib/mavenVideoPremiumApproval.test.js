// Handler-level proof of the Maven Chat video cost gate.
//
// These tests drive the real controlled-conversation handler, the real model
// routers and the real generators. Only the customer credential resolver and the
// provider adapters are mocks, so a assertion such as "no paid provider request
// happened before approval" is a statement about the shipping code path, not
// about a stubbed-out double.
//
// Scenarios: generic prompt, cinematic prompt, explicit Veo request, 4K request,
// model mismatch, approval rejection, approval acceptance, unavailable model,
// unknown pricing, and a failed budget generation that must not escalate.
import test from 'node:test';
import assert from 'node:assert/strict';

import { handleDesignAgentConversationPost } from './designAgentConversationEndpoint.js';
import { generateMavenVideo } from './mavenVideoGeneration.js';
import { generateMavenImageToVideo } from './mavenImageToVideoGeneration.js';

const IDENTITY = { creatorId: 'creator-1', accountId: 'account-1', identityKey: 'identity-1' };
const CONVERSATION = 'owned-session';
const VIDEO_URL = 'https://cdn.example.test/generated.mp4';
const IMAGE_URL = 'https://session-assets.example.test/photo.png';
const CREDENTIAL = 'customer-muapi-key';

function request(payload) { return { async json() { return payload; } }; }

/**
 * One handler harness: the video lanes run the REAL generators with mocked
 * credential+provider hops, and every paid hop is recorded.
 */
function harness({ messages = [], attachments = [], providerFails = false, credentialMissing = false } = {}) {
  const captured = { t2v: [], i2v: [], credentials: [], textProvider: 0, persisted: [] };
  const providerResult = { url: VIDEO_URL };
  // The transcript the reader returns is mutable so that a confirmation turn can
  // be driven against the reply the plan turn actually produced.
  const session = { messages, attachments };
  return {
    captured,
    session,
    setSession({ messages: nextMessages = session.messages, attachments: nextAttachments = session.attachments } = {}) {
      session.messages = nextMessages;
      session.attachments = nextAttachments;
    },
    deps: {
      controlledExecution: true,
      identity: IDENTITY,
      ownershipService: { async verifyOwnedSession() { return { ok: true }; } },
      conversationReader: { async read() { return { conversationId: CONVERSATION, messages: session.messages, attachments: session.attachments }; } },
      generateMavenVideo: (identity, args) => generateMavenVideo({
        ...args,
        identity,
        credentialResolver: async (input) => {
          captured.credentials.push(input);
          if (credentialMissing) return null;
          return CREDENTIAL;
        },
        provider: {
          async generateVideo(apiKey, providerArgs) {
            captured.t2v.push({ apiKey, providerArgs });
            if (providerFails) throw Object.assign(new Error('provider said no'), { code: 'provider_model_unsupported' });
            return providerResult;
          },
        },
      }),
      generateMavenImageToVideo: (identity, args) => generateMavenImageToVideo({
        ...args,
        identity,
        credentialResolver: async (input) => { captured.credentials.push(input); return CREDENTIAL; },
        provider: {
          async generateI2V(apiKey, providerArgs) {
            captured.i2v.push({ apiKey, providerArgs });
            return { url: VIDEO_URL };
          },
        },
      }),
      registerMavenMediaReference: async (_identity, { url, kind }) => ({ attachmentId: 'asset_registered_1', kind, url }),
      persistMavenCreativeAsset: async (_identity, saveArgs) => { captured.persisted.push(saveArgs); return { id: 'asset_library_1' }; },
      createTextProvider: () => { captured.textProvider += 1; return { execute: async () => ({ outputs: ['text reply'] }) }; },
      createConversationIntelligence: () => ({ async respond() { return { reply: 'text reply' }; } }),
      generateMavenImage: () => { throw new Error('image generation must not run for a video turn'); },
    },
  };
}

async function turn(message, harnessState, payload = {}) {
  return handleDesignAgentConversationPost(
    request({ conversationId: CONVERSATION, message, ...payload }),
    harnessState.deps,
  );
}

function planTurn(message, harnessState, payload) {
  return turn(message, harnessState, payload);
}

/**
 * Runs the customer's next utterance against the transcript that the plan turn
 * produced, using the same spies so both turns are observed together.
 */
async function confirmTurn(planResult, harnessState, utterance = 'confirm', payload = {}) {
  harnessState.setSession({
    messages: [
      { role: 'user', content: 'the original request' },
      { role: 'assistant', content: planResult.reply },
    ],
  });
  return handleDesignAgentConversationPost(
    request({ conversationId: CONVERSATION, message: utterance, ...payload }),
    harnessState.deps,
  );
}

test('a generic video prompt keeps the budget default and generates directly', async () => {
  const state = harness();
  const result = await planTurn('Create a short video of a fox in tall grass.', state);

  assert.equal(result.status, 200);
  assert.equal(state.captured.t2v.length, 1);
  assert.equal(state.captured.t2v[0].providerArgs.model, 'seedance-lite-t2v');
  assert.equal(state.captured.t2v[0].apiKey, CREDENTIAL);
  assert.doesNotMatch(result.reply, /Confirm this video generation/);
  assert.match(result.reply, /Play or download the generated video/);
});

test('a cinematic prompt selects a premium model and stops before any paid request', async () => {
  const state = harness();
  const result = await planTurn('Create a cinematic video of a cat walking on grass.', state);

  assert.equal(result.status, 200);
  assert.equal(state.captured.t2v.length, 0, 'no provider request may happen before approval');
  assert.equal(state.captured.credentials.length, 0, 'no credential is even resolved before approval');
  assert.equal(state.captured.textProvider, 0);
  assert.match(result.reply, /Confirm this video generation/);
  assert.match(result.reply, /Google · Gemini Omni · 16:9 · 8s · 1080p/);
  assert.match(result.reply, /Reply "confirm" to generate exactly this/);
  // The plan is persisted so the next turn can be authorized against it.
  assert.match(result.persistedMessages[1].content, /maven-video-approval:/);
});

test('an explicitly requested Veo 3 above the budget tier needs approval and reports no invented price', async () => {
  const state = harness();
  const result = await planTurn('Generate a video with Veo 3 of a sunset.', state);

  assert.equal(result.status, 200);
  assert.equal(state.captured.t2v.length, 0);
  assert.match(result.reply, /Google · Veo 3/);
  assert.match(result.reply, /You asked for this model, and it is priced above the budget tier\./);
  assert.match(result.reply, /Price varies; check provider pricing\./);
  assert.doesNotMatch(result.reply, /\$\d/);
});

test('a 4K request needs approval before the premium resolution is sent', async () => {
  const state = harness();
  const result = await planTurn('Make a 4k video of a dog running.', state);

  assert.equal(result.status, 200);
  assert.equal(state.captured.t2v.length, 0);
  assert.match(result.reply, /Confirm this video generation/);
  assert.match(result.reply, /Seedance 2\.0/);
  assert.match(result.reply, /4k/);
});

test('confirming generates exactly the approved model and settings, once', async () => {
  const state = harness();
  const plan = await planTurn('Create a cinematic video of a cat walking on grass.', state);
  const confirmed = await confirmTurn(plan, state);

  assert.equal(confirmed.status, 200);
  assert.equal(state.captured.t2v.length, 1);
  assert.equal(state.captured.t2v[0].apiKey, CREDENTIAL);
  assert.equal(state.captured.t2v[0].providerArgs.model, 'gemini-omni-text-to-video');
  assert.equal(state.captured.t2v[0].providerArgs.duration, 8);
  assert.equal(state.captured.t2v[0].providerArgs.resolution, '1080p');
  assert.equal(state.captured.t2v[0].providerArgs.aspect_ratio, '16:9');
  assert.match(confirmed.reply, /Play or download the generated video/);
  assert.match(confirmed.reply, /Google · Gemini Omni · 16:9 · 8s · 1080p — selected automatically for a higher-quality request — confirmed by you/);
});

test('the executed model, its tier and the approval are recorded in the asset metadata', async () => {
  const state = harness();
  const plan = await planTurn('Create a cinematic video of a cat walking on grass.', state);
  await confirmTurn(plan, state);

  assert.equal(state.captured.persisted.length, 1);
  const { media, kind } = state.captured.persisted[0];
  assert.equal(kind, 'video');
  assert.equal(media.executedModel, 'gemini-omni-text-to-video');
  assert.equal(media.model, 'gemini-omni-text-to-video');
  assert.equal(media.costTier, 'premium');
  assert.equal(media.selectionMode, 'auto');
  assert.equal(media.overrideReason, 'quality_signal_auto_upgrade');
  assert.equal(media.approvalStatus, 'approved');
  assert.equal(media.requestedModel, null);
});

test('declining a premium plan generates nothing, and a later confirm cannot revive it', async () => {
  const state = harness();
  const plan = await planTurn('Create a cinematic video of a cat walking on grass.', state);
  const declined = await confirmTurn(plan, state, 'cancel');

  assert.equal(declined.status, 200);
  assert.match(declined.reply, /no video was generated/);
  assert.equal(state.captured.t2v.length, 0);

  // The cancellation reply is now part of the transcript, so a later confirm
  // cannot revive the plan the customer declined.
  state.setSession({
    messages: [
      { role: 'user', content: 'the original request' },
      { role: 'assistant', content: plan.reply },
      { role: 'user', content: 'cancel' },
      { role: 'assistant', content: declined.reply },
    ],
  });
  const result = await turn('confirm', state);
  assert.equal(result.status, 200);
  assert.equal(state.captured.t2v.length, 0, 'a cancelled plan must stay cancelled');
});

test('a confirmation whose model no longer matches the plan fails closed without a provider call', async () => {
  const state = harness();
  const plan = await planTurn('Create a cinematic video of a cat walking on grass.', state);
  // A tampered or stale plan: the same marker, but a different model than the
  // router selects for this prompt.
  const tampered = plan.reply.replace(/maven-video-approval:([A-Za-z0-9_-]+)/, (match, encoded) => {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    payload.m = 'seedance-v2.0-t2v';
    return `maven-video-approval:${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')}`;
  });
  const next = harness({ messages: [{ role: 'user', content: 'x' }, { role: 'assistant', content: tampered }] });
  next.deps.generateMavenVideo = state.deps.generateMavenVideo;
  const result = await handleDesignAgentConversationPost(request({ conversationId: CONVERSATION, message: 'confirm' }), next.deps);

  assert.equal(result.status, 409);
  assert.equal(result.code, 'video_approval_stale');
  assert.equal(next.captured.t2v.length, 0, 'no provider request may run for a stale plan');
});

test('an unavailable video model fails loudly with no provider request and no substitution', async () => {
  const unsatisfiable = harness();
  const unsatisfiableResult = await planTurn('Create a 99:9 video of a fox.', unsatisfiable);
  assert.equal(unsatisfiableResult.status, 422);
  assert.equal(unsatisfiableResult.code, 'video_model_unavailable');
  assert.equal(unsatisfiable.captured.t2v.length, 0);

  // A provider that refuses the confirmed model is reported as unsupported: the
  // request is not retried against another (possibly dearer) model.
  const rejected = harness({ providerFails: true });
  const plan = await planTurn('Create a cinematic video of a cat walking on grass.', rejected);
  const confirmed = await confirmTurn(plan, rejected);
  assert.equal(confirmed.status, 422);
  assert.equal(confirmed.code, 'video_generation_unsupported');
  assert.equal(rejected.captured.t2v.length, 1, 'exactly one provider attempt, never a fallback model');
});

test('a failed budget generation is never retried on a more expensive model', async () => {
  const state = harness({ providerFails: true });
  const result = await planTurn('Create a short video of a fox in tall grass.', state);

  assert.equal(result.status, 422);
  assert.equal(state.captured.t2v.length, 1);
  assert.equal(state.captured.t2v[0].providerArgs.model, 'seedance-lite-t2v');
  assert.doesNotMatch(JSON.stringify(state.captured.t2v), /gemini-omni|veo3/);
});

test('a premium image-to-video model is confirmed, priced honestly, and then animated', async () => {
  const messages = [{ role: 'user', content: 'Animate this image.' }];
  const attachments = [{ attachmentId: 'asset_upload_1', kind: 'image', url: IMAGE_URL }];
  const state = harness({ messages, attachments });

  const plan = await planTurn('Animate this image into a video.', state, { attachments: ['asset_upload_1'] });
  assert.equal(plan.status, 200);
  assert.equal(state.captured.i2v.length, 0, 'no image-to-video request may happen before approval');
  assert.match(plan.reply, /Confirm this video generation/);
  assert.match(plan.reply, /Veo3 Image To Video/);
  assert.match(plan.reply, /Published provider list price: \$2\.50 USD per generation\./);

  const confirmed = await confirmTurn(plan, state, 'confirm', { attachments: ['asset_upload_1'] });
  assert.equal(confirmed.status, 200);
  assert.equal(state.captured.i2v.length, 1);
  assert.equal(state.captured.i2v[0].providerArgs.model, 'veo3-image-to-video');
  assert.equal(state.captured.i2v[0].providerArgs.image_url, IMAGE_URL);
  assert.equal(state.captured.persisted[0].media.approvalStatus, 'approved');
  assert.equal(state.captured.persisted[0].media.costTier, 'premium');
});

test('a missing customer credential still fails before any provider request', async () => {
  const state = harness({ credentialMissing: true });
  const result = await planTurn('Create a short video of a fox in tall grass.', state);

  assert.equal(result.status, 400);
  assert.equal(result.code, 'video_provider_credential_required');
  assert.equal(state.captured.t2v.length, 0);
});
