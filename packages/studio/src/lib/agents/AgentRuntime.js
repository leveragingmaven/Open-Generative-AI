// Creative OS — Agent runtime reply builder.
//
// Agents execute under the currently selected AI Twin. They never own memory or
// knowledge: at runtime an Agent automatically receives the twin's memory,
// knowledge, brand, creative skills, and the active campaign context. The Agent
// contributes its specialty, prompt, workflows, recipes, creative skills, and
// tool preferences.
//
// Replies are deterministic, config-derived plans — no provider calls. The
// Creative Execution Engine (Milestone 7) consumes the same routing metadata.

import { creativeMemoryEngine } from "../intelligence/CreativeMemoryEngine.js";
import { MEMORY_SCOPES, MEMORY_STATUSES } from "../intelligence/MemoryTypes.js";
import { getSkill } from "../skills/index.js";
import { resolveIntent } from "../intents/index.js";
import { buildRepurposeJob } from "../repurpose/index.js";
import { buildMotionJob, detectMotionTemplate } from "../motion/index.js";
import { buildRecastJob, getRecastRecipe, getRecastSkill } from "../recast/index.js";

export function readTwinMemoriesForAgent(twinId, limit = 6, memoryEngine = creativeMemoryEngine) {
  if (!twinId) return [];
  const all = memoryEngine.listMemory({ scope: MEMORY_SCOPES.ORGANIZATION });
  return all
    .filter(
      (memory) =>
        memory.status === MEMORY_STATUSES.ACTIVE &&
        ((memory.metadata?.twinIds || []).includes(twinId) ||
          (memory.tags || []).includes(`twin:${twinId}`) ||
          (memory.notes || "").includes(`twin:${twinId}`))
    )
    .slice(0, limit);
}

export function resolveAgentTwinContext(twin) {
  if (!twin) {
    return {
      name: "Unassigned",
      brandVoice: null,
      personality: null,
      knowledge: [],
      creativeDefaults: [],
      campaignId: null,
      campaignName: null,
    };
  }
  return {
    name: twin.name,
    brandVoice: twin.brandVoice || null,
    personality: twin.personality || null,
    knowledge: twin.knowledge || [],
    creativeDefaults: twin.creativeDefaults || [],
    campaignId: twin.campaignAccess?.[0] || null,
    campaignName: null,
  };
}

// Shared repurpose handoff for agents and the AI Twin. Detection reuses the
// canonical Intent Router (repurpose-shorts); the job skeleton is built by the
// single shared buildRepurposeJob. Neither the agent nor the twin executes
// clipping — they surface the ready job and route to Video Studio → Repurpose,
// which runs the full Creative OS pipeline.
export function detectRepurposeRequest(userMessage = {}) {
  const text = String(userMessage?.content || userMessage || "").trim();
  if (!text) return null;
  const resolved = resolveIntent(text);
  if (!resolved || resolved.intent?.id !== "repurpose-shorts") return null;
  const urlMatch = text.match(/https?:\/\/[^\s]+/);
  return {
    matchedPhrase: resolved.matchedPhrase || resolved.intent?.name || null,
    sourceVideoUrl: urlMatch ? urlMatch[0] : null,
  };
}

export function buildRepurposeInitiation(
  userMessage,
  { twinId = null, agentId = null, campaignId = null, campaignName = null, workspace = "agents" } = {}
) {
  const detected = detectRepurposeRequest(userMessage);
  if (!detected) return null;
  const job = buildRepurposeJob({
    sourceVideoUrl: detected.sourceVideoUrl,
    sourceAssetId: null,
    campaignId,
    campaignName,
    twinId,
    agentId,
    workspace,
  });
  return { job, detected };
}

export function repurposeGuidanceLines(initiation) {
  if (!initiation) return [];
  const { job, detected } = initiation;
  return [
    "",
    "**Short-form repurposing**",
    `I prepped the shared repurpose job — recipe **${job.recipeId}**, skill **${job.skillId}**, provider **${job.providerId}** (request ${job.requestId}).`,
    detected.sourceVideoUrl ? `Source: ${detected.sourceVideoUrl}` : "Add a source video in Video Studio → Repurpose to run it.",
    "It executes through the same Creative OS pipeline (Creative Intelligence → Execution Engine → Provider Registry → clips → campaign → Publishing).",
  ];
}

