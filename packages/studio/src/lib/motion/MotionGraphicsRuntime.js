// Creative OS — Motion Graphics Runtime.
//
// Orchestrates the full Creative OS execution path for motion graphics:
//
//   Workflow Template → vibe-motion Skill → motionGraphics Recipe → Creative
//   Intelligence (plan) → Creative Execution Engine (context/job/start/complete/
//   fail) → Provider Registry (operation motion_graphics → MuAPI) → Creative
//   Job → canonical Creative Asset → Campaign → Publishing (discovered via the
//   canonical asset path).
//
// Marketing Studio must not call MuAPI directly. The Agent runtime must not
// duplicate motion logic. The AI Twin must not duplicate motion logic. The
// Command Bar only resolves intent and routes context. Everyone calls this
// runtime / job builder.

import { CreativeIntelligenceEngine } from "../intelligence/CreativeIntelligenceEngine.js";
import { CreativeExecutionEngine } from "../intelligence/CreativeExecutionEngine.js";
import { InMemoryExecutionPersistence } from "../intelligence/ExecutionPersistence.js";
import { buildMotionJob, buildMotionRequest } from "./MotionJobBuilder.js";
import { MOTION_RECIPE_ID, MOTION_SKILL_ID } from "./MotionConstants.js";
import {
  buildMotionPrompt,
  buildMotionPayload,
  buildMotionEditPayload,
  executeMotionThroughRegistry,
  executeMotionEditThroughRegistry,
  normalizeMotionResponse,
  validateMotionResult,
} from "./MotionProvider.js";
import { createMotionRunRecord, saveMotionRun } from "./MotionHistory.js";
import { normalizeExecutionError } from "../intelligence/ExecutionError.js";
import { createCreativeAsset } from "../intelligence/CreativeAsset.js";
import { withCampaignMetadata } from "../campaigns/campaignAssetMetadata.js";

// Provider executor adapter: the Creative Execution Engine calls
// providerExecutor.execute({ job, context, routing }); this adapter executes the
// motion-graphics (or motion-graphics-edit) operation through the Provider
// Registry only — never MuAPI directly.
export function createMotionProviderExecutor({ providerRegistry, providerId = "muapi" }) {
  return {
    async execute({ job, context, routing }) {
      const metadata = context?.executionMetadata || job?.metadata?.executionMetadata || {};
      const inputs = metadata.inputs || {};
      const editMode = Boolean(metadata.editMode ?? inputs.sourceRequestId ?? inputs.sourceRequestId);
      const payload = editMode
        ? buildMotionEditPayload({
            requestId: inputs.sourceRequestId || inputs.requestId,
            prompt: metadata.prompt,
            aspectRatio: inputs.aspectRatio,
            durationSeconds: inputs.durationSeconds,
          })
        : buildMotionPayload(inputs, {
            aspectRatio: inputs.aspectRatio,
            durationSeconds: inputs.durationSeconds,
          });
      const raw = editMode
        ? await executeMotionEditThroughRegistry(providerRegistry, {
            apiKey: metadata.apiKey,
            payload,
            providerId: routing?.providerId || metadata.providerId || providerId,
          })
        : await executeMotionThroughRegistry(providerRegistry, {
            apiKey: metadata.apiKey,
            payload,
            providerId: routing?.providerId || metadata.providerId || providerId,
          });
      const normalized = normalizeMotionResponse(raw);
      return {
        status: "completed",
        providerResponseRef: normalized.requestId || null,
        providerMetadata: { ...(normalized.providerMetadata || {}), normalized },
        outputReferences: normalized.video ? [normalized.video] : [],
      };
    },
  };
}

