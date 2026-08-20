import assert from 'node:assert/strict';
import test from 'node:test';
import { ConversationProposalBuilder } from './conversationProposalBuilder.js';
import { resolveConcreteProviderRouting } from './agentExecutionModelResolution.js';
import { AgentExecutionPlanningService } from './agentExecutionPlanning.js';
import { CreativeIntelligenceEngine } from '../../packages/studio/src/lib/intelligence/CreativeIntelligenceEngine.js';
import { RecipeResolver } from '../../packages/studio/src/lib/intelligence/RecipeResolver.js';
import { SkillAwarePlanCompiler } from '../../packages/studio/src/lib/intelligence/SkillAwarePlanCompiler.js';

const identity = { accountId: 'account-1', identityKey: 'creator-1' };

const semanticInputs = {
  deliverable: 'professional portrait', subject: 'the person in the uploaded photo', audience: null, offer: null,
  platform: null, format: 'portrait', requestedOutcome: 'a polished professional portrait', requestedChanges: [],
  constraints: ['preserve the person'], websiteMentioned: null, durationSeconds: null, aspectRatio: '1:1',
};

function planningCompiler() {
  const recipeResolver = new RecipeResolver();
  const skill = {
    skillId: 'reference-portrait-test', name: 'Reference Portrait Test', version: '1.0.0', status: 'active',
    discoverable: true, capabilities: [], requiredInputs: [], compatibleContentTypes: [], compatibleCampaignTemplates: [],
  };
  const skillResolver = {
    getSkill: () => skill,
    resolve: () => ({ selected: skill, matches: [{ skill, score: 1, reasons: ['mocked semantic match'] }] }),
  };
  const skillReferenceResolver = {
    workflows: {},
    resolve: () => ({
      recipes: { candidates: [], unresolved: [] },
      workflows: { candidates: [], unresolved: [] },
    }),
  };
  const intelligenceEngine = new CreativeIntelligenceEngine({
    recipes: recipeResolver,
    memory: { projectMemory: () => ({ memories: [], values: {}, provenance: [] }) },
  });
  return new SkillAwarePlanCompiler({ skillResolver, skillReferenceResolver, recipeResolver, intelligenceEngine });
}

async function planProposal(proposal) {
  const sourceRequest = {
    ...proposal,
    authenticatedIdentity: { accountId: 'account-1', creatorId: 'creator-1', identityKey: 'creator-1', source: 'server' },
  };
  const repository = {
    job: {
      id: 'job-default-recipe', status: 'pending', executionStatus: 'planned', metadata: {},
      executionContext: { executionMetadata: { agentExecutionRequest: sourceRequest } },
    },
    async getJob() { return this.job; },
    async updatePlanningResult({ plan, planningError }) {
      this.job = { ...this.job, plan, error: planningError || null };
      return this.job;
    },
  };
  const result = await new AgentExecutionPlanningService({
    jobRepository: repository,
    skillResolver: { getSkill() { throw new Error('No explicit skill requested.'); } },
    compiler: planningCompiler(),
  }).planAcceptedJob({ jobId: repository.job.id, accountId: 'account-1' });
  assert.equal(result.planned, true);
  return result.plan;
}

test('trusted reference-driven conversation defaults to image-edit and routes to Nano Banana Pro Edit without execution', async () => {
  let extractionInput;
  let providerExecutions = 0;
  const attachment = {
    attachmentId: 'portrait-1', kind: 'image', filename: 'portrait.png', url: 'https://cdn.test/portrait.png',
  };
  const builder = new ConversationProposalBuilder({
    conversationReader: {
      async read() {
        return {
          messages: [{ role: 'user', content: 'Use my uploaded photo as a reference and create a new professional portrait.' }],
          attachments: [attachment], agent: null,
        };
      },
    },
    intentExtractionService: {
      async extract(input) {
        extractionInput = input;
        return { result: {
          status: 'resolved', operation: 'image_editing',
          userIntent: 'Use the uploaded photo as a reference for a new professional portrait.',
          inputs: semanticInputs,
          referenceRoles: [{ attachmentId: 'portrait-1', role: 'character_reference' }],
          requestedSkillHints: [], confidence: 0.99, clarificationNeeded: null,
        } };
      },
    },
  });

  const built = await builder.build({ agentId: 'design-agent', conversationId: 'conversation-1', identity });
  assert.equal(extractionInput.attachments[0].attachmentId, 'portrait-1');
  assert.equal(built.proposal.requestedRecipeId, null);
  assert.deepEqual(built.proposal.references, [{ id: 'portrait-1', url: 'https://cdn.test/portrait.png', role: 'character_reference' }]);

  const plan = await planProposal(built.proposal);
  assert.equal(plan.state, 'executable');
  assert.equal(plan.recipe.id, 'image-edit');
  assert.deepEqual(plan.unresolvedRequiredInputs, []);
  assert.deepEqual(plan.capabilityRequirements.map(({ id }) => id), ['image_editing', 'reference_images']);
  assert.equal(plan.routing.providerId, 'muapi');
  assert.equal(plan.routing.deploymentId, 'muapi-image-editing');

  const routing = resolveConcreteProviderRouting({
    routing: plan.routing,
    requiredCapabilities: plan.capabilityRequirements,
  });
  assert.equal(routing.providerId, 'muapi');
  assert.equal(routing.deploymentId, 'muapi-image-editing');
  assert.equal(routing.operation, 'image_editing');
  assert.equal(routing.model, 'nano-banana-pro-edit');
  assert.equal(routing.modelMetadata.id, 'muapi-nano-banana-pro-edit');
  assert.equal(providerExecutions, 0);
});

test('generic image generation defaults to image and preserves existing concrete routing', async () => {
  const plan = await planProposal({
    agentId: 'design-agent', conversationId: 'conversation-2', operation: 'image_generation',
    userIntent: 'Create one clean product image.', inputs: { ...semanticInputs, deliverable: 'product image', subject: 'a mug' },
    references: [], attachments: [], requestedSkillIds: [], requestedRecipeId: null,
  });
  assert.equal(plan.state, 'executable');
  assert.equal(plan.recipe.id, 'image');
  assert.deepEqual(plan.capabilityRequirements.map(({ id }) => id), ['image_generation']);
  const routing = resolveConcreteProviderRouting({ routing: plan.routing, requiredCapabilities: plan.capabilityRequirements });
  assert.equal(routing.providerId, 'muapi');
  assert.equal(routing.deploymentId, 'muapi-image-generation');
  assert.equal(routing.model, 'flux-kontext-dev-t2i');
});