// Shared motion graphics handoff for agents and the AI Twin. Detection reuses the
// canonical Intent Router (motion-graphics); the job skeleton is built by the
// single shared buildMotionJob + Workflow Template Library. Neither the agent nor
// the twin executes motion — they surface the ready job and route to Marketing
// Studio → Motion Graphics, which runs the full Creative OS pipeline.
export function detectMotionRequest(userMessage = {}) {
  const text = String(userMessage?.content || userMessage || "").trim();
  if (!text) return null;
  const resolved = resolveIntent(text);
  if (!resolved || resolved.intent?.id !== "motion-graphics") return null;
  return {
    matchedPhrase: resolved.matchedPhrase || resolved.intent?.name || null,
    templateId: detectMotionTemplate(text),
    prompt: text,
  };
}

export function buildMotionInitiation(
  userMessage,
  { twinId = null, agentId = null, campaignId = null, campaignName = null, workspace = "agents" } = {}
) {
  const detected = detectMotionRequest(userMessage);
  if (!detected) return null;
  const templateId = detected.templateId || "logo-reveal";
  const job = buildMotionJob({
    templateId,
    prompt: detected.prompt,
    text: detected.matchedPhrase || null,
    campaignId,
    campaignName,
    twinId,
    agentId,
    workspace,
  });
  return { job, detected };
}

export function motionGuidanceLines(initiation) {
  if (!initiation) return [];
  const { job, detected } = initiation;
  return [
    "",
    "**Motion graphics**",
    `I prepped the shared motion job — template **${job.templateId}**, recipe **${job.recipeId}**, skill **${job.skillId}**, provider **${job.providerId}** (request ${job.requestId}).`,
    "Run it in Marketing Studio → Motion Graphics, or I can render it through the same Creative OS pipeline (Workflow Template → Skill → Recipe → Creative Intelligence → Execution Engine → Provider Registry → Creative Job → Creative Asset → campaign → Publishing).",
  ];
}

// Shared performance-transfer handoff for agents and the AI Twin. Detection
// reuses the canonical Intent Router (talking-avatar). The job skeleton is
// built by the single shared buildRecastJob. Neither the agent nor the twin
// executes recast — they surface the ready job and route to Character Studio →
// Performance Transfer, which runs the full Creative OS pipeline. Character
// identities always come from a Creative OS identity source (influencer, AI
// Twin likeness, upload) — never a made-up likeness.
export function detectRecastRequest(userMessage = {}) {
  const text = String(userMessage?.content || userMessage || "").trim();
  if (!text) return null;
  const resolved = resolveIntent(text);
  if (!resolved || resolved.intent?.id !== "talking-avatar") return null;
  return {
    matchedPhrase: resolved.matchedPhrase || resolved.intent?.name || null,
    prompt: text,
  };
}

export function buildRecastInitiation(
  userMessage,
  { characterImage = null, characterIdentity = null, drivingVideo = null, sourceAssetId = null, twinId = null, agentId = null, campaignId = null, campaignName = null, workspace = "agents" } = {}
) {
  const detected = detectRecastRequest(userMessage);
  if (!detected) return null;
  try {
    const job = buildRecastJob({
      characterImage,
      characterIdentity,
      drivingVideo,
      sourceAssetId,
      campaignId,
      campaignName,
      twinId,
      agentId,
      workspace,
    });
    return { job, detected };
  } catch {
    // The intent matched but the character identity image or the driving video
    // is not attached yet — route to Character Studio to attach media. This is
    // not a failure: the studio is the execution surface.
    const recipe = getRecastRecipe();
    const skill = getRecastSkill();
    return {
      job: null,
      detected,
      needsMedia: true,
      recipe,
      skill,
    };
  }
}

export function recastGuidanceLines(initiation) {
  if (!initiation) return [];
  const { job, detected, needsMedia, recipe, skill } = initiation;
  if (needsMedia) {
    return [
      "",
      "**Performance transfer**",
      detected.matchedPhrase
        ? `I detected "${detected.matchedPhrase}" — transfer a driving performance onto a character identity.`
        : "I detected a performance-transfer request.",
      `It routes to **Character Studio → Performance Transfer** (skill **${skill?.id || "recast"}**, recipe **${recipe?.id || "performanceTransfer"}**).`,
      "Add a character identity (an AI Influencer or AI Twin likeness, or upload one) and a driving video there, and I'll run it through the full Creative OS pipeline.",
    ];
  }
  return [
    "",
    "**Performance transfer**",
    `I prepped the shared performance-transfer job — identity **${job.characterIdentity?.name || "character"}**, recipe **${job.recipeId}**, skill **${job.skillId}**, provider **${job.providerId}** (request ${job.requestId}).`,
    "It executes through Character Studio → Performance Transfer, or I can run the same Creative OS pipeline (Skill → Recipe → Creative Intelligence → Execution Engine → Provider Registry → Creative Job → Creative Asset → campaign → Publishing).",
  ];
}

