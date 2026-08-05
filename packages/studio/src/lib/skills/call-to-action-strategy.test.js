import assert from "node:assert/strict";
import test from "node:test";
import {
  SKILL_LIBRARY,
  getSkill,
  evaluateCallToActionStrategy,
  verifyCallToActionStrategy,
  analyzeCallToActionStrategy,
  preserveCallToAction,
  buildCtaRecommendations,
  CALL_TO_ACTION_STRATEGY_SKILL_ID,
} from "./index.js";
import { applyCreativeSkill } from "../creative-brief/CreativeSkill.js";

const SKILL = getSkill(CALL_TO_ACTION_STRATEGY_SKILL_ID);

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

test("call-to-action-strategy is registered and discoverable", () => {
  assert.ok(SKILL_LIBRARY[CALL_TO_ACTION_STRATEGY_SKILL_ID], "registered in SKILL_LIBRARY");
  assert.equal(SKILL.skillId, CALL_TO_ACTION_STRATEGY_SKILL_ID);
  assert.equal(SKILL.name, "Call to Action Strategy");
  assert.equal(SKILL.category, "marketing");
  assert.equal(SKILL.status, "active");
  assert.equal(SKILL.priority, "foundational");
  assert.equal(SKILL.shared, true);
  assert.equal(SKILL.discoverable, true);
});

