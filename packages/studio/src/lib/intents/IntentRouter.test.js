import assert from "node:assert/strict";
import test from "node:test";

import {
  INTENT_CATEGORIES,
  MIN_INTENT_CONFIDENCE,
  INTENT_LIBRARY,
  normalizeIntentText,
  getRecipeById,
  listIntents,
  registerIntent,
  resolveIntent,
  recommendTwinForIntent,
  buildIntentJob,
} from "./index.js";
import { getBlueprint } from "../twin/TwinBlueprints.js";
import { createTwin, deleteTwin, listTwins } from "../twin/TwinStore.js";

function createFakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

test("normalizeIntentText collapses case, punctuation, and whitespace", () => {
  assert.equal(normalizeIntentText("  Turn THIS,,, into  Shorts! "), "turn this into shorts");
  assert.equal(normalizeIntentText(""), "");
});

test("registry contains the five capability categories", () => {
  for (const category of INTENT_CATEGORIES) {
    assert.ok(listIntents().some((i) => i.category === category), `missing category ${category}`);
  }
});

test("twin intents are generated for every blueprint", () => {
  const twinIntents = listIntents().filter((i) => i.category === "AI Twins");
  assert.ok(twinIntents.length >= 10, `expected >= 10 twin intents, got ${twinIntents.length}`);
  assert.ok(twinIntents.every((i) => i.target.tabId === "ai-twin"));
  assert.ok(twinIntents.every((i) => i.target.twinBlueprintId));
});

test("multiple phrases map to the same intent", () => {
  const expectations = [
    ["turn this into shorts", "repurpose-shorts"],
    ["repurpose this video", "repurpose-shorts"],
    ["create tiktoks", "repurpose-shorts"],
    ["make youtube shorts", "repurpose-shorts"],
    ["extract highlights", "repurpose-shorts"],
    ["find the best clips", "repurpose-shorts"],
    ["turn my webinar into reels", "repurpose-shorts"],
    ["animate my logo", "motion-graphics"],
    ["create motion graphics", "motion-graphics"],
    ["make an animated chart", "motion-graphics"],
    ["build a countdown", "motion-graphics"],
    ["create a talking avatar", "talking-avatar"],
    ["recast this character", "performance-transfer"],
    ["animate my influencer", "talking-avatar"],
    ["recast this video", "performance-transfer"],
    ["transfer this performance", "performance-transfer"],
    ["make my spokesperson talk", "talking-avatar"],
    ["lip sync", "character-lip-sync"],
    ["lip-sync this video", "character-lip-sync"],
    ["sync lips to audio", "character-lip-sync"],
    ["animate my character", "character-animation"],
    ["character animation", "character-animation"],
    ["make my character move", "character-animation"],
    ["generate campaign", "campaign-plan"],
    ["launch product", "campaign-plan"],
    ["build funnel", "campaign-plan"],
    ["create pinterest campaign", "campaign-plan"],
  ];
  for (const [query, expectedId] of expectations) {
    const resolved = resolveIntent(query);
    assert.ok(resolved, `no intent for "${query}"`);
    assert.equal(resolved.intent.id, expectedId, `"${query}" resolved to ${resolved.intent.id}`);
  }
});

test("maven phrases route to the matching twin intent", () => {
  const expectations = [
    ["use marketing maven", "marketing-strategist"],
    ["switch to coach maven", "workflow-builder"],
    ["talk to research maven", "research-assistant"],
    ["ask brand designer", "brand-designer"],
    ["creative director", "creative-director"],
    ["use copywriter", "copywriter"],
  ];
  for (const [query, blueprintId] of expectations) {
    const resolved = resolveIntent(query);
    assert.ok(resolved, `no intent for "${query}"`);
    assert.equal(resolved.intent.target.twinBlueprintId, blueprintId, `"${query}"`);
  }
});

