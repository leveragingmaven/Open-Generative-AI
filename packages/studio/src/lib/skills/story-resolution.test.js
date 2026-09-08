import assert from "node:assert/strict";
import test from "node:test";
import {
  SKILL_LIBRARY,
  getSkill,
  evaluateStoryResolution,
  verifyStoryResolution,
  analyzeStoryResolution,
  preserveStoryResolution,
  buildStoryResolutionRecommendations,
  STORY_RESOLUTION_SKILL_ID,
  RESOLUTION_PATTERNS,
  CLOSURE_MARKERS,
  TRANSFORMATION_MARKERS,
  RESOLUTION_VOCAB,
} from "./index.js";
import { applyCreativeSkill } from "../creative-brief/CreativeSkill.js";

const SKILL = getSkill(STORY_RESOLUTION_SKILL_ID);

const REQUIRED_FIELDS = [
  "skillId",
  "name",
  "version",
  "schemaVersion",
  "category",
  "supportedStudios",
  "creativePrinciples",
  "vocabulary",
  "craftGuidance",
  "constraints",
  "evaluationRules",
  "provenance",
  "status",
];

test("story-resolution is registered and discoverable", () => {
  assert.ok(SKILL_LIBRARY[STORY_RESOLUTION_SKILL_ID], "registered in SKILL_LIBRARY");
  assert.equal(SKILL.skillId, STORY_RESOLUTION_SKILL_ID);
  assert.equal(SKILL.name, "Story Resolution");
  assert.equal(SKILL.category, "storytelling");
  assert.equal(SKILL.status, "active");
  assert.equal(SKILL.priority, "foundational");
  assert.equal(SKILL.shared, true);
  assert.equal(SKILL.discoverable, true);
});

test("story-resolution follows the approved Creative Skill schema", () => {
  for (const field of REQUIRED_FIELDS) {
    assert.ok(SKILL[field] !== undefined, `missing ${field}`);
  }
  assert.equal(SKILL.version, "1.0.0");
  assert.equal(SKILL.schemaVersion, "1.0.0");
  assert.ok(Array.isArray(SKILL.vocabulary));
  assert.ok(Array.isArray(SKILL.creativePrinciples));
  assert.ok(Array.isArray(SKILL.constraints));
  assert.ok(Array.isArray(SKILL.evaluationRules));
  assert.equal(typeof SKILL.craftGuidance, "object");
});

test("story-resolution is shared across every compatible studio", () => {
  for (const studio of ["marketing", "publishing", "ai-twin", "video", "audio", "workflow"]) {
    assert.ok(SKILL.supportedStudios.includes(studio), `missing ${studio}`);
  }
});

test("story-resolution declares advisory dependency metadata", () => {
  assert.deepEqual(SKILL.dependsOn, [
    "story-structure",
    "narrative-flow",
    "emotional-pacing",
    "character-perspective",
    "story-continuity",
  ]);
  assert.deepEqual(SKILL.complements, ["call-to-action-strategy", "trust-building"]);
  assert.deepEqual(SKILL.sharedUtilities, ["communication-utils"]);
});

test("manifest declares the compatible recipes", () => {
  assert.deepEqual(SKILL.compatibleRecipes, [
    "video-script",
    "podcast",
    "story-content",
    "webinar",
    "presentation",
    "blog",
    "educational-content",
    "sales-presentation",
  ]);
});

test("manifest declares all seven decision rules", () => {
  const ids = SKILL.decisionRules.map((rule) => rule.id);
  assert.deepEqual(ids, ["R1", "R2", "R3", "R4", "R5", "R6", "R7"]);
});

