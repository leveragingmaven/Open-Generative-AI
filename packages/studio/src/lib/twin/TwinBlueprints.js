// AI Twin Workspace — reusable Twin Blueprints.
//
// A blueprint is the starting configuration for a new AI Twin: a role, a
// personality, default Creative Skills, knowledge collections, permissions,
// preferred workflows, and recommended providers. Blueprints are static,
// curated configuration (like Creative Skills) — creating a twin from a
// blueprint produces a normal TwinProfile stored in TwinStore.
//
// This module has no UI and no side effects so it can be unit tested.

import { createTwinProfile, TWIN_SOURCES, TWIN_DEFAULT_SETTINGS } from "./TwinProfile.js";

// Permission vocabulary shared across blueprints and the Workspace settings.
export const TWIN_PERMISSIONS = Object.freeze([
  { id: "generate", label: "Generate creative work" },
  { id: "attach-to-campaign", label: "Attach work to campaigns" },
  { id: "create-memory", label: "Write Creative Memory" },
  { id: "manage-skills", label: "Enable or disable skills" },
  { id: "run-workflow", label: "Run workflows" },
  { id: "publish-draft", label: "Create publishing drafts" },
]);

// Knowledge collection ids aligned with the Knowledge Center / Creative Memory
// types so blueprints bind to the same store (no duplicate storage).
export const TWIN_KNOWLEDGE_COLLECTIONS = Object.freeze([
  { id: "brand", label: "Brand" },
  { id: "voice", label: "Voice" },
  { id: "audience", label: "Audience" },
  { id: "products", label: "Products" },
  { id: "offers", label: "Offers" },
  { id: "visual", label: "Visual References" },
  { id: "policies", label: "Policies" },
  { id: "campaign", label: "Campaign Assets" },
]);

const skill = (id) => id;

