// Creative OS — Character (Character Animation) Runtime.
//
// Orchestrates the same Creative OS execution path as Performance Transfer, but
// for prompt-driven image-to-video:
//
//   Character Studio → character-animation skill → characterAnimation recipe →
//   Creative Intelligence (plan) → Creative Execution Engine (context/job/start/
//   complete/fail) → Provider Registry (operation image_to_video → generateI2V)
//   → Creative Job → canonical Creative Asset → Campaign → Publishing.
//
// Distinct from Performance Transfer: the source is a character identity image
// plus a text motion prompt — no driving video is required or accepted.
//
// Character Studio must not call MuAPI directly. Everyone calls this runtime /
// job builder.

import { CreativeIntelligenceEngine } from "../intelligence/CreativeIntelligenceEngine.js";
import { CreativeExecutionEngine } from "../intelligence/CreativeExecutionEngine.js";
import { InMemoryExecutionPersistence } from "../intelligence/ExecutionPersistence.js";
import { createCreativeAsset } from "../intelligence/CreativeAsset.js";
import { withCampaignMetadata } from "../campaigns/campaignAssetMetadata.js";
import { normalizeExecutionError } from "../intelligence/ExecutionError.js";
import { RECIPE_LIBRARY } from "../intelligence/config.js";
import {
  CHARACTER_ANIMATION_SKILL_ID,
  CHARACTER_ANIMATION_RECIPE_ID,
  CHARACTER_ANIMATION_OPERATION,
  CHARACTER_ANIMATION_PROVIDER_ID,
  CHARACTER_ANIMATION_OUTPUT_SUBTYPE,
} from "./CharacterAnimationConstants.js";

export const CHARACTER_ANIMATION_DEFAULT_MODEL = "kling-v2.1-pro-i2v";

// Builds the image_to_video payload from normalized inputs. `characterImage` maps
// to the model's image field, `prompt` to the motion direction. Model, aspect
// ratio, and duration are passed through as given — nothing is invented.
export function buildCharacterAnimationPayload(input = {}) {
  const characterImage = input.characterImage ?? input.character_image ?? input.image_url;
  if (!characterImage) throw new Error("Character animation requires a character identity image");
  const payload = {
    model: input.model || input.model_id || CHARACTER_ANIMATION_DEFAULT_MODEL,
    image_url: characterImage,
  };
  if (input.prompt) payload.prompt = String(input.prompt).trim();
  if (input.aspectRatio || input.aspect_ratio) payload.aspect_ratio = input.aspectRatio || input.aspect_ratio;
  if (input.duration) payload.duration = input.duration;
  return payload;
}

function stringOrNull(value) {
  return value == null || value === "" ? null : String(value);
}

function extractVideo(raw) {
  if (raw == null || typeof raw !== "object") return null;
  const candidates = [
    raw.url,
    raw.video,
    raw.result_url,
    raw.output?.video,
    raw.output?.url,
    ...(Array.isArray(raw.outputs) ? raw.outputs : []),
    ...(Array.isArray(raw.result?.outputs) ? raw.result.outputs : []),
    ...(Array.isArray(raw.data?.outputs) ? raw.data.outputs : []),
  ];
  for (const candidate of candidates) {
    if (candidate == null) continue;
    const url =
      typeof candidate === "string"
        ? stringOrNull(candidate)
        : stringOrNull(candidate?.url ?? candidate?.src ?? candidate?.video ?? null);
    if (url) return url;
  }
  return null;
}

// Provider executor adapter: the Creative Execution Engine calls
// providerExecutor.execute({ job, context, routing }); this adapter executes the
// image_to_video operation through the Provider Registry only — never MuAPI
// directly.
export function createCharacterAnimationProviderExecutor({ providerRegistry, providerId = CHARACTER_ANIMATION_PROVIDER_ID } = {}) {
  return {
    async execute({ job, context, routing }) {
      const metadata = context?.executionMetadata || job?.metadata?.executionMetadata || {};
      const payload = metadata.payload || buildCharacterAnimationPayload(metadata.inputs || {});
      const provider = providerRegistry.get(routing?.providerId || metadata.providerId || providerId);
      if (!provider?.execute) throw new Error(`Provider ${providerId} does not support generic execution`);
      const raw = await provider.execute({
        operation: CHARACTER_ANIMATION_OPERATION,
        apiKey: metadata.apiKey,
        params: payload,
      });
      const video = extractVideo(raw);
      return {
        status: "completed",
        providerResponseRef: stringOrNull(raw?.request_id ?? raw?.id ?? raw?.prediction_id ?? raw?.requestId ?? null),
        providerMetadata: { ...(raw && typeof raw === "object" ? raw : {}) },
        outputReferences: video ? [video] : [],
      };
    },
  };
}

