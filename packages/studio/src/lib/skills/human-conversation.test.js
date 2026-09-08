import assert from "node:assert/strict";
import test from "node:test";
import {
  SKILL_LIBRARY,
  getSkill,
  evaluateHumanConversation,
  verifyHumanConversation,
  analyzeHumanConversation,
  refineContent,
  buildConversationRecommendations,
  HUMAN_CONVERSATION_SKILL_ID,
} from "./index.js";
import { applyCreativeSkill } from "../creative-brief/CreativeSkill.js";

const SKILL = getSkill(HUMAN_CONVERSATION_SKILL_ID);

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

test("human-conversation is registered and discoverable", () => {
  assert.ok(SKILL_LIBRARY[HUMAN_CONVERSATION_SKILL_ID], "registered in SKILL_LIBRARY");
  assert.equal(SKILL.skillId, HUMAN_CONVERSATION_SKILL_ID);
  assert.equal(SKILL.name, "Human Conversation");
  assert.equal(SKILL.category, "communication");
  assert.equal(SKILL.status, "active");
  assert.equal(SKILL.priority, "foundational");
  assert.equal(SKILL.shared, true);
  assert.equal(SKILL.discoverable, true);
});

test("human-conversation follows the approved Creative Skill schema", () => {
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

test("human-conversation is shared across every compatible studio", () => {
  for (const studio of ["marketing", "video", "audio", "publishing", "workflow", "ai-twin", "agents"]) {
    assert.ok(SKILL.supportedStudios.includes(studio), `missing ${studio}`);
  }
});

test("manifest declares all seven decision rules", () => {
  const ids = SKILL.decisionRules.map((rule) => rule.id);
  assert.deepEqual(ids, ["R1", "R2", "R3", "R4", "R5", "R6", "R7"]);
});

test("Test 1: repetitive sentence structure recommends greater sentence variation", () => {
  const result = evaluateHumanConversation({
    draftContent: "Our platform is fast. Our platform is reliable. Our platform is affordable. Our platform is secure.",
  });
  assert.equal(result.flags.repetitiveStructure, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R1"), "R1 recommendation present");
  assert.ok(result.scores.sentenceVariation < 100, "sentence variation penalized");
});

test("Test 2: robotic transitions recommend smoother conversational flow", () => {
  const result = evaluateHumanConversation({
    draftContent: "Furthermore, we will discuss the benefits. Moreover, we will explain the pricing. Additionally, we will share testimonials. In conclusion, we will summarize.",
  });
  assert.equal(result.flags.mechanicalTransitions, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R2"), "R2 recommendation present");
  assert.ok(result.scores.naturalFlow < 100, "natural flow penalized for robotic transitions");
});

test("Test 3: fabricated personal story rejects the modification", () => {
  const result = evaluateHumanConversation({
    draftContent: "Let me tell you about my own experience with this product. I remember when we saved a client overnight.",
  });
  assert.equal(result.flags.fabricatedExperience, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R6"), "R6 rejection present");
  assert.ok(
    !result.recommendations.some((r) => ["R1", "R2", "R3", "R4", "R5"].includes(r.ruleId)),
    "no delivery recommendations when experience is fabricated",
  );
});

test("Test 4: naturally readable input returns a high conversation score with minimal recommendations", () => {
  const result = evaluateHumanConversation({
    draftContent: "Our product just got a whole lot better. You will feel the difference right away. Give it a try and tell us what you think.",
  });
  assert.equal(result.recommendations.length, 0, "no recommendations for natural copy");
  assert.ok(result.conversationScore >= 80, `conversationScore ${result.conversationScore} should be high`);
});

test("Test 5: excellent rhythm and readability return high Natural Flow and Authenticity", () => {
  const result = evaluateHumanConversation({
    draftContent: "Honestly, we were skeptical at first. So we decided to try it ourselves. The results surprised everyone on the team. Now, a full year later, we cannot imagine working without it.",
  });
  assert.ok(result.naturalFlowScore >= 80, `naturalFlowScore ${result.naturalFlowScore} should be high`);
  assert.ok(result.authenticityScore >= 80, `authenticityScore ${result.authenticityScore} should be high`);
  assert.ok(result.rhythmScore >= 80, `rhythmScore ${result.rhythmScore} should be high`);
});

test("scores are independent, bounded 0-100, and never null", () => {
  const result = evaluateHumanConversation({
    draftContent: "Our product just got a whole lot better. You will feel the difference right away.",
  });
  for (const key of ["conversationQuality", "naturalFlow", "rhythm", "sentenceVariation", "readability", "authenticity"]) {
    assert.equal(typeof result.scores[key], "number");
    assert.ok(result.scores[key] >= 0 && result.scores[key] <= 100, `${key} within 0-100`);
  }
});

test("evaluation is deterministic across repeated calls", () => {
  const input = { draftContent: "Our platform is fast. Our platform is reliable. Our platform is affordable." };
  const first = evaluateHumanConversation(input);
  const second = evaluateHumanConversation(input);
  assert.deepEqual(first.scores, second.scores);
  assert.deepEqual(first.flags, second.flags);
  assert.deepEqual(first.recommendations, second.recommendations);
});

test("refineContent is a meaning-preserving no-op (delivery is recommended, never rewritten)", () => {
  const original = "Furthermore, we will discuss the benefits. Our platform is reliable.";
  const { refinedContent, edits } = refineContent(original);
  assert.equal(refinedContent, original);
  assert.deepEqual(edits, []);
});

test("excessive repetition is flagged", () => {
  const result = analyzeHumanConversation({
    draftContent: "We deliver results. We deliver results. We deliver results. We deliver results. We deliver results.",
  });
  assert.equal(result.flags.excessiveRepetition, true);
  assert.ok(result.scores.readability < 100, "readability penalized for repetition");
});

test("monotone sentence length is flagged", () => {
  const result = analyzeHumanConversation({
    draftContent: "Our platform is fast. Our platform is secure. Our platform is stable. Our platform is modern.",
  });
  assert.equal(result.flags.monotoneLength, true);
});

test("audience formality raises the formal wording threshold", () => {
  const content = "We will utilize our resources to facilitate this endeavor.";
  const generalAudience = analyzeHumanConversation({ draftContent: content });
  const formalAudience = analyzeHumanConversation({
    draftContent: content,
    audienceProfile: { formalityLevel: "formal", context: "business" },
  });
  assert.equal(generalAudience.flags.overlyFormal, true);
  assert.equal(formalAudience.flags.overlyFormal, false);
});

test("AI Twin verification exposes the five internal checks", () => {
  const verification = verifyHumanConversation({
    draftContent: "Our product just got a whole lot better. You will feel the difference right away.",
  });
  assert.equal(verification.skillId, HUMAN_CONVERSATION_SKILL_ID);
  assert.equal(typeof verification.soundsLikeNaturalConversation, "boolean");
  assert.equal(typeof verification.rhythmVaried, "boolean");
  assert.equal(typeof verification.transitionsSmooth, "boolean");
  assert.equal(typeof verification.soundsHumanWithoutPretending, "boolean");
  assert.equal(typeof verification.authenticityPreserved, "boolean");
  assert.equal(typeof verification.canImproveWithoutChangingIntent, "boolean");
});

test("human-conversation works with the shared enrichment integration", () => {
  const brief = {
    version: 1,
    studio: "marketing",
    goal: "launch email",
    subject: "product launch",
    tone: "friendly",
    style: "plain",
    brand: null,
    format: { medium: "copy", aspect: null, motion: null },
    meta: { source: "creative-brief-v1" },
  };
  const enriched = applyCreativeSkill(brief, SKILL);
  assert.equal(enriched.skill.skillId, HUMAN_CONVERSATION_SKILL_ID);
  assert.deepEqual(enriched.constraints, SKILL.constraints);
  assert.ok(enriched.style.includes("plain"));
});

test("unknown skill IDs still throw after registration change", () => {
  assert.throws(() => getSkill("does-not-exist"), /Unknown creative skill/);
});

test("SKILL_LIBRARY remains frozen", () => {
  assert.ok(Object.isFrozen(SKILL_LIBRARY));
});

test("analyzeHumanConversation handles empty and missing content safely", () => {
  const empty = analyzeHumanConversation({ draftContent: "" });
  assert.equal(empty.signals.wordCount, 0);
  assert.equal(typeof empty.conversationScore, "number");
  const missing = analyzeHumanConversation({});
  assert.equal(missing.signals.wordCount, 0);
});

test("identity and authenticity constraints are enforced by the manifest", () => {
  assert.ok(SKILL.constraints.includes("never invent memories"));
  assert.ok(SKILL.constraints.includes("never invent stories"));
  assert.ok(SKILL.constraints.includes("never fabricate lived experiences"));
  assert.ok(SKILL.constraints.includes("never imitate another person"));
  assert.ok(SKILL.constraints.includes("never change factual meaning"));
  assert.ok(SKILL.constraints.includes("never alter creator intent"));
  assert.ok(SKILL.constraints.includes("improve delivery only; never rewrite identity"));
});

test("buildConversationRecommendations returns a stable ordered list", () => {
  const analysis = analyzeHumanConversation({
    draftContent: "Furthermore, we will discuss the benefits. Moreover, we will explain the pricing.",
  });
  const recommendations = buildConversationRecommendations(analysis);
  assert.ok(Array.isArray(recommendations));
  for (const recommendation of recommendations) {
    assert.ok(recommendation.ruleId);
    assert.ok(recommendation.severity);
    assert.ok(recommendation.recommendation);
    assert.ok(recommendation.reason);
  }
});
