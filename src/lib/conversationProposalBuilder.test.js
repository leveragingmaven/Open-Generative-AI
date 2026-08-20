import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ConversationAgentExecutionService,
  ConversationProposalBuilder,
  MuApiConversationReader,
} from './conversationProposalBuilder.js';
import { createAgentExecutionAuthorizationContext } from './creatorOsAuth.js';

process.env.MAVENSYNC_SSO_SECRET = 'conversation-proposal-builder-test-secret';

const identity = { accountId: 'account-1', identityKey: 'creator-1' };

function semanticInputs(overrides = {}) {
  return {
    deliverable: 'image', subject: 'a ceramic mug', audience: null, offer: null,
    platform: null, format: null, requestedOutcome: null, requestedChanges: [],
    constraints: [], websiteMentioned: null, durationSeconds: null, aspectRatio: '1:1',
    ...overrides,
  };
}

function extraction(overrides = {}) {
  return {
    status: 'resolved', operation: 'image_generation', userIntent: 'Create one product image.',
    inputs: semanticInputs(), referenceRoles: [], requestedSkillHints: [], confidence: 0.98,
    clarificationNeeded: null, ...overrides,
  };
}

function reader(value = {}) {
  return {
    async read() {
      return {
        messages: [{ role: 'user', content: 'Create one product image.' }],
        attachments: [], agent: null, ...value,
      };
    },
  };
}

function extractor(result) {
  return { async extract(input) { return { result, metadata: { input } }; } };
}

