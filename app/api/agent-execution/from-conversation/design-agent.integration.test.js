import assert from 'node:assert/strict';
import test from 'node:test';
import { createAgentExecutionRequest } from '../../../../packages/studio/src/lib/agents/AgentExecutionRequest.js';
import { AgentExecutionPreparationService } from '../../../../src/lib/agentExecutionPreparation.js';
import {
  DesignAgentSessionOwnershipService,
  InMemoryDesignAgentSessionOwnershipRepository,
} from '../../../../src/lib/designAgentSessionOwnership.js';
import {
  createConversationExecutionService,
  createServerDesignAgentProvider,
  handleAgentExecutionFromConversationPost,
} from './route.js';

const identity = { accountId: 'account-1', identityKey: 'creator-1' };
const semanticInputs = {
  deliverable: 'image', subject: 'a ceramic mug', audience: null, offer: null,
  platform: null, format: null, requestedOutcome: null, requestedChanges: [], constraints: [],
  websiteMentioned: null, durationSeconds: null, aspectRatio: '1:1',
};

function request(body) {
  return new Request('http://localhost/api/agent-execution/from-conversation', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

async function response(value) {
  return { status: value.status, body: await value.json() };
}

function extraction(overrides = {}) {
  return {
    status: 'resolved', operation: 'image_generation', userIntent: 'Create one clean product image.',
    inputs: { ...semanticInputs }, referenceRoles: [], requestedSkillHints: [], confidence: 0.99,
    clarificationNeeded: null, ...overrides,
  };
}

function designProvider({ messages = [{ role: 'user', content: 'Create one clean product image.' }], assets = [] } = {}) {
  const calls = [];
  return {
    calls,
    async getSession(sessionId) {
      calls.push('getSession');
      return { raw: { messages: { session_id: sessionId, messages } } };
    },
    async getSessionAssets() { calls.push('getSessionAssets'); return assets; },
    async sendMessage() { assert.fail('external Design Agent chat must not run'); },
    async getDesignJob() { assert.fail('external Design Agent jobs must not be read or created'); },
    async submitDesignJob() { assert.fail('external Design Agent jobs must not be created'); },
  };
}

function preparationHarness() {
  const state = { accepted: 0, plannedUpdates: 0, attempts: 0, executions: 0, job: null };
  const jobRepository = {
    async acceptAuthorizedJob({ request: authorizedRequest, authorizationId }) {
      state.accepted += 1;
      state.job = {
        id: 'job-design-1', accountId: authorizedRequest.authenticatedIdentity.accountId,
        creatorIdentityKey: authorizedRequest.authenticatedIdentity.identityKey,
        authorizationId, status: 'pending', executionStatus: 'planned', metadata: {}, error: null,
        executionContext: { executionMetadata: { agentExecutionRequest: authorizedRequest } },
      };
      return { accepted: true, job: state.job };
    },
    async getJob(jobId, { accountId } = {}) {
      return state.job?.id === jobId && state.job.accountId === accountId ? state.job : null;
    },
    async getJobByAuthorizationId() { return state.job; },
    async updatePlanningResult({ plan, planningError, request: sourceRequest }) {
      state.plannedUpdates += 1;
      state.job = {
        ...state.job,
        plan: plan || state.job.plan,
        error: planningError || null,
        executionContext: {
          ...state.job.executionContext,
          executionMetadata: {
            ...state.job.executionContext.executionMetadata,
            ...(sourceRequest ? { agentExecutionRequest: sourceRequest } : {}),
          },
        },
      };
      return state.job;
    },
  };
  const acceptanceService = {
    attemptRepository: { async listAttempts() { return []; } },
    async acceptPlannedJobForExecution() {
      state.attempts += 1;
      return { job: state.job, attempt: { id: 'attempt-design-1' } };
    },
  };
  return {
    state,
    service: new AgentExecutionPreparationService({ jobRepository, acceptanceService }),
  };
}

function authorizationDependencies(state) {
  return {
    async issueApproval({ payload, identity: approvedIdentity }) {
      state.approvals += 1;
      state.approvedProposal = structuredClone(payload);
      assert.strictEqual(approvedIdentity, identity);
      return { proof: 'server-only-proof' };
    },
    async normalizeAuthorizedRequest(payload, { identity: authenticatedIdentity }) {
      assert.equal(payload.authorizationProof, 'server-only-proof');
      const timestamp = '2026-08-20T00:00:00.000Z';
      const normalized = createAgentExecutionRequest({
        ...payload,
        authorizationProof: undefined,
        authenticatedIdentity: {
          accountId: authenticatedIdentity.accountId,
          creatorId: authenticatedIdentity.identityKey,
          identityKey: authenticatedIdentity.identityKey,
          source: 'server',
        },
        authorization: {
          authorizationId: 'authorization-design-1', status: 'approved', source: 'server',
          requestedAt: timestamp, approvedAt: timestamp, approvedBy: authenticatedIdentity.identityKey,
        },
      });
      state.authorizedRequest = normalized;
      return {
        request: normalized,
        proof: { authorizationId: 'authorization-design-1' },
        context: { intentFingerprint: 'design-intent-fingerprint' },
      };
    },
  };
}

async function setup({
  owner = identity,
  bind = true,
  provider = designProvider(),
  extracted = extraction(),
  genericConversationReader = { async read() { assert.fail('generic reader must not handle design-agent'); } },
  preparation = preparationHarness(),
} = {}) {
  const repository = new InMemoryDesignAgentSessionOwnershipRepository();
  if (bind) {
    await repository.bind({
      designSessionId: 'session-1', accountId: owner.accountId, creatorIdentityKey: owner.identityKey,
    });
  }
  const ownershipService = new DesignAgentSessionOwnershipService({ repository });
  const state = { approvals: 0, extractions: 0, approvedProposal: null, authorizedRequest: null };
  const service = createConversationExecutionService({
    genericConversationReader,
    designAgentProvider: provider,
    designAgentOwnershipService: ownershipService,
    intentExtractionService: {
      async extract(input) {
        state.extractions += 1;
        state.extractionInput = input;
        return { result: extracted };
      },
    },
    preparationService: preparation.service,
    ...authorizationDependencies(state),
  });
  return { service, state, provider, preparation, repository };
}

test('owned Design Agent session resolves through its trusted reader and existing image-generation preparation path', async () => {
  const setupResult = await setup();
  const result = await response(await handleAgentExecutionFromConversationPost(request({
    agentId: 'design-agent', conversationId: 'session-1',
  }), { identity, service: setupResult.service }));
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    ok: true, status: 'ready', jobId: 'job-design-1', attemptId: 'attempt-design-1', executionStarted: false,
  });
  assert.deepEqual(setupResult.provider.calls, ['getSession', 'getSessionAssets']);
  assert.equal(setupResult.state.extractions, 1);
  assert.equal(setupResult.state.approvals, 1);
  assert.equal(setupResult.preparation.state.accepted, 1);
  assert.equal(setupResult.preparation.state.attempts, 1);
  assert.equal(setupResult.preparation.state.executions, 0);
  assert.equal(setupResult.preparation.state.job.plan.recipe.id, 'image');
  assert.deepEqual(setupResult.preparation.state.job.plan.capabilityRequirements.map(({ id }) => id), ['image_generation']);
  assert.equal(setupResult.preparation.state.job.plan.routing.providerId, 'muapi');
  assert.equal(setupResult.preparation.state.job.plan.routing.deploymentId, 'muapi-image-generation');
  assert.equal(setupResult.preparation.state.job.plan.routing.model, 'flux-kontext-dev-t2i');
  assert.equal(JSON.stringify(result.body).includes('server-only-proof'), false);
});

