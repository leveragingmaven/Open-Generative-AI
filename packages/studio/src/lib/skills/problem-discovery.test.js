import assert from "node:assert/strict";
import test from "node:test";
import {
  SKILL_LIBRARY,
  getSkill,
  evaluateProblemDiscovery,
  verifyProblemDiscovery,
  analyzeProblemDiscovery,
  preserveProblemDiscovery,
  buildProblemDiscoveryRecommendations,
  PROBLEM_DISCOVERY_SKILL_ID,
} from "./index.js";
import { applyCreativeSkill } from "../creative-brief/CreativeSkill.js";

const SKILL = getSkill(PROBLEM_DISCOVERY_SKILL_ID);

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

test("problem-discovery is registered and discoverable", () => {
  assert.ok(SKILL_LIBRARY[PROBLEM_DISCOVERY_SKILL_ID], "registered in SKILL_LIBRARY");
  assert.equal(SKILL.skillId, PROBLEM_DISCOVERY_SKILL_ID);
  assert.equal(SKILL.name, "Problem Discovery");
  assert.equal(SKILL.category, "marketing");
  assert.equal(SKILL.status, "active");
  assert.equal(SKILL.priority, "foundational");
  assert.equal(SKILL.shared, true);
  assert.equal(SKILL.discoverable, true);
});