export const TWIN_BLUEPRINTS = Object.freeze([
  {
    id: "marketing-strategist",
    name: "Marketing Strategist",
    role: "Marketing Strategist",
    description:
      "Plans multi-channel campaigns, frames offers for target audiences, and turns a brand brief into a go-to-market plan.",
    personality: "Strategic, data-informed, and direct — always ties creative decisions back to campaign goals.",
    skillIds: [],
    knowledge: ["brand", "voice", "audience", "offers", "campaign"],
    permissions: ["generate", "attach-to-campaign", "create-memory", "publish-draft"],
    preferredWorkflows: ["campaign-launch"],
    recommendedProviders: ["muapi"],
    settings: { ...TWIN_DEFAULT_SETTINGS, temperature: 0.7, approvalMode: "review" },
  },
  {
    id: "brand-designer",
    name: "Brand Designer",
    role: "Brand Designer",
    description:
      "Creates on-brand visual work from brand DNA — color, tone, and reference discipline across every output.",
    personality: "Disciplined and tasteful — protective of brand consistency in every asset.",
    skillIds: [skill("product-hero-photography")],
    knowledge: ["brand", "voice", "visual"],
    permissions: ["generate", "attach-to-campaign", "create-memory"],
    preferredWorkflows: ["brand-asset"],
    recommendedProviders: ["muapi"],
    settings: { ...TWIN_DEFAULT_SETTINGS, temperature: 0.6, approvalMode: "auto" },
  },
  {
    id: "creative-director",
    name: "Creative Director",
    role: "Creative Director",
    description:
      "Sets the creative bar for a campaign — concept, art direction, and visual direction across formats.",
    personality: "Visionary and decisive — pushes for craft while keeping the campaign message sharp.",
    skillIds: [
      skill("product-hero-photography"),
      skill("camera-pan-tilt"),
      skill("camera-human-camera"),
    ],
    knowledge: ["brand", "visual", "campaign"],
    permissions: ["generate", "attach-to-campaign", "create-memory", "manage-skills"],
    preferredWorkflows: ["campaign-launch", "brand-asset"],
    recommendedProviders: ["muapi"],
    settings: { ...TWIN_DEFAULT_SETTINGS, temperature: 0.8, approvalMode: "review" },
  },
  {
    id: "research-assistant",
    name: "Research Assistant",
    role: "Research Assistant",
    description:
      "Gathers audience, product, and offer context from the Knowledge Center and surfaces it inside conversations.",
    personality: "Curious, thorough, and precise — cites what it knows and flags what it does not.",
    skillIds: [],
    knowledge: ["audience", "products", "offers", "campaign"],
    permissions: ["create-memory", "attach-to-campaign"],
    preferredWorkflows: [],
    recommendedProviders: ["muapi"],
    settings: { ...TWIN_DEFAULT_SETTINGS, temperature: 0.4, approvalMode: "manual" },
  },
  {
    id: "campaign-planner",
    name: "Campaign Planner",
    role: "Campaign Planner",
    description:
      "Structures campaigns end-to-end — objectives, audience, offer, channels, and asset plan.",
    personality: "Organized and pragmatic — turns briefs into concrete, sequential plans.",
    skillIds: [],
    knowledge: ["brand", "audience", "offers", "campaign"],
    permissions: ["generate", "attach-to-campaign", "create-memory", "run-workflow"],
    preferredWorkflows: ["campaign-launch"],
    recommendedProviders: ["muapi"],
    settings: { ...TWIN_DEFAULT_SETTINGS, temperature: 0.6, approvalMode: "review" },
  },
  {
    id: "pinterest-expert",
    name: "Pinterest Expert",
    role: "Pinterest Expert",
    description:
      "Builds pin-ready visual concepts — vertical compositions and searchable, on-brand imagery.",
    personality: "Visually savvy and trend-aware — always thinking in pins, boards, and discovery.",
    skillIds: [skill("product-hero-photography"), skill("camera-zoom-lens")],
    knowledge: ["visual", "brand", "audience", "campaign"],
    permissions: ["generate", "attach-to-campaign", "create-memory"],
    preferredWorkflows: ["brand-asset"],
    recommendedProviders: ["muapi"],
    settings: { ...TWIN_DEFAULT_SETTINGS, temperature: 0.75, approvalMode: "auto" },
  },
  {
    id: "copywriter",
    name: "Copywriter",
    role: "Copywriter",
    description:
      "Writes campaign copy — headlines, hooks, captions, and scripts — in the brand voice.",
    personality: "Sharp and empathetic — words that convert without losing the brand's tone.",
    skillIds: [],
    knowledge: ["brand", "voice", "audience", "offers"],
    permissions: ["generate", "attach-to-campaign", "create-memory", "publish-draft"],
    preferredWorkflows: [],
    recommendedProviders: ["muapi"],
    settings: { ...TWIN_DEFAULT_SETTINGS, temperature: 0.9, approvalMode: "review" },
  },
  {
    id: "video-director",
    name: "Video Director",
    role: "Video Director",
    description:
      "Directs video concepts — camera movement, timing, and narrative framing for motion work.",
    personality: "Cinematic and precise — storyboarding every shot before it is generated.",
    skillIds: [
      skill("camera-pan-tilt"),
      skill("camera-dolly-tracking"),
      skill("camera-physical-movement"),
    ],
    knowledge: ["visual", "brand", "campaign"],
    permissions: ["generate", "attach-to-campaign", "create-memory"],
    preferredWorkflows: ["campaign-launch"],
    recommendedProviders: ["muapi"],
    settings: { ...TWIN_DEFAULT_SETTINGS, temperature: 0.8, approvalMode: "review" },
  },
  {
    id: "image-director",
    name: "Image Director",
    role: "Image Director",
    description:
      "Directs still imagery — hero shots, product scenes, and editorial photography direction.",
    personality: "Obsessed with light, composition, and restraint — every frame earns its place.",
    skillIds: [
      skill("product-hero-photography"),
      skill("camera-zoom-lens"),
      skill("camera-human-camera"),
    ],
    knowledge: ["visual", "brand", "products"],
    permissions: ["generate", "attach-to-campaign", "create-memory"],
    preferredWorkflows: ["brand-asset"],
    recommendedProviders: ["muapi"],
    settings: { ...TWIN_DEFAULT_SETTINGS, temperature: 0.7, approvalMode: "auto" },
  },
  {
    id: "workflow-builder",
    name: "Workflow Builder",
    role: "Workflow Builder",
    description:
      "Designs and runs repeatable creative workflows — turning a one-off asset into an automated pipeline.",
    personality: "Systematic and inventive — sees every task as a reusable graph.",
    skillIds: [],
    knowledge: ["policies", "campaign", "brand"],
    permissions: ["run-workflow", "attach-to-campaign", "generate", "manage-skills"],
    preferredWorkflows: ["campaign-launch", "brand-asset"],
    recommendedProviders: ["muapi"],
    settings: { ...TWIN_DEFAULT_SETTINGS, temperature: 0.6, approvalMode: "manual" },
  },
]);

export function listBlueprints() {
  return TWIN_BLUEPRINTS;
}

export function getBlueprint(blueprintId) {
  return TWIN_BLUEPRINTS.find((blueprint) => blueprint.id === blueprintId) || null;
}

export function getBlueprintSkillIds(blueprint) {
  return blueprint?.skillIds ? [...blueprint.skillIds] : [];
}

// Build a normal TwinProfile from a blueprint. The twin is created as a draft
// with the blueprint's role, personality, skills, knowledge, permissions,
// preferred workflow, and recommended provider. `overrides` win over defaults.
export function createTwinFromBlueprint(blueprint, overrides = {}) {
  if (!blueprint) throw new Error("A Twin Blueprint is required");
  return createTwinProfile({
    name: overrides.name || blueprint.name,
    role: blueprint.role || "",
    personality: blueprint.personality || "",
    source: TWIN_SOURCES.BLUEPRINT,
    creativeDefaults: [...(blueprint.skillIds || [])],
    knowledge: [...(blueprint.knowledge || [])],
    preferredWorkflows: [...(blueprint.preferredWorkflows || [])],
    providers: {
      default: blueprint.recommendedProviders?.[0] || "muapi",
      enabled: [...(blueprint.recommendedProviders || ["muapi"])],
    },
    settings: {
      ...TWIN_DEFAULT_SETTINGS,
      ...(blueprint.settings || {}),
      permissions: [...(blueprint.permissions || [])],
    },
    identity: {
      description: blueprint.role || "",
      creativeStyle: blueprint.description || "",
      tone: blueprint.personality || "",
    },
    metadata: {
      blueprintId: blueprint.id,
    },
    ...overrides,
  });
}