test('owned Design Agent image asset becomes the canonical image-editing reference and existing route selection', async () => {
  const trustedUrl = 'https://cdn.test/session-1/asset_1.png';
  const provider = designProvider({
    messages: [{ role: 'user', content: 'Edit @asset_1 and preserve the product.' }],
    assets: [{ asset_label: 'asset_1', url: trustedUrl, kind: 'image', session_id: 'session-1' }],
  });
  const setupResult = await setup({
    provider,
    extracted: extraction({
      operation: 'image_editing', userIntent: 'Edit the referenced product image.',
      inputs: { ...semanticInputs, subject: 'the referenced product', requestedChanges: ['polish lighting'] },
      referenceRoles: [{ attachmentId: 'asset_1', role: 'source_image' }],
    }),
  });
  const result = await response(await handleAgentExecutionFromConversationPost(request({
    agentId: 'design-agent', conversationId: 'session-1',
  }), { identity, service: setupResult.service }));
  assert.equal(result.body.status, 'ready');
  assert.deepEqual(setupResult.state.approvedProposal.references, [
    { id: 'asset_1', url: trustedUrl, role: 'source_image' },
  ]);
  assert.deepEqual(setupResult.state.approvedProposal.attachments, [
    { id: 'asset_1', url: trustedUrl, kind: 'image' },
  ]);
  assert.deepEqual(setupResult.state.authorizedRequest.references, setupResult.state.approvedProposal.references);
  const plan = setupResult.preparation.state.job.plan;
  assert.equal(plan.recipe.id, 'image-edit');
  assert.deepEqual(plan.capabilityRequirements.map(({ id }) => id), ['image_editing', 'reference_images']);
  assert.equal(plan.routing.providerId, 'muapi');
  assert.equal(plan.routing.deploymentId, 'muapi-image-editing');
  assert.equal(plan.routing.model, 'nano-banana-pro-edit');
  assert.equal(JSON.stringify(setupResult.state.approvedProposal).includes('image_url'), false);
  assert.equal(JSON.stringify(setupResult.state.approvedProposal).includes('images_list'), false);
  assert.equal(JSON.stringify(setupResult.state.approvedProposal).includes('credentials'), false);
  assert.equal(setupResult.preparation.state.executions, 0);
});

