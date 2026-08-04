// Creative Intent Router — maps natural-language intent to a Creative OS
// destination, a Recipe, the Creative Skills it engages, and (when applicable)
// a recommended AI Twin.
//
// The Command Bar never hardcodes actions: every command is an intent resolved
// here, and the resolved target carries the Recipe/Skill pipeline metadata the
// Creative Execution Engine will use (Milestone 6). Providers are never chosen
// by the Command Bar — the Recipe config owns provider selection.
//
// Intent definition shape:
//   id          — stable identifier
//   name        — user-facing label (actionable phrasing)
//   description — one-line explanation
//   category    — grouping (Video, Motion Graphics, Character, Campaign, AI Twins)
//   phrases     — natural-language phrases that map to this intent
//   target      — { studio, tabId, route, recipeId, skillIds, twinBlueprintId? }

import { RECIPE_LIBRARY } from "../intelligence/config.js";
import { TWIN_BLUEPRINTS, getBlueprint } from "../twin/TwinBlueprints.js";
import { listTwins } from "../twin/TwinStore.js";

export const INTENT_CATEGORIES = Object.freeze(["Video", "Motion Graphics", "Character", "Campaign", "AI Twins"]);

export const MIN_INTENT_CONFIDENCE = 0.5;

// Maven-brand aliases so natural phrases like "Marketing Maven" resolve to the
// matching blueprint even when the blueprint is named "Marketing Strategist".
const TWIN_MAVEN_ALIASES = Object.freeze({
  "marketing-strategist": "Marketing Maven",
  "workflow-builder": "Coach Maven",
  "research-assistant": "Research Maven",
});

const STOP_WORDS = new Set(["a", "an", "the", "my", "your", "this", "to", "into", "for", "and", "on", "in", "of"]);