test("intent targets carry studio, tab, and recipe", () => {
  const video = resolveIntent("turn this into shorts").intent.target;
  assert.equal(video.studio, "Video Studio");
  assert.equal(video.tabId, "video");
  assert.equal(video.recipeId, "repurposeVideo");
  assert.deepEqual(video.skillIds, ["ai-clipping"]);

  const motion = resolveIntent("create motion graphics").intent.target;
  assert.equal(motion.studio, "Marketing Studio");
  assert.equal(motion.tabId, "marketing");
  assert.equal(motion.recipeId, "motionGraphics");
  assert.deepEqual(motion.skillIds, ["vibe-motion"]);

  const avatar = resolveIntent("create a talking avatar").intent.target;
  assert.equal(avatar.studio, "Character Studio");
  assert.equal(avatar.tabId, "character");
  assert.equal(avatar.recipeId, "talkingAvatar");
  assert.deepEqual(avatar.skillIds, ["talking-avatar"]);

  const performance = resolveIntent("recast this character").intent.target;
  assert.equal(performance.studio, "Character Studio");
  assert.equal(performance.tabId, "character");
  assert.equal(performance.recipeId, "performanceTransfer");
  assert.deepEqual(performance.skillIds, ["recast"]);

  const lipSync = resolveIntent("lip sync").intent.target;
  assert.equal(lipSync.studio, "Character Studio");
  assert.equal(lipSync.tabId, "character");
  assert.equal(lipSync.recipeId, "characterLipSync");
  assert.deepEqual(lipSync.skillIds, ["character-lip-sync"]);

  const animation = resolveIntent("animate my character").intent.target;
  assert.equal(animation.studio, "Character Studio");
  assert.equal(animation.tabId, "character");
  assert.equal(animation.recipeId, "characterAnimation");
  assert.deepEqual(animation.skillIds, ["character-animation"]);

  const campaign = resolveIntent("generate campaign").intent.target;
  assert.equal(campaign.tabId, "campaigns");
  assert.equal(campaign.recipeId, null);
});

test("no-match queries return null", () => {
  assert.equal(resolveIntent("totally unrelated phrase"), null);
  assert.equal(resolveIntent(""), null);
  assert.equal(resolveIntent(null), null);
});

test("confidence respects the minimum threshold", () => {
  const resolved = resolveIntent("turn this into shorts");
  assert.ok(resolved.confidence >= MIN_INTENT_CONFIDENCE);
});

test("recommendTwinForIntent suggests the blueprint when no twin exists", () => {
  const resolved = resolveIntent("use marketing maven");
  const storage = createFakeStorage();
  const recommendation = recommendTwinForIntent(resolved.intent, storage);
  assert.equal(recommendation.kind, "blueprint");
  assert.equal(recommendation.blueprintId, "marketing-strategist");
});

test("recommendTwinForIntent returns the existing twin when present", () => {
  const storage = createFakeStorage();
  const blueprint = getBlueprint("marketing-strategist");
  const twin = createTwin(
    { name: "Maya", metadata: { blueprintId: blueprint.id } },
    storage
  );
  const resolved = resolveIntent("use marketing maven");
  const recommendation = recommendTwinForIntent(resolved.intent, storage);
  assert.equal(recommendation.kind, "twin");
  assert.equal(recommendation.twinId, twin.id);
  deleteTwin(twin.id, storage);
});

test("recommendTwinForIntent matches twins by role as a fallback", () => {
  const storage = createFakeStorage();
  const twin = createTwin({ name: "Brand", role: "Brand Designer" }, storage);
  const resolved = resolveIntent("ask brand designer");
  const recommendation = recommendTwinForIntent(resolved.intent, storage);
  assert.equal(recommendation.kind, "twin");
  assert.equal(recommendation.twinId, twin.id);
  deleteTwin(twin.id, storage);
});

test("recommendTwinForIntent returns null for non-twin intents", () => {
  const resolved = resolveIntent("create motion graphics");
  assert.equal(recommendTwinForIntent(resolved.intent), null);
});

test("buildIntentJob derives recipe and provider from config", () => {
  const resolved = resolveIntent("animate my logo");
  const job = buildIntentJob(resolved.intent, { campaignId: "camp-1", campaignName: "Drop" });
  assert.equal(job.intentId, "motion-graphics");
  assert.equal(job.recipeId, "motionGraphics");
  assert.equal(job.providerId, "muapi");
  assert.equal(job.target.tabId, "marketing");
  assert.equal(job.campaignId, "camp-1");
  assert.equal(job.campaignName, "Drop");
});

test("getRecipeById resolves real recipe config", () => {
  assert.equal(getRecipeById("video-transform").capabilityRequirements[0], "video_editing");
  assert.equal(getRecipeById("nope"), null);
});

test("registerIntent is extensible for future skills", () => {
  const before = listIntents().length;
  const custom = {
    id: "custom-zoom",
    name: "Create a zoom burst",
    description: "Test intent",
    category: "Video",
    phrases: ["make a zoom burst", "zoom burst"],
    target: { studio: "Video Studio", tabId: "video", route: "/studio/video", recipeId: "video-transform", skillIds: [] },
  };
  registerIntent(custom);
  assert.equal(listIntents().length, before + 1);
  const resolved = resolveIntent("make a zoom burst");
  assert.equal(resolved.intent.id, "custom-zoom");
  assert.throws(() => registerIntent(custom), /already registered/);
  assert.throws(() => registerIntent({}), /stable id/);
  assert.throws(() => registerIntent({ id: "x", phrases: [] }), /at least one phrase/);
});

test("INTENT_LIBRARY is introspectable and stable across reads", () => {
  assert.ok(INTENT_LIBRARY.length >= 14);
  assert.deepEqual(INTENT_LIBRARY, INTENT_LIBRARY);
});
