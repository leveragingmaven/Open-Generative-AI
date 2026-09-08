// Creative OS — shared AI Clipping repurpose job builder.
//
// Single implementation of the repurpose job skeleton used by every caller:
// Video Studio Repurpose mode, the Command Bar / Intent Router, Agents, and the
// AI Twin. Nobody duplicates the clipping logic; everyone builds the same job
// through this module, which resolves the recipe (repurposeVideo), the skill
// (ai-clipping), and the provider (from recipe config — never chosen by the
// Command Bar).

import { RECIPE_LIBRARY } from "../intelligence/config.js";
import { getSkill } from "../skills/index.js";

export const REPURPOSE_RECIPE_ID = "repurposeVideo";
export const REPURPOSE_SKILL_ID = "ai-clipping";

export const REPURPOSE_ASPECT_RATIOS = ["9:16", "16:9", "1:1", "4:5", "4:3", "3:4"];
export const REPURPOSE_MAX_HIGHLIGHTS = 60;
export const REPURPOSE_DEFAULT_HIGHLIGHTS = 3;

export function getRepurposeRecipe() {
  return RECIPE_LIBRARY[REPURPOSE_RECIPE_ID] || null;
}

export function getRepurposeSkill() {
  try {
    return getSkill(REPURPOSE_SKILL_ID);
  } catch {
    return null;
  }
}

// Builds the normalized repurpose job skeleton shared by studio / agent / twin /
// intent. Provider is resolved from the recipe config; the caller may override
// for provider configuration.
export function buildRepurposeJob({
  sourceVideoUrl,
  sourceAssetId = null,
  numHighlights = REPURPOSE_DEFAULT_HIGHLIGHTS,
  aspectRatio = "9:16",
  coordinatesOnly = false,
  guidance = null,
  campaignId = null,
  campaignName = null,
  twinId = null,
  twinName = null,
  agentId = null,
  agentName = null,
  workspace = "video",
  instruction = null,
  recipeId = REPURPOSE_RECIPE_ID,
  skillId = REPURPOSE_SKILL_ID,
  providerId = null,
} = {}) {
  const recipe = RECIPE_LIBRARY[recipeId] || RECIPE_LIBRARY[REPURPOSE_RECIPE_ID];
  const resolvedProvider = providerId || recipe?.providerId || "muapi";
  const requestId = `request-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    requestId,
    recipeId: recipe?.id || REPURPOSE_RECIPE_ID,
    recipe: recipe || null,
    skillId,
    skill: getRepurposeSkill(),
    providerId: resolvedProvider,
    provider: resolvedProvider,
    campaignId,
    campaignName,
    twinId,
    twinName,
    agentId,
    agentName,
    workspace,
    instruction,
    inputs: {
      videoUrl: sourceVideoUrl,
      sourceAssetId,
      numHighlights,
      aspectRatio,
      coordinatesOnly,
      guidance,
    },
    sourceVideoUrl,
    sourceAssetId,
    numHighlights,
    aspectRatio,
    coordinatesOnly,
    guidance,
    metadata: {
      sourceAssetId,
      campaignId,
      twinId,
      agentId,
      workspace,
      provider: resolvedProvider,
      recipeId: recipe?.id || REPURPOSE_RECIPE_ID,
      skillId,
      instruction,
      numHighlights,
      aspectRatio,
      coordinatesOnly,
    },
  };
}

// Builds the Creative Request the Creative Intelligence Engine plans against.
export function buildRepurposeRequest(job) {
  return {
    requestId: job.requestId,
    recipeId: job.recipeId,
    intent: job.guidance || job.instruction || "Repurpose long-form video into short-form clips",
    campaignId: job.campaignId,
    studioId: job.workspace,
    inputs: { ...job.inputs },
    references: job.sourceVideoUrl ? [job.sourceVideoUrl] : [],
    output: { modality: "video", subtype: "short-form clip", aspectRatio: job.aspectRatio },
    preferences: {},
    metadata: {
      sourceAssetId: job.sourceAssetId,
      campaignId: job.campaignId,
      twinId: job.twinId,
      agentId: job.agentId,
      workspace: job.workspace,
      provider: job.providerId,
      recipeId: job.recipeId,
      skillId: job.skillId,
      instruction: job.instruction,
    },
  };
}