test("Test 1: a narrative ending before the conflict resolves recommends strengthening the resolution", () => {
  const result = evaluateStoryResolution({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "We struggled for years. The problem never ended. Everything went wrong.",
  });
  assert.equal(result.flags.unresolvedConflict, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R1"), "R1 recommendation present");
  assert.equal(result.endingPattern, "unresolved");
  assert.ok(
    !result.recommendations.some((r) => ["R2", "R3", "R4", "R5", "R6", "R7"].includes(r.ruleId)),
    "only the resolution fix is recommended",
  );
});

test("Test 2: earlier promises left unresolved recommend fulfilling or removing them", () => {
  const result = evaluateStoryResolution({
    creativeBrief: "Deliver ongoing value to subscribers.",
    campaignContext: "Email nurture.",
    draftContent: "You'll learn a lot in this course. Stay tuned for what's coming up. We'll show you more soon.",
  });
  assert.equal(result.flags.abandonedPromise, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R2"), "R2 recommendation present");
  assert.ok(
    !result.recommendations.some((r) => ["R1", "R3", "R4", "R5", "R6", "R7"].includes(r.ruleId)),
    "only the promise fix is recommended",
  );
});

test("Test 3: an incomplete transformation recommends reinforcing the before-and-after journey", () => {
  const result = evaluateStoryResolution({
    creativeBrief: "Show how our process changes results.",
    campaignContext: "Launch campaign.",
    draftContent: "We struggled with scheduling. Finally, we found a way to fix it. In the end, we solved it.",
  });
  assert.equal(result.flags.incompleteTransformation, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R3"), "R3 recommendation present");
  assert.ok(
    !result.recommendations.some((r) => ["R1", "R2", "R4", "R5", "R6", "R7"].includes(r.ruleId)),
    "only the transformation fix is recommended",
  );
});

test("Test 4: an abrupt ending recommends a stronger narrative landing", () => {
  const result = evaluateStoryResolution({
    creativeBrief: "Explain the course outcome.",
    campaignContext: "Launch campaign.",
    draftContent: "The solution was clear. We figured it out.",
  });
  assert.equal(result.flags.abruptEnding, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R4"), "R4 recommendation present");
  assert.equal(result.endingPattern, "abrupt");
  assert.ok(
    !result.recommendations.some((r) => ["R1", "R2", "R3", "R5", "R6", "R7"].includes(r.ruleId)),
    "only the landing fix is recommended",
  );
});

test("Test 5: a complete, satisfying resolution returns high scores and no recommendations", () => {
  const result = evaluateStoryResolution({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "At first, we struggled with scheduling. We promised a better way. We changed our whole process. Now we save hours every week. In the end, we finally succeeded.",
  });
  assert.equal(result.flags.unresolvedConflict, false);
  assert.equal(result.flags.abandonedPromise, false);
  assert.equal(result.flags.incompleteTransformation, false);
  assert.equal(result.flags.abruptEnding, false);
  assert.equal(result.flags.informationalContent, false);
  assert.equal(result.flags.fabricatedStory, false);
  assert.equal(result.endingPattern, "complete");
  assert.ok(result.scores.closure >= 85, `closure ${result.scores.closure} should be high`);
  assert.ok(result.scores.promiseFulfillment >= 70, `promiseFulfillment ${result.scores.promiseFulfillment} should be high`);
  assert.ok(result.scores.transformationCompletion >= 85, `transformation ${result.scores.transformationCompletion} should be high`);
  assert.ok(result.scores.endingEffectiveness >= 85, `ending ${result.scores.endingEffectiveness} should be high`);
  assert.ok(result.scores.overallResolution >= 85, `overall ${result.scores.overallResolution} should be high`);
  assert.equal(result.recommendations.length, 0, "a complete resolution needs no recommendations");
});

test("Test 6: technical documentation is not forced into a narrative conclusion", () => {
  const result = evaluateStoryResolution({
    creativeBrief: "Document the configuration parameters.",
    campaignContext: "Reference guide.",
    contentType: "documentation",
    draftContent: "This documentation covers the configuration parameters. See section four for the syntax.",
  });
  assert.equal(result.flags.informationalContent, true);
  assert.equal(result.endingPattern, "none");
  assert.ok(result.recommendations.some((r) => r.ruleId === "R5"), "R5 recommendation present");
  assert.ok(
    !result.recommendations.some((r) => ["R1", "R2", "R3", "R4", "R6", "R7"].includes(r.ruleId)),
    "no narrative-ending changes on informational content",
  );
});

test("Test 7: an ungrounded story is rejected and creator intent is preserved", () => {
  const result = evaluateStoryResolution({
    draftContent: "At first we struggled. Eventually we figured it out. We succeeded in the end.",
  });
  assert.equal(result.flags.fabricatedStory, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R6"), "R6 rejection present");
  assert.ok(result.recommendations.some((r) => r.ruleId === "R7"), "R7 intent preservation present");
  assert.ok(
    !result.recommendations.some((r) => ["R1", "R2", "R3", "R4", "R5"].includes(r.ruleId)),
    "no resolution recommendations when the story is ungrounded",
  );
});

test("scores are independent, bounded 0-100, and never null", () => {
  const result = evaluateStoryResolution({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "At first, we struggled with scheduling. We changed our whole process. Now we save hours. In the end, we succeeded.",
  });
  for (const key of ["closure", "promiseFulfillment", "transformationCompletion", "endingEffectiveness", "overallResolution"]) {
    assert.equal(typeof result.scores[key], "number");
    assert.ok(result.scores[key] >= 0 && result.scores[key] <= 100, `${key} within 0-100`);
  }
  assert.equal(typeof result.resolutionScore, "number");
  assert.equal(typeof result.closureScore, "number");
  assert.equal(typeof result.promiseFulfillmentScore, "number");
  assert.equal(typeof result.transformationCompletionScore, "number");
  assert.equal(typeof result.endingEffectivenessScore, "number");
});

test("evaluation is deterministic across repeated calls", () => {
  const input = {
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "At first, we struggled with scheduling. We promised a better way. We changed our whole process. Now we save hours every week. In the end, we finally succeeded.",
  };
  const first = evaluateStoryResolution(input);
  const second = evaluateStoryResolution(input);
  assert.deepEqual(first.scores, second.scores);
  assert.deepEqual(first.flags, second.flags);
  assert.deepEqual(first.signals, second.signals);
  assert.deepEqual(first.recommendations, second.recommendations);
});

test("preserveStoryResolution is a meaning-preserving no-op (resolution is recommended, never rewritten)", () => {
  const original = "At first we struggled. In the end we finally succeeded. We save time daily.";
  const { preservedContent, edits } = preserveStoryResolution(original);
  assert.equal(preservedContent, original);
  assert.deepEqual(edits, []);
});

test("AI Twin verification exposes the five internal checks", () => {
  const verification = verifyStoryResolution({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "At first, we struggled with scheduling. We promised a better way. We changed our whole process. Now we save hours every week. In the end, we finally succeeded.",
  });
  assert.equal(verification.skillId, STORY_RESOLUTION_SKILL_ID);
  assert.equal(typeof verification.primaryConflictResolved, "boolean");
  assert.equal(typeof verification.promisesFulfilled, "boolean");
  assert.equal(typeof verification.transformationComplete, "boolean");
  assert.equal(typeof verification.endingEmotionallySatisfying, "boolean");
  assert.equal(typeof verification.endingReinforcesMessage, "boolean");
  assert.equal(typeof verification.canImproveWithoutChangingIntent, "boolean");
  assert.equal(verification.primaryConflictResolved, true);
  assert.equal(verification.promisesFulfilled, true);
  assert.equal(verification.transformationComplete, true);
  assert.equal(verification.endingEmotionallySatisfying, true);
  assert.equal(verification.endingReinforcesMessage, true);
});

test("analyzeStoryResolution handles empty and missing content safely", () => {
  const empty = analyzeStoryResolution({ draftContent: "" });
  assert.equal(empty.signals.wordCount, 0);
  assert.equal(empty.flags.emptyContent, true);
  assert.equal(typeof empty.resolutionScore, "number");
  const missing = analyzeStoryResolution({});
  assert.equal(missing.signals.wordCount, 0);
  assert.equal(missing.flags.emptyContent, true);
  assert.equal(typeof missing.resolutionScore, "number");
});

test("honesty constraints are enforced by the manifest", () => {
  assert.ok(SKILL.constraints.includes("never invent missing endings"));
  assert.ok(SKILL.constraints.includes("never fabricate missing outcomes"));
  assert.ok(SKILL.constraints.includes("never create unsupported conclusions"));
  assert.ok(SKILL.constraints.includes("never rewrite the story"));
  assert.ok(SKILL.constraints.includes("never override creator intent"));
});

test("buildStoryResolutionRecommendations returns a stable ordered list", () => {
  const analysis = analyzeStoryResolution({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "We struggled for years. The problem never ended. Everything went wrong.",
  });
  const recommendations = buildStoryResolutionRecommendations(analysis);
  assert.ok(Array.isArray(recommendations));
  assert.ok(recommendations.length > 0);
  for (const recommendation of recommendations) {
    assert.ok(recommendation.ruleId);
    assert.ok(recommendation.severity);
    assert.ok(recommendation.recommendation);
    assert.ok(recommendation.reason);
  }
});

test("story-resolution works with the shared enrichment integration", () => {
  const brief = {
    version: 1,
    studio: "marketing",
    goal: "launch email",
    subject: "product launch",
    tone: "direct",
    style: "plain",
    brand: null,
    format: { medium: "copy", aspect: null, motion: null },
    meta: { source: "creative-brief-v1" },
  };
  const enriched = applyCreativeSkill(brief, SKILL);
  assert.equal(enriched.skill.skillId, STORY_RESOLUTION_SKILL_ID);
  assert.deepEqual(enriched.constraints, SKILL.constraints);
  assert.ok(enriched.style.includes("plain"));
});

test("unknown skill IDs still throw after registration change", () => {
  assert.throws(() => getSkill("does-not-exist"), /Unknown creative skill/);
});

test("SKILL_LIBRARY remains frozen", () => {
  assert.ok(Object.isFrozen(SKILL_LIBRARY));
});

test("the additive resolution vocabularies are reusable by dependent skills", () => {
  assert.ok(CLOSURE_MARKERS.length > 0);
  assert.ok(TRANSFORMATION_MARKERS.length > 0);
  assert.ok(RESOLUTION_PATTERNS.complete);
  assert.ok(RESOLUTION_PATTERNS.unresolved);
  assert.ok(RESOLUTION_PATTERNS.abrupt);
  assert.ok(RESOLUTION_PATTERNS.open);
  assert.ok(RESOLUTION_PATTERNS.none);
  assert.deepEqual(RESOLUTION_VOCAB.closureMarkers, CLOSURE_MARKERS);
  assert.deepEqual(RESOLUTION_VOCAB.transformationMarkers, TRANSFORMATION_MARKERS);
  assert.deepEqual(RESOLUTION_VOCAB.resolutionPatterns, RESOLUTION_PATTERNS);
  assert.ok(CLOSURE_MARKERS.includes("in the end"));
  assert.ok(TRANSFORMATION_MARKERS.includes("changed"));
});