// Creative OS — AI Clipping Repurpose Runtime.
//
// Orchestrates the full Creative OS execution path for short-form repurposing:
//
//   Intent → ai-clipping Skill → repurposeVideo Recipe → Creative Intelligence
//   (plan) → Creative Execution Engine (context/job/start/complete/fail) →
//   Provider Registry (operation ai_clipping → MuAPI) → Creative Job →
//   canonical Creative Assets (one per clip) → Campaign → Publishing (discovered
//   via the canonical asset path).
//
// The Video Studio must not call MuAPI directly. The Agent runtime must not
// duplicate clipping logic. The Command Bar only resolves intent and routes
// context. Everyone calls this runtime / job builder.

import { CreativeIntelligenceEngine } from "../intelligence/CreativeIntelligenceEngine.js";
import { CreativeExecutionEngine } from "../intelligence/CreativeExecutionEngine.js";
import { InMemoryExecutionPersistence } from "../intelligence/ExecutionPersistence.js";
import { buildRepurposeRequest, REPURPOSE_RECIPE_ID, REPURPOSE_SKILL_ID } from "./RepurposeJobBuilder.js";
import {
  buildClippingPayload,
  executeClippingThroughRegistry,
  normalizeRepurposeResponse,
  validateRepurposeResult,
} from "./RepurposeProvider.js";
import { createRepurposeRunRecord, saveRepurposeRun } from "./RepurposeHistory.js";
import { normalizeExecutionError } from "../intelligence/ExecutionError.js";
import { createCreativeAsset } from "../intelligence/CreativeAsset.js";
import { withCampaignMetadata } from "../campaigns/campaignAssetMetadata.js";

// Provider executor adapter: the Creative Execution Engine calls
// providerExecutor.execute({ job, context, routing }); this adapter executes the
// ai-clipping operation through the Provider Registry only — never MuAPI directly.
export function createRepurposeProviderExecutor({ providerRegistry, providerId = "muapi" }) {
  return {
    async execute({ job, context, routing }) {
      const metadata = context?.executionMetadata || job?.metadata?.executionMetadata || {};
      const payload = metadata.payload || buildClippingPayload(metadata.inputs || {});
      const raw = await executeClippingThroughRegistry(providerRegistry, {
        apiKey: metadata.apiKey,
        payload,
        providerId: routing?.providerId || metadata.providerId || providerId,
      });
      const normalized = normalizeRepurposeResponse(raw, {
        sourceVideoUrl: payload.video_url,
        aspectRatio: payload.aspect_ratio,
        coordinatesOnly: Boolean(payload.return_coordinates_only),
      });
      return {
        status: "completed",
        providerResponseRef: normalized.requestId || null,
        providerMetadata: { ...(normalized.providerMetadata || {}) },
        outputReferences: normalized.clips.map((clip) => clip.url),
        normalized,
      };
    },
  };
}