test("problem-discovery follows the approved Creative Skill schema", () => {
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

test("problem-discovery is shared across every compatible studio", () => {
  for (const studio of ["marketing", "video", "audio", "publishing", "workflow", "ai-twin", "agents"]) {
    assert.ok(SKILL.supportedStudios.includes(studio), `missing ${studio}`);
  }
});

test("problem-discovery declares advisory dependency metadata", () => {
  assert.deepEqual(SKILL.dependsOn, ["message-clarity", "trust-building"]);
  assert.deepEqual(SKILL.complements, ["positioning", "customer-transformation"]);
  assert.ok(SKILL.sharedUtilities.includes("communication-utils"));
});

test("manifest declares all seven decision rules", () => {
  const ids = SKILL.decisionRules.map((rule) => rule.id);
  assert.deepEqual(ids, ["R1", "R2", "R3", "R4", "R5", "R6", "R7"]);
});

test("Test 1: three unrelated problems recommend one dominant problem", () => {
  const result = evaluateProblemDiscovery({
    creativeBrief: "Email launch about improving our customer service. Customers report slow, expensive, and unresponsive support.",
    campaignContext: "Q3 support-improvement campaign.",
    draftContent: "Our customers complain the app is too slow, too expensive, and support never answers.",
  });
  assert.equal(result.flags.competingProblems, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R1"), "R1 recommendation present");
  assert.equal(result.signals.distinctProblemCount, 3);
  assert.ok(result.primaryProblem.theme, "a primary problem is selected");
  assert.equal(result.secondaryProblems.length, 2);
  assert.ok(result.problemFocusScore < 85, "focus penalized for competing problems");
});

test("Test 2: features without a problem recommend leading with the problem", () => {
  const result = evaluateProblemDiscovery({
    creativeBrief: "Product update email about our new project management app.",
    campaignContext: "Feature-announcement campaign.",
    draftContent: "Our app has a dashboard, built-in integrations, and advanced features.",
  });
  assert.equal(result.flags.featureLed, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R4"), "R4 recommendation present");
  assert.ok(!result.recommendations.some((r) => r.ruleId === "R3"), "no clarification flag when features anchor the content");
});

test("Test 3: symptoms without a root cause recommend the underlying problem", () => {
  const result = evaluateProblemDiscovery({
    creativeBrief: "Fix the checkout for our online store.",
    campaignContext: "Conversion optimization campaign.",
    draftContent: "The page loads slowly and the checkout crashes. Users complain about errors every day.",
  });
  assert.equal(result.flags.symptomsOnly, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R2"), "R2 recommendation present");
});

test("Test 4: one clear problem aligned with the brief returns high Focus and Alignment", () => {
  const result = evaluateProblemDiscovery({
    creativeBrief: "Launch email for our scheduling tool. Customers waste hours organizing meetings and need a faster way.",
    campaignContext: "Scheduling product launch campaign.",
    draftContent: "Customers waste hours scheduling meetings every week. That is the problem our scheduling tool solves.",
  });
  assert.equal(result.flags.competingProblems, false);
  assert.equal(result.flags.symptomsOnly, false);
  assert.ok(result.problemFocusScore >= 85, `problemFocusScore ${result.problemFocusScore} should be high`);
  assert.ok(result.strategicAlignmentScore >= 85, `strategicAlignmentScore ${result.strategicAlignmentScore} should be high`);
  assert.equal(result.primaryProblem.theme, "effort");
});

test("Test 5: no identifiable problem flags for clarification with low confidence", () => {
  const result = evaluateProblemDiscovery({
    creativeBrief: "Announce our new coffee brand to cold email subscribers.",
    campaignContext: "Brand launch campaign.",
    draftContent: "We are excited to share our new coffee brand. Our beans are roasted to perfection.",
  });
  assert.equal(result.flags.noIdentifiableProblem, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R3"), "R3 clarification flag present");
  assert.ok(result.problemConfidence < 30, `problemConfidence ${result.problemConfidence} should be low`);
});

test("Rule 6: problems without grounding are rejected, never invented", () => {
  const result = evaluateProblemDiscovery({
    draftContent: "Our customers are frustrated with slow delivery and high costs.",
  });
  assert.equal(result.flags.ungroundedInference, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R6"), "R6 rejection present");
  assert.ok(result.recommendations.some((r) => r.ruleId === "R7"), "R7 intent preservation present");
  assert.ok(
    !result.recommendations.some((r) => ["R1", "R2", "R3", "R4", "R5"].includes(r.ruleId)),
    "no problem recommendations when the problem would be invented",
  );
});

test("Rule 5: solving everything recommends narrowing the scope", () => {
  const result = evaluateProblemDiscovery({
    creativeBrief: "Launch email about our all-in-one platform.",
    campaignContext: "Platform launch campaign.",
    draftContent: "Our app solves everything. It fixes all your problems and handles everything you need.",
  });
  assert.equal(result.flags.solvingEverything, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R5"), "R5 recommendation present");
});

test("problem shifting mid-content is flagged and penalized", () => {
  const result = evaluateProblemDiscovery({
    creativeBrief: "Customers struggle with slow checkout and support.",
    campaignContext: "Ecommerce campaign.",
    draftContent: "The checkout is too slow and crashes. But the real problem is that support never answers.",
  });
  assert.equal(result.flags.problemShifting, true);
  assert.ok(result.problemFocusScore < 100, "focus penalized for shifting problems");
});

test("primary and secondary problems are reported with labels", () => {
  const result = evaluateProblemDiscovery({
    creativeBrief: "Customers waste hours and lose money on manual work.",
    campaignContext: "Automation campaign.",
    draftContent: "Our customers waste hours every week and waste money on manual work.",
  });
  assert.equal(result.primaryProblem.theme, "effort");
  assert.equal(result.primaryProblem.label, "Effort and time spent");
  assert.equal(result.secondaryProblems.length, 1);
  assert.equal(result.secondaryProblems[0].theme, "waste");
});

test("scores are independent, bounded 0-100, and never null", () => {
  const result = evaluateProblemDiscovery({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "Customers waste hours scheduling meetings every week.",
  });
  for (const key of ["problemFocus", "rootProblemAccuracy", "strategicAlignment", "customerRelevance", "problemSimplicity"]) {
    assert.equal(typeof result.scores[key], "number");
    assert.ok(result.scores[key] >= 0 && result.scores[key] <= 100, `${key} within 0-100`);
  }
  assert.equal(typeof result.problemFocusScore, "number");
  assert.equal(typeof result.problemComplexityScore, "number");
  assert.equal(typeof result.problemConfidence, "number");
});

test("evaluation is deterministic across repeated calls", () => {
  const input = {
    creativeBrief: "Email launch about improving our customer service.",
    campaignContext: "Q3 support-improvement campaign.",
    draftContent: "Our customers complain the app is too slow, too expensive, and support never answers.",
  };
  const first = evaluateProblemDiscovery(input);
  const second = evaluateProblemDiscovery(input);
  assert.deepEqual(first.scores, second.scores);
  assert.deepEqual(first.flags, second.flags);
  assert.deepEqual(first.recommendations, second.recommendations);
  assert.deepEqual(first.primaryProblem, second.primaryProblem);
});

test("preserveProblemDiscovery is a meaning-preserving no-op (problems are recommended, never rewritten)", () => {
  const original = "Customers waste hours scheduling meetings every week.";
  const { preservedContent, edits } = preserveProblemDiscovery(original);
  assert.equal(preservedContent, original);
  assert.deepEqual(edits, []);
});

test("AI Twin verification exposes the five internal checks", () => {
  const verification = verifyProblemDiscovery({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "Customers waste hours scheduling meetings every week.",
  });
  assert.equal(verification.skillId, PROBLEM_DISCOVERY_SKILL_ID);
  assert.equal(typeof verification.problemClear, "boolean");
  assert.equal(typeof verification.rootCauseIdentified, "boolean");
  assert.equal(typeof verification.alignedWithBrief, "boolean");
  assert.equal(typeof verification.customerRelevant, "boolean");
  assert.equal(typeof verification.scopeFocused, "boolean");
  assert.equal(typeof verification.canImproveWithoutChangingIntent, "boolean");
});

test("problem-discovery works with the shared enrichment integration", () => {
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
  assert.equal(enriched.skill.skillId, PROBLEM_DISCOVERY_SKILL_ID);
  assert.deepEqual(enriched.constraints, SKILL.constraints);
  assert.ok(enriched.style.includes("plain"));
});

test("unknown skill IDs still throw after registration change", () => {
  assert.throws(() => getSkill("does-not-exist"), /Unknown creative skill/);
});

test("SKILL_LIBRARY remains frozen", () => {
  assert.ok(Object.isFrozen(SKILL_LIBRARY));
});

test("analyzeProblemDiscovery handles empty and missing content safely", () => {
  const empty = analyzeProblemDiscovery({ draftContent: "" });
  assert.equal(empty.signals.wordCount, 0);
  assert.equal(typeof empty.problemFocusScore, "number");
  const missing = analyzeProblemDiscovery({});
  assert.equal(missing.signals.wordCount, 0);
  assert.equal(missing.primaryProblem, null);
  assert.deepEqual(missing.secondaryProblems, []);
});

test("honesty constraints are enforced by the manifest", () => {
  assert.ok(SKILL.constraints.includes("never invent customer frustrations"));
  assert.ok(SKILL.constraints.includes("never recommend a problem unsupported by the brief or campaign context"));
  assert.ok(SKILL.constraints.includes("never replace the customer problem with features"));
  assert.ok(SKILL.constraints.includes("never solve every problem at once"));
  assert.ok(SKILL.constraints.includes("never shift the problem mid-content"));
  assert.ok(SKILL.constraints.includes("preserve creator intent"));
});

test("buildProblemDiscoveryRecommendations returns a stable ordered list", () => {
  const analysis = analyzeProblemDiscovery({
    creativeBrief: "Email launch about improving our customer service.",
    campaignContext: "Q3 support-improvement campaign.",
    draftContent: "Our customers complain the app is too slow, too expensive, and support never answers.",
  });
  const recommendations = buildProblemDiscoveryRecommendations(analysis);
  assert.ok(Array.isArray(recommendations));
  for (const recommendation of recommendations) {
    assert.ok(recommendation.ruleId);
    assert.ok(recommendation.severity);
    assert.ok(recommendation.recommendation);
    assert.ok(recommendation.reason);
  }
});