test('completed external edit activity is excluded while portrait intent and trusted provenance prepare an executable image edit', async () => {
  const trustedUrl = 'https://cdn.test/session-1/portrait-reference.png';
  const provider = designProvider({
    messages: [
      { role: 'system', content: 'Private runtime instructions.' },
      {
        role: 'user',
        content: 'Using @asset_1 as the reference, create a professional 1:1 portrait with polished studio lighting.',
        attachments: [{ asset_label: 'asset_1', kind: 'image' }],
      },
      {
        role: 'assistant',
        content: 'I created the professional portrait using your reference.',
        events: [
          { type: 'tool_call', name: 'edit_image', args: { model: 'external-runtime-model', prompt: 'provider prompt' } },
          { type: 'tool_result', name: 'edit_image', result: { url: 'https://provider.test/generated.png', provider_secret: 'hidden' } },
        ],
      },
      { role: 'tool', content: '{"provider_payload":"hidden"}' },
    ],
    assets: [{ asset_label: 'asset_1', url: trustedUrl, kind: 'image', session_id: 'session-1' }],
  });
  const setupResult = await setup({
    provider,
    extracted: extraction({
      operation: 'image_editing',
      userIntent: 'Create a professional square portrait using the trusted portrait reference.',
      inputs: {
        ...semanticInputs,
        subject: 'the person in the trusted portrait reference',
        requestedChanges: ['professional studio lighting', 'polished portrait finish'],
      },
      referenceRoles: [{ attachmentId: 'asset_1', role: 'source_image' }],
    }),
  });

  const result = await response(await handleAgentExecutionFromConversationPost(request({
    agentId: 'design-agent', conversationId: 'session-1',
  }), { identity, service: setupResult.service }));

  assert.equal(result.status, 200);
  assert.equal(result.body.status, 'ready');
  assert.equal(result.body.executionStarted, false);
  for (const field of ['provider', 'model', 'credential', 'apiKey', 'endpoint', 'authorizationProof']) {
    assert.equal(JSON.stringify(result.body).includes(field), false);
  }
  assert.deepEqual(setupResult.state.extractionInput.messages, [
    { role: 'user', content: 'Using @asset_1 as the reference, create a professional 1:1 portrait with polished studio lighting.' },
    { role: 'assistant', content: 'I created the professional portrait using your reference.' },
  ]);
  assert.deepEqual(setupResult.state.extractionInput.attachments, [{
    attachmentId: 'asset_1', kind: 'image', url: trustedUrl,
  }]);
  assert.equal(JSON.stringify(setupResult.state.extractionInput).includes('tool_call'), false);
  assert.equal(JSON.stringify(setupResult.state.extractionInput).includes('provider_secret'), false);
  assert.equal(JSON.stringify(setupResult.state.extractionInput).includes('external-runtime-model'), false);
  const plan = setupResult.preparation.state.job.plan;
  assert.equal(plan.state, 'executable');
  assert.equal(plan.recipe.id, 'image-edit');
  assert.deepEqual(plan.capabilityRequirements.map(({ id }) => id), ['image_editing', 'reference_images']);
  assert.equal(plan.routing.operation, 'image_editing');
  assert.equal(typeof plan.routing.model, 'string');
  assert.ok(plan.routing.model);
  assert.deepEqual(setupResult.state.approvedProposal.references, [
    { id: 'asset_1', url: trustedUrl, role: 'source_image' },
  ]);
  assert.equal(setupResult.preparation.state.executions, 0);
});

