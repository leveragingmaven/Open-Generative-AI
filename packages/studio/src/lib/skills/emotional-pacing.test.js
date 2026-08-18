import assert from "node:assert/strict";
import test from "node:test";
import {
  SKILL_LIBRARY,
  getSkill,
  evaluateEmotionalPacing,
  verifyEmotionalPacing,
  analyzeEmotionalPacing,
  preserveEmotionalPacing,
  buildEmotionalPacingRecommendations,
  EMOTIONAL_PACING_SKILL_ID,
  POSITIVE_EMOTION_MARKERS,
  NEGATIVE_EMOTION_MARKERS,
  EMOTIONAL_INTENSITY_MARKERS,
} from "./index.js";
import { applyCreativeSkill } from "../creative-brief/CreativeSkill.js";

const SKILL = getSkill(EMOTIONAL_PACING_SKILL_ID);

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

test("emotional-pacing is registered and discoverable", () => {
  assert.ok(SKILL_LIBRARY[EMOTIONAL_PACING_SKILL_ID], "registered in SKILL_LIBRARY");
  assert.equal(SKILL.skillId, EMOTIONAL_PACING_SKILL_ID);
  assert.equal(SKILL.name, "Emotional Pacing");
  assert.equal(SKILL.category, "storytelling");
  assert.equal(SKILL.status, "active");
  assert.equal(SKILL.priority, "foundational");
  assert.equal(SKILL.shared, true);
  assert.equal(SKILL.discoverable, true);
});