export function createMotionGraphicsRuntime({
  providerRegistry,
  intelligence = null,
  execution = null,
  campaignManager = null,
  assetStore = null,
  historyStore = saveMotionRun,
  persistence = null,
} = {}) {
  if (!providerRegistry) throw new Error("Motion Graphics runtime requires a Provider Registry");
  const providerExecutor = createMotionProviderExecutor({ providerRegistry });
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
      const request = buildMotionRequest(job);
      return intelligenceEngine.plan({
        ...request,
        capabilityRequirements: [{ id: "motion_graphics", kind: "required" }],
      });
    },
    // Executes a built motion job end-to-end. Returns the run summary.
    async run(job, { apiKey, campaign = null } = {}) {
      const startedAt = Date.now();
      const campaignId = job.campaignId || campaign?.id || null;
      const campaignName = job.campaignName || campaign?.name || null;
      let historyRun = this.persistRun(
        createMotionRunRecord({
          requestId: job.requestId,
          status: "pending",
          templateId: job.templateId,
          sourceRequestId: job.sourceRequestId,
          campaignId,
          campaignName,
          twinId: job.twinId,
          agentId: job.agentId,
          workspace: job.workspace,
          aspectRatio: job.aspectRatio,
          durationSeconds: job.durationSeconds,
          providerId: job.providerId,
        })
      );
      let jobRecord = null;
      try {
        const plan = this.plan(job);
        const prompt = buildMotionPrompt({ template: job.template, inputs: job.inputs, prompt: job.prompt });
        const context = this.execution.createExecutionContext(plan, {
          metadata: {
            apiKey,
            providerId: job.providerId,
            inputs: { ...job.inputs, prompt },
            payload: {
              prompt,
              aspect_ratio: job.aspectRatio,
              duration_seconds: job.durationSeconds,
            },
            editMode: job.editMode,
            prompt,
            twinId: job.twinId,
            agentId: job.agentId,
            workspace: job.workspace,
          },
        });
        jobRecord = this.execution.createJob(context, {
          metadata: {
            templateId: job.templateId,
            campaignId,
            twinId: job.twinId,
            agentId: job.agentId,
            workspace: job.workspace,
            provider: job.providerId,
            recipeId: job.recipeId,
            skillId: job.skillId,
            requestId: job.requestId,
            sourceRequestId: job.sourceRequestId,
            aspectRatio: job.aspectRatio,
            durationSeconds: job.durationSeconds,
          },
        });
        this.execution.queue(jobRecord.id);
        const resultJob = await this.execution.execute(jobRecord.id, { context, routing: context.routing });
        jobRecord = resultJob || jobRecord;
        const result = jobRecord?.result;

        if (jobRecord?.status === "failed" || !result?.success) {
          throw Object.assign(new Error(jobRecord?.error?.message || "Motion graphics execution failed"), {
            code: jobRecord?.error?.code,
            cause: jobRecord?.error,
          });
        }

        const normalized = result.providerMetadata?.normalized
          ? result.providerMetadata.normalized
          : normalizeMotionResponse(result.providerMetadata || {});
        const validation = validateMotionResult(normalized);
        if (!validation.valid) {
          throw Object.assign(new Error(validation.error), { code: "malformed_provider_response" });
        }

        // Honest empty state: a completed job with no rendered video is a valid
        // outcome — never fabricate a video.
        const materializedAssets = this.materializeAssets({
          job: jobRecord,
          normalized,
          campaign,
        });

        if (campaignId && this.campaignManager) {
          this.attachToCampaign(campaignId, { jobId: jobRecord.id, assets: materializedAssets });
        }

        historyRun = this.persistRun(
          createMotionRunRecord({
            job: jobRecord,
            requestId: job.requestId,
            status: "completed",
            templateId: job.templateId,
            sourceRequestId: job.sourceRequestId,
            campaignId,
            campaignName,
            twinId: job.twinId,
            agentId: job.agentId,
            workspace: job.workspace,
            aspectRatio: job.aspectRatio,
            durationSeconds: job.durationSeconds,
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
          createMotionRunRecord({
            requestId: job.requestId,
            status: "failed",
            templateId: job.templateId,
            sourceRequestId: job.sourceRequestId,
            campaignId,
            campaignName,
            twinId: job.twinId,
            agentId: job.agentId,
            workspace: job.workspace,
            aspectRatio: job.aspectRatio,
            durationSeconds: job.durationSeconds,
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
    // One canonical Creative Asset per rendered motion graphic, referencing the
    // parent job, the workflow template, the skill, the recipe, and the provider.
    materializeAssets({ job, normalized, campaign = null }) {
      if (!this.assetStore || !normalized?.video) return [];
      const provider = job.metadata?.provider || job.provider || null;
      const requestId = job.metadata?.requestId || job.requestId || null;
      const workspace = job.metadata?.workspace || job.workspace || "marketing";
      const aspectRatio = job.metadata?.aspectRatio || job.aspectRatio || "16:9";
      const durationSeconds = job.metadata?.durationSeconds ?? job.durationSeconds ?? null;
      const templateId = job.metadata?.templateId || job.templateId || null;
      const sourceRequestId = job.metadata?.sourceRequestId || job.sourceRequestId || null;
      const twinId = job.metadata?.twinId ?? job.twinId ?? null;
      const agentId = job.metadata?.agentId ?? job.agentId ?? null;
      const campaignId = job.metadata?.campaignId || job.campaignId || campaign?.id || null;
      const campaignName = job.metadata?.campaignName || job.campaignName || campaign?.name || null;
      const asset = withCampaignMetadata(
        createCreativeAsset({
          id: `motion-${job.id}-${requestId || Date.now()}`,
          title: templateId ? `Motion Graphic — ${templateId}` : "Motion Graphic",
          description: normalized.providerMetadata?.prompt || "",
          recipe: MOTION_RECIPE_ID,
          provider,
          model: null,
          requestId,
          aspectRatio,
          generatedFiles: [normalized.video],
          thumbnails: normalized.preview ? [normalized.preview] : [],
          duration: durationSeconds,
          campaignId,
          campaignName,
          createdFromStudio: workspace,
          subtype: "motion graphic",
          tags: [MOTION_SKILL_ID, "motion"],
          metadata: {
            assetType: "video",
            subtype: "motion graphic",
            templateId,
            skillId: MOTION_SKILL_ID,
            recipeId: MOTION_RECIPE_ID,
            provider,
            requestId,
            sourceRequestId,
            parentJobId: job.id,
            campaignId,
            createdFromStudio: workspace,
            durationSeconds,
            aspectRatio,
            twinId,
            agentId,
            workspace,
            videoUrl: normalized.video,
            previewUrl: normalized.preview || null,
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
      const existingJobs = campaign?.metadata?.motionJobs || [];
      if (campaign) {
        this.campaignManager.updateCampaign?.(campaignId, {
          metadata: { ...(campaign.metadata || {}), motionJobs: [...new Set([...existingJobs, jobId])] },
        });
      }
      for (const asset of assets || []) {
        this.campaignManager.addAsset?.(campaignId, {
          assetId: asset.id,
          role: "motion",
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

export function createDefaultMotionGraphicsRuntime(deps) {
  return createMotionGraphicsRuntime(deps);
}