test('unbound, wrong-account, and wrong-creator sessions fail before extraction, authorization, or preparation', async (t) => {
  for (const [name, options, requestIdentity, code] of [
    ['unbound', { bind: false }, identity, 'design_session_ownership_unverified'],
    ['wrong account', { owner: identity }, { accountId: 'account-2', identityKey: 'creator-1' }, 'design_session_scope_mismatch'],
    ['wrong creator', { owner: identity }, { accountId: 'account-1', identityKey: 'creator-2' }, 'design_session_scope_mismatch'],
  ]) {
    await t.test(name, async () => {
      const setupResult = await setup(options);
      const result = await response(await handleAgentExecutionFromConversationPost(request({
        agentId: 'design-agent', conversationId: 'session-1',
      }), { identity: requestIdentity, service: setupResult.service }));
      assert.equal(result.status, 403);
      assert.equal(result.body.code, code);
      assert.equal(setupResult.state.extractions, 0);
      assert.equal(setupResult.state.approvals, 0);
      assert.equal(setupResult.preparation.state.accepted, 0);
      assert.deepEqual(setupResult.provider.calls, []);
    });
  }
});

test('ambiguous and unsupported Design Agent intent returns safe state without authorization, jobs, attempts, or execution', async (t) => {
  for (const [name, extracted, expectedStatus] of [
    ['ambiguous', extraction({ status: 'ambiguous', operation: null, userIntent: 'Create something from the reference.', clarificationNeeded: 'What should I create?' }), 'ambiguous'],
    ['unsupported', extraction({ status: 'unsupported', operation: null, userIntent: 'Create a multi-slide carousel.', clarificationNeeded: null }), 'unsupported'],
  ]) {
    await t.test(name, async () => {
      const setupResult = await setup({ extracted });
      const result = await response(await handleAgentExecutionFromConversationPost(request({
        agentId: 'design-agent', conversationId: 'session-1',
      }), { identity, service: setupResult.service }));
      assert.equal(result.body.status, expectedStatus);
      assert.equal(result.body.executionStarted, false);
      assert.equal(setupResult.state.approvals, 0);
      assert.equal(setupResult.preparation.state.accepted, 0);
      assert.equal(setupResult.preparation.state.attempts, 0);
      assert.equal(setupResult.preparation.state.executions, 0);
      assert.equal('operation' in result.body, false);
    });
  }
});

test('fabricated or malformed session assets fail closed before extraction', async (t) => {
  for (const [name, provider] of [
    ['fabricated label', designProvider({
      messages: [{ role: 'user', content: 'Edit @asset_999.' }],
      assets: [{ asset_label: 'asset_1', url: 'https://cdn.test/asset_1.png', kind: 'image', session_id: 'session-1' }],
    })],
    ['malformed asset', designProvider({
      messages: [{ role: 'user', content: 'Edit the attached image.' }],
      assets: [{ asset_label: 'asset_1', kind: 'image', session_id: 'session-1' }],
    })],
  ]) {
    await t.test(name, async () => {
      const setupResult = await setup({ provider });
      const result = await response(await handleAgentExecutionFromConversationPost(request({
        agentId: 'design-agent', conversationId: 'session-1',
      }), { identity, service: setupResult.service }));
      assert.equal(result.status >= 400, true);
      assert.equal(setupResult.state.extractions, 0);
      assert.equal(setupResult.state.approvals, 0);
      assert.equal(setupResult.preparation.state.accepted, 0);
    });
  }
});