export function buildAgentReply(
  agent,
  twin,
  { campaignId = null, campaignName = null, userMessage = null, memoryEngine = creativeMemoryEngine } = {}
) {
  if (!agent) return "This agent has no profile yet. Add it from the Agents Studio first.";
  const context = resolveAgentTwinContext(twin);
  const memories = readTwinMemoriesForAgent(twin?.id, 6, memoryEngine);
  const skills = (context.creativeDefaults || [])
    .map((id) => {
      try {
        return getSkill(id);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const activeCampaignId = campaignId || context.campaignId;
  const activeCampaignName = campaignName || context.campaignName;

  const lines = [];
  if (twin?.personality) lines.push(`*${twin.personality}*`);
  lines.push("");
  lines.push(`I'm **${agent.name}** — your ${agent.category || "creative"} specialist. I run under **${context.name}**, your AI Twin, so I work with its identity, not a separate one.`);
  if (agent.specialty) lines.push("");
  lines.push(`**Specialty**: ${agent.specialty}`);
  if (activeCampaignId || activeCampaignName) {
    lines.push("");
    lines.push(`**Active campaign**: ${activeCampaignName || activeCampaignId}`);
  }
  lines.push("");
  lines.push(`For "${userMessage?.content?.slice(0, 60) || "your brief"}", here's my plan:`);
  lines.push("");
  const steps = buildAgentSteps({ agent, context, skills, memories, activeCampaignId });
  steps.forEach((step, i) => lines.push(`${i + 1}. ${step}`));

  if (agent.suggestedRecipeIds?.length) {
    lines.push("");
    lines.push("**Recipes I'd route through**");
    agent.suggestedRecipeIds.forEach((id) => lines.push(`- ${id}`));
  }
  if (agent.suggestedWorkflowIds?.length) {
    lines.push("");
    lines.push("**Workflows I'd run**");
    agent.suggestedWorkflowIds.forEach((w) => lines.push(`- ${w}`));
  }
  if (skills.length) {
    lines.push("");
    lines.push("**Creative skills from my twin**");
    skills.forEach((skill) => lines.push(`- ${skill.name}`));
  }
  if (context.brandVoice) {
    lines.push("");
    lines.push(`**Voice**: ${context.brandVoice}`);
  }
  if (memories.length) {
    lines.push("");
    lines.push("**What my twin remembers**");
    memories.forEach((m) => lines.push(`- ${m.value}`));
  }
  lines.push("");
  lines.push(
    activeCampaignId
      ? "Say the word and I'll turn this plan into a Creative Job — Recipe + Skill + Workflow → Creative Asset linked to the campaign."
      : "Attach a campaign and I'll turn this plan into a Creative Job — Recipe + Skill + Workflow → Creative Asset."
  );

  const repurpose = buildRepurposeInitiation(userMessage, {
    twinId: twin?.id,
    agentId: agent.id,
    campaignId: activeCampaignId,
    campaignName: activeCampaignName,
    workspace: "agents",
  });
  if (repurpose) lines.push(...repurposeGuidanceLines(repurpose));

  const motion = buildMotionInitiation(userMessage, {
    twinId: twin?.id,
    agentId: agent.id,
    campaignId: activeCampaignId,
    campaignName: activeCampaignName,
    workspace: "agents",
  });
  if (motion) lines.push(...motionGuidanceLines(motion));

  const recast = buildRecastInitiation(userMessage, {
    characterImage: null,
    characterIdentity: null,
    drivingVideo: null,
    sourceAssetId: null,
    twinId: twin?.id,
    agentId: agent.id,
    campaignId: activeCampaignId,
    campaignName: activeCampaignName,
    workspace: "agents",
  });
  if (recast) lines.push(...recastGuidanceLines(recast));
  return lines.join("\n");
}

function buildAgentSteps({ agent, context, skills, memories, activeCampaignId }) {
  const steps = ["Read the brief from the active campaign (goal, offer, audience)."];
  if (memories.length) {
    steps.push(`Pull my twin's memory: ${memories.map((m) => m.value).join("; ")}.`);
  }
  if (context.knowledge.length) {
    steps.push(`Reference my twin's knowledge collections: ${context.knowledge.join(", ")}.`);
  }
  if (agent.suggestedRecipeIds?.length) {
    steps.push(`Route through my recipes: ${agent.suggestedRecipeIds.join(", ")}.`);
  }
  if (skills.length) {
    steps.push(`Apply my twin's creative skills: ${skills.map((s) => s.name).join(", ")}.`);
  }
  steps.push("Draft the concept, run the Recipe → Skill → Creative Intelligence → Execution pipeline, and deliver a Creative Asset to the campaign.");
  return steps;
}
