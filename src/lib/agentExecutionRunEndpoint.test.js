import assert from 'node:assert/strict';
import test from 'node:test';
import { handleAgentExecutionRunPost, handleAgentExecutionRunRoute } from './agentExecutionRunEndpoint.js';

function request(body) {
  return { async json() { return body; } };
}

const identity = { accountId: 'account-1', identityKey: 'creator-1', creatorId: 'creator-1' };

test('authenticated execution request reaches executeReadyJob with server identity', async () => {
  let received;
  const response = await handleAgentExecutionRunPost(request({ jobId: 'job-1' }), {
    identity,
    executionService: { async executeReadyJob(input) { received = input; return { completed: true, job: { id: 'job-1', status: 'completed', executionStatus: 'completed', result: { outputReferences: ['https://output'] } }, attempt: { id: 'attempt-1', status: 'completed', providerResponseRef: 'provider-job-1' } }; } },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(received, { jobId: 'job-1', accountId: 'account-1', creatorIdentityKey: 'creator-1' });
  assert.deepEqual(await response.json(), { ok: true, status: 'completed', executionStarted: true, result: { jobId: 'job-1', jobStatus: 'completed', executionStatus: 'completed', attemptId: 'attempt-1', attemptStatus: 'completed', completed: true, providerResponseRef: 'provider-job-1', outputReferences: ['https://output'] } });
});

test('unauthenticated and incorrectly scoped requests are rejected', async () => {
  const unauthenticated = await handleAgentExecutionRunPost(request({ jobId: 'job-1' }));
  assert.equal(unauthenticated.status, 401);
  const wrongIdentity = await handleAgentExecutionRunPost(request({ jobId: 'job-1', accountId: 'browser-account' }), { identity, executionService: { executeReadyJob: assert.fail } });
  assert.equal(wrongIdentity.status, 400);
  assert.equal((await wrongIdentity.json()).code, 'identity_override_not_allowed');
});

test('browser cannot inject credentials, routing, or execution status', async () => {
  for (const field of ['apiKey', 'credential', 'credentials', 'providerId', 'routing', 'status', 'attemptStatus']) {
    const response = await handleAgentExecutionRunPost(request({ jobId: 'job-1', [field]: 'browser-value' }), { identity, executionService: { executeReadyJob: assert.fail } });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, 'trusted_execution_fields_not_allowed');
  }
});

test('not-ready and credential failures are returned without exposing secrets', async () => {
  const response = await handleAgentExecutionRunPost(request({ jobId: 'job-1' }), { identity, executionService: { async executeReadyJob() { const error = new Error('server-secret-value'); error.code = 'provider_credential_unavailable:muapi'; throw error; } } });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.code, 'provider_credential_unavailable:muapi');
  assert.equal(JSON.stringify(body).includes('server-secret-value'), false);
});

test('route authenticates before invoking the execution service', async () => {
  let called = false;
  const response = await handleAgentExecutionRunRoute(request({ jobId: 'job-1' }), {
    authenticate: async () => ({ identity: null, response: Response.json({ error: 'unauthorized' }, { status: 401 }) }),
    rateLimit: async () => null,
    executionService: { executeReadyJob: async () => { called = true; } },
  });
  assert.equal(response.status, 401);
  assert.equal(called, false);
});
