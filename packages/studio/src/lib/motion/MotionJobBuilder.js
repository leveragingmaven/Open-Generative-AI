// Creative OS — shared motion graphics job builder.
//
// Single implementation of the motion job skeleton used by every caller:
// Marketing Studio Motion Graphics, the Command Bar / Intent Router, Agents, and
// the AI Twin. Nobody duplicates the motion logic; everyone builds the same job
// through this module, which resolves the workflow template, the recipe
// (motionGraphics), the skill (vibe-motion), and the provider (from recipe
// config — never chosen by the Command Bar).

import { RECIPE_LIBRARY } from "../intelligence/config.js";
import { getSkill } from "../skills/index.js";
import { getWorkflowTemplate } from "./templates.js";
import { MOTION_RECIPE_ID, MOTION_SKILL_ID, MOTION_PROVIDER_ID } from "./MotionConstants.js";

export const MOTION_ASPECT_RATIOS = ["16:9", "9:16", "1:1"];
export const MOTION_DEFAULT_DURATION = 6;
export const MOTION_MAX_DURATION = 30;

// Best-effort template detection from free text (agent / twin / command bar
// phrases). Returns null when no template keyword matches.
export function detectMotionTemplate(text = "") {
  const t = String(text).toLowerCase();
  const matches = [
    { keywords: ["logo"], templateId: "logo-reveal" },
    { keywords: ["countdown", "count down"], templateId: "countdown-timer" },
    { keywords: ["dashboard", "sales data", "revenue", "chart"], templateId: "sales-dashboard" },
    { keywords: ["quote", "testimonial", "kinetic typography"], templateId: "animated-quote" },
    { keywords: ["product spotlight", "spotlight", "product showcase", "product"], templateId: "product-spotlight" },
    { keywords: ["announcement", "announce", "social post"], templateId: "social-announcement" },
    { keywords: ["lower third", "lower-third", "title bar"], templateId: "lower-third" },
    { keywords: ["statistics", "statistic", "stats animation", "stat animation"], templateId: "statistics-animation" },
    { keywords: ["call to action", "cta", "end card"], templateId: "call-to-action" },
    { keywords: ["promo intro", "intro", "opener", "open an ad"], templateId: "promo-intro" },
  ];
  for (const { keywords, templateId } of matches) {
    if (keywords.some((keyword) => t.includes(keyword))) return templateId;
  }
  return null;
}

export function getMotionRecipe() {
  return RECIPE_LIBRARY[MOTION_RECIPE_ID] || null;
}

export function getMotionSkill() {
  try {
    return getSkill(MOTION_SKILL_ID);
  } catch {
    return null;
  }
}

export function getMotionTemplate(templateId) {
  try {
    return getWorkflowTemplate(templateId);
  } catch {
    return null;
  }
}

// Builds the normalized motion graphics job skeleton shared by studio / agent /
// twin / intent. Template and provider are resolved from the template library and
// the recipe config; the caller may override provider for provider configuration.
export function buildMotionJob({
  templateId,
  text = null,
  brandColors = null,
  logo = null,
  images = null,
  dataPoints = null,
  countdown = null,
  attribution = null,
  durationSeconds = null,
  aspectRatio = null,
  prompt = null,
  sourceRequestId = null,
  campaignId = null,
  campaignName = null,
  twinId = null,
  twinName = null,
  agentId = null,
  agentName = null,
  workspace = "marketing",
  instruction = null,
  recipeId = MOTION_RECIPE_ID,
  skillId = MOTION_SKILL_ID,
  providerId = null,
} = {}) {
  const recipe = RECIPE_LIBRARY[recipeId] || RECIPE_LIBRARY[MOTION_RECIPE_ID];
  const resolvedProvider = providerId || recipe?.providerId || MOTION_PROVIDER_ID;
  const template = getMotionTemplate(templateId);
  if (!template) throw new Error(`Unknown workflow template: ${templateId}`);
  const resolvedDuration =
    durationSeconds ??
    (template?.defaultDurationSeconds ?? MOTION_DEFAULT_DURATION);
  const resolvedRatio =
    aspectRatio ??
    (template?.defaultAspectRatio ?? "16:9");
  const requestId = `request-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const editMode = Boolean(sourceRequestId);
  return {
    requestId,
    templateId: template?.templateId || templateId,
    template: template || null,
    recipeId: recipe?.id || MOTION_RECIPE_ID,
    recipe: recipe || null,
    skillId,
    skill: getMotionSkill(),
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
    editMode,
    sourceRequestId: sourceRequestId || null,
    inputs: {
      templateId: template?.templateId || templateId,
      text,
      brandColors,
      logo,
      images,
      dataPoints,
      countdown,
      attribution,
      durationSeconds: resolvedDuration,
      aspectRatio: resolvedRatio,
      prompt,
    },
    durationSeconds: resolvedDuration,
    aspectRatio: resolvedRatio,
    metadata: {
      templateId: template?.templateId || templateId,
      campaignId,
      twinId,
      agentId,
      workspace,
      provider: resolvedProvider,
      recipeId: recipe?.id || MOTION_RECIPE_ID,
      skillId,
      instruction,
      durationSeconds: resolvedDuration,
      aspectRatio: resolvedRatio,
      editMode,
      sourceRequestId: sourceRequestId || null,
    },
  };
}

// Builds the Creative Request the Creative Intelligence Engine plans against.
export function buildMotionRequest(job) {
  return {
    requestId: job.requestId,
    recipeId: job.recipeId,
    intent:
      job.prompt ||
      job.instruction ||
      (job.template?.title ? `Render a ${job.template.title.toLowerCase()} motion graphic` : "Render a motion graphic from a workflow template"),
    campaignId: job.campaignId,
    studioId: job.workspace,
    inputs: { ...job.inputs },
    references: [job.inputs?.logo, ...(Array.isArray(job.inputs?.images) ? job.inputs.images : [])].filter(Boolean),
    output: {
      modality: "video",
      subtype: "motion graphic",
      aspectRatio: job.aspectRatio,
      durationSeconds: job.durationSeconds,
    },
    preferences: {},
    metadata: {
      templateId: job.templateId,
      campaignId: job.campaignId,
      twinId: job.twinId,
      agentId: job.agentId,
      workspace: job.workspace,
      provider: job.providerId,
      recipeId: job.recipeId,
      skillId: job.skillId,
      instruction: job.instruction,
      editMode: job.editMode,
      sourceRequestId: job.sourceRequestId,
      durationSeconds: job.durationSeconds,
      aspectRatio: job.aspectRatio,
    },
  };
}
