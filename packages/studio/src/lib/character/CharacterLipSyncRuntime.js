// Creative OS — Character (Talking Avatar + Lip Sync) Runtime.
//
// ONE shared runtime for the two lip-sync Character capabilities, mirroring the
// Creative OS execution/materialization path already used by Performance
// Transfer and Character Animation:
//
//   Character Studio → character skill → talkingAvatar / characterLipSync recipe
//   → Creative Intelligence (plan) → Creative Execution Engine → Provider
//   Registry (operation lip_sync → processLipSync) → Creative Job → canonical
//   Creative Asset → Campaign → Publishing.
//
// The runtime accepts a mode/input shape that resolves to either:
//   TALKING AVATAR: { image_url, audio_url, model, ... }
//   LIP SYNC:       { video_url, audio_url, model, ... }
//
// Talking Avatar and Character Lip Sync execute the SAME lip_sync provider
// operation; there is deliberately no second provider runtime.

import { CreativeIntelligenceEngine } from "../intelligence/CreativeIntelligenceEngine.js";
import { CreativeExecutionEngine } from "../intelligence/CreativeExecutionEngine.js";
import { InMemoryExecutionPersistence } from "../intelligence/ExecutionPersistence.js";
import { createCreativeAsset } from "../intelligence/CreativeAsset.js";
import { withCampaignMetadata } from "../campaigns/campaignAssetMetadata.js";
import { normalizeExecutionError } from "../intelligence/ExecutionError.js";
import { RECIPE_LIBRARY } from "../intelligence/config.js";
import {
  TALKING_AVATAR_SKILL_ID,
  TALKING_AVATAR_RECIPE_ID,
  TALKING_AVATAR_OUTPUT_SUBTYPE,
  CHARACTER_LIPSYNC_SKILL_ID,
  CHARACTER_LIPSYNC_RECIPE_ID,
  CHARACTER_LIPSYNC_OUTPUT_SUBTYPE,
  CHARACTER_LIPSYNC_OPERATION,
  CHARACTER_LIPSYNC_PROVIDER_ID,
} from "./CharacterLipSyncConstants.js";

export const TALKING_AVATAR_MODE = "talking-avatar";
export const CHARACTER_LIP_SYNC_MODE = "lip-sync";

export const CHARACTER_LIPSYNC_DEFAULT_MODEL = "infinitetalk-image-to-video";

const stringOrNull = (value) => (value == null || value === "" ? null : String(value));

function resolveModeDefaults(mode) {
  return mode === CHARACTER_LIP_SYNC_MODE
    ? { recipeId: CHARACTER_LIPSYNC_RECIPE_ID, skillId: CHARACTER_LIPSYNC_SKILL_ID, subtype: CHARACTER_LIPSYNC_OUTPUT_SUBTYPE }
    : { recipeId: TALKING_AVATAR_RECIPE_ID, skillId: TALKING_AVATAR_SKILL_ID, subtype: TALKING_AVATAR_OUTPUT_SUBTYPE };
}

