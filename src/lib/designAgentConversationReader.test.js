import assert from 'node:assert/strict';
import test from 'node:test';
import { CreativeIntentExtractionService } from '../../packages/studio/src/lib/intelligence/CreativeIntentExtractionService.js';
import { ConversationProposalBuilder } from './conversationProposalBuilder.js';
import { DesignAgentConversationReader } from './designAgentConversationReader.js';
import {
  DesignAgentSessionOwnershipService,
  InMemoryDesignAgentSessionOwnershipRepository,
} from './designAgentSessionOwnership.js';

const identity = { accountId: 'account-1', identityKey: 'creator-1' };

function asset(label, kind = 'image', overrides = {}) {
  return {
    asset_label: label,
    url: `https://cdn.test/${label}.${kind === 'video' ? 'mp4' : kind === 'audio' ? 'mp3' : 'png'}`,
    kind,
    session_id: 'session-1',
    ...overrides,
  };
}

function provider({ messages = [], assets = [], session = {}, hooks = {} } = {}) {
  const calls = [];
  return {
    calls,
    async getSession(sessionId, context) {
      calls.push({ method: 'getSession', sessionId, context });
      hooks.getSession?.();
      return {
        raw: {
          messages: {
            session_id: sessionId,
            account_id: 'account-1',
            creator_identity_key: 'creator-1',
            messages,
            ...session,
          },
        },
      };
    },
    async getSessionAssets(sessionId, context) {
      calls.push({ method: 'getSessionAssets', sessionId, context });
      hooks.getSessionAssets?.();
      return assets;
    },
    async sendMessage() { assert.fail('reader must not send chat messages'); },
    async getDesignJob() { assert.fail('reader must not read or execute jobs'); },
    async submitDesignJob() { assert.fail('reader must not execute generation'); },
  };
}

function reader(options = {}) {
  const designAgentProvider = options.designAgentProvider || provider(options);
  const ownershipService = options.ownershipService || {
    async verifyOwnedSession({ designSessionId, identity: receivedIdentity }) {
      assert.equal(designSessionId, 'session-1');
      assert.strictEqual(receivedIdentity, identity);
      return { designSessionId, accountId: 'account-1', creatorIdentityKey: 'creator-1' };
    },
  };
  return {
    designAgentProvider,
    ownershipService,
    conversationReader: new DesignAgentConversationReader({
      designAgentProvider,
      ownershipService,
      ...(options.maxHistoryCharacters ? { maxHistoryCharacters: options.maxHistoryCharacters } : {}),
    }),
  };
}

async function read(conversationReader) {
  return conversationReader.read({
    agentId: 'design-agent',
    conversationId: 'session-1',
    identity,
    signal: AbortSignal.timeout(5_000),
  });
}

function resolvedIntent(overrides = {}) {
  return {
    status: 'resolved',
    operation: 'image_editing',
    userIntent: 'Edit the referenced image.',
    inputs: {
      deliverable: 'image', subject: 'the referenced product', audience: null, offer: null,
      platform: null, format: null, requestedOutcome: null, requestedChanges: ['polish lighting'],
      constraints: [], websiteMentioned: null, durationSeconds: null, aspectRatio: '1:1',
    },
    referenceRoles: [{ attachmentId: 'asset_1', role: 'source_image' }],
    requestedSkillHints: [],
    confidence: 0.99,
    clarificationNeeded: null,
    ...overrides,
  };
}

test('normalizes valid Design Agent history and excludes tool, job, and event internals', async () => {
  const { conversationReader } = reader({
    messages: [
      { role: 'system', content: 'provider instructions' },
      { role: 'user', content: ' Create a clean product image. ', routing: { provider: 'muapi' } },
      { role: 'tool', content: 'job-123', arguments: { model: 'secret-model' } },
      { role: 'assistant', content: 'I can help with that.', events: [{ type: 'tool_call', job_id: 'job-123' }] },
      { role: 'assistant', content: '', events: [{ type: 'tool_result', billing: 1 }] },
    ],
  });
  const result = await read(conversationReader);
  assert.deepEqual(result.messages, [
    { role: 'user', content: 'Create a clean product image.' },
    { role: 'assistant', content: 'I can help with that.' },
  ]);
  assert.equal(JSON.stringify(result.messages).includes('job-123'), false);
  assert.equal(JSON.stringify(result.messages).includes('muapi'), false);
});