export function normalizeIntentText(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const RECIPE_BY_ID = Object.fromEntries(Object.values(RECIPE_LIBRARY).map((recipe) => [recipe.id, recipe]));

export function getRecipeById(recipeId) {
  return RECIPE_BY_ID[recipeId] || null;
}

function twinPhrases(blueprint) {
  const labels = [TWIN_MAVEN_ALIASES[blueprint.id] || blueprint.name, blueprint.name].filter(Boolean);
  const phrases = new Set();
  for (const label of labels) {
    const l = normalizeIntentText(label);
    if (!l) continue;
    phrases.add(l);
    for (const verb of ["use", "talk to", "ask", "switch to", "chat with", "message"]) {
      phrases.add(`${verb} ${l}`);
    }
  }
  return [...phrases];
}

function buildTwinIntents() {
  return TWIN_BLUEPRINTS.map((blueprint) => ({
    id: `twin-${blueprint.id}`,
    name: `Talk to ${blueprint.name}`,
    description: `Open a conversation with your ${blueprint.name} twin.`,
    category: "AI Twins",
    phrases: twinPhrases(blueprint),
    target: {
      studio: "AI Twin Studio",
      tabId: "ai-twin",
      route: "/studio/ai-twin",
      recipeId: null,
      skillIds: [...(blueprint.skillIds || [])],
      twinBlueprintId: blueprint.id,
    },
  }));
}

// Base capability intents (non-twin). Twin intents are generated from the
// blueprint catalog so the router stays extensible as blueprints grow.
const BASE_INTENTS = [
  {
    id: "repurpose-shorts",
    name: "Turn this into shorts",
    description: "Repurpose a video into short-form clips — TikToks, YouTube Shorts, highlights.",
    category: "Video",
    phrases: [
      "turn this into shorts",
      "turn this video into shorts",
      "repurpose this video",
      "repurpose video",
      "create tiktoks",
      "create a tiktok",
      "make a tiktok",
      "tiktok",
      "make youtube shorts",
      "youtube shorts",
      "extract highlights",
      "extract the highlights",
      "find the best clips",
      "find the best clip",
      "best clips",
      "turn my webinar into reels",
      "make reels",
      "create reels",
      "reels",
      "make shorts",
      "create shorts",
      "make a short",
      "create a short",
      "clip this video",
      "edit this video into shorts",
      "short form",
    ],
    target: {
      studio: "Video Studio",
      tabId: "video",
      route: "/studio/video",
      recipeId: "repurposeVideo",
      skillIds: ["ai-clipping"],
    },
  },
  {
    id: "motion-graphics",
    name: "Create motion graphics",
    description: "Animate graphics — logos, charts, countdowns, intros.",
    category: "Motion Graphics",
    phrases: [
      "animate my logo",
      "logo animation",
      "animate a logo",
      "create motion graphics",
      "motion graphics",
      "motion design",
      "make an animated chart",
      "animated chart",
      "build a countdown",
      "create a countdown",
      "countdown",
      "animated intro",
      "create an intro",
      "make an intro",
    ],
    target: {
      studio: "Marketing Studio",
      tabId: "marketing",
      route: "/studio/marketing",
      recipeId: "motionGraphics",
      skillIds: ["vibe-motion"],
    },
  },
  {
    id: "talking-avatar",
    name: "Create a talking avatar",
    description: "Create or recast a character and animate it to speak.",
    category: "Character",
    phrases: [
      "create a talking avatar",
      "make a talking avatar",
      "talking avatar",
      "create an avatar",
      "recast this character",
      "recast my character",
      "recast character",
      "recast this video",
      "transfer this performance",
      "performance transfer",
      "recast",
      "animate my influencer",
      "animate influencer",
      "influencer animation",
      "make my spokesperson talk",
      "make my spokesperson speak",
      "spokesperson video",
      "talking spokesperson",
      "character animation",
      "animate my character",
    ],
    target: {
      studio: "Character Studio",
      tabId: "character",
      route: "/studio/character",
      recipeId: "performanceTransfer",
      skillIds: ["recast"],
    },
  },
  {
    id: "campaign-plan",
    name: "Generate campaign",
    description: "Plan a campaign — launch, funnel, Pinterest.",
    category: "Campaign",
    phrases: [
      "generate campaign",
      "generate a campaign",
      "create a campaign",
      "make a campaign",
      "launch product",
      "launch my product",
      "product launch",
      "build funnel",
      "build a funnel",
      "create a funnel",
      "funnel",
      "create pinterest campaign",
      "make a pinterest campaign",
      "pinterest campaign",
    ],
    target: {
      studio: "Campaign Planner",
      tabId: "campaigns",
      route: "/studio/campaigns",
      recipeId: null,
      skillIds: [],
    },
  },
];

const intentStore = [...BASE_INTENTS, ...buildTwinIntents()];

export const INTENT_LIBRARY = intentStore;

export function listIntents() {
  return [...intentStore];
}

// Registers a new intent (extensibility point for future Creative Skills).
export function registerIntent(definition) {
  if (!definition || typeof definition.id !== "string" || !definition.id) {
    throw new Error("An intent requires a stable id");
  }
  if (intentStore.some((intent) => intent.id === definition.id)) {
    throw new Error(`Intent already registered: ${definition.id}`);
  }
  if (!Array.isArray(definition.phrases) || definition.phrases.length === 0) {
    throw new Error(`Intent ${definition.id} requires at least one phrase`);
  }
  intentStore.push({
    category: definition.category || "General",
    target: definition.target || { studio: "Creative OS", tabId: null, route: "/studio", recipeId: null, skillIds: [] },
    ...definition,
    phrases: [...new Set(definition.phrases.map(normalizeIntentText).filter(Boolean))],
  });
  return definition;
}

function scorePhrase(query, phrase) {
  if (!query) return 0;
  if (query === phrase) return 1.0;
  if (phrase.startsWith(query) && query.length >= 3) return 0.8; // user still typing a known phrase
  if (query.startsWith(phrase)) return 0.75; // known phrase leading the query
  if (query.includes(phrase)) return 0.7; // known phrase inside the query
  if (phrase.includes(query) && query.length >= 3) return 0.55; // query is a fragment of a phrase
  return 0;
}

// Resolves a natural-language query to the best-matching intent.
// Returns { intent, confidence, matchedPhrase } or null when nothing clears
// MIN_INTENT_CONFIDENCE. Ties are broken by the longest matched phrase.
export function resolveIntent(query) {
  const q = normalizeIntentText(query);
  if (!q) return null;
  let best = null;
  let bestScore = 0;
  let bestPhrase = "";
  for (const intent of intentStore) {
    for (const phrase of intent.phrases) {
      const score = scorePhrase(q, phrase);
      if (score < MIN_INTENT_CONFIDENCE) continue;
      if (score > bestScore || (score === bestScore && phrase.length > bestPhrase.length)) {
        bestScore = score;
        best = intent;
        bestPhrase = phrase;
      }
    }
  }
  if (!best) return null;
  return { intent: best, confidence: bestScore, matchedPhrase: bestPhrase };
}

// Recommends the AI Twin for an intent: the existing twin created from the
// blueprint, or a blueprint to instantiate. Returns null for non-twin intents.
// `storage` is optional (defaults to the browser store) so Node tests can
// inject a fake.
export function recommendTwinForIntent(intent, storage) {
  const blueprintId = intent?.target?.twinBlueprintId;
  if (!blueprintId) return null;
  const blueprint = getBlueprint(blueprintId);
  const twins = listTwins(storage);
  const byBlueprint = twins.find((twin) => twin.metadata?.blueprintId === blueprintId);
  if (byBlueprint) return { kind: "twin", twinId: byBlueprint.id, blueprintId, name: byBlueprint.name };
  const expectedRole = normalizeIntentText(blueprint.name);
  const byRole = twins.find((twin) => twin.role && normalizeIntentText(twin.role) === expectedRole);
  if (byRole) return { kind: "twin", twinId: byRole.id, blueprintId, name: byRole.name };
  return { kind: "blueprint", blueprintId, name: blueprint.name };
}

// Builds the Creative Job skeleton an intent implies. The Execution Engine
// (Milestone 6) consumes this to run Recipe → Skill → Creative Intelligence →
// Provider without the Command Bar knowing who does the work.
export function buildIntentJob(intent, { campaignId = null, campaignName = null } = {}) {
  const recipeId = intent?.target?.recipeId || null;
  const recipe = getRecipeById(recipeId);
  return {
    intentId: intent?.id || null,
    intentName: intent?.name || null,
    category: intent?.category || null,
    recipeId,
    skillIds: intent?.target?.skillIds ? [...intent.target.skillIds] : [],
    providerId: recipe?.providerId || null,
    target: {
      studio: intent?.target?.studio || null,
      tabId: intent?.target?.tabId || null,
      route: intent?.target?.route || null,
    },
    campaignId,
    campaignName,
  };
}
