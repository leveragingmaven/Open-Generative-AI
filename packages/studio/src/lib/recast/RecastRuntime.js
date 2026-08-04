// Creative OS — Character (Performance Transfer) Runtime.
//
// Orchestrates the full Creative OS execution path for performance transfer:
//
//   Character Studio → recast Skill → performanceTransfer Recipe → Creative
//   Intelligence (plan) → Creative Execution Engine (context/job/start/complete/
//   fail) → Provider Registry (operation performance_transfer → MuAPI) →
//   Creative Job → canonical Creative Asset → Campaign → Publishing (discovered
//   via the canonical asset path).
//
// Character Studio must not call MuAPI directly. The Agent runtime must not
// duplicate recast logic. The AI Twin must not duplicate recast logic. The
// Command Bar only resolves intent and routes context. Everyone calls this
// runtime / job builder.

import { CreativeIntelligenceEngine } from "../intelligence/CreativeIntelligenceEngine.js";
import { CreativeExecutionEngine } from "../intelligence/CreativeExecutionEngine.js";
import { InMemoryExecutionPersistence } from "../intelligence/ExecutionPersistence.js";
import { buildRecastJob, buildRecastRequest } from "./RecastJobBuilder.js";
import { RECAST_RECIPE_ID, RECAST_SKILL_ID } from "./RecastConstants.js";
import {
  buildRecastPayload,
  executeRecastThroughRegistry,
  normalizeRecastResponse,
  validateRecastResult,
} from "./RecastProvider.js";
import { createRecastRunRecord, saveRecastRun } from "./RecastHistory.js";
import { normalizeExecutionError } from "../intelligence/ExecutionError.js";
import { createCreativeAsset } from "../intelligence/CreativeAsset.js";
import { withCampaignMetadata } from "../campaigns/campaignAssetMetadata.js";

// Provider executor adapter: the Creative Execution Engine calls
// providerExecutor.execute({ job, context, routing }); this adapter executes the
// performance-transfer operation through the Provider Registry only — never
// MuAPI directly.
export function createRecastProviderExecutor({ providerRegistry, providerId = "muapi" }) {
  return {
    async execute({ job, context, routing }) {
      const metadata = context?.executionMetadata || job?.metadata?.executionMetadata || {};
      const payload = metadata.payload || buildRecastPayload(metadata.inputs || {});
      const raw = await executeRecastThroughRegistry(providerRegistry, {
        apiKey: metadata.apiKey,
        payload,
        providerId: routing?.providerId || metadata.providerId || providerId,
      });
      const normalized = normalizeRecastResponse(raw);
      return {
        status: "completed",
        providerResponseRef: normalized.requestId || null,
        providerMetadata: { ...(normalized.providerMetadata || {}), normalized },
        outputReferences: normalized.video ? [normalized.video] : [],
      };
    },
  };
}