// Builds the MuAPI lip_sync payload from normalized inputs. The media field is
// resolved by mode: image_url for Talking Avatar, video_url for Lip Sync —
// audio_url is always required. Model and resolution are passed through as
// given — nothing is invented.
export function buildCharacterLipSyncPayload(input = {}) {
  const mode = input.mode === CHARACTER_LIP_SYNC_MODE ? CHARACTER_LIP_SYNC_MODE : TALKING_AVATAR_MODE;
  const audioUrl = stringOrNull(input.audioUrl ?? input.audio_url);
  const imageUrl = stringOrNull(input.characterImage ?? input.imageUrl ?? input.image_url);
  const videoUrl = stringOrNull(input.videoUrl ?? input.video_url);
  if (!audioUrl) throw new Error("Character lip sync requires an audio track");
  if (mode === CHARACTER_LIP_SYNC_MODE && !videoUrl) {
    throw new Error("Character lip sync requires a source video");
  }
  if (mode === TALKING_AVATAR_MODE && !imageUrl) {
    throw new Error("Talking Avatar requires a character identity image");
  }
  const payload = {
    model: input.model || input.model_id || CHARACTER_LIPSYNC_DEFAULT_MODEL,
    audio_url: audioUrl,
  };
  if (mode === CHARACTER_LIP_SYNC_MODE) payload.video_url = videoUrl;
  else payload.image_url = imageUrl;
  if (input.prompt) payload.prompt = String(input.prompt).trim();
  if (input.resolution) payload.resolution = input.resolution;
  return payload;
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
// lip_sync operation through the Provider Registry only — never MuAPI directly.
export function createCharacterLipSyncProviderExecutor({ providerRegistry, providerId = CHARACTER_LIPSYNC_PROVIDER_ID } = {}) {
  return {
    async execute({ job, context, routing }) {
      const metadata = context?.executionMetadata || job?.metadata?.executionMetadata || {};
      const payload = metadata.payload || buildCharacterLipSyncPayload(metadata.inputs || {});
      const provider = providerRegistry.get(routing?.providerId || metadata.providerId || providerId);
      if (!provider?.execute) throw new Error(`Provider ${providerId} does not support generic execution`);
      const raw = await provider.execute({
        operation: CHARACTER_LIPSYNC_OPERATION,
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

// Builds the normalized Character lip-sync job skeleton shared by the studios
// and intent/agent/twin callers. Provider is resolved from the recipe config.
export function buildCharacterLipSyncJob({
  mode = TALKING_AVATAR_MODE,
  characterImage = null,
  characterIdentity = null,
  videoUrl = null,
  sourceName = null,
  audioUrl = null,
  prompt = null,
  model = null,
  resolution = null,
  campaignId = null,
  campaignName = null,
  twinId = null,
  twinName = null,
  agentId = null,
  agentName = null,
  workspace = "character",
  recipeId = null,
  skillId = null,
  providerId = null,
} = {}) {
  if (!audioUrl) throw new Error("Character lip sync requires an audio track");
  if (mode === CHARACTER_LIP_SYNC_MODE && !videoUrl) throw new Error("Character lip sync requires a source video");
  if (mode !== CHARACTER_LIP_SYNC_MODE && !characterImage) {
    throw new Error("Talking Avatar requires a character identity image");
  }
  const defaults = resolveModeDefaults(mode);
  const recipe = RECIPE_LIBRARY[recipeId || defaults.recipeId] || RECIPE_LIBRARY[defaults.recipeId];
  const resolvedProvider = providerId || recipe?.providerId || CHARACTER_LIPSYNC_PROVIDER_ID;
  const requestId = `request-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    requestId,
    mode,
    characterImage: mode === CHARACTER_LIP_SYNC_MODE ? null : characterImage,
    characterIdentity: characterIdentity && typeof characterIdentity === "object" ? { ...characterIdentity } : null,
    videoUrl: mode === CHARACTER_LIP_SYNC_MODE ? videoUrl : null,
    sourceName: sourceName ? String(sourceName) : null,
    audioUrl,
    recipeId: recipe?.id || defaults.recipeId,
    recipe: recipe || null,
    skillId: skillId || defaults.skillId,
    subtype: defaults.subtype,
    providerId: resolvedProvider,
    provider: resolvedProvider,
    model: model || CHARACTER_LIPSYNC_DEFAULT_MODEL,
    resolution: resolution || null,
    prompt: prompt ? String(prompt).trim() : null,
    campaignId,
    campaignName,
    twinId,
    twinName,
    agentId,
    agentName,
    workspace,
    inputs: {
      mode,
      characterImage: mode === CHARACTER_LIP_SYNC_MODE ? null : characterImage,
      characterIdentity: characterIdentity && typeof characterIdentity === "object" ? { ...characterIdentity } : null,
      videoUrl: mode === CHARACTER_LIP_SYNC_MODE ? videoUrl : null,
      audioUrl,
      model: model || CHARACTER_LIPSYNC_DEFAULT_MODEL,
      resolution: resolution || null,
      prompt: prompt ? String(prompt).trim() : null,
    },
    metadata: {
      mode,
      characterImage: mode === CHARACTER_LIP_SYNC_MODE ? null : characterImage,
      characterIdentity: characterIdentity && typeof characterIdentity === "object" ? { ...characterIdentity } : null,
      videoUrl: mode === CHARACTER_LIP_SYNC_MODE ? videoUrl : null,
      audioUrl,
      campaignId,
      twinId,
      agentId,
      workspace,
      provider: resolvedProvider,
      recipeId: recipe?.id || defaults.recipeId,
      skillId: skillId || defaults.skillId,
      model: model || CHARACTER_LIPSYNC_DEFAULT_MODEL,
      resolution: resolution || null,
    },
  };
}

// Builds the Creative Request the Creative Intelligence Engine plans against.
export function buildCharacterLipSyncRequest(job) {
  return {
    requestId: job.requestId,
    recipeId: job.recipeId,
    intent:
      job.prompt ||
      (job.mode === CHARACTER_LIP_SYNC_MODE
        ? "Synchronize lip movement to an audio track"
        : job.characterIdentity?.name
          ? `Make the character identity ${job.characterIdentity.name} speak`
          : "Make a character identity speak"),
    campaignId: job.campaignId,
    studioId: job.workspace,
    inputs: { ...job.inputs },
    references: [
      ...(job.characterImage ? [job.characterImage] : []),
      ...(job.videoUrl ? [job.videoUrl] : []),
      job.audioUrl,
    ].filter(Boolean),
    output: {
      modality: "video",
      subtype: job.subtype,
    },
    preferences: {},
    metadata: {
      mode: job.mode,
      characterIdentity: job.characterIdentity,
      audioUrl: job.audioUrl,
      campaignId: job.campaignId,
      twinId: job.twinId,
      agentId: job.agentId,
      workspace: job.workspace,
      provider: job.providerId,
      recipeId: job.recipeId,
      skillId: job.skillId,
      model: job.model,
      resolution: job.resolution,
    },
  };
}

export function createCharacterLipSyncRuntime({
  providerRegistry,
  intelligence = null,
  execution = null,
  campaignManager = null,
  assetStore = null,
} = {}) {
  if (!providerRegistry) throw new Error("Character lip sync runtime requires a Provider Registry");
  const providerExecutor = createCharacterLipSyncProviderExecutor({ providerRegistry });
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
      const request = buildCharacterLipSyncRequest(job);
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
            payload: buildCharacterLipSyncPayload(job.inputs),
            twinId: job.twinId,
            agentId: job.agentId,
            workspace: job.workspace,
          },
        });
        jobRecord = this.execution.createJob(context, {
          metadata: {
            mode: job.mode,
            characterImage: job.characterImage,
            characterIdentity: job.characterIdentity,
            videoUrl: job.videoUrl,
            sourceName: job.sourceName,
            audioUrl: job.audioUrl,
            campaignId,
            twinId: job.twinId,
            agentId: job.agentId,
            workspace: job.workspace,
            provider: job.providerId,
            recipeId: job.recipeId,
            skillId: job.skillId,
            requestId: job.requestId,
            model: job.model,
            resolution: job.resolution,
          },
        });
        this.execution.queue(jobRecord.id);
        const resultJob = await this.execution.execute(jobRecord.id, { context, routing: context.routing });
        jobRecord = resultJob || jobRecord;
        const result = jobRecord?.result;

        if (jobRecord?.status === "failed" || !result?.success) {
          throw Object.assign(new Error(jobRecord?.error?.message || "Character lip sync execution failed"), {
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
    // One canonical Creative Asset per rendered talking avatar / lip-synced
    // video, referencing the parent job, the media inputs, the skill, the
    // recipe, and the provider. Honest empty state: a completed job with no
    // rendered video is a valid outcome — never fabricate a video.
    materializeAssets({ job, video, requestId = null, campaign = null }) {
      if (!this.assetStore || !video) return [];
      const mode = job.metadata?.mode || job.mode || TALKING_AVATAR_MODE;
      const subtype = job.metadata?.subtype || job.subtype || resolveModeDefaults(mode).subtype;
      const provider = job.metadata?.provider || job.provider || null;
      const workspace = job.metadata?.workspace || job.workspace || "character";
      const model = job.metadata?.model || job.model || null;
      const resolution = job.metadata?.resolution || job.resolution || null;
      const characterImage = job.metadata?.characterImage || job.characterImage || null;
      const characterIdentity = job.metadata?.characterIdentity || job.characterIdentity || null;
      const videoUrl = job.metadata?.videoUrl || job.videoUrl || null;
      const audioUrl = job.metadata?.audioUrl || job.audioUrl || null;
      const sourceName = job.metadata?.sourceName || job.sourceName || null;
      const campaignId = job.metadata?.campaignId || job.campaignId || campaign?.id || null;
      const campaignName = job.metadata?.campaignName || job.campaignName || campaign?.name || null;
      const twinId = job.metadata?.twinId ?? job.twinId ?? null;
      const agentId = job.metadata?.agentId ?? job.agentId ?? null;
      const skillId = job.metadata?.skillId || job.skillId || resolveModeDefaults(mode).skillId;
      const recipeId = job.metadata?.recipeId || job.recipeId || resolveModeDefaults(mode).recipeId;
      const identityName = characterIdentity?.name || (characterImage ? "Character" : null);
      const title =
        mode === CHARACTER_LIP_SYNC_MODE
          ? `Lip Sync — ${sourceName || "Video"}`
          : `Talking Avatar — ${identityName || "Character"}`;
      const asset = withCampaignMetadata(
        createCreativeAsset({
          id: `character-lipsync-${job.id}-${requestId || Date.now()}`,
          title,
          description: job.prompt || "",
          recipe: recipeId,
          provider,
          model,
          requestId,
          generatedFiles: [video],
          aspectRatio: null,
          duration: null,
          sourceVideo: videoUrl,
          parentAsset: null,
          campaignId,
          campaignName,
          createdFromStudio: workspace,
          subtype,
          tags: [skillId, "character"],
          metadata: {
            assetType: "video",
            subtype,
            mode,
            characterImage,
            characterIdentity,
            sourceVideo: videoUrl,
            audioUrl,
            parentJobId: job.id,
            requestId,
            campaignId,
            createdFromStudio: workspace,
            model,
            resolution,
            skillId,
            recipeId,
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
      const existingJobs = campaign?.metadata?.characterLipSyncs || [];
      if (campaign) {
        this.campaignManager.updateCampaign?.(campaignId, {
          metadata: { ...(campaign.metadata || {}), characterLipSyncs: [...new Set([...existingJobs, jobId])] },
        });
      }
      for (const asset of assets || []) {
        this.campaignManager.addAsset?.(campaignId, {
          assetId: asset.id,
          role: "character-lip-sync",
          video: true,
          status: "draft",
        });
      }
    },
  };
  return runtime;
}

export function createDefaultCharacterLipSyncRuntime(deps) {
  return createCharacterLipSyncRuntime(deps);
}
