import assert from "node:assert/strict";
import test from "node:test";
import {
  SKILL_LIBRARY,
  getSkill,
  evaluatePositioning,
  verifyPositioning,
  analyzePositioning,
  preservePositioning,
  buildPositioningRecommendations,
  POSITIONING_SKILL_ID,
} from "./index.js";
import { applyCreativeSkill } from "../creative-brief/CreativeSkill.js";

const SKILL = getSkill(POSITIONING_SKILL_ID);

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

test("positioning is registered and discoverable", () => {
  assert.ok(SKILL_LIBRARY[POSITIONING_SKILL_ID], "registered in SKILL_LIBRARY");
  assert.equal(SKILL.skillId, POSITIONING_SKILL_ID);
  assert.equal(SKILL.name, "Positioning");
  assert.equal(SKILL.category, "marketing");
  assert.equal(SKILL.status, "active");
  assert.equal(SKILL.priority, "foundational");
  assert.equal(SKILL.shared, true);
  assert.equal(SKILL.discoverable, true);
});

test("positioning follows the approved Creative Skill schema", () => {
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

test("positioning is shared across every compatible studio", () => {
  for (const studio of ["marketing", "video", "audio", "publishing", "workflow", "ai-twin", "agents"]) {
    assert.ok(SKILL.supportedStudios.includes(studio), `missing ${studio}`);
  }
});

test("positioning declares advisory dependency metadata", () => {
  assert.deepEqual(SKILL.dependsOn, ["problem-discovery"]);
  assert.deepEqual(SKILL.complements, ["offer-strategy", "customer-transformation"]);
  assert.ok(SKILL.sharedUtilities.includes("communication-utils"));
});

test("manifest declares all seven decision rules", () => {
  const ids = SKILL.decisionRules.map((rule) => rule.id);
  assert.deepEqual(ids, ["R1", "R2", "R3", "R4", "R5", "R6", "R7"]);
});

test("Test 1: content with no identifiable positioning recommends creating one", () => {
  const result = evaluatePositioning({
    creativeBrief: "Announce our new coffee brand to cold email subscribers.",
    campaignContext: "Brand launch campaign.",
    draftContent: "We are excited to share our new coffee brand. Our beans are roasted to perfection.",
  });
  assert.equal(result.flags.missingPositioning, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R1"), "R1 recommendation present");
  assert.equal(result.positioningStatement.present, false);
});

test("Test 2: multiple conflicting positions recommend one dominant position", () => {
  const result = evaluatePositioning({
    creativeBrief: "Launch email for our new coffee brand.",
    campaignContext: "Brand launch campaign.",
    draftContent: "We are the cheapest option on the market. We are also the most premium luxury brand.",
  });
  assert.equal(result.flags.conflictingPositions, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R2"), "R2 recommendation present");
  assert.ok(result.clarityScore < 85, "clarity penalized for conflicting positions");
});

test("Test 3: content relying only on features recommends customer outcomes", () => {
  const result = evaluatePositioning({
    creativeBrief: "Product update email about our project management app.",
    campaignContext: "Feature-announcement campaign.",
    draftContent: "Our app has a dashboard, built-in integrations, and automation features. It includes everything you need.",
  });
  assert.equal(result.flags.featuresOverOutcomes, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R5"), "R5 recommendation present");
  assert.ok(!result.recommendations.some((r) => r.ruleId === "R1"), "no create-position flag when features anchor the content");
});

test("Test 4: clear differentiated position aligned with the problem returns high Clarity and Differentiation", () => {
  const result = evaluatePositioning({
    creativeBrief: "Customers waste hours scheduling meetings and want to win more clients.",
    campaignContext: "Scheduling product launch campaign.",
    draftContent: "Unlike generic scheduling tools, we are the only calendar built for creative agencies. We help you save time and win more clients.",
  });
  assert.equal(result.flags.missingPositioning, false);
  assert.equal(result.flags.weakDifferentiation, false);
  assert.equal(result.flags.conflictsWithCustomerProblem, false);
  assert.ok(result.clarityScore >= 85, `clarityScore ${result.clarityScore} should be high`);
  assert.ok(result.differentiationScore >= 85, `differentiationScore ${result.differentiationScore} should be high`);
  assert.ok(result.positioningScore >= 85, `positioningScore ${result.positioningScore} should be high`);
});

test("Test 5: unsupported competitive claims reject the modification", () => {
  const result = evaluatePositioning({
    creativeBrief: "Launch email for our scheduling tool.",
    campaignContext: "Competitive campaign.",
    draftContent: "Our tool is better than every competitor. Nobody else comes close. We are miles ahead of the market.",
  });
  assert.equal(result.flags.unsupportedCompetitiveClaims, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R6"), "R6 rejection present");
  assert.ok(result.recommendations.some((r) => r.ruleId === "R7"), "R7 intent preservation present");
  assert.ok(
    !result.recommendations.some((r) => ["R1", "R2", "R3", "R4", "R5"].includes(r.ruleId)),
    "no positioning recommendations when claims are unsupported",
  );
});

test("Rule 3: weak differentiation recommends authentic unique value", () => {
  const result = evaluatePositioning({
    creativeBrief: "Launch email for our scheduling app.",
    campaignContext: "Product launch campaign.",
    draftContent: "We are a scheduling app for teams. It helps them book meetings.",
  });
  assert.equal(result.flags.weakDifferentiation, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R3"), "R3 recommendation present");
});

test("Rule 4: positioning that conflicts with the customer problem recommends alignment", () => {
  const result = evaluatePositioning({
    creativeBrief: "Customers find scheduling tools too expensive and complicated.",
    campaignContext: "Premium product launch.",
    draftContent: "We are the premium, high-end scheduling platform. We offer exclusive features.",
  });
  assert.equal(result.flags.conflictsWithCustomerProblem, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R4"), "R4 recommendation present");
});

test("evidence-backed competitive claims are not rejected", () => {
  const result = evaluatePositioning({
    creativeBrief: "We need to communicate why our scheduling tool is better.",
    campaignContext: "Competitive campaign.",
    draftContent: "Our tool is better than generic tools, according to independent benchmarks. We tested 100 teams and measured faster setup.",
  });
  assert.equal(result.flags.unsupportedCompetitiveClaims, false);
  assert.ok(!result.recommendations.some((r) => r.ruleId === "R6"), "no R6 rejection for supported claims");
});

test("positioningStatement identifies the position sentence and category", () => {
  const result = evaluatePositioning({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "Unlike generic scheduling tools, we are the only calendar built for creative agencies. We help you save time and win more clients.",
  });
  assert.equal(result.positioningStatement.present, true);
  assert.equal(result.positioningStatement.statement, "Unlike generic scheduling tools, we are the only calendar built for creative agencies.");
  assert.equal(result.positioningStatement.category, null);
  assert.equal(result.positioningStatement.differentiation, true);
});

test("dominant position category is reported when a category is claimed", () => {
  const result = evaluatePositioning({
    creativeBrief: "Launch email for our coffee brand.",
    campaignContext: "Brand launch campaign.",
    draftContent: "We are the premium luxury coffee brand. Our beans are exclusive and high-end.",
  });
  assert.equal(result.dominantPosition.category, "premium");
});

test("scores are independent, bounded 0-100, and never null", () => {
  const result = evaluatePositioning({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "Unlike generic tools, we are the only calendar built for teams. We help you save time.",
  });
  for (const key of ["positioningClarity", "differentiation", "customerRelevance", "strategicConsistency", "marketFocus"]) {
    assert.equal(typeof result.scores[key], "number");
    assert.ok(result.scores[key] >= 0 && result.scores[key] <= 100, `${key} within 0-100`);
  }
  assert.equal(typeof result.positioningScore, "number");
  assert.equal(typeof result.clarityScore, "number");
  assert.equal(typeof result.differentiationScore, "number");
  assert.equal(typeof result.consistencyScore, "number");
  assert.equal(typeof result.relevanceScore, "number");
  assert.equal(typeof result.marketFocusScore, "number");
});

test("evaluation is deterministic across repeated calls", () => {
  const input = {
    creativeBrief: "Launch email for our coffee brand.",
    campaignContext: "Brand launch campaign.",
    draftContent: "We are the cheapest option on the market. We are also the most premium luxury brand.",
  };
  const first = evaluatePositioning(input);
  const second = evaluatePositioning(input);
  assert.deepEqual(first.scores, second.scores);
  assert.deepEqual(first.flags, second.flags);
  assert.deepEqual(first.recommendations, second.recommendations);
  assert.deepEqual(first.positioningStatement, second.positioningStatement);
});

test("preservePositioning is a meaning-preserving no-op (positioning is recommended, never rewritten)", () => {
  const original = "Unlike generic tools, we are the only calendar built for teams.";
  const { preservedContent, edits } = preservePositioning(original);
  assert.equal(preservedContent, original);
  assert.deepEqual(edits, []);
});

test("AI Twin verification exposes the five internal checks", () => {
  const verification = verifyPositioning({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "Unlike generic tools, we are the only calendar built for teams. We help you save time.",
  });
  assert.equal(verification.skillId, POSITIONING_SKILL_ID);
  assert.equal(typeof verification.positionClear, "boolean");
  assert.equal(typeof verification.differentiationObvious, "boolean");
  assert.equal(typeof verification.alignedWithProblem, "boolean");
  assert.equal(typeof verification.consistentPositioning, "boolean");
  assert.equal(typeof verification.customerUnderstandsDifference, "boolean");
  assert.equal(typeof verification.canImproveWithoutChangingIntent, "boolean");
});

test("positioning works with the shared enrichment integration", () => {
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
  assert.equal(enriched.skill.skillId, POSITIONING_SKILL_ID);
  assert.deepEqual(enriched.constraints, SKILL.constraints);
  assert.ok(enriched.style.includes("plain"));
});

test("unknown skill IDs still throw after registration change", () => {
  assert.throws(() => getSkill("does-not-exist"), /Unknown creative skill/);
});

test("SKILL_LIBRARY remains frozen", () => {
  assert.ok(Object.isFrozen(SKILL_LIBRARY));
});

test("analyzePositioning handles empty and missing content safely", () => {
  const empty = analyzePositioning({ draftContent: "" });
  assert.equal(empty.signals.wordCount, 0);
  assert.equal(typeof empty.positioningScore, "number");
  const missing = analyzePositioning({});
  assert.equal(missing.signals.wordCount, 0);
  assert.equal(missing.positioningStatement.present, false);
  assert.equal(missing.positioningStatement.statement, null);
});

test("honesty constraints are enforced by the manifest", () => {
  assert.ok(SKILL.constraints.includes("never invent competitive advantages"));
  assert.ok(SKILL.constraints.includes("never fabricate customer results"));
  assert.ok(SKILL.constraints.includes("never create unsupported comparisons"));
  assert.ok(SKILL.constraints.includes("never exaggerate uniqueness"));
  assert.ok(SKILL.constraints.includes("never alter factual meaning"));
  assert.ok(SKILL.constraints.includes("never override creator intent"));
});

test("buildPositioningRecommendations returns a stable ordered list", () => {
  const analysis = analyzePositioning({
    creativeBrief: "Launch email for our coffee brand.",
    campaignContext: "Brand launch campaign.",
    draftContent: "We are the cheapest option on the market. We are also the most premium luxury brand.",
  });
  const recommendations = buildPositioningRecommendations(analysis);
  assert.ok(Array.isArray(recommendations));
  for (const recommendation of recommendations) {
    assert.ok(recommendation.ruleId);
    assert.ok(recommendation.severity);
    assert.ok(recommendation.recommendation);
    assert.ok(recommendation.reason);
  }
});
