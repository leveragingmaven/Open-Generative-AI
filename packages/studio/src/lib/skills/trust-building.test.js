import assert from "node:assert/strict";
import test from "node:test";
import {
  SKILL_LIBRARY,
  getSkill,
  evaluateTrustBuilding,
  verifyTrustBuilding,
  analyzeTrustBuilding,
  preserveContent,
  buildTrustRecommendations,
  TRUST_BUILDING_SKILL_ID,
} from "./index.js";
import { applyCreativeSkill } from "../creative-brief/CreativeSkill.js";

const SKILL = getSkill(TRUST_BUILDING_SKILL_ID);

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

test("trust-building is registered and discoverable", () => {
  assert.ok(SKILL_LIBRARY[TRUST_BUILDING_SKILL_ID], "registered in SKILL_LIBRARY");
  assert.equal(SKILL.skillId, TRUST_BUILDING_SKILL_ID);
  assert.equal(SKILL.name, "Trust Building");
  assert.equal(SKILL.category, "communication");
  assert.equal(SKILL.status, "active");
  assert.equal(SKILL.priority, "foundational");
  assert.equal(SKILL.shared, true);
  assert.equal(SKILL.discoverable, true);
});

test("trust-building follows the approved Creative Skill schema", () => {
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

test("trust-building is shared across every compatible studio", () => {
  for (const studio of ["marketing", "video", "audio", "publishing", "workflow", "ai-twin", "agents"]) {
    assert.ok(SKILL.supportedStudios.includes(studio), `missing ${studio}`);
  }
});

test("trust-building declares advisory dependency metadata", () => {
  assert.deepEqual(SKILL.dependsOn, ["message-clarity", "curiosity-building"]);
  assert.deepEqual(SKILL.complements, ["human-conversation"]);
  assert.ok(SKILL.sharedUtilities.includes("communication-utils"));
});

test("manifest declares all seven decision rules", () => {
  const ids = SKILL.decisionRules.map((rule) => rule.id);
  assert.deepEqual(ids, ["R1", "R2", "R3", "R4", "R5", "R6", "R7"]);
});

test("Test 1: unsupported marketing claims recommend supporting evidence or reduced certainty", () => {
  const result = evaluateTrustBuilding({
    draftContent: "Our product is the best on the market. Everyone loves it. It is the greatest thing ever created.",
  });
  assert.equal(result.flags.unsupportedClaims, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R1"), "R1 recommendation present");
  assert.ok(result.scores.credibility < 100, "credibility penalized for unsupported claims");
});

test("Test 2: exaggerated promises recommend realistic language", () => {
  const result = evaluateTrustBuilding({
    draftContent: "This will 100% guarantee you lose weight overnight. It works miracles every time.",
  });
  assert.equal(result.flags.exaggeratedPromises, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R2"), "R2 recommendation present");
  assert.ok(result.recommendations.some((r) => r.ruleId === "R3"), "R3 recommendation present");
});

test("Test 3: fabricated authority rejects the recommendation", () => {
  const result = evaluateTrustBuilding({
    draftContent: "We are endorsed by top doctors. Celebrity chefs swear by us. As seen on national television, we are the world's leading brand.",
  });
  assert.equal(result.flags.fabricatedAuthority, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R6"), "R6 rejection present");
  assert.ok(
    !result.recommendations.some((r) => ["R1", "R2", "R3", "R4", "R5"].includes(r.ruleId)),
    "no credibility recommendations when authority is fabricated",
  );
});

test("Test 4: consistent, evidence-supported communication returns high Trust and Credibility", () => {
  const result = evaluateTrustBuilding({
    draftContent: "We surveyed 500 customers in 2024. 92% reported faster load times. Our data shows a 30% reduction in errors.",
  });
  assert.equal(result.flags.unsupportedClaims, false);
  assert.equal(result.flags.exaggeratedPromises, false);
  assert.ok(result.trustScore >= 85, `trustScore ${result.trustScore} should be high`);
  assert.ok(result.credibilityScore >= 85, `credibilityScore ${result.credibilityScore} should be high`);
});

test("Test 5: transparent messaging with balanced expectations returns high Authenticity and Transparency", () => {
  const result = evaluateTrustBuilding({
    draftContent: "We surveyed 300 customers. Most reported positive results, though individual results may vary. We are not making any promise we cannot keep. Our full methodology is available on request.",
  });
  assert.equal(result.flags.fabricatedAuthority, false);
  assert.equal(result.flags.exaggeratedPromises, false);
  assert.ok(result.authenticityScore >= 85, `authenticityScore ${result.authenticityScore} should be high`);
  assert.ok(result.transparencyScore >= 85, `transparencyScore ${result.transparencyScore} should be high`);
});

test("internal contradictions are flagged and recommend consistency", () => {
  const result = evaluateTrustBuilding({
    draftContent: "Results are guaranteed for everyone. Though individual results may vary.",
  });
  assert.equal(result.flags.inconsistentMessaging, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R4"), "R4 recommendation present");
  assert.ok(result.scores.consistency < 100, "consistency penalized for contradictions");
});

test("scores are independent, bounded 0-100, and never null", () => {
  const result = evaluateTrustBuilding({
    draftContent: "We surveyed 500 customers. 92% reported faster load times.",
  });
  for (const key of ["trust", "credibility", "authenticity", "transparency", "consistency"]) {
    assert.equal(typeof result.scores[key], "number");
    assert.ok(result.scores[key] >= 0 && result.scores[key] <= 100, `${key} within 0-100`);
  }
});

test("evaluation is deterministic across repeated calls", () => {
  const input = { draftContent: "Our product is the best on the market. Everyone loves it." };
  const first = evaluateTrustBuilding(input);
  const second = evaluateTrustBuilding(input);
  assert.deepEqual(first.scores, second.scores);
  assert.deepEqual(first.flags, second.flags);
  assert.deepEqual(first.recommendations, second.recommendations);
});

test("preserveContent is a meaning-preserving no-op (trust is recommended, never rewritten)", () => {
  const original = "Our product is the best on the market. Everyone loves it.";
  const { preservedContent, edits } = preserveContent(original);
  assert.equal(preservedContent, original);
  assert.deepEqual(edits, []);
});

test("AI Twin verification exposes the five internal checks", () => {
  const verification = verifyTrustBuilding({
    draftContent: "We surveyed 500 customers. 92% reported faster load times.",
  });
  assert.equal(verification.skillId, TRUST_BUILDING_SKILL_ID);
  assert.equal(typeof verification.believable, "boolean");
  assert.equal(typeof verification.claimsSupported, "boolean");
  assert.equal(typeof verification.soundsAuthentic, "boolean");
  assert.equal(typeof verification.buildsConfidence, "boolean");
  assert.equal(typeof verification.trustPreservedWithoutExaggeration, "boolean");
  assert.equal(typeof verification.canImproveWithoutChangingIntent, "boolean");
});

test("trust-building works with the shared enrichment integration", () => {
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
  assert.equal(enriched.skill.skillId, TRUST_BUILDING_SKILL_ID);
  assert.deepEqual(enriched.constraints, SKILL.constraints);
  assert.ok(enriched.style.includes("plain"));
});

test("unknown skill IDs still throw after registration change", () => {
  assert.throws(() => getSkill("does-not-exist"), /Unknown creative skill/);
});

test("SKILL_LIBRARY remains frozen", () => {
  assert.ok(Object.isFrozen(SKILL_LIBRARY));
});

test("analyzeTrustBuilding handles empty and missing content safely", () => {
  const empty = analyzeTrustBuilding({ draftContent: "" });
  assert.equal(empty.signals.wordCount, 0);
  assert.equal(typeof empty.trustScore, "number");
  const missing = analyzeTrustBuilding({});
  assert.equal(missing.signals.wordCount, 0);
});

test("honesty constraints are enforced by the manifest", () => {
  assert.ok(SKILL.constraints.includes("never invent proof"));
  assert.ok(SKILL.constraints.includes("never fabricate reviews"));
  assert.ok(SKILL.constraints.includes("never fabricate credentials"));
  assert.ok(SKILL.constraints.includes("never manipulate trust"));
  assert.ok(SKILL.constraints.includes("never change factual meaning"));
  assert.ok(SKILL.constraints.includes("preserve creator intent"));
});

test("buildTrustRecommendations returns a stable ordered list", () => {
  const analysis = analyzeTrustBuilding({
    draftContent: "Our product is the best on the market. Everyone loves it.",
  });
  const recommendations = buildTrustRecommendations(analysis);
  assert.ok(Array.isArray(recommendations));
  for (const recommendation of recommendations) {
    assert.ok(recommendation.ruleId);
    assert.ok(recommendation.severity);
    assert.ok(recommendation.recommendation);
    assert.ok(recommendation.reason);
  }
});