// Builds the normalized Character Animation job skeleton shared by the studio
// and intent/agent/twin callers. Provider is resolved from the recipe config.
export function buildCharacterAnimationJob({
  characterImage = null,
  characterIdentity = null,
  prompt = null,
  model = null,
  aspectRatio = null,
  duration = null,
  campaignId = null,
  campaignName = null,
  twinId = null,
  twinName = null,
  agentId = null,
  agentName = null,
  workspace = "character",
  recipeId = CHARACTER_ANIMATION_RECIPE_ID,
  skillId = CHARACTER_ANIMATION_SKILL_ID,
  providerId = null,
} = {}) {
  if (!characterImage) throw new Error("Character animation requires a character identity image");
  const recipe = RECIPE_LIBRARY[recipeId] || RECIPE_LIBRARY[CHARACTER_ANIMATION_RECIPE_ID];
  const resolvedProvider = providerId || recipe?.providerId || CHARACTER_ANIMATION_PROVIDER_ID;
  const resolvedModel = model || CHARACTER_ANIMATION_DEFAULT_MODEL;
  const requestId = `request-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    requestId,
    characterImage,
    characterIdentity: characterIdentity && typeof characterIdentity === "object" ? { ...characterIdentity } : null,
    recipeId: recipe?.id || CHARACTER_ANIMATION_RECIPE_ID,
    recipe: recipe || null,
    skillId,
    providerId: resolvedProvider,
    provider: resolvedProvider,
    model: resolvedModel,
    aspectRatio: aspectRatio || null,
    duration: duration || null,
    prompt: prompt ? String(prompt).trim() : null,
    campaignId,
    campaignName,
    twinId,
    twinName,
    agentId,
    agentName,
    workspace,
    inputs: {
      characterImage,
      characterIdentity: characterIdentity && typeof characterIdentity === "object" ? { ...characterIdentity } : null,
      model: resolvedModel,
      aspectRatio: aspectRatio || null,
      duration: duration || null,
      prompt: prompt ? String(prompt).trim() : null,
    },
    metadata: {
      characterImage,
      characterIdentity: characterIdentity && typeof characterIdentity === "object" ? { ...characterIdentity } : null,
      campaignId,
      twinId,
      agentId,
      workspace,
      provider: resolvedProvider,
      recipeId: recipe?.id || CHARACTER_ANIMATION_RECIPE_ID,
      skillId,
      model: resolvedModel,
      aspectRatio: aspectRatio || null,
      duration: duration || null,
    },
  };
}

// Builds the Creative Request the Creative Intelligence Engine plans against.
export function buildCharacterAnimationRequest(job) {
  return {
    requestId: job.requestId,
    recipeId: job.recipeId,
    intent:
      job.prompt ||
      (job.characterIdentity?.name
        ? `Animate the character identity ${job.characterIdentity.name}`
        : "Animate a character identity"),
    campaignId: job.campaignId,
    studioId: job.workspace,
    inputs: { ...job.inputs },
    references: [job.characterImage].filter(Boolean),
    output: {
      modality: "video",
      subtype: CHARACTER_ANIMATION_OUTPUT_SUBTYPE,
      aspectRatio: job.aspectRatio,
    },
    preferences: {},
    metadata: {
      characterIdentity: job.characterIdentity,
      campaignId: job.campaignId,
      twinId: job.twinId,
      agentId: job.agentId,
      workspace: job.workspace,
      provider: job.providerId,
      recipeId: job.recipeId,
      skillId: job.skillId,
      model: job.model,
      aspectRatio: job.aspectRatio,
      duration: job.duration,
    },
  };
}

export function createCharacterAnimationRuntime({
  providerRegistry,
  intelligence = null,
  execution = null,
  campaignManager = null,
  assetStore = null,
} = {}) {
  if (!providerRegistry) throw new Error("Character animation runtime requires a Provider Registry");
  const providerExecutor = createCharacterAnimationProviderExecutor({ providerRegistry });
  const intelligenceEngine = intelligence || new CreativeIntelligenceEngine();
  const executionEngine = execution || new CreativeExecutionEngine({
    persistence: new InMemoryExecutionPersistence(),
    providerExecutor,
  });
  if (!executionEngine.providerExecutor) executionEngine.providerExecutor = providerExecutor;

  const runtime = {
    intelligence: intelligenceEngine,
    execution: executionEngine,
    campaignManager,
    assetStore,
    plan(job) {
      const request = buildCharacterAnimationRequest(job);
      return intelligenceEngine.plan({ ...request });
    },
    async run(job, { apiKey, campaign = null } = {}) {
      const startedAt = Date.now();
      const campaignId = job.campaignId || campaign?.id || null;
      const campaignName = job.campaignName || campaign?.name || null;
      let jobRecord = null;
      try {
        const plan = this.plan(job);
        const context = this.execution.createExecutionContext(plan, {
          metadata: {
            apiKey,
            providerId: job.providerId,
            inputs: { ...job.inputs },
            payload: buildCharacterAnimationPayload(job.inputs),
            twinId: job.twinId,
            agentId: job.agentId,
            workspace: job.workspace,
          },
        });
        jobRecord = this.execution.createJob(context, {
          metadata: {
            characterImage: job.characterImage,
            characterIdentity: job.characterIdentity,
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
            duration: job.duration,
          },
        });
        this.execution.queue(jobRecord.id);
        const resultJob = await this.execution.execute(jobRecord.id, { context, routing: context.routing });
        jobRecord = resultJob || jobRecord;
        const result = jobRecord?.result;

        if (jobRecord?.status === "failed" || !result?.success) {
          throw Object.assign(new Error(jobRecord?.error?.message || "Character animation execution failed"), {
            code: jobRecord?.error?.code,
            cause: jobRecord?.error,
          });
        }

        const raw = result.providerMetadata || {};
        const video = extractVideo(raw);
        const requestId = stringOrNull(raw?.request_id ?? raw?.id ?? raw?.prediction_id ?? result.providerResponseRef ?? null);

        const materializedAssets = this.materializeAssets({
          job: jobRecord,
          video,
          requestId,
          campaign,
        });

        if (campaignId && this.campaignManager) {
          this.attachToCampaign(campaignId, { jobId: jobRecord.id, assets: materializedAssets });
        }

        return {
          ok: true,
          job: jobRecord,
          video,
          requestId,
          assets: materializedAssets,
          executionTimeMs: Date.now() - startedAt,
          warnings: result.warnings || [],
        };
      } catch (error) {
        const failure = normalizeExecutionError(error);
        if (jobRecord?.id) jobRecord = this.execution.fail?.(jobRecord.id, failure) || jobRecord;
        return {
          ok: false,
          job: jobRecord,
          error: failure,
          executionTimeMs: Date.now() - startedAt,
        };
      }
    },
    // One canonical Creative Asset per rendered Character Animation, referencing
    // the parent job, the character identity, the skill, the recipe, and the
    // provider. Honest empty state: a completed job with no rendered video is a
    // valid outcome — never fabricate a video.
    materializeAssets({ job, video, requestId = null, campaign = null }) {
      if (!this.assetStore || !video) return [];
      const provider = job.metadata?.provider || job.provider || null;
      const workspace = job.metadata?.workspace || job.workspace || "character";
      const aspectRatio = job.metadata?.aspectRatio || job.aspectRatio || null;
      const duration = job.metadata?.duration || job.duration || null;
      const model = job.metadata?.model || job.model || null;
      const characterImage = job.metadata?.characterImage || job.characterImage || null;
      const characterIdentity = job.metadata?.characterIdentity || job.characterIdentity || null;
      const campaignId = job.metadata?.campaignId || job.campaignId || campaign?.id || null;
      const campaignName = job.metadata?.campaignName || job.campaignName || campaign?.name || null;
      const twinId = job.metadata?.twinId ?? job.twinId ?? null;
      const agentId = job.metadata?.agentId ?? job.agentId ?? null;
      const identityName = characterIdentity?.name || (characterImage ? "Character" : "Character identity");
      const asset = withCampaignMetadata(
        createCreativeAsset({
          id: `character-animation-${job.id}-${requestId || Date.now()}`,
          title: `Character Animation — ${identityName}`,
          description: job.prompt || "",
          recipe: CHARACTER_ANIMATION_RECIPE_ID,
          provider,
          model,
          requestId,
          aspectRatio,
          duration,
          generatedFiles: [video],
          parentAsset: null,
          campaignId,
          campaignName,
          createdFromStudio: workspace,
          subtype: CHARACTER_ANIMATION_OUTPUT_SUBTYPE,
          tags: [CHARACTER_ANIMATION_SKILL_ID, "character"],
          metadata: {
            assetType: "video",
            subtype: CHARACTER_ANIMATION_OUTPUT_SUBTYPE,
            characterImage,
            characterIdentity,
            sourceImage: characterImage,
            parentJobId: job.id,
            requestId,
            campaignId,
            createdFromStudio: workspace,
            model,
            aspectRatio,
            duration,
            skillId: CHARACTER_ANIMATION_SKILL_ID,
            recipeId: CHARACTER_ANIMATION_RECIPE_ID,
            provider,
            twinId,
            agentId,
            workspace,
            videoUrl: video,
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
      const existingJobs = campaign?.metadata?.characterAnimations || [];
      if (campaign) {
        this.campaignManager.updateCampaign?.(campaignId, {
          metadata: { ...(campaign.metadata || {}), characterAnimations: [...new Set([...existingJobs, jobId])] },
        });
      }
      for (const asset of assets || []) {
        this.campaignManager.addAsset?.(campaignId, {
          assetId: asset.id,
          role: "character-animation",
          video: true,
          status: "draft",
        });
      }
    },
  };
  return runtime;
}

export function createDefaultCharacterAnimationRuntime(deps) {
  return createCharacterAnimationRuntime(deps);
}