export function createRepurposeRuntime({
  providerRegistry,
  intelligence = null,
  execution = null,
  campaignManager = null,
  assetStore = null,
  historyStore = saveRepurposeRun,
  persistence = null,
} = {}) {
  if (!providerRegistry) throw new Error("Repurpose runtime requires a Provider Registry");
  const providerExecutor = createRepurposeProviderExecutor({ providerRegistry });
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
      const request = buildRepurposeRequest(job);
      return intelligenceEngine.plan({
        ...request,
        capabilityRequirements: [
          { id: "video_editing", kind: "required" },
          { id: "highlight_extraction", kind: "required" },
        ],
      });
    },
    // Executes a built repurpose job end-to-end. Returns the run summary.
    async run(job, { apiKey, sourceAsset = null, campaign = null } = {}) {
      const startedAt = Date.now();
      const campaignId = job.campaignId || campaign?.id || null;
      const campaignName = job.campaignName || campaign?.name || null;
      let historyRun = this.persistRun(
        createRepurposeRunRecord({
          requestId: job.requestId,
          status: "pending",
          sourceVideoUrl: job.sourceVideoUrl,
          sourceAssetId: job.sourceAssetId,
          campaignId,
          campaignName,
          twinId: job.twinId,
          agentId: job.agentId,
          workspace: job.workspace,
          aspectRatio: job.aspectRatio,
          numHighlights: job.numHighlights,
          coordinatesOnly: job.coordinatesOnly,
          guidance: job.guidance,
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
            payload: buildClippingPayload(job.inputs),
            twinId: job.twinId,
            agentId: job.agentId,
            workspace: job.workspace,
          },
        });
        jobRecord = this.execution.createJob(context, {
          metadata: {
            sourceAssetId: job.sourceAssetId,
            campaignId,
            twinId: job.twinId,
            agentId: job.agentId,
            workspace: job.workspace,
            provider: job.providerId,
            recipeId: job.recipeId,
            skillId: job.skillId,
            requestId: job.requestId,
            sourceVideoUrl: job.sourceVideoUrl,
            aspectRatio: job.aspectRatio,
          },
        });
        this.execution.queue(jobRecord.id);
        const resultJob = await this.execution.execute(jobRecord.id, { context, routing: context.routing });
        jobRecord = resultJob || jobRecord;
        const result = jobRecord?.result;

        if (jobRecord?.status === "failed" || !result?.success) {
          throw Object.assign(new Error(jobRecord?.error?.message || "Repurpose execution failed"), {
            code: jobRecord?.error?.code,
            cause: jobRecord?.error,
          });
        }

        const normalized = result.providerMetadata?.normalized
          ? result.providerMetadata.normalized
          : normalizeRepurposeResponse(result.providerMetadata || {}, {
              sourceVideoUrl: job.sourceVideoUrl,
              aspectRatio: job.aspectRatio,
              coordinatesOnly: Boolean(job.coordinatesOnly),
            });
        const validation = validateRepurposeResult(normalized);
        if (!validation.valid) {
          throw Object.assign(new Error(validation.error), { code: "malformed_provider_response" });
        }

        // Honest empty state: a completed job with zero clips/coordinates is a
        // valid outcome — never fabricate highlights.
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
          createRepurposeRunRecord({
            job: jobRecord,
            requestId: job.requestId,
            status: "completed",
            sourceVideoUrl: job.sourceVideoUrl,
            sourceAssetId: job.sourceAssetId,
            campaignId,
            campaignName,
            twinId: job.twinId,
            agentId: job.agentId,
            workspace: job.workspace,
            aspectRatio: job.aspectRatio,
            numHighlights: job.numHighlights,
            coordinatesOnly: job.coordinatesOnly,
            guidance: job.guidance,
            providerId: job.providerId,
            clipCount: normalized.clips.length,
            coordinatesCount: normalized.coordinates.length,
            assetIds: materializedAssets.map((asset) => asset.id),
            completedAt: new Date().toISOString(),
          })
        );

        return {
          ok: true,
          job: jobRecord,
          normalized,
          assets: materializedAssets,
          clippedCount: normalized.coordinatesOnly ? normalized.coordinates.length : normalized.clips.length,
          executionTimeMs: Date.now() - startedAt,
          warnings: result.warnings || [],
          historyRun,
        };
      } catch (error) {
        const failure = normalizeExecutionError(error);
        if (jobRecord?.id) jobRecord = this.execution.fail?.(jobRecord.id, failure) || jobRecord;
        historyRun = this.persistRun(
          createRepurposeRunRecord({
            requestId: job.requestId,
            status: "failed",
            sourceVideoUrl: job.sourceVideoUrl,
            sourceAssetId: job.sourceAssetId,
            campaignId,
            campaignName,
            twinId: job.twinId,
            agentId: job.agentId,
            workspace: job.workspace,
            aspectRatio: job.aspectRatio,
            numHighlights: job.numHighlights,
            coordinatesOnly: job.coordinatesOnly,
            guidance: job.guidance,
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
    // One canonical Creative Asset per clip, all referencing the same parent job
    // and source video. Clip payloads live only in the canonical library.
    materializeAssets({ job, normalized, sourceAsset = null, campaign = null }) {
      if (!this.assetStore) return [];
      const clips = normalized.coordinatesOnly ? [] : normalized.clips || [];
      const sourceAssetId = sourceAsset?.id || job.metadata?.sourceAssetId || null;
      const provider = job.metadata?.provider || job.provider || null;
      const requestId = job.metadata?.requestId || job.requestId || null;
      const workspace = job.metadata?.workspace || job.workspace || "video";
      const aspectRatio = job.metadata?.aspectRatio || job.aspectRatio || "9:16";
      const sourceVideoUrl = job.metadata?.sourceVideoUrl || job.sourceVideoUrl || null;
      const twinId = job.metadata?.twinId ?? job.twinId ?? null;
      const agentId = job.metadata?.agentId ?? job.agentId ?? null;
      const campaignId = job.metadata?.campaignId || job.campaignId || campaign?.id || null;
      const campaignName = job.metadata?.campaignName || job.campaignName || campaign?.name || null;
      return clips
        .map((clip, index) => {
          if (!clip || !clip.url) return null;
          const asset = withCampaignMetadata(
            createCreativeAsset({
              id: `clip-${job.id}-${index}-${clip.clipIndex ?? index}`,
              title: clip.title || `Clip ${index + 1}`,
              description: clip.hook || "",
              recipe: REPURPOSE_RECIPE_ID,
              provider,
              model: null,
              requestId,
              aspectRatio: clip.aspectRatio || aspectRatio,
              generatedFiles: [clip.url],
              duration: clip.duration ?? null,
              sourceVideo: sourceVideoUrl,
              parentAsset: sourceAssetId,
              campaignId,
              campaignName,
              createdFromStudio: workspace,
              subtype: "short-form clip",
              tags: [REPURPOSE_SKILL_ID, "short-form"],
              metadata: {
                assetType: "video",
                subtype: "short-form clip",
                parentSourceAssetId: sourceAssetId,
                parentJobId: job.id,
                requestId,
                campaignId,
                createdFromStudio: workspace,
                skillId: REPURPOSE_SKILL_ID,
                recipeId: REPURPOSE_RECIPE_ID,
                provider,
                clipIndex: clip.clipIndex ?? index,
                startTime: clip.startTime,
                endTime: clip.endTime,
                duration: clip.duration ?? null,
                score: clip.score,
                hook: clip.hook,
                viralityReason: clip.viralityReason,
                aspectRatio: clip.aspectRatio || aspectRatio,
                sourceVideoUrl,
                sourceAssetId,
                twinId,
                agentId,
                workspace,
              },
            }),
            campaign,
            workspace
          );
          return this.assetStore.saveAsset ? this.assetStore.saveAsset(asset) : asset;
        })
        .filter(Boolean);
    },
    attachToCampaign(campaignId, { jobId, assets }) {
      if (!this.campaignManager) return;
      const campaign = this.campaignManager.getCampaign?.(campaignId);
      const existingJobs = campaign?.metadata?.repurposeJobs || [];
      if (campaign) {
        this.campaignManager.updateCampaign?.(campaignId, {
          metadata: { ...(campaign.metadata || {}), repurposeJobs: [...new Set([...existingJobs, jobId])] },
        });
      }
      for (const asset of assets || []) {
        this.campaignManager.addAsset?.(campaignId, {
          assetId: asset.id,
          role: "clip",
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

export function createDefaultRepurposeRuntime(deps) {
  return createRepurposeRuntime(deps);
}
