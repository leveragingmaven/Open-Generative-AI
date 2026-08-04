// Creative OS — shared performance-transfer job builder.
//
// Single implementation of the recast job skeleton used by every caller:
// Character Studio (Performance Transfer), the Command Bar / Intent Router,
// Agents, and the AI Twin. Nobody duplicates the recast logic; everyone builds
// the same job through this module, which resolves the recipe
// (performanceTransfer), the skill (recast), and the provider (from recipe
// config — never chosen by the Command Bar).
//
// The character identity is always a Creative OS identity source — a preset
// influencer, an AI Twin likeness, or a temporary upload — never a made-up
// likeness.

import { RECIPE_LIBRARY } from "../intelligence/config.js";
import { getSkill } from "../skills/index.js";
import { RECAST_RECIPE_ID, RECAST_SKILL_ID, RECAST_PROVIDER_ID } from "./RecastConstants.js";

export const RECAST_ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:5", "4:3", "3:4", "21:9"];
export const RECAST_DEFAULT_MODEL = "kling-v3.0-pro-recast";

export function getRecastRecipe() {
  return RECIPE_LIBRARY[RECAST_RECIPE_ID] || null;
}

export function getRecastSkill() {
  try {
    return getSkill(RECAST_SKILL_ID);
  } catch {
    return null;
  }
}

// Builds the normalized performance-transfer job skeleton shared by studio /
// agent / twin / intent. Provider is resolved from the recipe config; the caller
// may override provider for provider configuration. Throws when the driving
// video or the character identity image is missing.
export function buildRecastJob({
  characterImage = null,
  characterIdentity = null,
  drivingVideo = null,
  sourceAssetId = null,
  model = null,
  aspectRatio = null,
  characterOrientation = null,
  prompt = null,
  campaignId = null,
  campaignName = null,
  twinId = null,
  twinName = null,
  agentId = null,
  agentName = null,
  workspace = "character",
  instruction = null,
  recipeId = RECAST_RECIPE_ID,
  skillId = RECAST_SKILL_ID,
  providerId = null,
} = {}) {
  if (!characterImage) throw new Error("Performance transfer requires a character identity image");
  if (!drivingVideo) throw new Error("Performance transfer requires a driving video");
  const recipe = RECIPE_LIBRARY[recipeId] || RECIPE_LIBRARY[RECAST_RECIPE_ID];
  const resolvedProvider = providerId || recipe?.providerId || RECAST_PROVIDER_ID;
  const resolvedModel = model || RECAST_DEFAULT_MODEL;
  const resolvedRatio = aspectRatio || "16:9";
  const requestId = `request-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    requestId,
    characterImage,
    characterIdentity: characterIdentity && typeof characterIdentity === "object" ? { ...characterIdentity } : null,
    drivingVideo,
    sourceAssetId,
    recipeId: recipe?.id || RECAST_RECIPE_ID,
    recipe: recipe || null,
    skillId,
    skill: getRecastSkill(),
    providerId: resolvedProvider,
    provider: resolvedProvider,
    model: resolvedModel,
    aspectRatio: resolvedRatio,
    characterOrientation: characterOrientation || null,
    prompt: prompt || null,
    campaignId,
    campaignName,
    twinId,
    twinName,
    agentId,
    agentName,
    workspace,
    instruction,
    inputs: {
      characterImage,
      characterIdentity: characterIdentity && typeof characterIdentity === "object" ? { ...characterIdentity } : null,
      drivingVideo,
      sourceAssetId,
      model: resolvedModel,
      aspectRatio: resolvedRatio,
      characterOrientation: characterOrientation || null,
      prompt: prompt || null,
    },
    metadata: {
      characterImage,
      characterIdentity: characterIdentity && typeof characterIdentity === "object" ? { ...characterIdentity } : null,
      drivingVideo,
      sourceAssetId,
      campaignId,
      twinId,
      agentId,
      workspace,
      provider: resolvedProvider,
      recipeId: recipe?.id || RECAST_RECIPE_ID,
      skillId,
      instruction,
      model: resolvedModel,
      aspectRatio: resolvedRatio,
      characterOrientation: characterOrientation || null,
    },
  };
}

// Builds the Creative Request the Creative Intelligence Engine plans against.
export function buildRecastRequest(job) {
  return {
    requestId: job.requestId,
    recipeId: job.recipeId,
    intent:
      job.prompt ||
      job.instruction ||
      (job.characterIdentity?.name
        ? `Transfer a driving performance onto the character identity ${job.characterIdentity.name}`
        : "Transfer a driving performance onto a character identity"),
    campaignId: job.campaignId,
    studioId: job.workspace,
    inputs: { ...job.inputs },
    references: [job.drivingVideo, job.characterImage].filter(Boolean),
    output: {
      modality: "video",
      subtype: "performance transfer",
      aspectRatio: job.aspectRatio,
    },
    preferences: {},
    metadata: {
      characterIdentity: job.characterIdentity,
      sourceAssetId: job.sourceAssetId,
      campaignId: job.campaignId,
      twinId: job.twinId,
      agentId: job.agentId,
      workspace: job.workspace,
      provider: job.providerId,
      recipeId: job.recipeId,
      skillId: job.skillId,
      instruction: job.instruction,
      model: job.model,
      aspectRatio: job.aspectRatio,
      characterOrientation: job.characterOrientation,
    },
  };
}
