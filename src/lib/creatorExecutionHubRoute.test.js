import test from 'node:test';
import assert from 'node:assert/strict';
import {
  handleCreatorExecutionHandoffGet,
  handleCreatorExecutionHandoffPost,
  publicReview,
} from '../../app/api/creator-execution/handoffs/[reference]/route.js';

const REFERENCE = 'e'.repeat(43);
const identity = { email: 'member@example.com', identityKey: 'ai-gency:member', accountId: 'acct-1' };

test('the review surface returns only the signed-in member request', async () => {
  const hub = {
    async read(reference, subject) {
      assert.equal(reference, REFERENCE);
      assert.equal(subject, identity.email);
      return {
        reference: REFERENCE,
        operation: 'video_generation',
        brief: 'Create the exact approved brief.',
        parameters: { duration: 5 },
        costCeiling: 0,
        state: 'pending',
        jobId: null,
        expiresAt: '2026-11-04T00:05:00.000Z',
        paidExecutionEnabled: false,
        executionMode: 'approval_and_job_creation_only',
      };
    },
  };
  const response = await handleCreatorExecutionHandoffGet(REFERENCE, { identity, hub });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.request.brief, 'Create the exact approved brief.');
  assert.equal(body.request.paidExecutionEnabled, false);
  assert.deepEqual(publicReview(body.request), body.request);
  assert.equal(JSON.stringify(body).includes('owner'), false);
});

test('approve reuses the native approval path and decline creates nothing', async () => {
  const seen = { approvals: 0, declines: 0 };
  const hub = {
    async decline(reference, subject) {
      seen.declines += 1;
      assert.equal(reference, REFERENCE);
      assert.equal(subject, identity.email);
    },
  };
  const declined = await handleCreatorExecutionHandoffPost(REFERENCE, { decision: 'decline' }, { identity, hub });
  assert.equal(declined.status, 200);
  assert.equal((await declined.json()).status, 'declined');
  assert.equal(seen.declines, 1);

  const approved = await handleCreatorExecutionHandoffPost(REFERENCE, { decision: 'approve' }, {
    identity,
    hub,
    approve: async ({ identity: approvedIdentity, reference, hub: approvedHub }) => {
      seen.approvals += 1;
      assert.equal(approvedIdentity, identity);
      assert.equal(reference, REFERENCE);
      assert.equal(approvedHub, hub);
      return { ok: true, status: 'started', jobId: 'job-1', paidExecutionEnabled: false };
    },
  });
  assert.equal(approved.status, 200);
  assert.equal((await approved.json()).jobId, 'job-1');
  assert.equal(seen.approvals, 1);
});

test('the review surface fails closed without a session or a valid decision', async () => {
  const unauth = await handleCreatorExecutionHandoffGet(REFERENCE, { hub: {} });
  assert.equal(unauth.status, 401);
  const invalid = await handleCreatorExecutionHandoffPost(REFERENCE, { decision: 'execute' }, { identity, hub: {} });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).code, 'invalid_decision');
});
