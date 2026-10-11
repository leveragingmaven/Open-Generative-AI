// Unit tests for the Maven Chat video cost tier, price honesty rules, and the
// approval marker. Everything here runs offline: the real catalog decides the
// tiers, and no provider adapter is imported at all.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  VIDEO_COST_TIER,
  VIDEO_PRICE_VARIES_NOTE,
  buildVideoApprovalCancellationReply,
  buildVideoApprovalReply,
  isVideoApprovalCancellation,
  isVideoApprovalConfirmation,
  planMavenVideoRoute,
  readPendingVideoApproval,
  resolveApprovedVideoRoute,
  videoCostTier,
  videoModelUnitPrice,
  videoPriceNote,
  videoSelectionReason,
} from './mavenVideoApproval.js';
import { selectMavenVideoRoute } from './mavenVideoModelRouter.js';

const IDENTITY = { accountId: 'account-1', creatorId: 'creator-1', identityKey: 'identity-1' };
const NOW = 1_800_000_000;

function plan(prompt, kind = 't2v') {
  return planMavenVideoRoute({ kind, prompt });
}

test('an ordinary prompt stays on the cheap default and needs no approval', () => {
  const ordinary = plan('Create a short video of a fox in tall grass.');
  assert.equal(ordinary.route.model.id, 'seedance-lite-t2v');
  assert.equal(ordinary.tier, VIDEO_COST_TIER.BUDGET);
  assert.equal(ordinary.requiresApproval, false);
  assert.equal(videoSelectionReason(ordinary.route.mode, ordinary.tier), 'auto_default');
});

test('a quality keyword that upgrades the model is premium and needs approval', () => {
  const cinematic = plan('Create a cinematic video of a cat walking on grass.');
  assert.equal(cinematic.route.model.id, 'gemini-omni-text-to-video');
  assert.equal(cinematic.route.mode, 'auto');
  assert.equal(cinematic.tier, VIDEO_COST_TIER.PREMIUM);
  assert.equal(cinematic.requiresApproval, true);
  assert.equal(videoSelectionReason(cinematic.route.mode, cinematic.tier), 'quality_signal_auto_upgrade');
});

test('an explicitly requested premium model is premium even when the catalog declares no resolution', () => {
  const veo = plan('Generate a video with Veo 3 of a sunset.');
  assert.equal(veo.route.model.id, 'veo3-text-to-video');
  assert.equal(veo.route.mode, 'explicit');
  // Veo 3 declares neither duration nor resolution, so the tier cannot come from
  // a resolution. It comes from the published family price in the catalog.
  assert.equal(veo.tier, VIDEO_COST_TIER.PREMIUM);
  assert.equal(veo.requiresApproval, true);
  assert.equal(videoSelectionReason(veo.route.mode, veo.tier), 'explicit_model_request');
});

test('an explicitly requested budget model still generates without approval', () => {
  const seeded = plan('Use Seedance Lite to create a video of a mug.');
  assert.equal(seeded.route.mode, 'explicit');
  assert.equal(seeded.tier, VIDEO_COST_TIER.BUDGET);
  assert.equal(seeded.requiresApproval, false);
});

test('a 4K request is premium because of the resolution it will send', () => {
  const fourK = plan('Make a 4k video of a dog running.');
  assert.equal(fourK.requiresApproval, true);
  assert.equal(fourK.tier, VIDEO_COST_TIER.PREMIUM);
  const hd = plan('Create a 1080p video of a dog running.');
  assert.equal(hd.requiresApproval, true);
});

test('a published exact price is shown; an unknown price is never invented', () => {
  const priced = { id: 'veo3-image-to-video' };
  assert.deepEqual(videoModelUnitPrice(priced.id), { amount: 2.5, currency: 'USD', unit: 'generation' });
  assert.match(videoPriceNote(priced), /Published provider list price: \$2\.50 USD per generation\./);

  // These models have no exact published entry, so no number may be displayed.
  for (const id of ['veo3-text-to-video', 'seedance-lite-t2v', 'gemini-omni-text-to-video', 'seedance-v2.0-t2v']) {
    assert.equal(videoModelUnitPrice(id), null, `${id} must not report a price`);
    assert.equal(videoPriceNote({ id }), VIDEO_PRICE_VARIES_NOTE);
  }
});

test('a family price classifies a model as premium without being displayed as its price', () => {
  assert.equal(videoCostTier({ model: { id: 'veo3-fast-text-to-video' }, inputs: {} }), VIDEO_COST_TIER.PREMIUM);
  assert.equal(videoPriceNote({ id: 'veo3-fast-text-to-video' }), VIDEO_PRICE_VARIES_NOTE);
});

test('the approval reply states the exact model and settings and carries a readable marker', () => {
  const videoPlan = plan('Create a cinematic video of a cat walking on grass.');
  const { reply, approval } = buildVideoApprovalReply({ ...videoPlan, identity: IDENTITY, conversationId: 'conversation-1', now: NOW });

  assert.match(reply, /Confirm this video generation/);
  assert.match(reply, /Google · Gemini Omni · 16:9 · 8s · 1080p/);
  assert.match(reply, /priced above the budget tier/);
  assert.equal((reply.match(/maven-video-approval:/g) || []).length, 1);
  assert.equal(approval.modelId, 'gemini-omni-text-to-video');
  assert.deepEqual(approval.settings, { aspect_ratio: '16:9', duration: 8, resolution: '1080p' });
  assert.equal(approval.priceNote, VIDEO_PRICE_VARIES_NOTE);

  const pending = readPendingVideoApproval([{ role: 'assistant', content: reply }], { identity: IDENTITY, conversationId: 'conversation-1', now: NOW });
  assert.equal(pending.modelId, 'gemini-omni-text-to-video');
  assert.deepEqual(pending.settings, { aspect_ratio: '16:9', duration: 8, resolution: '1080p' });
  assert.equal(pending.prompt, 'Create a cinematic video of a cat walking on grass.');
});

