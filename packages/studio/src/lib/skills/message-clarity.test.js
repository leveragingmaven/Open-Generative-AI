import assert from "node:assert/strict";
import test from "node:test";
import {
  SKILL_LIBRARY,
  getSkill,
  evaluateMessageClarity,
  verifyMessageClarity,
  analyzeMessageClarity,
  clarifyContent,
  buildRecommendations,
  MESSAGE_CLARITY_SKILL_ID,
} from "./index.js";
import { applyCreativeSkill } from "../creative-brief/CreativeSkill.js";

const SKILL = getSkill(MESSAGE_CLARITY_SKILL_ID);

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

test("message-clarity is registered and discoverable", () => {
  assert.ok(SKILL_LIBRARY[MESSAGE_CLARITY_SKILL_ID], "registered in SKILL_LIBRARY");
  assert.equal(SKILL.skillId, MESSAGE_CLARITY_SKILL_ID);
  assert.equal(SKILL.name, "Message Clarity");
  assert.equal(SKILL.category, "communication");
  assert.equal(SKILL.status, "active");
  assert.equal(SKILL.priority, "foundational");
  assert.equal(SKILL.shared, true);
  assert.equal(SKILL.discoverable, true);
});

test("message-clarity follows the approved Creative Skill schema", () => {
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

test("message-clarity is shared across every compatible studio", () => {
  for (const studio of ["marketing", "image", "video", "audio", "workflow", "publishing", "ai-twin", "agents"]) {
    assert.ok(SKILL.supportedStudios.includes(studio), `missing ${studio}`);
  }
});

test("Test 1: three unrelated ideas recommends one primary message", () => {
  const result = evaluateMessageClarity({
    draftContent: "We just released a new tracking feature. We also added a dark mode. On top of that, our pricing changed.",
  });
  assert.equal(result.flags.multipleCompetingIdeas, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R1"), "R1 recommendation present");
  assert.ok(result.scores.messageFocus < 100, "focus penalized for competing ideas");
});

test("Test 2: heavy jargon recommends simpler wording", () => {
  const result = evaluateMessageClarity({
    draftContent: "We will leverage our synergies to facilitate a paradigm shift in holistic value delivery.",
  });
  assert.equal(result.flags.excessiveJargon, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R3"), "R3 recommendation present");
  assert.ok(result.scores.cognitiveLoad < 100, "cognitive load penalized for jargon");
});

test("Test 3: hidden benefit recommends making the benefit explicit", () => {
  const result = evaluateMessageClarity({
    draftContent: "Our platform includes real-time dashboards, automated reporting, and proprietary algorithms.",
  });
  assert.equal(result.flags.audienceBenefitHidden, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R4"), "R4 recommendation present");
  assert.equal(result.scores.benefitVisibility, 30);
});

test("Test 4: missing action recommends one clear next action", () => {
  const result = evaluateMessageClarity({
    draftContent: "Our product is fast, reliable, and affordable.",
  });
  assert.equal(result.flags.actionMissing, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R5"), "R5 recommendation present");
  assert.equal(result.scores.actionClarity, 40);
});

test("Test 5: already clear copy returns a high clarity score with minimal recommendations", () => {
  const result = evaluateMessageClarity({
    draftContent: "Save money on your energy bills. Sign up today to get started.",
  });
  assert.ok(result.clarityScore >= 70, `clarityScore ${result.clarityScore} should be high`);
  assert.equal(result.recommendations.length, 0, "no recommendations for clear copy");
  assert.equal(result.flags.multipleCompetingIdeas, false);
});

test("scores are independent, bounded 0-100, and never null", () => {
  const result = evaluateMessageClarity({ draftContent: "Save money on your energy bills. Sign up today." });
  for (const key of ["messageFocus", "cognitiveLoad", "benefitVisibility", "actionClarity", "logicalFlow", "clarity"]) {
    assert.equal(typeof result.scores[key], "number");
    assert.ok(result.scores[key] >= 0 && result.scores[key] <= 100, `${key} within 0-100`);
  }
});

test("evaluation is deterministic across repeated calls", () => {
  const input = { draftContent: "We just released a new tracking feature. We also added a dark mode." };
  const first = evaluateMessageClarity(input);
  const second = evaluateMessageClarity(input);
  assert.deepEqual(first.scores, second.scores);
  assert.deepEqual(first.flags, second.flags);
  assert.deepEqual(first.recommendations, second.recommendations);
});

test("clarifiedContent never changes meaning and never invents facts", () => {
  const { clarifiedContent, edits } = clarifyContent("Welcome to our newsletter. We launched a feature that saves you time.");
  assert.ok(clarifiedContent.includes("We launched a feature that saves you time."));
  assert.ok(clarifiedContent.includes("Welcome to our newsletter."));
  assert.equal(edits[0].ruleId, "R6");
});

test("clarification is a no-op for already-clear copy", () => {
  const { clarifiedContent, edits } = clarifyContent("Sign up today to start saving money.");
  assert.equal(clarifiedContent, "Sign up today to start saving money.");
  assert.deepEqual(edits, []);
});

test("compound sentences are split meaning-preservingly", () => {
  const { clarifiedContent, edits } = clarifyContent("We track expenses, and we also generate reports.");
  assert.ok(clarifiedContent.includes("We track expenses. We also generate reports."));
  assert.ok(edits.some((e) => e.ruleId === "R2"));
});

test("AI Twin verification exposes the four internal checks", () => {
  const verification = verifyMessageClarity({
    draftContent: "Save money on your energy bills. Sign up today to get started.",
  });
  assert.equal(verification.skillId, MESSAGE_CLARITY_SKILL_ID);
  assert.equal(typeof verification.immediatelyUnderstandable, "boolean");
  assert.equal(typeof verification.singlePrimaryMessage, "boolean");
  assert.equal(typeof verification.benefitObvious, "boolean");
  assert.equal(typeof verification.actionClear, "boolean");
  assert.equal(typeof verification.canImproveWithoutChangingIntent, "boolean");
});

test("message-clarity works with the shared enrichment integration", () => {
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
  assert.equal(enriched.skill.skillId, MESSAGE_CLARITY_SKILL_ID);
  assert.deepEqual(enriched.constraints, SKILL.constraints);
  assert.ok(enriched.style.includes("plain"));
});

test("unknown skill IDs still throw after registration change", () => {
  assert.throws(() => getSkill("does-not-exist"), /Unknown creative skill/);
});

test("SKILL_LIBRARY remains frozen", () => {
  assert.ok(Object.isFrozen(SKILL_LIBRARY));
});

test("analyzeMessageClarity handles empty and missing content safely", () => {
  const empty = analyzeMessageClarity({ draftContent: "" });
  assert.equal(empty.signals.wordCount, 0);
  assert.equal(typeof empty.clarityScore, "number");
  const missing = analyzeMessageClarity({});
  assert.equal(missing.signals.wordCount, 0);
});

test("audience expertise raises the jargon threshold", () => {
  const content = "We leverage our synergy.";
  const technicalAudience = analyzeMessageClarity({
    draftContent: content,
    audienceProfile: { expertiseLevel: "expert", readingLevel: "technical" },
  });
  const generalAudience = analyzeMessageClarity({
    draftContent: content,
  });
  assert.equal(technicalAudience.flags.excessiveJargon, false);
  assert.equal(generalAudience.flags.excessiveJargon, true);
});

test("buried primary message is flagged and recommendation R6 present", () => {
  const result = evaluateMessageClarity({
    draftContent: "Welcome to our newsletter. We launched a feature that saves you time.",
  });
  assert.equal(result.flags.primaryMessageBuried, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R6"), "R6 recommendation present");
});

test("meaning-preservation constraint is enforced by the manifest", () => {
  assert.ok(SKILL.constraints.includes("never change factual meaning"));
  assert.ok(SKILL.constraints.includes("never invent information"));
  assert.ok(SKILL.constraints.includes("never rewrite personality"));
  assert.ok(SKILL.constraints.includes("never modify brand positioning"));
  assert.ok(SKILL.constraints.includes("preserve creator intent"));
});

test("buildRecommendations returns a stable ordered list", () => {
  const analysis = analyzeMessageClarity({
    draftContent: "We leverage synergies to change everything. Our pricing also changed. Call us now.",
  });
  const recommendations = buildRecommendations(analysis);
  assert.ok(Array.isArray(recommendations));
  for (const recommendation of recommendations) {
    assert.ok(recommendation.ruleId);
    assert.ok(recommendation.severity);
    assert.ok(recommendation.recommendation);
    assert.ok(recommendation.reason);
  }
});