test('MuAPI reader uses trusted history and server-observed user attachments', async () => {
  let request;
  const conversationReader = new MuApiConversationReader({
    baseUrl: 'https://api.muapi.test',
    apiKey: 'server-secret',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({
        conversation_id: 'conversation-1',
        history: [
          { role: 'user', content: 'Use this portrait.', attachments: ['https://cdn.test/portrait.png'] },
          { role: 'assistant', content: 'I will help.', attachments: ['https://untrusted.test/model.png'] },
        ],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
    observedContextReader: () => ({ attachments: ['https://cdn.test/portrait.png', 'https://cdn.test/product.jpg'] }),
  });
  const result = await conversationReader.read({ agentId: 'Design-Agent', conversationId: 'conversation-1', identity });
  assert.equal(request.url, 'https://api.muapi.test/agents/by-slug/design-agent/conversation-1');
  assert.equal(request.options.headers['x-api-key'], 'server-secret');
  assert.deepEqual(result.messages, [{ role: 'user', content: 'Use this portrait.' }, { role: 'assistant', content: 'I will help.' }]);
  assert.deepEqual(result.attachments.map(({ attachmentId, kind, url }) => ({ attachmentId, kind, url })), [
    { attachmentId: 'conversation-attachment-1', kind: 'image', url: 'https://cdn.test/portrait.png' },
    { attachmentId: 'conversation-attachment-2', kind: 'image', url: 'https://cdn.test/product.jpg' },
  ]);
  assert.equal(JSON.stringify(result).includes('untrusted.test'), false);
});

test('builds a provider-neutral canonical proposal for a clear image request', async () => {
  let extractionInput;
  const builder = new ConversationProposalBuilder({
    conversationReader: reader(),
    intentExtractionService: { async extract(input) { extractionInput = input; return { result: extraction() }; } },
    skillResolver: { getSkill: assert.fail },
  });
  const result = await builder.build({ agentId: 'agent-1', conversationId: 'conversation-1', identity });
  assert.equal(result.status, 'resolved');
  assert.deepEqual(result.proposal, {
    agentId: 'agent-1', conversationId: 'conversation-1', operation: 'image_generation',
    userIntent: 'Create one product image.', inputs: semanticInputs(), references: [], attachments: [],
    requestedSkillIds: [], requestedRecipeId: null, requestedWorkflowId: null, campaignId: null,
    metadata: { source: 'conversation_intent_extraction' },
  });
  assert.deepEqual(extractionInput.messages, [{ role: 'user', content: 'Create one product image.' }]);
  assert.equal('provider' in result.proposal, false);
  assert.equal('model' in result.proposal, false);
});

test('maps a trusted reference-driven portrait and only exact registered skill hints', async () => {
  const trustedAttachment = { attachmentId: 'portrait-1', kind: 'image', filename: 'portrait.png', url: 'https://cdn.test/portrait.png' };
  const builder = new ConversationProposalBuilder({
    conversationReader: reader({ attachments: [trustedAttachment] }),
    intentExtractionService: extractor(extraction({
      operation: 'image_editing',
      userIntent: 'Create a polished portrait while preserving the person.',
      inputs: semanticInputs({ deliverable: 'portrait', subject: 'the referenced person' }),
      referenceRoles: [{ attachmentId: 'portrait-1', role: 'character_reference' }],
      requestedSkillHints: ['character-composition', 'not-a-real-skill'],
    })),
    skillResolver: { getSkill(id) { if (id === 'character-composition') return { skillId: id }; throw new Error('unknown'); } },
  });
  const { proposal } = await builder.build({ agentId: 'agent-1', conversationId: 'conversation-1', identity });
  assert.deepEqual(proposal.references, [{ id: 'portrait-1', url: 'https://cdn.test/portrait.png', role: 'character_reference' }]);
  assert.deepEqual(proposal.attachments, [{ id: 'portrait-1', url: 'https://cdn.test/portrait.png', kind: 'image', filename: 'portrait.png' }]);
  assert.deepEqual(proposal.requestedSkillIds, ['character-composition']);
  assert.deepEqual(proposal.metadata.unresolvedSkillHints, ['not-a-real-skill']);
  assert.equal(JSON.stringify(proposal).includes('image_url'), false);
  assert.equal(JSON.stringify(proposal).includes('images_list'), false);
});

test('ambiguous intent returns clarification without authorization or preparation', async () => {
  let approvals = 0;
  let preparations = 0;
  const service = new ConversationAgentExecutionService({
    proposalBuilder: new ConversationProposalBuilder({
      conversationReader: reader({ messages: [{ role: 'user', content: 'Can we do something with this?' }] }),
      intentExtractionService: extractor(extraction({ status: 'ambiguous', operation: null, userIntent: 'Do something creative.', clarificationNeeded: 'What would you like me to create?' })),
    }),
    issueApproval: async () => { approvals += 1; },
    preparationService: { async prepare() { preparations += 1; } },
  });
  const result = await service.prepare({ agentId: 'agent-1', conversationId: 'conversation-1', identity });
  assert.deepEqual(result, { ok: true, status: 'ambiguous', clarificationNeeded: 'What would you like me to create?', userIntent: 'Do something creative.', executionStarted: false });
  assert.equal(approvals, 0);
  assert.equal(preparations, 0);
});

test('unsupported carousel preserves intent without authorization or a Creative Job', async () => {
  let approvals = 0;
  let preparations = 0;
  const service = new ConversationAgentExecutionService({
    proposalBuilder: new ConversationProposalBuilder({
      conversationReader: reader(),
      intentExtractionService: extractor(extraction({ status: 'unsupported', operation: null, userIntent: 'Create an Instagram carousel for solo female entrepreneurs.', clarificationNeeded: null })),
    }),
    issueApproval: async () => { approvals += 1; },
    preparationService: { async prepare() { preparations += 1; } },
  });
  const result = await service.prepare({ agentId: 'agent-1', conversationId: 'conversation-1', identity });
  assert.equal(result.status, 'unsupported');
  assert.equal(result.userIntent, 'Create an Instagram carousel for solo female entrepreneurs.');
  assert.equal(approvals, 0);
  assert.equal(preparations, 0);
});

test('rejects a fabricated attachment before authorization', async () => {
  const builder = new ConversationProposalBuilder({
    conversationReader: reader({ attachments: [{ attachmentId: 'portrait-1', kind: 'image', url: 'https://cdn.test/portrait.png' }] }),
    intentExtractionService: extractor(extraction({ referenceRoles: [{ attachmentId: 'fabricated-1', role: 'source_image' }] })),
  });
  await assert.rejects(builder.build({ agentId: 'agent-1', conversationId: 'conversation-1', identity }), (error) => error.code === 'fabricated_attachment_reference');
});

test('authorizes and prepares the exact server-built proposal with no client mutation point', async () => {
  let approvedProposal;
  let normalizedPayload;
  let preparationInput;
  const proposal = {
    agentId: 'agent-1', conversationId: 'conversation-1', operation: 'image_generation', userIntent: 'Create one image.',
    inputs: semanticInputs(), references: [], attachments: [], requestedSkillIds: [], requestedRecipeId: null,
    requestedWorkflowId: null, campaignId: null, metadata: { source: 'conversation_intent_extraction' },
  };
  const service = new ConversationAgentExecutionService({
    proposalBuilder: { async build() { return { status: 'resolved', proposal }; } },
    issueApproval: async ({ payload }) => { approvedProposal = payload; return { proof: 'server-proof' }; },
    normalizeAuthorizedRequest: async (payload) => {
      normalizedPayload = payload;
      return {
        request: { ...proposal, authenticatedIdentity: identity },
        context: createAgentExecutionAuthorizationContext({ identity, request: proposal }),
        proof: { authorizationId: 'authorization-1' },
      };
    },
    preparationService: { async prepare(input) { preparationInput = input; return { ok: true, status: 'ready', jobId: 'job-1', attemptId: 'attempt-1', executionStarted: false }; } },
  });
  const result = await service.prepare({ agentId: 'ignored-by-stub', conversationId: 'ignored-by-stub', identity });
  assert.strictEqual(approvedProposal, proposal);
  assert.deepEqual(normalizedPayload, { ...proposal, authorizationProof: 'server-proof' });
  assert.deepEqual(preparationInput.request, { ...proposal, authenticatedIdentity: identity });
  assert.equal(preparationInput.requestFingerprint, createAgentExecutionAuthorizationContext({ identity, request: proposal }).intentFingerprint);
  assert.equal(preparationInput.authorizationId, 'authorization-1');
  assert.equal(result.status, 'ready');
});

test('real authorization proof validates only for the server-built proposal passed to preparation', async () => {
  let preparationInput;
  const proposal = {
    agentId: 'agent-proof', conversationId: 'conversation-proof', operation: 'image_generation', userIntent: 'Create one proof image.',
    inputs: semanticInputs(), references: [], attachments: [], requestedSkillIds: [], requestedRecipeId: null,
    requestedWorkflowId: null, campaignId: null, metadata: { source: 'conversation_intent_extraction' },
  };
  const service = new ConversationAgentExecutionService({
    proposalBuilder: { async build() { return { status: 'resolved', proposal }; } },
    preparationService: { async prepare(input) { preparationInput = input; return { ok: true, status: 'requires_input', jobId: 'job-proof', executionStarted: false }; } },
  });
  const result = await service.prepare({ agentId: proposal.agentId, conversationId: proposal.conversationId, identity });
  assert.equal(result.status, 'requires_input');
  assert.equal(preparationInput.request.agentId, proposal.agentId);
  assert.equal(preparationInput.request.conversationId, proposal.conversationId);
  assert.equal(preparationInput.request.userIntent, proposal.userIntent);
  assert.equal(preparationInput.request.operation, proposal.operation);
  assert.deepEqual(preparationInput.request.inputs, proposal.inputs);
  assert.equal(preparationInput.requestFingerprint, createAgentExecutionAuthorizationContext({ identity, request: proposal }).intentFingerprint);
  assert.ok(preparationInput.authorizationId);
});