export function createRecastRuntime({
  providerRegistry,
  intelligence = null,
  execution = null,
  campaignManager = null,
  assetStore = null,
  historyStore = saveRecastRun,
  persistence = null,
} = {}) {
  if (!providerRegistry) throw new Error("Character runtime requires a Provider Registry");
  const providerExecutor = createRecastProviderExecutor({ providerRegistry });
  const intelligenceEngine = intelligence || new CreativeIntelligenceEngine();
  const executionEngine = execution || new CreativeExecutionEngine({
    persistence: persistence || new InMemoryExecutionPersistence(),
    providerExecutor,
  });
  if (!executionEngine.providerExecutor) executionEngine.providerExecutor = providerExecutor;

  const runtime = {
    intelligence: intelligenceEngine,
    execution: executionEngine,
    campaignManager,
    assetStore,
    historyStore,
    plan(job) {
      const request = buildRecastRequest(job);
      return intelligenceEngine.plan({
        ...request,
        capabilityRequirements: [
          { id: "performance_transfer", kind: "required" },
          { id: "identity_preservation", kind: "required" },
          { id: "motion_transfer", kind: "required" },
          { id: "character_consistency", kind: "required" },
        ],
      });
    },
    // Executes a built performance-transfer job end-to-end. Returns the run summary.
    async run(job, { apiKey, sourceAsset = null, campaign = null } = {}) {
      const startedAt = Date.now();
      const campaignId = job.campaignId || campaign?.id || null;
      const campaignName = job.campaignName || campaign?.name || null;
      let historyRun = this.persistRun(
        createRecastRunRecord({
          requestId: job.requestId,
          status: "pending",
          characterImage: job.characterImage,
          characterIdentity: job.characterIdentity,
          drivingVideo: job.drivingVideo,
          sourceAssetId: job.sourceAssetId,
          model: job.model,
          aspectRatio: job.aspectRatio,
          characterOrientation: job.characterOrientation,
          campaignId,
          campaignName,
          twinId: job.twinId,
          agentId: job.agentId,
          workspace: job.workspace,
          providerId: job.providerId,
        })
      );
      let jobRecord = null;
      try {
        const plan = this.plan(job);
        const context = this.execution.createExecutionContext(plan, {
          metadata: {
            apiKey,
            providerId: job.providerId,
            inputs: { ...job.inputs },
            payload: buildRecastPayload(job.inputs),
            twinId: job.twinId,
            agentId: job.agentId,
            workspace: job.workspace,
          },
        });
        jobRecord = this.execution.createJob(context, {
          metadata: {
            characterImage: job.characterImage,
            characterIdentity: job.characterIdentity,
            drivingVideo: job.drivingVideo,
            sourceAssetId: job.sourceAssetId,
            campaignId,
            twinId: job.twinId,
            agentId: job.agentId,
            workspace: job.workspace,
            provider: job.providerId,
            recipeId: job.recipeId,
            skillId: job.skillId,
            requestId: job.requestId,
            model: job.model,
            aspectRatio: job.aspectRatio,
            characterOrientation: job.characterOrientation,
          },
        });
        this.execution.queue(jobRecord.id);
        const resultJob = await this.execution.execute(jobRecord.id, { context, routing: context.routing });
        jobRecord = resultJob || jobRecord;
        const result = jobRecord?.result;

        if (jobRecord?.status === "failed" || !result?.success) {
          throw Object.assign(new Error(jobRecord?.error?.message || "Performance transfer execution failed"), {
            code: jobRecord?.error?.code,
            cause: jobRecord?.error,
          });
        }

        const normalized = result.providerMetadata?.normalized
          ? result.providerMetadata.normalized
          : normalizeRecastResponse(result.providerMetadata || {});
        const validation = validateRecastResult(normalized);
        if (!validation.valid) {
          throw Object.assign(new Error(validation.error), { code: "malformed_provider_response" });
        }

        // Honest empty state: a completed job with no rendered video is a valid
        // outcome — never fabricate a video.
        const materializedAssets = this.materializeAssets({
          job: jobRecord,
          normalized,
          sourceAsset,
          campaign,
        });

        if (campaignId && this.campaignManager) {
          this.attachToCampaign(campaignId, { jobId: jobRecord.id, assets: materializedAssets });
        }

        historyRun = this.persistRun(
          createRecastRunRecord({
            job: jobRecord,
            requestId: job.requestId,
            status: "completed",
            characterImage: job.characterImage,
            characterIdentity: job.characterIdentity,
            drivingVideo: job.drivingVideo,
            sourceAssetId: job.sourceAssetId,
            model: job.model,
            aspectRatio: job.aspectRatio,
            characterOrientation: job.characterOrientation,
            campaignId,
            campaignName,
            twinId: job.twinId,
            agentId: job.agentId,
            workspace: job.workspace,
            providerId: job.providerId,
            assetIds: materializedAssets.map((asset) => asset.id),
            videoUrl: normalized.video || null,
            completedAt: new Date().toISOString(),
          })
        );

        return {
          ok: true,
          job: jobRecord,
          normalized,
          assets: materializedAssets,
          video: normalized.video || null,
          executionTimeMs: Date.now() - startedAt,
          warnings: result.warnings || [],
          historyRun,
        };
      } catch (error) {
        const failure = normalizeExecutionError(error);
        if (jobRecord?.id) jobRecord = this.execution.fail?.(jobRecord.id, failure) || jobRecord;
        historyRun = this.persistRun(
          createRecastRunRecord({
            requestId: job.requestId,
            status: "failed",
            characterImage: job.characterImage,
            characterIdentity: job.characterIdentity,
            drivingVideo: job.drivingVideo,
            sourceAssetId: job.sourceAssetId,
            model: job.model,
            aspectRatio: job.aspectRatio,
            characterOrientation: job.characterOrientation,
            campaignId,
            campaignName,
            twinId: job.twinId,
            agentId: job.agentId,
            workspace: job.workspace,
            providerId: job.providerId,
            error: failure,
            completedAt: new Date().toISOString(),
          })
        );
        return {
          ok: false,
          job: jobRecord,
          error: failure,
          executionTimeMs: Date.now() - startedAt,
          historyRun,
        };
      }
    },
    // One canonical Creative Asset per rendered performance transfer, referencing
    // the parent job, the character identity, the source video, the skill, the
    // recipe, and the provider.
    materializeAssets({ job, normalized, sourceAsset = null, campaign = null }) {
      if (!this.assetStore || !normalized?.video) return [];
      const provider = job.metadata?.provider || job.provider || null;
      const requestId = job.metadata?.requestId || job.requestId || null;
      const workspace = job.metadata?.workspace || job.workspace || "character";
      const aspectRatio = job.metadata?.aspectRatio || job.aspectRatio || "16:9";
      const model = job.metadata?.model || job.model || null;
      const characterOrientation = job.metadata?.characterOrientation || job.characterOrientation || null;
      const characterImage = job.metadata?.characterImage || job.characterImage || null;
      const characterIdentity = job.metadata?.characterIdentity || job.characterIdentity || null;
      const drivingVideo = job.metadata?.drivingVideo || job.drivingVideo || null;
      const sourceAssetId = job.metadata?.sourceAssetId || sourceAsset?.id || null;
      const twinId = job.metadata?.twinId ?? job.twinId ?? null;
      const agentId = job.metadata?.agentId ?? job.agentId ?? null;
      const campaignId = job.metadata?.campaignId || job.campaignId || campaign?.id || null;
      const campaignName = job.metadata?.campaignName || job.campaignName || campaign?.name || null;
      const identityName = characterIdentity?.name || (characterImage ? "Character" : "Character identity");
      const asset = withCampaignMetadata(
        createCreativeAsset({
          id: `recast-${job.id}-${requestId || Date.now()}`,
          title: `Performance Transfer — ${identityName}`,
          description: normalized.providerMetadata?.prompt || "",
          recipe: RECAST_RECIPE_ID,
          provider,
          model,
          requestId,
          aspectRatio,
          generatedFiles: [normalized.video],
          duration: null,
          sourceVideo: drivingVideo,
          parentAsset: sourceAssetId,
          campaignId,
          campaignName,
          createdFromStudio: workspace,
          subtype: "performance transfer",
          tags: [RECAST_SKILL_ID, "character"],
          metadata: {
            assetType: "video",
            subtype: "performance transfer",
            characterImage,
            characterIdentity,
            drivingVideo,
            sourceAssetId,
            parentSourceAssetId: sourceAssetId,
            parentJobId: job.id,
            requestId,
            campaignId,
            createdFromStudio: workspace,
            model,
            aspectRatio,
            characterOrientation,
            skillId: RECAST_SKILL_ID,
            recipeId: RECAST_RECIPE_ID,
            provider,
            twinId,
            agentId,
            workspace,
            videoUrl: normalized.video,
          },
        }),
        campaign,
        workspace
      );
      return [this.assetStore.saveAsset ? this.assetStore.saveAsset(asset) : asset];
    },
    attachToCampaign(campaignId, { jobId, assets }) {
      if (!this.campaignManager) return;
      const campaign = this.campaignManager.getCampaign?.(campaignId);
      const existingJobs = campaign?.metadata?.performanceTransfers || [];
      if (campaign) {
        this.campaignManager.updateCampaign?.(campaignId, {
          metadata: { ...(campaign.metadata || {}), performanceTransfers: [...new Set([...existingJobs, jobId])] },
        });
      }
      for (const asset of assets || []) {
        this.campaignManager.addAsset?.(campaignId, {
          assetId: asset.id,
          role: "performance-transfer",
          video: true,
          status: "draft",
        });
      }
    },
    persistRun(run) {
      return this.historyStore ? this.historyStore(run) : run;
    },
  };
  return runtime;
}

export function createDefaultRecastRuntime(deps) {
  return createRecastRuntime(deps);
}