test('bounds history with the existing recent contiguous turn policy', async () => {
  const { conversationReader } = reader({
    maxHistoryCharacters: 120,
    messages: [
      { role: 'user', content: 'one' }, { role: 'assistant', content: 'reply one' },
      { role: 'user', content: 'two' }, { role: 'assistant', content: 'reply two' },
    ],
  });
  assert.deepEqual((await read(conversationReader)).messages, [
    { role: 'user', content: 'two' }, { role: 'assistant', content: 'reply two' },
  ]);
});

test('normalizes image, video, and audio session assets with stable labels and trusted URLs', async () => {
  const assets = [asset('asset_1'), asset('asset_2', 'video'), asset('asset_3', 'audio')];
  const { conversationReader } = reader({ assets });
  assert.deepEqual((await read(conversationReader)).attachments, [
    { attachmentId: 'asset_1', kind: 'image', url: assets[0].url },
    { attachmentId: 'asset_2', kind: 'video', url: assets[1].url },
    { attachmentId: 'asset_3', kind: 'audio', url: assets[2].url },
  ]);
});

test('preserves optional filenames without exposing raw asset metadata', async () => {
  const { conversationReader } = reader({
    assets: [asset('asset_1', 'image', { filename: 'reference.png', model: 'provider-model', billing: 4 })],
  });
  const [normalized] = (await read(conversationReader)).attachments;
  assert.deepEqual(normalized, {
    attachmentId: 'asset_1', kind: 'image', filename: 'reference.png', url: 'https://cdn.test/asset_1.png',
  });
  assert.equal('model' in normalized, false);
  assert.equal('billing' in normalized, false);
});

test('rejects a fabricated asset label referenced by a user message', async () => {
  const { conversationReader } = reader({
    messages: [{ role: 'user', content: 'Please edit @asset_999.' }],
    assets: [asset('asset_1')],
  });
  await assert.rejects(read(conversationReader), { code: 'fabricated_design_asset_reference' });
});

test('accepts structured and textual labels only when they resolve to server-loaded assets', async () => {
  const { conversationReader } = reader({
    messages: [{
      role: 'user', content: 'Please edit @asset_1.\n\n[Attached asset_1 (image)]',
      attachments: [{ asset_label: 'asset_1', url: 'https://browser.invalid/fabricated.png' }],
    }],
    assets: [asset('asset_1')],
  });
  const result = await read(conversationReader);
  assert.equal(result.attachments[0].url, 'https://cdn.test/asset_1.png');
  assert.equal(JSON.stringify(result).includes('browser.invalid'), false);
});

test('rejects assets explicitly attributed to another Design Agent session', async () => {
  const { conversationReader } = reader({ assets: [asset('asset_1', 'image', { session_id: 'session-2' })] });
  await assert.rejects(read(conversationReader), { code: 'design_asset_scope_mismatch' });
});

test('rejects malformed, duplicate, and unsupported session assets', async (t) => {
  await t.test('malformed', async () => {
    const { conversationReader } = reader({ assets: [{ asset_label: 'asset_1', kind: 'image', session_id: 'session-1' }] });
    await assert.rejects(read(conversationReader), { code: 'design_session_asset_invalid' });
  });
  await t.test('duplicate label', async () => {
    const { conversationReader } = reader({ assets: [asset('asset_1'), asset('asset_1')] });
    await assert.rejects(read(conversationReader), { code: 'design_session_asset_invalid' });
  });
  await t.test('unsupported kind', async () => {
    const { conversationReader } = reader({ assets: [asset('asset_1', 'document')] });
    await assert.rejects(read(conversationReader), { code: 'unsupported_design_attachment_kind' });
  });
});

