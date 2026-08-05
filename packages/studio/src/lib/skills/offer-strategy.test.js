import assert from "node:assert/strict";
import test from "node:test";
import {
  SKILL_LIBRARY,
  getSkill,
  evaluateOfferStrategy,
  verifyOfferStrategy,
  analyzeOfferStrategy,
  preserveOfferStrategy,
  buildOfferStrategyRecommendations,
  OFFER_STRATEGY_SKILL_ID,
} from "./index.js";
import { applyCreativeSkill } from "../creative-brief/CreativeSkill.js";

const SKILL = getSkill(OFFER_STRATEGY_SKILL_ID);

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

test("offer-strategy is registered and discoverable", () => {
  assert.ok(SKILL_LIBRARY[OFFER_STRATEGY_SKILL_ID], "registered in SKILL_LIBRARY");
  assert.equal(SKILL.skillId, OFFER_STRATEGY_SKILL_ID);
  assert.equal(SKILL.name, "Offer Strategy");
  assert.equal(SKILL.category, "marketing");
  assert.equal(SKILL.status, "active");
  assert.equal(SKILL.priority, "foundational");
  assert.equal(SKILL.shared, true);
  assert.equal(SKILL.discoverable, true);
});

test("offer-strategy follows the approved Creative Skill schema", () => {
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

test("offer-strategy is shared across every compatible studio", () => {
  for (const studio of ["marketing", "video", "audio", "publishing", "workflow", "ai-twin", "agents"]) {
    assert.ok(SKILL.supportedStudios.includes(studio), `missing ${studio}`);
  }
});

test("offer-strategy declares advisory dependency metadata", () => {
  assert.deepEqual(SKILL.dependsOn, ["problem-discovery", "positioning"]);
  assert.deepEqual(SKILL.complements, ["customer-transformation", "call-to-action-strategy"]);
  assert.ok(SKILL.sharedUtilities.includes("communication-utils"));
});

test("manifest declares all seven decision rules", () => {
  const ids = SKILL.decisionRules.map((rule) => rule.id);
  assert.deepEqual(ids, ["R1", "R2", "R3", "R4", "R5", "R6", "R7"]);
});

test("Test 1: three competing offers recommend one primary offer", () => {
  const result = evaluateOfferStrategy({
    creativeBrief: "Launch email for our training offers.",
    campaignContext: "Launch campaign.",
    draftContent: "We offer a video course, a done-for-you template pack, and a monthly coaching membership.",
  });
  assert.equal(result.flags.competingOffers, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R1"), "R1 recommendation present");
  assert.ok(result.primaryOffer.type, "a primary offer type is selected");
});

test("Test 2: offer that does not solve the identified problem recommends alignment", () => {
  const result = evaluateOfferStrategy({
    creativeBrief: "Customers are frustrated because scheduling takes too long.",
    campaignContext: "Launch campaign.",
    draftContent: "Join our exclusive program and get access to everything.",
  });
  assert.equal(result.flags.misalignedWithProblem, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R2"), "R2 recommendation present");
});

test("Test 3: feature-heavy offer with unclear value recommends outcomes", () => {
  const result = evaluateOfferStrategy({
    creativeBrief: "Launch email about our project management tool.",
    campaignContext: "Feature campaign.",
    draftContent: "Our app has a dashboard, built-in integrations, automation features, and 50 modules.",
  });
  assert.equal(result.flags.featuresOverValue, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R4"), "R4 recommendation present");
  assert.ok(result.valueClarityScore < 50, `valueClarityScore ${result.valueClarityScore} should be low`);
  assert.ok(!result.recommendations.some((r) => ["R1", "R2", "R5"].includes(r.ruleId)), "only the value recommendation fires");
});

test("Test 4: simple, clearly aligned offer returns high Clarity, Value, and Strength", () => {
  const result = evaluateOfferStrategy({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "Get instant access to the Calendar Pro course. You'll learn to save hours every week and win more clients. For just $99, with our money-back guarantee in writing.",
  });
  assert.equal(result.flags.competingOffers, false);
  assert.equal(result.flags.featuresOverValue, false);
  assert.equal(result.flags.misalignedWithProblem, false);
  assert.equal(result.flags.unsupportedUrgencyOrGuarantee, false);
  assert.ok(result.clarityScore >= 85, `clarityScore ${result.clarityScore} should be high`);
  assert.ok(result.valueClarityScore >= 85, `valueClarityScore ${result.valueClarityScore} should be high`);
  assert.ok(result.strengthScore >= 85, `strengthScore ${result.strengthScore} should be high`);
});

test("Test 5: fabricated scarcity and unsupported guarantees reject the modification", () => {
  const result = evaluateOfferStrategy({
    creativeBrief: "Launch email for our course.",
    campaignContext: "Launch campaign.",
    draftContent: "Limited time offer! Act now before it's gone. 100% money-back guarantee, guaranteed results.",
  });
  assert.equal(result.flags.unsupportedUrgencyOrGuarantee, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R6"), "R6 rejection present");
  assert.ok(result.recommendations.some((r) => r.ruleId === "R7"), "R7 intent preservation present");
  assert.ok(
    !result.recommendations.some((r) => ["R1", "R2", "R3", "R4", "R5"].includes(r.ruleId)),
    "no offer recommendations when claims are unsupported",
  );
});

test("Rule 3: unnecessary complexity recommends simplification", () => {
  const result = evaluateOfferStrategy({
    creativeBrief: "Launch email for our bundle.",
    campaignContext: "Launch campaign.",
    draftContent: "You get our all-in-one comprehensive bundle with everything included.",
  });
  assert.equal(result.flags.unnecessaryComplexity, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R3"), "R3 recommendation present");
  assert.ok(result.simplicityScore < 85, "simplicity penalized for complexity");
});

test("Rule 5: missing offer elements are identified without inventing content", () => {
  const result = evaluateOfferStrategy({
    creativeBrief: "Launch email for our course.",
    campaignContext: "Launch campaign.",
    draftContent: "Sign up for our offer.",
  });
  assert.equal(result.flags.missingOfferComponents, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R5"), "R5 recommendation present");
  assert.equal(result.primaryOffer.components.mechanism, false);
  assert.ok(result.primaryOffer.missingComponents.includes("mechanism"));
});

test("primaryOffer reports the offer statement, type, and components", () => {
  const result = evaluateOfferStrategy({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "Get instant access to the Calendar Pro course. You'll learn to save hours every week and win more clients. For just $99, with our money-back guarantee in writing.",
  });
  assert.equal(result.primaryOffer.present, true);
  assert.equal(result.primaryOffer.type, "program");
  assert.equal(result.primaryOffer.components.mechanism, true);
  assert.equal(result.primaryOffer.components.outcome, true);
  assert.equal(result.primaryOffer.components.price, true);
  assert.deepEqual(result.primaryOffer.missingComponents, []);
});

test("scores are independent, bounded 0-100, and never null", () => {
  const result = evaluateOfferStrategy({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "Get the Calendar Pro course. You'll save hours every week. For just $99.",
  });
  for (const key of ["offerClarity", "valueCommunication", "simplicity", "problemAlignment", "strategicStrength"]) {
    assert.equal(typeof result.scores[key], "number");
    assert.ok(result.scores[key] >= 0 && result.scores[key] <= 100, `${key} within 0-100`);
  }
  assert.equal(typeof result.offerScore, "number");
  assert.equal(typeof result.clarityScore, "number");
  assert.equal(typeof result.valueClarityScore, "number");
  assert.equal(typeof result.simplicityScore, "number");
  assert.equal(typeof result.problemAlignmentScore, "number");
  assert.equal(typeof result.strengthScore, "number");
});

test("evaluation is deterministic across repeated calls", () => {
  const input = {
    creativeBrief: "Launch email for our training offers.",
    campaignContext: "Launch campaign.",
    draftContent: "We offer a video course, a done-for-you template pack, and a monthly coaching membership.",
  };
  const first = evaluateOfferStrategy(input);
  const second = evaluateOfferStrategy(input);
  assert.deepEqual(first.scores, second.scores);
  assert.deepEqual(first.flags, second.flags);
  assert.deepEqual(first.recommendations, second.recommendations);
  assert.deepEqual(first.primaryOffer, second.primaryOffer);
});

test("preserveOfferStrategy is a meaning-preserving no-op (offers are recommended, never rewritten)", () => {
  const original = "Get the Calendar Pro course. You'll save hours every week.";
  const { preservedContent, edits } = preserveOfferStrategy(original);
  assert.equal(preservedContent, original);
  assert.deepEqual(edits, []);
});

test("AI Twin verification exposes the five internal checks", () => {
  const verification = verifyOfferStrategy({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "Get the Calendar Pro course. You'll save hours every week. For just $99.",
  });
  assert.equal(verification.skillId, OFFER_STRATEGY_SKILL_ID);
  assert.equal(typeof verification.primaryOfferClear, "boolean");
  assert.equal(typeof verification.solvesIdentifiedProblem, "boolean");
  assert.equal(typeof verification.valueImmediatelyObvious, "boolean");
  assert.equal(typeof verification.offerSimpleToUnderstand, "boolean");
  assert.equal(typeof verification.customerKnowsWhatTheyReceive, "boolean");
  assert.equal(typeof verification.canImproveWithoutChangingIntent, "boolean");
});

test("offer-strategy works with the shared enrichment integration", () => {
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
  assert.equal(enriched.skill.skillId, OFFER_STRATEGY_SKILL_ID);
  assert.deepEqual(enriched.constraints, SKILL.constraints);
  assert.ok(enriched.style.includes("plain"));
});

test("unknown skill IDs still throw after registration change", () => {
  assert.throws(() => getSkill("does-not-exist"), /Unknown creative skill/);
});

test("SKILL_LIBRARY remains frozen", () => {
  assert.ok(Object.isFrozen(SKILL_LIBRARY));
});

test("analyzeOfferStrategy handles empty and missing content safely", () => {
  const empty = analyzeOfferStrategy({ draftContent: "" });
  assert.equal(empty.signals.wordCount, 0);
  assert.equal(typeof empty.offerScore, "number");
  const missing = analyzeOfferStrategy({});
  assert.equal(missing.signals.wordCount, 0);
  assert.equal(missing.primaryOffer.present, false);
  assert.equal(missing.primaryOffer.statement, null);
});

test("honesty constraints are enforced by the manifest", () => {
  assert.ok(SKILL.constraints.includes("never invent products"));
  assert.ok(SKILL.constraints.includes("never invent bonuses"));
  assert.ok(SKILL.constraints.includes("never recommend deceptive scarcity"));
  assert.ok(SKILL.constraints.includes("never fabricate guarantees"));
  assert.ok(SKILL.constraints.includes("never change factual meaning"));
  assert.ok(SKILL.constraints.includes("never override creator intent"));
});

test("buildOfferStrategyRecommendations returns a stable ordered list", () => {
  const analysis = analyzeOfferStrategy({
    creativeBrief: "Launch email for our training offers.",
    campaignContext: "Launch campaign.",
    draftContent: "We offer a video course, a done-for-you template pack, and a monthly coaching membership.",
  });
  const recommendations = buildOfferStrategyRecommendations(analysis);
  assert.ok(Array.isArray(recommendations));
  for (const recommendation of recommendations) {
    assert.ok(recommendation.ruleId);
    assert.ok(recommendation.severity);
    assert.ok(recommendation.recommendation);
    assert.ok(recommendation.reason);
  }
});
