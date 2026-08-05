import assert from "node:assert/strict";
import test from "node:test";
import {
  SKILL_LIBRARY,
  getSkill,
  evaluateCustomerTransformation,
  verifyCustomerTransformation,
  analyzeCustomerTransformation,
  preserveCustomerTransformation,
  buildCustomerTransformationRecommendations,
  CUSTOMER_TRANSFORMATION_SKILL_ID,
} from "./index.js";
import { applyCreativeSkill } from "../creative-brief/CreativeSkill.js";

const SKILL = getSkill(CUSTOMER_TRANSFORMATION_SKILL_ID);

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

test("customer-transformation is registered and discoverable", () => {
  assert.ok(SKILL_LIBRARY[CUSTOMER_TRANSFORMATION_SKILL_ID], "registered in SKILL_LIBRARY");
  assert.equal(SKILL.skillId, CUSTOMER_TRANSFORMATION_SKILL_ID);
  assert.equal(SKILL.name, "Customer Transformation");
  assert.equal(SKILL.category, "marketing");
  assert.equal(SKILL.status, "active");
  assert.equal(SKILL.priority, "foundational");
  assert.equal(SKILL.shared, true);
  assert.equal(SKILL.discoverable, true);
});

test("customer-transformation follows the approved Creative Skill schema", () => {
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

test("customer-transformation is shared across every compatible studio", () => {
  for (const studio of ["marketing", "publishing", "ai-twin", "workflow", "video", "audio"]) {
    assert.ok(SKILL.supportedStudios.includes(studio), `missing ${studio}`);
  }
});

test("customer-transformation declares advisory dependency metadata", () => {
  assert.deepEqual(SKILL.dependsOn, ["problem-discovery", "positioning", "offer-strategy"]);
  assert.deepEqual(SKILL.complements, ["call-to-action-strategy"]);
  assert.ok(SKILL.sharedUtilities.includes("communication-utils"));
});

test("manifest declares all seven decision rules", () => {
  const ids = SKILL.decisionRules.map((rule) => rule.id);
  assert.deepEqual(ids, ["R1", "R2", "R3", "R4", "R5", "R6", "R7"]);
});

test("Test 1: features without a transformation recommend defining one", () => {
  const result = evaluateCustomerTransformation({
    creativeBrief: "Launch email for our project management tool.",
    campaignContext: "Feature campaign.",
    draftContent: "Our app has a dashboard, built-in integrations, automation features, and 50 modules.",
  });
  assert.equal(result.flags.missingTransformation, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R1"), "R1 recommendation present");
  assert.equal(result.transformationStatement, null, "no transformation statement to preserve");
  assert.ok(!result.recommendations.some((r) => r.ruleId === "R6"), "no rejection without claims");
});

test("Test 2: a current struggle without a desired outcome recommends the future state", () => {
  const result = evaluateCustomerTransformation({
    creativeBrief: "Customers are frustrated because scheduling takes too long.",
    campaignContext: "Launch campaign.",
    draftContent: "Customers waste hours scheduling meetings. It is frustrating and takes too long.",
  });
  assert.equal(result.flags.missingFutureState, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R2"), "R2 recommendation present");
  assert.ok(result.currentState.present, "current struggle is recognized");
  assert.equal(result.desiredState.present, false);
});

test("Test 3: a desired outcome without a current struggle recommends the starting point", () => {
  const result = evaluateCustomerTransformation({
    creativeBrief: "Launch campaign for our time-saving training.",
    campaignContext: "Outcome-led campaign.",
    draftContent: "Imagine saving hours every week and winning more clients. You'll finally have time to grow your business.",
  });
  assert.equal(result.flags.missingCurrentState, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R3"), "R3 recommendation present");
  assert.ok(result.desiredState.present, "desired outcome is recognized");
  assert.equal(result.currentState.present, false);
});

test("Test 4: a clear, realistic, offer-connected transformation scores high", () => {
  const result = evaluateCustomerTransformation({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "You waste hours scheduling meetings. Imagine saving hours every week and winning more clients. Get instant access to the Calendar Pro course for just $99.",
  });
  assert.equal(result.flags.missingTransformation, false);
  assert.equal(result.flags.disconnectedOffer, false);
  assert.equal(result.flags.unrealisticClaims, false);
  assert.ok(result.transformationClarityScore >= 85, `transformationClarityScore ${result.transformationClarityScore} should be high`);
  assert.ok(result.offerAlignmentScore >= 85, `offerAlignmentScore ${result.offerAlignmentScore} should be high`);
  assert.ok(result.outcomeRelevanceScore >= 85, `outcomeRelevanceScore ${result.outcomeRelevanceScore} should be high`);
  assert.ok(result.transformationScore >= 85, `transformationScore ${result.transformationScore} should be high`);
  assert.ok(result.currentState.present);
  assert.ok(result.desiredState.present);
});

test("Test 5: unrealistic guarantees and unsupported promises reject the modification", () => {
  const result = evaluateCustomerTransformation({
    creativeBrief: "Launch email for our course.",
    campaignContext: "Launch campaign.",
    draftContent: "Limited time offer! Change your life overnight with guaranteed results. 100% money-back guarantee.",
  });
  assert.equal(result.flags.unrealisticClaims, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R6"), "R6 rejection present");
  assert.ok(result.recommendations.some((r) => r.ruleId === "R7"), "R7 intent preservation present");
  assert.ok(
    !result.recommendations.some((r) => ["R1", "R2", "R3", "R4", "R5"].includes(r.ruleId)),
    "no transformation recommendations when claims are unsupported",
  );
  assert.ok(result.outcomeRelevanceScore < 50, `outcomeRelevanceScore ${result.outcomeRelevanceScore} should be low`);
});

test("Rule 4: an offer disconnected from the transformation recommends strengthening", () => {
  const result = evaluateCustomerTransformation({
    creativeBrief: "Customers are overwhelmed by manual work.",
    campaignContext: "Launch campaign.",
    draftContent: "You are overwhelmed by manual work, and you'd love to finally be free of it. Join our membership.",
  });
  assert.equal(result.flags.disconnectedOffer, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R4"), "R4 recommendation present");
  assert.ok(result.offerAlignmentScore < 85, "offer alignment penalized for a disconnected offer");
});

test("Rule 5: features over outcomes recommend shifting toward transformation", () => {
  const result = evaluateCustomerTransformation({
    creativeBrief: "Launch email for our tool.",
    campaignContext: "Feature campaign.",
    draftContent: "Our app has a dashboard, built-in integrations, and automation features.",
  });
  assert.equal(result.flags.featuresOverOutcomes, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R5"), "R5 recommendation present");
});

test("currentState and desiredState report present state and statements", () => {
  const result = evaluateCustomerTransformation({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "You waste hours scheduling meetings. Imagine saving hours every week and winning more clients. Get instant access to the Calendar Pro course for just $99.",
  });
  assert.equal(result.currentState.present, true);
  assert.equal(result.desiredState.present, true);
  assert.equal(typeof result.currentState.statement, "string");
  assert.equal(typeof result.desiredState.statement, "string");
  assert.equal(typeof result.transformationStatement, "string");
});

test("scores are independent, bounded 0-100, and never null", () => {
  const result = evaluateCustomerTransformation({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "You waste hours scheduling meetings. Imagine saving hours every week and winning more clients. Get instant access to the Calendar Pro course for just $99.",
  });
  for (const key of ["transformationClarity", "currentStateDefinition", "futureStateDefinition", "offerAlignment", "outcomeRelevance"]) {
    assert.equal(typeof result.scores[key], "number");
    assert.ok(result.scores[key] >= 0 && result.scores[key] <= 100, `${key} within 0-100`);
  }
  assert.equal(typeof result.transformationScore, "number");
  assert.equal(typeof result.outcomeClarityScore, "number");
  assert.equal(typeof result.bridgeAlignmentScore, "number");
  for (const key of ["transformationClarityScore", "currentStateDefinitionScore", "futureStateDefinitionScore", "offerAlignmentScore", "outcomeRelevanceScore"]) {
    assert.equal(typeof result[key], "number");
  }
});

test("evaluation is deterministic across repeated calls", () => {
  const input = {
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "You waste hours scheduling meetings. Imagine saving hours every week and winning more clients. Get instant access to the Calendar Pro course for just $99.",
  };
  const first = evaluateCustomerTransformation(input);
  const second = evaluateCustomerTransformation(input);
  assert.deepEqual(first.scores, second.scores);
  assert.deepEqual(first.flags, second.flags);
  assert.deepEqual(first.recommendations, second.recommendations);
  assert.deepEqual(first.currentState, second.currentState);
  assert.deepEqual(first.desiredState, second.desiredState);
});

test("preserveCustomerTransformation is a meaning-preserving no-op (transformations are recommended, never rewritten)", () => {
  const original = "You waste hours scheduling meetings. Imagine saving hours every week and winning more clients.";
  const { preservedContent, edits } = preserveCustomerTransformation(original);
  assert.equal(preservedContent, original);
  assert.deepEqual(edits, []);
});

test("AI Twin verification exposes the five internal checks", () => {
  const verification = verifyCustomerTransformation({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "You waste hours scheduling meetings. Imagine saving hours every week and winning more clients. Get instant access to the Calendar Pro course for just $99.",
  });
  assert.equal(verification.skillId, CUSTOMER_TRANSFORMATION_SKILL_ID);
  assert.equal(typeof verification.transformationClear, "boolean");
  assert.equal(typeof verification.currentStateDefined, "boolean");
  assert.equal(typeof verification.desiredOutcomeDefined, "boolean");
  assert.equal(typeof verification.offerSupportsTransformation, "boolean");
  assert.equal(typeof verification.transformationRealistic, "boolean");
  assert.equal(typeof verification.canImproveWithoutChangingIntent, "boolean");
  assert.equal(verification.transformationClear, true);
  assert.equal(verification.transformationRealistic, true);
});

test("customer-transformation works with the shared enrichment integration", () => {
  const brief = {
    version: 1,
    studio: "marketing",
    goal: "launch email",
    subject: "product launch",
    tone: "hopeful",
    style: "plain",
    brand: null,
    format: { medium: "copy", aspect: null, motion: null },
    meta: { source: "creative-brief-v1" },
  };
  const enriched = applyCreativeSkill(brief, SKILL);
  assert.equal(enriched.skill.skillId, CUSTOMER_TRANSFORMATION_SKILL_ID);
  assert.deepEqual(enriched.constraints, SKILL.constraints);
  assert.ok(enriched.style.includes("plain"));
});

test("unknown skill IDs still throw after registration change", () => {
  assert.throws(() => getSkill("does-not-exist"), /Unknown creative skill/);
});

test("SKILL_LIBRARY remains frozen", () => {
  assert.ok(Object.isFrozen(SKILL_LIBRARY));
});

test("analyzeCustomerTransformation handles empty and missing content safely", () => {
  const empty = analyzeCustomerTransformation({ draftContent: "" });
  assert.equal(empty.signals.wordCount, 0);
  assert.equal(typeof empty.transformationScore, "number");
  const missing = analyzeCustomerTransformation({});
  assert.equal(missing.signals.wordCount, 0);
  assert.equal(missing.currentState.present, false);
  assert.equal(missing.desiredState.present, false);
  assert.equal(missing.transformationStatement, null);
});

test("honesty constraints are enforced by the manifest", () => {
  assert.ok(SKILL.constraints.includes("never invent a customer struggle"));
  assert.ok(SKILL.constraints.includes("never invent a customer outcome"));
  assert.ok(SKILL.constraints.includes("never recommend unrealistic guarantees or life-changing claims"));
  assert.ok(SKILL.constraints.includes("never recommend outcomes the offer cannot support"));
  assert.ok(SKILL.constraints.includes("never change factual meaning"));
  assert.ok(SKILL.constraints.includes("never override creator intent"));
});

test("buildCustomerTransformationRecommendations returns a stable ordered list", () => {
  const analysis = analyzeCustomerTransformation({
    creativeBrief: "Launch email for our tool.",
    campaignContext: "Feature campaign.",
    draftContent: "Our app has a dashboard, built-in integrations, and automation features.",
  });
  const recommendations = buildCustomerTransformationRecommendations(analysis);
  assert.ok(Array.isArray(recommendations));
  for (const recommendation of recommendations) {
    assert.ok(recommendation.ruleId);
    assert.ok(recommendation.severity);
    assert.ok(recommendation.recommendation);
    assert.ok(recommendation.reason);
  }
});