test('fails closed when the provider returns another session ID after durable verification', async () => {
  const { conversationReader } = reader({ session: { session_id: 'session-2' } });
  await assert.rejects(read(conversationReader), { code: 'design_session_scope_mismatch' });
});

test('fails closed before provider reads when durable ownership is absent', async () => {
  const repository = new InMemoryDesignAgentSessionOwnershipRepository();
  const ownershipService = new DesignAgentSessionOwnershipService({ repository });
  const designAgentProvider = {
    async getSession() { assert.fail('history must not load before ownership is verified'); },
    async getSessionAssets() { assert.fail('assets must not load before ownership is verified'); },
  };
  const { conversationReader } = reader({ designAgentProvider, ownershipService });
  await assert.rejects(read(conversationReader), { code: 'design_session_ownership_unverified' });
});

test('fails closed before provider reads when durable ownership belongs to another creator', async () => {
  const repository = new InMemoryDesignAgentSessionOwnershipRepository();
  await repository.bind({ designSessionId: 'session-1', accountId: 'account-1', creatorIdentityKey: 'creator-2' });
  const ownershipService = new DesignAgentSessionOwnershipService({ repository });
  const designAgentProvider = {
    async getSession() { assert.fail('history must not load for another creator'); },
    async getSessionAssets() { assert.fail('assets must not load for another creator'); },
  };
  const { conversationReader } = reader({ designAgentProvider, ownershipService });
  await assert.rejects(read(conversationReader), { code: 'design_session_scope_mismatch' });
});

test('returns only safe Design Agent metadata and performs read operations only', async () => {
  const { conversationReader, designAgentProvider } = reader({
    messages: [{ role: 'user', content: 'Create an image.' }],
    assets: [],
    session: { provider: 'muapi', model: 'provider-model', routing: { providerId: 'muapi' }, apiKey: 'secret' },
  });
  const result = await read(conversationReader);
  assert.deepEqual(result.agent, {
    id: 'design-agent', name: 'Design Agent', category: 'creative-orchestration', specialty: 'design',
  });
  assert.deepEqual(designAgentProvider.calls.map(({ method }) => method), ['getSession', 'getSessionAssets']);
  assert.equal(JSON.stringify(result).includes('provider-model'), false);
  assert.equal(JSON.stringify(result).includes('apiKey'), false);
  assert.equal(JSON.stringify(result).includes('routing'), false);
});

test('is compatible with ConversationProposalBuilder and CreativeIntentExtractionService attachment trust', async () => {
  const { conversationReader } = reader({
    messages: [{ role: 'user', content: 'Polish @asset_1 while preserving the product.' }],
    assets: [asset('asset_1')],
  });
  let modelRequest;
  const intentExtractionService = new CreativeIntentExtractionService({
    textIntelligence: {
      async extract(input) {
        modelRequest = input.modelRequest;
        return resolvedIntent();
      },
    },
  });
  const builder = new ConversationProposalBuilder({
    conversationReader,
    intentExtractionService,
    skillResolver: { getSkill: assert.fail },
  });
  const result = await builder.build({
    agentId: 'design-agent', conversationId: 'session-1', identity,
  });
  assert.deepEqual(modelRequest.input.sourceMaterial.data.trustedAttachments, [
    { attachmentId: 'asset_1', kind: 'image', sourceIndex: 0 },
  ]);
  assert.deepEqual(result.proposal.references, [
    { id: 'asset_1', url: 'https://cdn.test/asset_1.png', role: 'source_image' },
  ]);
  assert.deepEqual(result.proposal.attachments, [
    { id: 'asset_1', url: 'https://cdn.test/asset_1.png', kind: 'image' },
  ]);
});
