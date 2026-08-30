import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeStructuredActions, dispatchStructuredAction } from '../../packages/Open-Poe-AI/packages/agents/src/structuredActions.js';
import { beginAgentExecution } from '../../app/agents/agentExecutionBridge.js';
import { createAgentChatResponseContext, enrichAgentPredictionResult } from './agentExecutionProposal.js';

test('mocked proposal response reaches the explicit Agent Execution start boundary', async () => {
  const trustedReference = 'https://trusted.example/reference-avatar.jpg';
  const context = createAgentChatResponseContext({
    agentId: 'trusted-agent-1',
    conversationId: 'trusted-conversation-1',
    attachments: [{ id: 'upload-1', url: trustedReference }],
  });
  const prediction = {
    messages: [{ role: 'assistant', content: 'I have enough to prepare this profile image.' }],
    suggestions: [{ label: 'Adjust the background', prompt: 'Use a warmer background.' }],
    execution_proposal: {
      version: 1,
      operation: 'image_editing',
      userIntent: 'Create one professional creator profile image using the uploaded reference.',
      agentId: 'model-agent',
      conversationId: 'model-conversation',
      provider: 'muapi',
      model: 'nano-banana-pro-edit',
      routing: { providerId: 'muapi' },
      credentials: 'secret',
      apiKey: 'secret',
      funding: 'account',
      accountId: 'model-account',
      creatorIdentity: 'model-identity',
      authorizationProof: 'forged',
      jobStatus: 'ready',
      executionStatus: 'running',
      inputs: {
        prompt: 'Create one square professional profile image in a bright studio with a natural expression and clean neutral background.',
        model: 'unsafe-model',
        provider_id: 'unsafe-provider',
        api_key: 'secret',
        account_id: 'unsafe-account',
      },
      references: [{ url: trustedReference }],
      attachments: [],
      requestedSkillIds: [],
      requestedRecipeId: 'image',
      requestedWorkflowId: null,
      campaignId: null,
    },
  };

  const enriched = enrichAgentPredictionResult(prediction, context);
  const actions = normalizeStructuredActions(enriched.actions);
  assert.equal(actions.length, 1);
  assert.equal(enriched.messages, prediction.messages);
  assert.equal(enriched.suggestions, prediction.suggestions);
  assert.equal(actions[0].payload.agentId, 'trusted-agent-1');
  assert.equal(actions[0].payload.conversationId, 'trusted-conversation-1');
  assert.deepEqual(actions[0].payload.references, [{ url: trustedReference }]);
  assert.equal(actions[0].payload.inputs.model, undefined);
  assert.equal(actions[0].payload.inputs.provider_id, undefined);
  assert.equal(actions[0].payload.inputs.api_key, undefined);

  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    if (url === '/api/agent-execution/approve') {
      return new Response(JSON.stringify({ approval: { proof: 'mock-proof' } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url === '/api/agent-execution/start') {
      return new Response(JSON.stringify({ status: 'ready', jobId: 'job-1', attemptId: 'attempt-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  try {
    let dispatched = false;
    const result = await new Promise((resolve, reject) => {
      const accepted = dispatchStructuredAction(actions[0], async (action) => {
        dispatched = true;
        try { resolve(await beginAgentExecution(action.payload)); } catch (error) { reject(error); }
      });
      assert.equal(accepted, true);
    });

    assert.equal(dispatched, true);
    assert.equal(result.status, 'ready');
    assert.deepEqual(calls.map((call) => call.url), ['/api/agent-execution/approve', '/api/agent-execution/start']);
    assert.equal(calls[0].body.references[0].url, trustedReference);
    assert.equal(calls[0].body.provider, undefined);
    assert.equal(calls[0].body.model, undefined);
    assert.equal(calls[1].body.authorizationProof, 'mock-proof');
    assert.equal(calls.some((call) => call.url === '/api/agent-execution/execute'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('missing trusted context and malformed proposals fail closed without changing conversation content', () => {
  const prediction = {
    messages: [{ role: 'assistant', content: 'I need more information.' }],
    suggestions: [{ label: 'Clarify the audience', prompt: 'Who is this for?' }],
    execution_proposal: {
      version: 1,
      operation: 'image_editing',
      userIntent: 'Edit this image.',
      references: [{ url: 'https://trusted.example/reference-avatar.jpg' }],
    },
  };

  const missingContext = enrichAgentPredictionResult(prediction, {});
  assert.equal(missingContext.actions, undefined);
  assert.deepEqual(missingContext.messages, prediction.messages);
  assert.deepEqual(missingContext.suggestions, prediction.suggestions);

  const malformed = enrichAgentPredictionResult({
    ...prediction,
    execution_proposal: { version: 1, operation: 'unsupported_operation', userIntent: 'No.' },
  }, createAgentChatResponseContext({ agentId: 'agent-1', conversationId: 'conversation-1' }));
  assert.equal(malformed.actions, undefined);
  assert.deepEqual(malformed.messages, prediction.messages);
  assert.deepEqual(malformed.suggestions, prediction.suggestions);
});

