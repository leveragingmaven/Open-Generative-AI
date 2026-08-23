import test from 'node:test';
import assert from 'node:assert/strict';

const { StatelessCreativePreparationService } = await import('./statelessCreativePreparation.js');

function makeRequest(overrides = {}) {
  return {
    version: 1,
    agentId: 'agent-1',
    conversationId: 'conv-1',
    operation: 'image_generation',
    userIntent: 'Generate a hero image for the launch.',
    inputs: {},
    references: [],
    attachments: [],
    requestedSkillIds: [],
    requestedRecipeId: null,
    requestedWorkflowId: null,
    campaignId: null,
    authenticatedIdentity: {
      accountId: 'acc-1',
      identityKey: 'ai-gency:creator@example.com',
      creatorId: 'ai-gency:creator@example.com',
      source: 'server',
    },
    ...overrides,
  };
}

function executablePlan() {
  return {
    planId: 'plan-1',
    state: 'executable',
    valid: true,
    recipe: { id: 'r1', version: 'v1' },
    capabilityRequirements: [{ id: 'image', kind: 'required' }],
    selectedSkills: [],
    warnings: [],
    errors: [],
    assumptions: [],
    requiredInputs: [],
    unresolvedRequiredInputs: [],
    approvalRequirements: [],
    routing: { providerId: 'muapi', operation: 'image_generation' },
    request: { userIntent: 'x' },
  };
}

function requiresApprovalPlan() {
  return {
    ...executablePlan(),
    state: 'requires_approval',
    approvalRequirements: ['cost_authorization'],
  };
}

function nonExecutablePlan() {
  return {
    ...executablePlan(),
    state: 'non_executable',
    valid: false,
    errors: [{ code: 'planning_failed', message: 'no skill' }],
  };
}

class FakeCompiler {
  constructor(plan) {
    this.plan = plan;
  }
  compile() {
    return this.plan;
  }
}

class ThrowingCompiler {
  compile() {
    throw new Error('planning_failed');
  }
}

test('stateless prepare: never creates a durable job or mints/consumes authorization', () => {
  const service = new StatelessCreativePreparationService({
    skillResolver: { getSkill: () => ({ skillId: 's1' }), resolve: () => ({ matches: [] }) },
    compiler: new FakeCompiler(executablePlan()),
    capabilityRouter: { resolve: (input) => ({ providerId: 'gemini', operation: 'image_generation', model: 'gemini-pro' }) },
  });
  const result = service.prepare({ request: makeRequest() });
  assert.equal(result.ok, true);
  assert.equal(result.executionStarted, false);
  assert.equal(result.authorized, false);
  assert.equal(result.durableJobCreated, false);
  assert.equal(result.status, 'executable');
  assert.equal(result.jobId, undefined);
  assert.equal(result.attemptId, undefined);
});

test('stateless service: reports requires_approval truthfully without authorizing', async () => {
  const service = new StatelessCreativePreparationService({
    compiler: new FakeCompiler(requiresApprovalPlan()),
  });
  const result = service.prepare({ request: makeRequest() });
  assert.equal(result.status, 'requires_approval');
  assert.deepEqual(result.approvalRequirements, ['cost_authorization']);
  assert.equal(result.authorized, false);
  assert.equal(result.durableJobCreated, false);
});

test('stateless service: reports non_executable/blocked state', async () => {
  const service = new StatelessCreativePreparationService({
    compiler: new FakeCompiler(nonExecutablePlan()),
  });
  const result = service.prepare({ request: makeRequest() });
  assert.equal(result.status, 'non_executable');
  assert.equal(result.authorized, false);
  assert.equal(result.durableJobCreated, false);
});

test('stateless service: handles compiler failure as non_executable, never throws', () => {
  const service = new StatelessCreativePreparationService({
    compiler: new ThrowingCompiler(),
  });
  const result = service.prepare({ request: makeRequest() });
  assert.equal(result.status, 'non_executable');
  assert.equal(result.authorized, false);
  assert.equal(result.durableJobCreated, false);
});

test('stateless service: preserves capability requirements and proposed routing metadata only', () => {
  const service = new StatelessCreativePreparationService({
    compiler: new FakeCompiler(executablePlan()),
    capabilityRouter: { resolve: () => ({ providerId: 'muapi', operation: 'image_generation', model: 'm1' }) },
  });
  const result = service.prepare({ request: makeRequest() });
  assert.ok(Array.isArray(result.capabilityRequirements));
  assert.equal(result.capabilityRequirements[0].id, 'image');
  // Routing is deterministic metadata only: the plan already carried a
  // providerId, so it is preserved; no model candidate is registered in the
  // test environment, so model stays null. No provider call ever occurs.
  assert.equal(result.proposedRouting.providerId, 'muapi');
  assert.equal(result.proposedRouting.operation, 'image_generation');
  assert.equal(result.proposedRouting.model, null);
});

// ---- Authority boundary: service auth alone can NEVER execute/approve/cost/publish ----

test('boundary: stateless prepare never returns execution authority', () => {
  const service = new StatelessCreativePreparationService({ compiler: new FakeCompiler(executablePlan()) });
  const result = service.prepare({ request: makeRequest() });
  assert.equal(result.authorized, false, 'service auth must never grant execution authorization');
  assert.equal(result.executionStarted, false, 'service auth must never start execution');
  assert.equal(result.durableJobCreated, false, 'service auth must never create a durable creative job');
  assert.equal(result.jobId, undefined, 'no job id means nothing is executable');
  assert.equal(result.attemptId, undefined);
});

test('stateless prepare: cannot satisfy required plan approval', () => {
  const service = new StatelessCreativePreparationService({ compiler: new FakeCompiler(requiresApprovalPlan()) });
  const result = service.prepare({ request: makeRequest() });
  // Requires_approval is reported truthfully; no approval is manufactured.
  assert.equal(result.status, 'requires_approval');
  assert.deepEqual(result.approvalRequirements, ['cost_authorization']);
  assert.equal(result.authorized, false);
});

test('stateless prepare: cannot satisfy cost authorization', () => {
  const service = new StatelessCreativePreparationService({ compiler: new FakeCompiler(executablePlan()) });
  const result = service.prepare({ request: makeRequest() });
  // No cost/funding authority is created; the response carries no spend token.
  assert.equal(result.authorized, false);
  assert.equal(result.executionStarted, false);
  assert.equal(result.proposedRouting?.model, null);
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes('costAuthorized'));
  assert.ok(!serialized.includes('fundingAuthorized'));
});

test('stateless prepare: service auth cannot publish', () => {
  const service = new StatelessCreativePreparationService({ compiler: new FakeCompiler(executablePlan()) });
  const result = service.prepare({ request: makeRequest() });
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes('publish'));
  assert.ok(!serialized.includes('publication'));
});

test('stateless prepare: no provider generation occurs', () => {
  let providerCalls = 0;
  const service = new StatelessCreativePreparationService({
    compiler: new FakeCompiler(executablePlan()),
    capabilityRouter: { resolve: (input) => { providerCalls += 1; return { providerId: 'muapi', operation: 'image_generation' }; } },
  });
  service.prepare({ request: makeRequest() });
  assert.equal(providerCalls, 0, 'routing must be metadata-only; no provider is invoked');
});
