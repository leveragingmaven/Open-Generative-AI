import assert from 'node:assert/strict';
import test from 'node:test';
import { approvalErrorMessage, approveAgentExecutionPlan, beginAgentExecution, beginAgentExecutionFromConversation, executeAgentCreativeJob, executionErrorMessage, normalizeAgentExecutionRequest } from './agentExecutionBridge.js';

test('normalizes only canonical user execution fields', () => {
  const result = normalizeAgentExecutionRequest({ agentId: 'agent-1', conversationId: 'conversation-1', userIntent: 'Create', authorizationProof: 'secret', provider: 'muapi', references: ['ref-1'] });
  assert.deepEqual(result, { agentId: 'agent-1', conversationId: 'conversation-1', userIntent: 'Create', references: ['ref-1'], inputs: {}, attachments: [], requestedSkillIds: [] });
  assert.equal('authorizationProof' in result, false);
  assert.equal('provider' in result, false);
});

test('issues authorization and immediately starts without exposing or persisting the proof', async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return { ok: true, status: 200, async json() { return url.endsWith('/approve') ? { approval: { proof: 'temporary-proof' } } : { status: 'requires_approval', jobId: 'job-1', planId: 'plan-1' }; } };
  };
  try {
    const result = await beginAgentExecution({ agentId: 'agent-1', conversationId: 'conversation-1', userIntent: 'Create', operation: 'image_generation' });
    assert.deepEqual(result, { status: 'requires_approval', jobId: 'job-1', planId: 'plan-1' });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, '/api/agent-execution/approve');
    assert.equal(calls[1].url, '/api/agent-execution/start');
    assert.equal(calls[1].body.authorizationProof, 'temporary-proof');
    assert.equal(JSON.stringify(result).includes('temporary-proof'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('native Start Creative Work sends identifiers only and never calls execute or approval endpoints', async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return { ok: true, status: 200, async json() { return { status: 'requires_input', jobId: 'job-1', planId: 'plan-1', requiredInputs: [{ name: 'format' }], executionStarted: false }; } };
  };
  try {
    const result = await beginAgentExecutionFromConversation({ agentId: 'agent-1', conversationId: 'conversation-1', provider: 'ignored', operation: 'ignored' });
    assert.deepEqual(calls, [{ url: '/api/agent-execution/from-conversation', body: { agentId: 'agent-1', conversationId: 'conversation-1' } }]);
    assert.equal(result.status, 'requires_input');
    assert.deepEqual(result.requiredInputs, [{ name: 'format' }]);
    assert.equal(calls.some(({ url }) => url.includes('/execute') || url.includes('/approve')), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('native Start Creative Work preserves safe ambiguous and unsupported UI states', async () => {
  const originalFetch = globalThis.fetch;
  const responses = [
    { status: 'ambiguous', clarificationNeeded: 'What should I create?', userIntent: 'Create from my reference.' },
    { status: 'unsupported', message: 'Not supported yet.', userIntent: 'Create a carousel.' },
  ];
  globalThis.fetch = async () => ({ ok: true, status: 200, async json() { return responses.shift(); } });
  try {
    assert.deepEqual(await beginAgentExecutionFromConversation({ agentId: 'agent-1', conversationId: 'conversation-1' }), {
      status: 'ambiguous', clarificationNeeded: 'What should I create?', userIntent: 'Create from my reference.', executionStarted: false,
    });
    assert.deepEqual(await beginAgentExecutionFromConversation({ agentId: 'agent-1', conversationId: 'conversation-1' }), {
      status: 'unsupported', message: 'Not supported yet.', userIntent: 'Create a carousel.', executionStarted: false,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('approves only the exact current job and plan and normalizes the safe response', async () => {
  const originalFetch = globalThis.fetch;
  let call;
  globalThis.fetch = async (url, options) => {
    call = { url, body: JSON.parse(options.body) };
    return { ok: true, status: 200, async json() { return { status: 'ready', jobId: 'job-1', planId: 'plan-1', attemptId: 'attempt-1', providerId: 'secret-provider', funding: { secret: true } }; } };
  };
  try {
    const result = await approveAgentExecutionPlan({ jobId: 'job-1', planId: 'plan-1' });
    assert.deepEqual(call, { url: '/api/agent-execution/approve-plan', body: { jobId: 'job-1', planId: 'plan-1' } });
    assert.deepEqual(result, { status: 'ready', planState: 'ready', jobId: 'job-1', planId: 'plan-1', attemptId: 'attempt-1', requiredInputs: [], approvalRequirements: [], review: null, executionStarted: false });
    assert.equal('providerId' in result, false);
    assert.equal('funding' in result, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('maps approval failures to safe user messages', () => {
  assert.equal(approvalErrorMessage({ code: 'stale_plan_approval' }), 'This plan changed and needs to be reviewed again.');
  assert.equal(approvalErrorMessage({ code: 'creator_scope_mismatch' }), 'We couldn’t approve this plan. Please refresh and try again.');
  assert.equal(approvalErrorMessage({ code: 'unexpected_internal_code' }), 'We couldn’t approve the plan right now. Please try again.');
});

test('executes only the requested job and preserves safe result information', async () => {
  const originalFetch = globalThis.fetch;
  let call;
  globalThis.fetch = async (url, options) => {
    call = { url, body: JSON.parse(options.body) };
    return { ok: true, status: 200, async json() { return { status: 'completed', executionStarted: true, result: { jobId: 'job-1', attemptId: 'attempt-1', completed: true, outputReferences: ['https://cdn.example.test/result.png'], providerId: 'secret-provider' } }; } };
  };
  try {
    const result = await executeAgentCreativeJob({ jobId: 'job-1', providerId: 'attacker-provider', credentials: 'secret' });
    assert.deepEqual(call, { url: '/api/agent-execution/execute', body: { jobId: 'job-1' } });
    assert.equal(result.status, 'completed');
    assert.equal(result.attemptId, 'attempt-1');
    assert.deepEqual(result.outputReferences, ['https://cdn.example.test/result.png']);
    assert.equal('providerId' in result, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('maps execution errors without exposing provider internals', () => {
  assert.equal(executionErrorMessage({ code: 'creative_job_not_execution_ready' }), 'This creative job is no longer ready to start. Refresh its status before trying again.');
  assert.equal(executionErrorMessage({ code: 'creator_scope_mismatch' }), 'We couldn’t start creation. Please refresh and try again.');
  assert.equal(executionErrorMessage({ code: 'provider_internal_secret_error' }), 'The provider couldn’t complete this creation.');
});
