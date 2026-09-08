// Creative OS — Agent Profile model and profile generation.
//
// Agents are reusable specialists that never own memory or knowledge: they
// execute under the currently selected AI Twin and receive the twin's memory,
// knowledge, brand, creative skills, and the active campaign at runtime.
//
// An Agent contributes its specialty, prompt, workflows, recipes, creative
// skills, and tool preferences. The prompt-based creation flow derives an
// Agent profile from a one-line specialty description using the real Creative
// Skill and Recipe registries — deterministic, no API calls.

import { SKILL_LIBRARY } from "../skills/index.js";
import { RECIPE_LIBRARY } from "../intelligence/config.js";

export const AGENT_STATUSES = Object.freeze({
  DRAFT: "draft",
  PUBLISHED: "published",
  ARCHIVED: "archived",
});

export const AGENT_CATEGORIES = Object.freeze([
  "Image",
  "Video",
  "Motion Graphics",
  "Audio",
  "Copywriting",
  "Marketing",
  "Social",
  "Character",
  "Design",
  "Strategy",
  "General",
]);

const RECIPE_NAMES = Object.freeze({
  "cinema-image": "Cinematic Image",
  image: "Image",
  marketing: "Marketing",
  video: "Video",
  "image-edit": "Image Edit",
  "ai-influencer": "AI Influencer",
  "vibe-motion": "Vibe Motion",
  audio: "Audio",
  recast: "Recast",
  "lip-sync": "Lip Sync",
  "video-transform": "Video Transform",
  workflow: "Workflow",
});

const CATEGORY_KEYWORDS = Object.freeze({
  Image: ["photo", "image", "picture", "photograph", "visual", "hero shot", "product shot", "photography"],
  Video: ["video", "film", "shorts", "clip", "reel", "tiktok", "footage", "camera", "cinema"],
  "Motion Graphics": ["motion", "animate", "animation", "graphic", "logo", "countdown", "chart"],
  Audio: ["audio", "sound", "music", "voice", "voiceover", "podcast", "song"],
  Copywriting: ["copy", "write", "writing", "headline", "script", "caption", "story", "email"],
  Marketing: ["marketing", "campaign", "ad", "promote", "convert", "funnel", "launch"],
  Social: ["social", "tiktok", "instagram", "pinterest", "youtube", "community", "post"],
  Character: ["character", "avatar", "influencer", "recast", "talking", "persona"],
  Design: ["design", "brand", "logo", "layout", "identity", "poster", "art"],
  Strategy: ["strategy", "plan", "research", "audience", "insight", "analyst", "planner"],
});

const WORKFLOW_SUGGESTIONS = Object.freeze({
  Image: ["Product Campaign Workflow", "Brand Kit Workflow"],
  Video: ["Social Repurposing Workflow", "Video Post-Production Workflow"],
  "Motion Graphics": ["Motion Asset Workflow", "Countdown Launch Workflow"],
  Audio: ["Podcast Production Workflow", "Voiceover Workflow"],
  Copywriting: ["Content Calendar Workflow", "Campaign Copy Workflow"],
  Marketing: ["Campaign Launch Workflow", "Pinterest Campaign Workflow", "Funnel Build Workflow"],
  Social: ["Social Repurposing Workflow", "Content Calendar Workflow"],
  Character: ["Character Consistency Workflow", "Avatar Launch Workflow"],
  Design: ["Brand Kit Workflow", "Product Campaign Workflow"],
  Strategy: ["Research Brief Workflow", "Campaign Launch Workflow"],
  General: ["Campaign Launch Workflow"],
});

function tokens(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t && t.length > 2);
}

function scoreTokens(text, keywords) {
  const textTokens = new Set(tokens(text));
  let score = 0;
  for (const keyword of keywords) {
    if (textTokens.has(keyword)) score += 2;
    else if ((text || "").toLowerCase().includes(keyword)) score += 1;
  }
  return score;
}

export function detectAgentCategory(specialty) {
  let best = { category: "General", score: 0 };
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const score = scoreTokens(specialty, keywords);
    if (score > best.score) best = { category, score };
  }
  return best.category;
}

export function suggestAgentSkills(specialty, limit = 4) {
  const scored = [];
  for (const skill of Object.values(SKILL_LIBRARY)) {
    const haystack = `${skill.name} ${skill.category} ${(skill.supportedStudios || []).join(" ")} ${(skill.vocabulary || []).join(" ")}`;
    const score = scoreTokens(specialty, tokens(haystack)) + scoreTokens(specialty, [skill.category]);
    if (score > 0) scored.push({ skill, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ skill }) => skill.skillId);
}

