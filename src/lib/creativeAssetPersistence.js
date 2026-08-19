import { createAssetFromExecution } from '../../packages/studio/src/lib/intelligence/AssetFactory.js';
import { validateOutputReference } from '../../packages/studio/src/lib/intelligence/OutputValidation.js';
import { MySqlCreativeAssetRepository } from './creativeAssetRepository.js';

export class CreativeAssetPersistenceError extends Error {
  constructor(code, message = code) { super(message); this.code = code; }
}

function canonicalContext(job, routing, plan) {
  const context = { ...(job.executionContext || {}) };
  const recipe = plan?.recipe || job.recipe || context.recipe || null;
  return { ...context, id: context.id || job.executionContextId, routing, recipe };
}

export class CreativeAssetPersistenceService {
  constructor({ assetRepository = new MySqlCreativeAssetRepository() } = {}) { this.assetRepository = assetRepository; }

  buildAsset({ result, job, attempt, routing } = {}) {
    if (!job?.id || !attempt?.id) throw new CreativeAssetPersistenceError('asset_lineage_required');
    const outputs = Array.isArray(result?.outputReferences) ? result.outputReferences.filter(Boolean) : [];
    if (!outputs.length) throw new CreativeAssetPersistenceError('provider_output_required');
    const plan = job.plan || {};
    const context = canonicalContext(job, routing, plan);
    const recipe = context.recipe || {};
    const failures = outputs.map((reference) => validateOutputReference(reference, { expectedModality: recipe.outputModality })).filter((item) => !item.valid);
    if (failures.length) throw new CreativeAssetPersistenceError('invalid_provider_output_reference');
    const asset = createAssetFromExecution({ result, context, job, plan });
    const lineage = {
      accountId: job.accountId,
      creatorIdentityKey: job.creatorIdentityKey,
      jobId: job.id,
      attemptId: attempt?.id || job.attemptId,
      requestId: job.requestId,
      authorizationId: job.authorizationId,
      agentId: job.agentId,
      conversationId: job.conversationId,
      campaignId: job.campaignId || null,
      recipeId: recipe.id || job.recipeId || null,
      planId: job.planId || plan.planId || null,
      twinContext: job.twinContext || null,
      skillReferences: plan.selectedSkills || plan.skills || plan.skillReferences || [],
      providerOutputReference: outputs[0],
      storageReference: outputs[0],
    };
    return {
      ...asset,
      ...lineage,
      campaignId: lineage.campaignId,
      generatedFiles: outputs,
      provider: routing?.providerId || asset.provider,
      model: routing?.deploymentId || asset.model,
      metadata: {
        ...asset.metadata,
        assetType: 'generated',
        modality: recipe.outputModality || null,
        provider: routing?.providerId || null,
        deployment: routing?.deploymentId || null,
        recipe: lineage.recipeId,
        campaignId: lineage.campaignId,
        accountId: lineage.accountId,
        creatorIdentityKey: lineage.creatorIdentityKey,
        jobId: lineage.jobId,
        attemptId: lineage.attemptId,
        authorizationId: lineage.authorizationId,
        agentId: lineage.agentId,
        conversationId: lineage.conversationId,
        requestId: lineage.requestId,
        planId: lineage.planId,
        twinContext: lineage.twinContext,
        skillReferences: lineage.skillReferences,
        providerOutputReference: outputs[0],
        storageReference: outputs[0],
      },
    };
  }

  async persistOnConnection(connection, input = {}) {
    const asset = this.buildAsset(input);
    const persisted = await this.assetRepository.saveOnConnection(connection, asset);
    return { asset: persisted, storageReferences: asset.generatedFiles || [] };
  }
}