test('browser attachment, reference, semantic, provider, and execution overrides are rejected before source resolution', async () => {
  const setupResult = await setup();
  for (const override of [
    { attachments: [{ url: 'https://browser.invalid/image.png' }] },
    { references: [{ url: 'https://browser.invalid/image.png' }] },
    { operation: 'image_editing' }, { inputs: { subject: 'override' } },
    { provider: 'muapi' }, { model: 'provider-model' }, { authorizationProof: 'browser-proof' },
  ]) {
    const result = await response(await handleAgentExecutionFromConversationPost(request({
      agentId: 'design-agent', conversationId: 'session-1', ...override,
    }), { identity, service: setupResult.service }));
    assert.equal(result.status, 400);
    assert.equal(result.body.code, 'unsupported_conversation_execution_fields');
  }
  assert.deepEqual(setupResult.provider.calls, []);
  assert.equal(setupResult.state.extractions, 0);
});

test('generic agents continue through the existing default conversation reader', async () => {
  let genericReads = 0;
  const genericConversationReader = {
    async read({ agentId, conversationId }) {
      genericReads += 1;
      assert.equal(agentId, 'generic-agent');
      assert.equal(conversationId, 'generic-conversation');
      return { messages: [{ role: 'user', content: 'Create an image.' }], attachments: [], agent: null };
    },
  };
  const provider = designProvider();
  const setupResult = await setup({ genericConversationReader, provider });
  const result = await response(await handleAgentExecutionFromConversationPost(request({
    agentId: 'generic-agent', conversationId: 'generic-conversation',
  }), { identity, service: setupResult.service }));
  assert.equal(result.body.status, 'ready');
  assert.equal(genericReads, 1);
  assert.deepEqual(provider.calls, []);
  assert.equal(setupResult.preparation.state.job.plan.recipe.id, 'image');
  assert.equal(setupResult.preparation.state.job.plan.routing.model, 'flux-kontext-dev-t2i');
});

test('server Design Agent provider reuses the existing facade for authenticated read-only endpoints', async () => {
  const calls = [];
  const controller = new AbortController();
  const provider = createServerDesignAgentProvider({
    baseUrl: 'https://muapi.test',
    apiKey: 'server-key',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return Response.json(url.endsWith('/assets')
        ? [{ asset_label: 'asset_1', url: 'https://cdn.test/asset_1.png', kind: 'image' }]
        : [{ role: 'user', content: 'Edit asset_1.' }]);
    },
  });
  await provider.getSession('session-1', { signal: controller.signal });
  await provider.getSessionAssets('session-1', { signal: controller.signal });
  assert.deepEqual(calls.map(({ url }) => url), [
    'https://muapi.test/api/v1/creative-agent/sessions/session-1/messages',
    'https://muapi.test/api/v1/creative-agent/sessions/session-1/assets',
  ]);
  assert.equal(calls.every(({ options }) => options.method === 'GET'), true);
  assert.equal(calls.every(({ options }) => options.headers.get('x-api-key') === 'server-key'), true);
  assert.equal(calls.every(({ options }) => options.signal === controller.signal), true);
});

test('missing ownership migration returns the explicit schema error before reads or extraction', async () => {
  const provider = designProvider();
  const service = createConversationExecutionService({
    genericConversationReader: { read: assert.fail },
    designAgentProvider: provider,
    designAgentOwnershipService: {
      async verifyOwnedSession() {
        throw Object.assign(new Error('design_session_ownership_schema_missing'), {
          code: 'design_session_ownership_schema_missing', status: 503,
        });
      },
    },
    intentExtractionService: { extract: assert.fail },
    preparationService: { prepare: assert.fail },
    issueApproval: assert.fail,
    normalizeAuthorizedRequest: assert.fail,
  });
  const result = await response(await handleAgentExecutionFromConversationPost(request({
    agentId: 'design-agent', conversationId: 'session-1',
  }), { identity, service }));
  assert.equal(result.status, 503);
  assert.equal(result.body.code, 'design_session_ownership_schema_missing');
  assert.deepEqual(provider.calls, []);
});