test("call-to-action-strategy follows the approved Creative Skill schema", () => {
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

test("call-to-action-strategy is shared across every compatible studio", () => {
  for (const studio of ["marketing", "publishing", "ai-twin", "workflow", "video", "audio"]) {
    assert.ok(SKILL.supportedStudios.includes(studio), `missing ${studio}`);
  }
});

test("call-to-action-strategy declares advisory dependency metadata", () => {
  assert.deepEqual(SKILL.dependsOn, ["offer-strategy", "customer-transformation"]);
  assert.deepEqual(SKILL.complements, ["trust-building"]);
  assert.ok(SKILL.sharedUtilities.includes("communication-utils"));
});

test("manifest declares the compatible recipes", () => {
  assert.deepEqual(SKILL.compatibleRecipes, [
    "sales-page",
    "landing-page",
    "email-campaign",
    "webinar",
    "product-launch",
    "funnel-strategy",
    "social-campaign",
    "checkout-flow",
  ]);
});

test("manifest declares all seven decision rules", () => {
  const ids = SKILL.decisionRules.map((rule) => rule.id);
  assert.deepEqual(ids, ["R1", "R2", "R3", "R4", "R5", "R6", "R7"]);
});

test("Test 1: content with no call to action recommends defining one", () => {
  const result = evaluateCallToActionStrategy({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "You waste hours scheduling meetings. Imagine saving hours every week and winning more clients. Our Calendar Pro course is built to help.",
  });
  assert.equal(result.flags.missingCta, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R1"), "R1 recommendation present");
  assert.equal(result.primaryCTA.present, false);
  assert.equal(result.primaryCTA.statement, null);
  assert.ok(result.decisionConfidence < 50, `decisionConfidence ${result.decisionConfidence} should be low`);
});

test("Test 2: three competing calls to action recommend one primary action", () => {
  const result = evaluateCallToActionStrategy({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "You waste hours scheduling meetings. Imagine winning more clients and saving time. Get instant access to the Calendar Pro course for just $99. Also sign up for the newsletter. And reserve your spot for the free webinar.",
  });
  assert.equal(result.flags.competingCtas, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R2"), "R2 recommendation present");
  assert.ok(result.signals.distinctCtaTypeCount >= 3, "three CTA types detected");
  assert.ok(result.decisionSimplicityScore < 85, `decisionSimplicityScore ${result.decisionSimplicityScore} penalized`);
  assert.ok(!result.recommendations.some((r) => r.ruleId === "R1"), "a CTA exists, so R1 should not fire");
});

test("Test 3: a CTA asking for more commitment than the offer earned recommends a next step", () => {
  const result = evaluateCallToActionStrategy({
    creativeBrief: "Launch email for our new platform.",
    campaignContext: "Feature campaign.",
    draftContent: "Buy now for $299 and get instant access to the platform.",
  });
  assert.equal(result.flags.commitmentMismatch, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R4"), "R4 recommendation present");
  assert.equal(result.primaryCTA.type, "purchase");
  assert.equal(result.primaryCTA.commitment, "high");
});

test("Test 4: a CTA that follows the transformation and aligns with the offer scores high", () => {
  const result = evaluateCallToActionStrategy({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "You waste hours scheduling meetings. Imagine saving hours every week and winning more clients. Get instant access to the Calendar Pro course for just $99.",
  });
  assert.equal(result.flags.missingCta, false);
  assert.equal(result.flags.competingCtas, false);
  assert.equal(result.flags.misalignedCta, false);
  assert.equal(result.flags.commitmentMismatch, false);
  assert.equal(result.flags.deceptiveUrgency, false);
  assert.ok(result.clarityScore >= 85, `clarityScore ${result.clarityScore} should be high`);
  assert.ok(result.alignmentScore >= 85, `alignmentScore ${result.alignmentScore} should be high`);
  assert.ok(result.actionConfidenceScore >= 85, `actionConfidenceScore ${result.actionConfidenceScore} should be high`);
  assert.ok(result.ctaScore >= 85, `ctaScore ${result.ctaScore} should be high`);
  assert.ok(result.decisionConfidence >= 70, "decision confidence should be high");
});

test("Test 5: fabricated deadlines and deceptive urgency reject the modification", () => {
  const result = evaluateCallToActionStrategy({
    creativeBrief: "Launch email for our course.",
    campaignContext: "Launch campaign.",
    draftContent: "Limited time offer! Act now before it's gone. Buy now!",
  });
  assert.equal(result.flags.deceptiveUrgency, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R6"), "R6 rejection present");
  assert.ok(result.recommendations.some((r) => r.ruleId === "R7"), "R7 intent preservation present");
  assert.ok(
    !result.recommendations.some((r) => ["R1", "R2", "R3", "R4", "R5"].includes(r.ruleId)),
    "no CTA recommendations when pressure is deceptive",
  );
});

test("Rule 5: a vague or passive CTA recommends a more specific action", () => {
  const result = evaluateCallToActionStrategy({
    creativeBrief: "Launch email for our course.",
    campaignContext: "Launch campaign.",
    draftContent: "If you're interested, just let me know. Whenever you're ready, feel free to reach out.",
  });
  assert.equal(result.flags.vagueCta, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R5"), "R5 recommendation present");
  assert.equal(result.primaryCTA.vague, true);
});

test("primaryCTA reports the statement, type, and commitment", () => {
  const result = evaluateCallToActionStrategy({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "You waste hours scheduling meetings. Imagine saving hours every week and winning more clients. Get instant access to the Calendar Pro course for just $99.",
  });
  assert.equal(result.primaryCTA.present, true);
  assert.equal(result.primaryCTA.type, "join");
  assert.equal(result.primaryCTA.commitment, "high");
  assert.equal(typeof result.primaryCTA.statement, "string");
  assert.equal(result.ctaType, "join");
});

test("scores are independent, bounded 0-100, and never null", () => {
  const result = evaluateCallToActionStrategy({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "You waste hours scheduling meetings. Imagine saving hours every week and winning more clients. Get instant access to the Calendar Pro course for just $99.",
  });
  for (const key of ["ctaClarity", "strategicAlignment", "decisionSimplicity", "commitmentAppropriateness", "actionConfidence"]) {
    assert.equal(typeof result.scores[key], "number");
    assert.ok(result.scores[key] >= 0 && result.scores[key] <= 100, `${key} within 0-100`);
  }
  assert.equal(typeof result.ctaScore, "number");
  assert.equal(typeof result.clarityScore, "number");
  assert.equal(typeof result.alignmentScore, "number");
  assert.equal(typeof result.decisionConfidence, "number");
});

test("evaluation is deterministic across repeated calls", () => {
  const input = {
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "You waste hours scheduling meetings. Imagine winning more clients and saving time. Get instant access to the Calendar Pro course for just $99. Also sign up for the newsletter. And reserve your spot for the free webinar.",
  };
  const first = evaluateCallToActionStrategy(input);
  const second = evaluateCallToActionStrategy(input);
  assert.deepEqual(first.scores, second.scores);
  assert.deepEqual(first.flags, second.flags);
  assert.deepEqual(first.recommendations, second.recommendations);
  assert.deepEqual(first.primaryCTA, second.primaryCTA);
});

test("preserveCallToAction is a meaning-preserving no-op (CTAs are recommended, never rewritten)", () => {
  const original = "You waste hours scheduling meetings. Get instant access to the Calendar Pro course.";
  const { preservedContent, edits } = preserveCallToAction(original);
  assert.equal(preservedContent, original);
  assert.deepEqual(edits, []);
});

test("AI Twin verification exposes the five internal checks", () => {
  const verification = verifyCallToActionStrategy({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "You waste hours scheduling meetings. Imagine saving hours every week and winning more clients. Get instant access to the Calendar Pro course for just $99.",
  });
  assert.equal(verification.skillId, CALL_TO_ACTION_STRATEGY_SKILL_ID);
  assert.equal(typeof verification.nextStepClear, "boolean");
  assert.equal(typeof verification.onePrimaryAction, "boolean");
  assert.equal(typeof verification.ctaMatchesReadiness, "boolean");
  assert.equal(typeof verification.alignedWithOfferAndTransformation, "boolean");
  assert.equal(typeof verification.customerKnowsNextStep, "boolean");
  assert.equal(typeof verification.canImproveWithoutChangingIntent, "boolean");
  assert.equal(verification.nextStepClear, true);
  assert.equal(verification.customerKnowsNextStep, true);
});

test("call-to-action-strategy works with the shared enrichment integration", () => {
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
  assert.equal(enriched.skill.skillId, CALL_TO_ACTION_STRATEGY_SKILL_ID);
  assert.deepEqual(enriched.constraints, SKILL.constraints);
  assert.ok(enriched.style.includes("plain"));
});

test("unknown skill IDs still throw after registration change", () => {
  assert.throws(() => getSkill("does-not-exist"), /Unknown creative skill/);
});

test("SKILL_LIBRARY remains frozen", () => {
  assert.ok(Object.isFrozen(SKILL_LIBRARY));
});

test("analyzeCallToActionStrategy handles empty and missing content safely", () => {
  const empty = analyzeCallToActionStrategy({ draftContent: "" });
  assert.equal(empty.signals.wordCount, 0);
  assert.equal(typeof empty.ctaScore, "number");
  const missing = analyzeCallToActionStrategy({});
  assert.equal(missing.signals.wordCount, 0);
  assert.equal(missing.primaryCTA.present, false);
  assert.equal(missing.primaryCTA.statement, null);
  assert.equal(missing.ctaType, null);
});

test("honesty constraints are enforced by the manifest", () => {
  assert.ok(SKILL.constraints.includes("never invent offers"));
  assert.ok(SKILL.constraints.includes("never fabricate deadlines"));
  assert.ok(SKILL.constraints.includes("never recommend deceptive scarcity"));
  assert.ok(SKILL.constraints.includes("never manipulate emotions dishonestly"));
  assert.ok(SKILL.constraints.includes("never change factual meaning"));
  assert.ok(SKILL.constraints.includes("never override creator intent"));
});

test("buildCtaRecommendations returns a stable ordered list", () => {
  const analysis = analyzeCallToActionStrategy({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "You waste hours scheduling meetings. Imagine winning more clients and saving time. Get instant access to the Calendar Pro course for just $99. Also sign up for the newsletter. And reserve your spot for the free webinar.",
  });
  const recommendations = buildCtaRecommendations(analysis);
  assert.ok(Array.isArray(recommendations));
  for (const recommendation of recommendations) {
    assert.ok(recommendation.ruleId);
    assert.ok(recommendation.severity);
    assert.ok(recommendation.recommendation);
    assert.ok(recommendation.reason);
  }
});