test("emotional-pacing follows the approved Creative Skill schema", () => {
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

test("emotional-pacing is shared across every compatible studio", () => {
  for (const studio of ["marketing", "publishing", "ai-twin", "video", "audio", "workflow"]) {
    assert.ok(SKILL.supportedStudios.includes(studio), `missing ${studio}`);
  }
});

test("emotional-pacing declares advisory dependency metadata", () => {
  assert.deepEqual(SKILL.dependsOn, ["story-structure", "narrative-flow"]);
  assert.deepEqual(SKILL.complements, ["character-perspective", "story-continuity"]);
  assert.deepEqual(SKILL.sharedUtilities, ["communication-utils"]);
});

test("manifest declares the compatible content types", () => {
  assert.deepEqual(SKILL.compatibleContentTypes, [
    "video-script",
    "podcast",
    "story-content",
    "presentation",
    "webinar",
    "blog",
    "educational-content",
    "sales-presentation",
  ]);
});

test("manifest declares all seven decision rules", () => {
  const ids = SKILL.decisionRules.map((rule) => rule.id);
  assert.deepEqual(ids, ["R1", "R2", "R3", "R4", "R5", "R6", "R7"]);
});

test("Test 1: emotionally flat content recommends increased emotional variation", () => {
  const result = evaluateEmotionalPacing({
    creativeBrief: "Announce the quarterly update.",
    campaignContext: "Product update.",
    draftContent: "The product ships next week. Pricing starts at ninety-nine dollars. The team handles support. We ship quarterly.",
  });
  assert.equal(result.flags.flatTone, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R1"), "R1 recommendation present");
  assert.ok(result.emotionalVariationScore < 70, `variationScore ${result.emotionalVariationScore} should be low`);
  assert.ok(result.emotionalProgressionScore < 70, `progressionScore ${result.emotionalProgressionScore} should be low`);
});

test("Test 2: emotion shifting without explanation recommends smoother progression", () => {
  const result = evaluateEmotionalPacing({
    creativeBrief: "Share the launch story.",
    campaignContext: "Launch campaign.",
    draftContent: "We were thrilled to launch. The results were devastating. We felt relieved afterward.",
  });
  assert.equal(result.flags.abruptEmotionalShifts, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R2"), "R2 recommendation present");
  assert.ok(result.emotionalConsistencyScore < 70, `consistencyScore ${result.emotionalConsistencyScore} should be penalized`);
  assert.ok(result.signals.abruptShifts >= 2, "multiple abrupt shifts detected");
});

test("Test 3: an immediate emotional climax recommends redistributing emphasis", () => {
  const result = evaluateEmotionalPacing({
    creativeBrief: "Describe the project journey.",
    campaignContext: "Project update.",
    draftContent: "It was the most incredible, amazing breakthrough ever. The project had many phases. Each phase had a normal step. We finished the last step on time.",
  });
  assert.equal(result.flags.earlyClimax, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R3"), "R3 recommendation present");
  assert.ok(result.emotionalProgressionScore < 70, `progressionScore ${result.emotionalProgressionScore} should be penalized`);
});

test("Test 4: natural emotional progression returns high scores", () => {
  const result = evaluateEmotionalPacing({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "We struggled at first and felt overwhelmed. But as time passed, we kept improving step by step. Finally, we succeeded and felt proud and relieved.",
  });
  assert.equal(result.flags.flatTone, false);
  assert.equal(result.flags.abruptEmotionalShifts, false);
  assert.equal(result.flags.earlyClimax, false);
  assert.equal(result.flags.narrativeEmotionConflict, false);
  assert.equal(result.flags.fabricatedEmotion, false);
  assert.ok(result.emotionalProgressionScore >= 85, `progressionScore ${result.emotionalProgressionScore} should be high`);
  assert.ok(result.emotionalVariationScore >= 85, `variationScore ${result.emotionalVariationScore} should be high`);
  assert.ok(result.emotionalBalanceScore >= 85, `balanceScore ${result.emotionalBalanceScore} should be high`);
  assert.ok(result.emotionalConsistencyScore >= 85, `consistencyScore ${result.emotionalConsistencyScore} should be high`);
  assert.ok(result.emotionalPacingScore >= 85, `pacingScore ${result.emotionalPacingScore} should be high`);
  assert.equal(result.recommendations.length, 0, "a natural arc needs no pacing recommendations");
});

test("Test 5: technical documentation with neutral tone is not forced", () => {
  const result = evaluateEmotionalPacing({
    creativeBrief: "Document the setup and configuration.",
    campaignContext: "Reference guide.",
    contentType: "documentation",
    draftContent: "This guide documents the setup. See chapter two for configuration. The appendix lists the defaults.",
  });
  assert.equal(result.flags.informationalContent, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R5"), "R5 recommendation present");
  assert.ok(
    !result.recommendations.some((r) => ["R1", "R2", "R3", "R4", "R6", "R7"].includes(r.ruleId)),
    "no emotional storytelling on informational content",
  );
});

test("Test 6: ungrounded emotional narrative rejects the modification", () => {
  const result = evaluateEmotionalPacing({
    draftContent: "I was devastated when we failed. But I never gave up. Eventually I felt incredible joy.",
  });
  assert.equal(result.flags.fabricatedEmotion, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R6"), "R6 rejection present");
  assert.ok(result.recommendations.some((r) => r.ruleId === "R7"), "R7 intent preservation present");
  assert.ok(
    !result.recommendations.some((r) => ["R1", "R2", "R3", "R4", "R5"].includes(r.ruleId)),
    "no pacing recommendations when the emotion is ungrounded",
  );
});

test("emotion that conflicts with the narrative structure recommends alignment", () => {
  const result = evaluateEmotionalPacing({
    creativeBrief: "Tell the project story.",
    campaignContext: "Project update.",
    draftContent: "The project started calmly. The struggle was brutal. We finally reached the end.",
  });
  assert.equal(result.flags.narrativeEmotionConflict, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R4"), "R4 recommendation present");
  assert.ok(
    !result.recommendations.some((r) => ["R1", "R2", "R3"].includes(r.ruleId)),
    "only the alignment fix is recommended",
  );
});

test("scores are independent, bounded 0-100, and never null", () => {
  const result = evaluateEmotionalPacing({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "We struggled at first and felt overwhelmed. But as time passed, we kept improving step by step. Finally, we succeeded and felt proud and relieved.",
  });
  for (const key of ["emotionalProgression", "emotionalVariation", "emotionalBalance", "emotionalConsistency", "audienceEngagement"]) {
    assert.equal(typeof result.scores[key], "number");
    assert.ok(result.scores[key] >= 0 && result.scores[key] <= 100, `${key} within 0-100`);
  }
  assert.equal(typeof result.emotionalPacingScore, "number");
  assert.equal(typeof result.emotionalProgressionScore, "number");
  assert.equal(typeof result.emotionalVariationScore, "number");
  assert.equal(typeof result.emotionalBalanceScore, "number");
  assert.equal(typeof result.emotionalConsistencyScore, "number");
});

test("emotionalPacingScore aggregates the independent dimensions", () => {
  const result = evaluateEmotionalPacing({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "We struggled at first and felt overwhelmed. But as time passed, we kept improving step by step. Finally, we succeeded and felt proud and relieved.",
  });
  assert.equal(result.emotionalPacingScore, result.scores.audienceEngagement);
  assert.equal(result.emotionalProgressionScore, result.scores.emotionalProgression);
  assert.equal(result.emotionalVariationScore, result.scores.emotionalVariation);
  assert.equal(result.emotionalBalanceScore, result.scores.emotionalBalance);
  assert.equal(result.emotionalConsistencyScore, result.scores.emotionalConsistency);
});

test("evaluation is deterministic across repeated calls", () => {
  const input = {
    creativeBrief: "Share the launch story.",
    campaignContext: "Launch campaign.",
    draftContent: "We were thrilled to launch. The results were devastating. We felt relieved afterward.",
  };
  const first = evaluateEmotionalPacing(input);
  const second = evaluateEmotionalPacing(input);
  assert.deepEqual(first.scores, second.scores);
  assert.deepEqual(first.flags, second.flags);
  assert.deepEqual(first.signals, second.signals);
  assert.deepEqual(first.recommendations, second.recommendations);
});

test("preserveEmotionalPacing is a meaning-preserving no-op (pacing is recommended, never rewritten)", () => {
  const original = "We struggled at first and felt overwhelmed. Finally, we succeeded and felt proud and relieved.";
  const { preservedContent, edits } = preserveEmotionalPacing(original);
  assert.equal(preservedContent, original);
  assert.deepEqual(edits, []);
});

test("AI Twin verification exposes the five internal checks", () => {
  const verification = verifyEmotionalPacing({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "We struggled at first and felt overwhelmed. But as time passed, we kept improving step by step. Finally, we succeeded and felt proud and relieved.",
  });
  assert.equal(verification.skillId, EMOTIONAL_PACING_SKILL_ID);
  assert.equal(typeof verification.doesEmotionalIntensityProgressNaturally, "boolean");
  assert.equal(typeof verification.isThereAppropriateEmotionalVariation, "boolean");
  assert.equal(typeof verification.doEmotionalShiftsSupportUnderstanding, "boolean");
  assert.equal(typeof verification.isEmotionAuthentic, "boolean");
  assert.equal(typeof verification.doesPacingStrengthenCommunication, "boolean");
  assert.equal(typeof verification.canImproveWithoutChangingIntent, "boolean");
  assert.equal(verification.doesEmotionalIntensityProgressNaturally, true);
  assert.equal(verification.isThereAppropriateEmotionalVariation, true);
  assert.equal(verification.doEmotionalShiftsSupportUnderstanding, true);
  assert.equal(verification.isEmotionAuthentic, true);
  assert.equal(verification.doesPacingStrengthenCommunication, true);
});

test("emotional-pacing works with the shared enrichment integration", () => {
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
  assert.equal(enriched.skill.skillId, EMOTIONAL_PACING_SKILL_ID);
  assert.deepEqual(enriched.constraints, SKILL.constraints);
  assert.ok(enriched.style.includes("plain"));
});

test("unknown skill IDs still throw after registration change", () => {
  assert.throws(() => getSkill("does-not-exist"), /Unknown creative skill/);
});

test("SKILL_LIBRARY remains frozen", () => {
  assert.ok(Object.isFrozen(SKILL_LIBRARY));
});

test("analyzeEmotionalPacing handles empty and missing content safely", () => {
  const empty = analyzeEmotionalPacing({ draftContent: "" });
  assert.equal(empty.signals.wordCount, 0);
  assert.equal(empty.flags.emptyContent, true);
  assert.equal(typeof empty.emotionalPacingScore, "number");
  const missing = analyzeEmotionalPacing({});
  assert.equal(missing.signals.wordCount, 0);
  assert.equal(missing.scores.emotionalProgression, 50);
  assert.equal(typeof missing.emotionalPacingScore, "number");
});

test("honesty constraints are enforced by the manifest", () => {
  assert.ok(SKILL.constraints.includes("never fabricate emotional experiences"));
  assert.ok(SKILL.constraints.includes("never invent reactions"));
  assert.ok(SKILL.constraints.includes("never exaggerate emotion"));
  assert.ok(SKILL.constraints.includes("never manipulate audiences"));
  assert.ok(SKILL.constraints.includes("never override creator intent"));
});

test("buildEmotionalPacingRecommendations returns a stable ordered list", () => {
  const analysis = analyzeEmotionalPacing({
    creativeBrief: "Share the launch story.",
    campaignContext: "Launch campaign.",
    draftContent: "We were thrilled to launch. The results were devastating. We felt relieved afterward.",
  });
  const recommendations = buildEmotionalPacingRecommendations(analysis);
  assert.ok(Array.isArray(recommendations));
  assert.ok(recommendations.length > 0);
  for (const recommendation of recommendations) {
    assert.ok(recommendation.ruleId);
    assert.ok(recommendation.severity);
    assert.ok(recommendation.recommendation);
    assert.ok(recommendation.reason);
  }
});

test("the additive emotional lexicons are reusable by dependent skills", () => {
  assert.ok(POSITIVE_EMOTION_MARKERS.length > 0);
  assert.ok(NEGATIVE_EMOTION_MARKERS.length > 0);
  assert.ok(EMOTIONAL_INTENSITY_MARKERS.length > 0);
  assert.ok(POSITIVE_EMOTION_MARKERS.includes("proud"));
  assert.ok(NEGATIVE_EMOTION_MARKERS.includes("frustrated"));
  assert.ok(EMOTIONAL_INTENSITY_MARKERS.includes("absolutely"));
  const overlap = POSITIVE_EMOTION_MARKERS.filter((marker) => NEGATIVE_EMOTION_MARKERS.includes(marker));
  assert.deepEqual(overlap, [], "positive and negative lexicons must not overlap");
});

test("the sentence report details every sentence's emotional profile", () => {
  const result = evaluateEmotionalPacing({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "We struggled at first and felt overwhelmed. But as time passed, we kept improving step by step. Finally, we succeeded and felt proud and relieved.",
  });
  assert.ok(Array.isArray(result.signals.sentenceReport));
  assert.equal(result.signals.sentenceReport.length, result.signals.sentenceCount);
  for (const entry of result.signals.sentenceReport) {
    assert.equal(typeof entry.sentence, "string");
    assert.equal(typeof entry.positive, "number");
    assert.equal(typeof entry.negative, "number");
    assert.equal(typeof entry.intensity, "number");
    assert.equal(typeof entry.magnitude, "number");
    assert.equal(typeof entry.valence, "number");
  }
});