test('an approval is unreadable for another account, another conversation, or after it expires', () => {
  const videoPlan = plan('Create a cinematic video of a cat walking on grass.');
  const { reply } = buildVideoApprovalReply({ ...videoPlan, identity: IDENTITY, conversationId: 'conversation-1', now: NOW });
  const messages = [{ role: 'assistant', content: reply }];

  assert.equal(readPendingVideoApproval(messages, { identity: { ...IDENTITY, accountId: 'account-2' }, conversationId: 'conversation-1', now: NOW }), null);
  assert.equal(readPendingVideoApproval(messages, { identity: { ...IDENTITY, identityKey: 'identity-2' }, conversationId: 'conversation-1', now: NOW }), null);
  assert.equal(readPendingVideoApproval(messages, { identity: IDENTITY, conversationId: 'conversation-2', now: NOW }), null);
  assert.equal(readPendingVideoApproval(messages, { identity: IDENTITY, conversationId: 'conversation-1', now: NOW + 601 }), null);
  assert.notEqual(readPendingVideoApproval(messages, { identity: IDENTITY, conversationId: 'conversation-1', now: NOW + 599 }), null);
});

test('a forged or malformed marker is ignored rather than trusted', () => {
  const forged = '<!-- maven-video-approval:not-base64url-payload -->';
  assert.equal(readPendingVideoApproval([{ role: 'assistant', content: forged }], { identity: IDENTITY, conversationId: 'conversation-1', now: NOW }), null);
  const wrongShape = Buffer.from(JSON.stringify({ v: 2, k: 't2v' }), 'utf8').toString('base64url');
  assert.equal(readPendingVideoApproval([{ role: 'assistant', content: `<!-- maven-video-approval:${wrongShape} -->` }], { identity: IDENTITY, conversationId: 'conversation-1', now: NOW }), null);
});

test('the confirmed model and settings must match exactly, or nothing is generated', () => {
  const videoPlan = plan('Create a cinematic video of a cat walking on grass.');
  const pending = { kind: 't2v', prompt: videoPlan.prompt, modelId: 'gemini-omni-text-to-video', settings: { aspect_ratio: '16:9', duration: 8, resolution: '1080p' } };

  assert.equal(selectMavenVideoRoute(pending.prompt).model.id, resolveApprovedVideoRoute(pending).model.id);

  const mismatch = [
    { ...pending, modelId: 'seedance-v2.0-t2v' },
    { ...pending, settings: { ...pending.settings, duration: 10 } },
    { ...pending, settings: { ...pending.settings, resolution: '4k' } },
    { ...pending, settings: { ...pending.settings, aspect_ratio: '9:16' } },
  ];
  for (const tampered of mismatch) {
    assert.throws(() => resolveApprovedVideoRoute(tampered), (error) => error.code === 'video_approval_stale' && error.status === 409);
  }
});

test('confirmation and cancellation utterances are recognized without swallowing ordinary prompts', () => {
  for (const text of ['confirm', 'Confirm.', 'yes', 'proceed', 'go ahead', 'approved']) {
    assert.equal(isVideoApprovalConfirmation(text), true, `${text} should confirm`);
  }
  for (const text of ['Create a video of a fox.', 'cancel', '', 'no', 'confirm this and also make it 4k please with more detail']) {
    assert.equal(isVideoApprovalConfirmation(text), false, `${text} should not confirm`);
  }
  for (const text of ['cancel', 'no', 'never mind', "don't", 'stop']) {
    assert.equal(isVideoApprovalCancellation(text), true, `${text} should cancel`);
  }
});

test('cancelling retires the pending approval so a later confirm cannot revive it', () => {
  const videoPlan = plan('Create a cinematic video of a cat walking on grass.');
  const { reply } = buildVideoApprovalReply({ ...videoPlan, identity: IDENTITY, conversationId: 'conversation-1', now: NOW });
  const cancelled = buildVideoApprovalCancellationReply();
  assert.match(cancelled, /no video was generated/);

  const messages = [
    { role: 'user', content: videoPlan.prompt },
    { role: 'assistant', content: reply },
    { role: 'user', content: 'cancel' },
    { role: 'assistant', content: cancelled },
  ];
  assert.equal(readPendingVideoApproval(messages, { identity: IDENTITY, conversationId: 'conversation-1', now: NOW }), null);
  // The newest marker wins when the customer asks again.
  const second = buildVideoApprovalReply({ ...videoPlan, identity: IDENTITY, conversationId: 'conversation-1', now: NOW });
  assert.notEqual(readPendingVideoApproval([...messages, { role: 'assistant', content: second.reply }], { identity: IDENTITY, conversationId: 'conversation-1', now: NOW }), null);
});