export function suggestAgentRecipes(specialty) {
  const scored = [];
  for (const recipe of Object.values(RECIPE_LIBRARY)) {
    const name = RECIPE_NAMES[recipe.id] || recipe.id;
    const haystack = `${name} ${recipe.id} ${(recipe.capabilityRequirements || []).join(" ")}`;
    const score = scoreTokens(specialty, tokens(haystack));
    if (score > 0) scored.push({ id: recipe.id, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map(({ id }) => id);
}

function suggestAgentWorkflows(category) {
  return WORKFLOW_SUGGESTIONS[category] || WORKFLOW_SUGGESTIONS.General;
}

export function suggestAgentTools(recipeIds) {
  const tools = new Set();
  for (const id of recipeIds || []) {
    const recipe = RECIPE_LIBRARY[Object.keys(RECIPE_LIBRARY).find((k) => RECIPE_LIBRARY[k].id === id)];
    if (recipe?.capabilityRequirements) recipe.capabilityRequirements.forEach((c) => tools.add(c));
  }
  return [...tools];
}

function deriveAgentName(specialty, category) {
  const meaningful = tokens(specialty).filter((t) => !new Set(["create", "make", "build", "for", "with", "and"]).has(t));
  if (meaningful.length >= 2) {
    const name = meaningful
      .slice(0, 3)
      .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
      .join(" ");
    return `${name} Specialist`;
  }
  return `${category} Specialist`;
}

export function generateAgentProfile(specialty, overrides = {}) {
  const normalized = (specialty || "").trim();
  if (!normalized) throw new Error("Describe what the agent should specialize in");
  const category = detectAgentCategory(normalized);
  const name = overrides.name || deriveAgentName(normalized, category);
  const suggestedRecipeIds = suggestAgentRecipes(normalized);
  return createAgentProfile({
    name,
    specialty: normalized,
    category,
    description:
      overrides.description ||
      `A ${category.toLowerCase()} specialist that plans and produces work for your briefs, executing under your AI Twin's identity.`,
    prompt:
      overrides.prompt ||
      `You are ${name}, a ${category.toLowerCase()} specialist. Analyze the brief, apply your specialty together with the executing AI Twin's memory, knowledge, brand voice, and creative skills, choose the best Recipe + Creative Skill + Workflow path, and produce the creative asset for the active campaign.`,
    suggestedSkillIds: suggestAgentSkills(normalized),
    suggestedRecipeIds,
    suggestedWorkflowIds: suggestAgentWorkflows(category),
    toolPreferences: suggestAgentTools(suggestedRecipeIds),
    categories: [category, "General"],
    avatarPlaceholder: overrides.avatarPlaceholder || category.charAt(0).toUpperCase(),
    ...overrides,
  });
}

export function createAgentProfile(input = {}) {
  const now = new Date().toISOString();
  return {
    id: input.id || `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: input.name || "Unnamed Agent",
    description: input.description || "",
    avatarPlaceholder: input.avatarPlaceholder || (input.name || "A").charAt(0).toUpperCase(),
    specialty: input.specialty || input.name || "",
    prompt: input.prompt || "",
    categories: Array.isArray(input.categories) ? [...input.categories] : [input.category || "General"],
    category: input.category || (Array.isArray(input.categories) && input.categories[0]) || "General",
    suggestedSkillIds: Array.isArray(input.suggestedSkillIds) ? [...input.suggestedSkillIds] : [],
    suggestedRecipeIds: Array.isArray(input.suggestedRecipeIds) ? [...input.suggestedRecipeIds] : [],
    suggestedWorkflowIds: Array.isArray(input.suggestedWorkflowIds) ? [...input.suggestedWorkflowIds] : [],
    toolPreferences: Array.isArray(input.toolPreferences) ? [...input.toolPreferences] : [],
    status: input.status || AGENT_STATUSES.PUBLISHED,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
    metadata: input.metadata ? { ...input.metadata } : {},
  };
}

export function updateAgentProfile(agent, changes = {}) {
  if (!agent) return null;
  return createAgentProfile({ ...agent, ...changes, updatedAt: new Date().toISOString() });
}

// Curated reusable specialists shown on the Featured tab. Each is an Agent
// template — never a Twin, and never part of the AI Twin identity model.
export const FEATURED_AGENT_TEMPLATES = Object.freeze([
  {
    id: "product-hero-photographer",
    name: "Product Hero Photographer",
    specialty: "Product hero photography with a branded visual style",
    description: "Directs and produces product hero imagery using craft photography skills.",
    category: "Image",
    prompt:
      "You are the Product Hero Photographer. Apply your craft guidance to brief product shots, keep the brand voice in mind, and produce a hero image asset.",
    suggestedSkillIds: ["product-hero-photography"],
    suggestedRecipeIds: ["image", "image-edit"],
    suggestedWorkflowIds: ["Product Campaign Workflow"],
    toolPreferences: ["image_generation", "image_editing"],
    categories: ["Image", "General"],
  },
  {
    id: "camera-operator",
    name: "Camera Operator",
    specialty: "Camera movement and framing for video production",
    description: "Plans camera moves and framing for any shot list.",
    category: "Video",
    prompt:
      "You are the Camera Operator. Recommend the camera movement, framing, and pacing for each shot in the brief, then produce the video.",
    suggestedSkillIds: [
      "camera-pan-tilt",
      "camera-zoom-lens",
      "camera-dolly-tracking",
      "camera-physical-movement",
      "camera-human-camera",
      "camera-drone-crane",
      "camera-special-techniques",
    ],
    suggestedRecipeIds: ["video"],
    suggestedWorkflowIds: ["Video Post-Production Workflow"],
    toolPreferences: ["video_generation"],
    categories: ["Video", "General"],
  },
  {
    id: "social-video-strategist",
    name: "Social Video Strategist",
    specialty: "Repurposing long-form video into platform-native shorts",
    description: "Turns videos into TikToks, YouTube Shorts, and highlight clips.",
    category: "Video",
    prompt:
      "You are the Social Video Strategist. Analyze the source video, extract the strongest moments, and plan the shorts for each platform under the active campaign.",
    suggestedSkillIds: ["camera-pan-tilt", "camera-dolly-tracking"],
    suggestedRecipeIds: ["video-transform", "video"],
    suggestedWorkflowIds: ["Social Repurposing Workflow"],
    toolPreferences: ["video_editing", "video_generation"],
    categories: ["Video", "Social"],
  },
  {
    id: "motion-designer",
    name: "Motion Graphics Designer",
    specialty: "Animated graphics — logos, charts, countdowns, intros",
    description: "Designs and animates motion graphics for brand content.",
    category: "Motion Graphics",
    prompt:
      "You are the Motion Graphics Designer. Plan the animation concept and apply motion design best practices for the brief.",
    suggestedSkillIds: [],
    suggestedRecipeIds: ["vibe-motion"],
    suggestedWorkflowIds: ["Motion Asset Workflow", "Countdown Launch Workflow"],
    toolPreferences: ["video_generation"],
    categories: ["Motion Graphics", "Video"],
  },
  {
    id: "brand-designer",
    name: "Brand Designer",
    specialty: "On-brand visual design across image assets",
    description: "Keeps every visual on-brand with a consistent identity.",
    category: "Design",
    prompt:
      "You are the Brand Designer. Apply the executing AI Twin's brand voice and visual knowledge to every asset you plan.",
    suggestedSkillIds: ["product-hero-photography"],
    suggestedRecipeIds: ["image", "marketing"],
    suggestedWorkflowIds: ["Brand Kit Workflow"],
    toolPreferences: ["image_generation"],
    categories: ["Design", "Image"],
  },
  {
    id: "pinterest-strategist",
    name: "Pinterest Strategist",
    specialty: "Pinterest campaign planning and pin design",
    description: "Plans Pinterest campaigns and produces on-brand pins.",
    category: "Marketing",
    prompt:
      "You are the Pinterest Strategist. Plan the pin set and campaign structure for the active campaign, then produce the creative assets.",
    suggestedSkillIds: ["product-hero-photography"],
    suggestedRecipeIds: ["image", "marketing"],
    suggestedWorkflowIds: ["Pinterest Campaign Workflow"],
    toolPreferences: ["image_generation"],
    categories: ["Marketing", "Social"],
  },
  {
    id: "campaign-copywriter",
    name: "Campaign Copywriter",
    specialty: "Campaign copy, headlines, and scripts",
    description: "Writes on-brand campaign copy with the twin's voice.",
    category: "Copywriting",
    prompt:
      "You are the Campaign Copywriter. Draft headlines, scripts, and captions in the executing AI Twin's brand voice for the active campaign.",
    suggestedSkillIds: [],
    suggestedRecipeIds: ["marketing"],
    suggestedWorkflowIds: ["Campaign Copy Workflow", "Content Calendar Workflow"],
    toolPreferences: [],
    categories: ["Copywriting", "Marketing"],
  },
  {
    id: "recast-artist",
    name: "Character Recast Artist",
    specialty: "Recasting characters and animating influencers",
    description: "Recasts characters and creates talking avatars.",
    category: "Character",
    prompt:
      "You are the Character Recast Artist. Plan the character recast and avatar animation for the brief, using the twin's creative context.",
    suggestedSkillIds: [],
    suggestedRecipeIds: ["recast", "ai-influencer"],
    suggestedWorkflowIds: ["Character Consistency Workflow", "Avatar Launch Workflow"],
    toolPreferences: ["video_editing", "character_consistency"],
    categories: ["Character", "Video"],
  },
]);

export function listFeaturedAgentTemplates() {
  return [...FEATURED_AGENT_TEMPLATES];
}

export function getFeaturedAgentTemplate(id) {
  return FEATURED_AGENT_TEMPLATES.find((template) => template.id === id) || null;
}
