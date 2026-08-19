import assert from 'node:assert/strict';
import test from 'node:test';
import { SkillAwarePlanCompiler } from '../../packages/studio/src/lib/intelligence/SkillAwarePlanCompiler.js';
import { CreativeIntelligenceEngine } from '../../packages/studio/src/lib/intelligence/CreativeIntelligenceEngine.js';
import { RecipeResolver } from '../../packages/studio/src/lib/intelligence/RecipeResolver.js';
import { SkillReferenceResolver } from '../../packages/studio/src/lib/skills/SkillReferenceResolver.js';
import { AgentExecutionPlanningService } from './agentExecutionPlanning.js';

const skills = {
  alpha: {
    skillId: 'alpha', name: 'Alpha', version: '1.0.0', status: 'active', discoverable: true,
    recipes: [], capabilities: [], requiredInputs: [], compatibleContentTypes: [], compatibleCampaignTemplates: [],
  },
};

function makeCompiler() {
  const recipes = { image: { id: 'image', version: 2, inputs: { prompt: { required: true } }, capabilityRequirements: ['image_generation'] } };
  const recipeResolver = new RecipeResolver({ recipes });
  const skillResolver = { getSkill: (id) => skills[id] || null, resolve: () => ({ matches: [] }) };
  const skillReferenceResolver = new SkillReferenceResolver({ skills, recipeResolver, workflows: {} });
  const intelligenceEngine = new CreativeIntelligenceEngine({
    memory: { projectMemory: () => ({ memories: [], values: {}, provenance: [] }) },
    recipes: recipeResolver,
    router: { resolve: () => ({ deploymentId: 'logical-deployment' }) },
  });
  return new SkillAwarePlanCompiler({ skillResolver, skillReferenceResolver, recipeResolver, intelligenceEngine });
}

function request(overrides = {}) {
  return {
    requestId: 'request-planning-1', agentId: 'remote-template-1', conversationId: 'remote-conversation-1',
    userIntent: 'Create the approved image.', operation: 'creative_generation', inputs: { prompt: 'A hero image' },
    references: [], attachments: [], requestedSkillIds: ['alpha'], requestedRecipeId: 'image',
    campaignId: 'campaign-1', twinContext: { twinId: 'twin-1' },
    authenticatedIdentity: { accountId: 'account-1', creatorId: 'creator-1', identityKey: 'creator-1', source: 'server' },
    ...overrides,
  };
}

function jobRepository(sourceRequest) {
  const job = {
    id: 'job-1', status: 'pending', executionStatus: 'planned', metadata: {},
    executionContext: { executionMetadata: { agentExecutionRequest: sourceRequest } },
  };
  return {
    job,
    async getJob() { return this.job; },
    async updatePlanningResult({ plan, planningError, unresolvedAdvisories }) {
      this.job = {
        ...this.job,
        status: planningError ? 'failed' : this.job.status,
        plan,
        metadata: { ...this.job.metadata, planning: { plan, planningError, unresolvedAdvisories } },
      };
      return this.job;
    },
  };
}

test('accepted job compiles and persists a skill-aware plan with context lineage', async () => {
  const repository = jobRepository(request());
  const result = await new AgentExecutionPlanningService({
    jobRepository: repository,
    skillResolver: { getSkill: (id) => skills[id] || (() => { throw new Error('skill_not_found'); })() },
    compiler: makeCompiler(),
  }).planAcceptedJob({ jobId: 'job-1', accountId: 'account-1' });
  assert.equal(result.planned, true);
  assert.equal(result.plan.recipe.id, 'image');
  assert.deepEqual(result.plan.selectedSkills.map((skill) => skill.skillId), ['alpha']);
  assert.equal(result.plan.request.accountId, 'account-1');
  assert.equal(result.plan.request.metadata.agentExecution.agentId, 'remote-template-1');
  assert.equal(result.plan.request.metadata.agentExecution.creatorIdentityKey, 'creator-1');
  assert.equal(result.plan.campaignContext.twinContext.twinId, 'twin-1');
  assert.equal(repository.job.plan.planId, result.plan.planId);
});

test('unresolved remote skills remain advisory and are not fabricated', async () => {
  const source = request({ requestedSkillIds: ['remote-skill-name', 'alpha'] });
  const repository = jobRepository(source);
  const result = await new AgentExecutionPlanningService({
    jobRepository: repository,
    skillResolver: { getSkill: (id) => skills[id] || (() => { throw new Error('skill_not_found'); })() },
    compiler: makeCompiler(),
  }).planAcceptedJob({ jobId: 'job-1', accountId: 'account-1' });
  assert.equal(result.planned, true);
  assert.deepEqual(result.plan.selectedSkills.map((skill) => skill.skillId), ['alpha']);
  assert.equal(result.unresolvedSkillReferences[0].reference, 'remote-skill-name');
  assert.equal(result.unresolvedSkillReferences[0].advisory, true);
});

test('invalid recipe is reported as planning failure without creating a job', async () => {
  const repository = jobRepository(request({ requestedRecipeId: 'not-a-recipe' }));
  const result = await new AgentExecutionPlanningService({
    jobRepository: repository,
    skillResolver: { getSkill: (id) => skills[id] || (() => { throw new Error('skill_not_found'); })() },
    compiler: makeCompiler(),
  }).planAcceptedJob({ jobId: 'job-1', accountId: 'account-1' });
  assert.equal(result.planned, false);
  assert.equal(repository.job.status, 'failed');
  assert.equal(repository.job.metadata.planning.planningError.code, 'planning_failed');
  assert.equal(repository.job.id, 'job-1');
});

test('malformed structured plan is rejected before it can be persisted', async () => {
  const repository = jobRepository(request());
  const compiler = { compile: () => ({ planId: 'plan-1', request: {}, recipe: { id: 'image' }, capabilityRequirements: 'not-an-array' }) };
  const result = await new AgentExecutionPlanningService({
    jobRepository: repository,
    skillResolver: { getSkill: (id) => skills[id] || (() => { throw new Error('skill_not_found'); })() },
    compiler,
  }).planAcceptedJob({ jobId: 'job-1', accountId: 'account-1' });
  assert.equal(result.planned, false);
  assert.equal(result.plan, null);
  assert.equal(repository.job.metadata.planning.planningError.code, 'structured_state_invalid');
  assert.equal(repository.job.plan, undefined);
});
