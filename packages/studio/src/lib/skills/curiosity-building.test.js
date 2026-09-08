import assert from "node:assert/strict";
import test from "node:test";
import {
  SKILL_LIBRARY,
  getSkill,
  evaluateCuriosityBuilding,
  verifyCuriosityBuilding,
  analyzeCuriosityBuilding,
  restructureContent,
  buildCuriosityRecommendations,
  CURIOSITY_BUILDING_SKILL_ID,
} from "./index.js";
import { applyCreativeSkill } from "../creative-brief/CreativeSkill.js";

const SKILL = getSkill(CURIOSITY_BUILDING_SKILL_ID);

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

test("curiosity-building is registered and discoverable", () => {
  assert.ok(SKILL_LIBRARY[CURIOSITY_BUILDING_SKILL_ID], "registered in SKILL_LIBRARY");
  assert.equal(SKILL.skillId, CURIOSITY_BUILDING_SKILL_ID);
  assert.equal(SKILL.name, "Curiosity Building");
  assert.equal(SKILL.category, "communication");
  assert.equal(SKILL.status, "active");
  assert.equal(SKILL.priority, "foundational");
  assert.equal(SKILL.shared, true);
  assert.equal(SKILL.discoverable, true);
});

test("curiosity-building follows the approved Creative Skill schema", () => {
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

test("curiosity-building is shared across every compatible studio", () => {
  for (const studio of ["marketing", "image", "video", "audio", "workflow", "publishing", "ai-twin", "agents"]) {
    assert.ok(SKILL.supportedStudios.includes(studio), `missing ${studio}`);
  }
});

test("manifest declares all seven decision rules", () => {
  const ids = SKILL.decisionRules.map((rule) => rule.id);
  assert.deepEqual(ids, ["R1", "R2", "R3", "R4", "R5", "R6", "R7"]);
});

test("Test 1: flat introduction with no hook recommends a stronger opening", () => {
  const result = evaluateCuriosityBuilding({
    draftContent: "We provide a service. It helps businesses. Many companies use it.",
  });
  assert.equal(result.flags.noCompellingOpening, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R1"), "R1 recommendation present");
  assert.ok(result.scores.hookStrength < 100, "hook strength penalized for a flat opening");
});

test("Test 2: entire conclusion revealed immediately recommends delaying the resolution", () => {
  const result = evaluateCuriosityBuilding({
    draftContent: "The answer is simple: our product is the best choice. In conclusion, you should try it today.",
  });
  assert.equal(result.flags.prematureConclusion, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R4"), "R4 recommendation present");
  assert.ok(result.recommendations.some((r) => r.ruleId === "R2"), "R2 recommendation present");
  assert.ok(result.scores.informationFlow < 100, "information flow penalized for a premature conclusion");
});

test("Test 3: misleading teaser language rejects the recommendation", () => {
  const result = evaluateCuriosityBuilding({
    draftContent: "You won't believe what happens next! Our secret will blow your mind. They don't want you to know this.",
  });
  assert.equal(result.flags.deceptiveCuriosity, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R6"), "R6 rejection present");
  assert.ok(
    !result.recommendations.some((r) => ["R1", "R2", "R3", "R4", "R5"].includes(r.ruleId)),
    "no engagement recommendations when curiosity depends on deception",
  );
});

test("Test 4: progressive release with strong transitions returns a high curiosity score", () => {
  const result = evaluateCuriosityBuilding({
    draftContent: "Have you ever wondered what makes some campaigns unforgettable? It starts with a single message. Then the audience feels something. The ending is what you will not see coming. So how do you keep them reading? Keep reading to find out.",
  });
  assert.equal(result.flags.prematureConclusion, false);
  assert.equal(result.flags.abruptTransitions, false);
  assert.equal(result.flags.progressiveDisclosure, true);
  assert.ok(result.curiosityScore >= 85, `curiosityScore ${result.curiosityScore} should be high`);
});

test("Test 5: content already maintaining excellent engagement returns minimal recommendations", () => {
  const result = evaluateCuriosityBuilding({
    draftContent: "Did you know most campaigns fail before the first idea? It starts with attention. Then the message lands. The trick is timing. So what happens next? Read on to find out.",
  });
  assert.equal(result.recommendations.length, 0, "no recommendations for already-engaging content");
  assert.ok(result.attentionRetentionScore >= 85, `attentionRetentionScore ${result.attentionRetentionScore} should be high`);
  assert.ok(result.curiosityScore >= 85, `curiosityScore ${result.curiosityScore} should be high`);
});

test("scores are independent, bounded 0-100, and never null", () => {
  const result = evaluateCuriosityBuilding({
    draftContent: "Did you know most campaigns fail before the first idea? Read on to find out.",
  });
  for (const key of ["hookStrength", "curiosityLevel", "informationFlow", "narrativeMomentum", "attentionRetention", "curiosity"]) {
    assert.equal(typeof result.scores[key], "number");
    assert.ok(result.scores[key] >= 0 && result.scores[key] <= 100, `${key} within 0-100`);
  }
});

test("evaluation is deterministic across repeated calls", () => {
  const input = { draftContent: "We provide a service. It helps businesses. Many companies use it." };
  const first = evaluateCuriosityBuilding(input);
  const second = evaluateCuriosityBuilding(input);
  assert.deepEqual(first.scores, second.scores);
  assert.deepEqual(first.flags, second.flags);
  assert.deepEqual(first.recommendations, second.recommendations);
});

test("restructureContent front-loads a later question without changing meaning", () => {
  const { restructuredContent, edits } = restructureContent(
    "Our service is reliable. Have you ever wondered why we built it? Keep reading to find out.",
  );
  assert.ok(restructuredContent.startsWith("Have you ever wondered why we built it?"));
  assert.ok(restructuredContent.includes("Our service is reliable."));
  assert.ok(restructuredContent.includes("Keep reading to find out."));
  assert.equal(edits[0].ruleId, "R3");
});

test("restructuring is a no-op when the opening is already a hook", () => {
  const { restructuredContent, edits } = restructureContent("Have you tried our product? It saves time.");
  assert.equal(restructuredContent, "Have you tried our product? It saves time.");
  assert.deepEqual(edits, []);
});

test("restructuring is a no-op when no later question exists", () => {
  const { restructuredContent, edits } = restructureContent("Our service is reliable. It saves time.");
  assert.equal(restructuredContent, "Our service is reliable. It saves time.");
  assert.deepEqual(edits, []);
});

test("restructureContent never fabricates or removes words", () => {
  const original = "Our service is reliable. Have you ever wondered why we built it? Keep reading to find out.";
  const { restructuredContent } = restructureContent(original);
  const originalWords = original.toLowerCase().match(/[a-z']+/g).sort();
  const restructuredWords = restructuredContent.toLowerCase().match(/[a-z']+/g).sort();
  assert.deepEqual(restructuredWords, originalWords);
});

test("excessive repetition is flagged", () => {
  const result = analyzeCuriosityBuilding({
    draftContent: "Our product is fast. Our product is fast. Our product is fast. Our product is fast. Our product is fast.",
  });
  assert.equal(result.flags.excessiveRepetition, true);
  assert.ok(result.scores.attentionRetention < 100, "attention retention penalized for repetition");
});

test("AI Twin verification exposes the five internal checks", () => {
  const verification = verifyCuriosityBuilding({
    draftContent: "Did you know most campaigns fail before the first idea? It starts with attention. Read on to find out.",
  });
  assert.equal(verification.skillId, CURIOSITY_BUILDING_SKILL_ID);
  assert.equal(typeof verification.openingCreatesInterest, "boolean");
  assert.equal(typeof verification.naturalReasonToContinue, "boolean");
  assert.equal(typeof verification.informationPacedRight, "boolean");
  assert.equal(typeof verification.curiosityEarnedNotManufactured, "boolean");
  assert.equal(typeof verification.audienceWillFeelRewarded, "boolean");
  assert.equal(typeof verification.canImproveWithoutChangingIntent, "boolean");
});

test("curiosity-building works with the shared enrichment integration", () => {
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
  assert.equal(enriched.skill.skillId, CURIOSITY_BUILDING_SKILL_ID);
  assert.deepEqual(enriched.constraints, SKILL.constraints);
  assert.ok(enriched.style.includes("plain"));
});

test("unknown skill IDs still throw after registration change", () => {
  assert.throws(() => getSkill("does-not-exist"), /Unknown creative skill/);
});

test("SKILL_LIBRARY remains frozen", () => {
  assert.ok(Object.isFrozen(SKILL_LIBRARY));
});

test("analyzeCuriosityBuilding handles empty and missing content safely", () => {
  const empty = analyzeCuriosityBuilding({ draftContent: "" });
  assert.equal(empty.signals.wordCount, 0);
  assert.equal(typeof empty.curiosityScore, "number");
  const missing = analyzeCuriosityBuilding({});
  assert.equal(missing.signals.wordCount, 0);
});

test("trust constraints are enforced by the manifest", () => {
  assert.ok(SKILL.constraints.includes("never create clickbait"));
  assert.ok(SKILL.constraints.includes("never fabricate information"));
  assert.ok(SKILL.constraints.includes("never manipulate emotions dishonestly"));
  assert.ok(SKILL.constraints.includes("never exaggerate outcomes"));
  assert.ok(SKILL.constraints.includes("never change factual meaning"));
  assert.ok(SKILL.constraints.includes("preserve creator intent"));
});

test("buildCuriosityRecommendations returns a stable ordered list", () => {
  const analysis = analyzeCuriosityBuilding({
    draftContent: "The answer is simple: we win. In conclusion, buy today.",
  });
  const recommendations = buildCuriosityRecommendations(analysis);
  assert.ok(Array.isArray(recommendations));
  for (const recommendation of recommendations) {
    assert.ok(recommendation.ruleId);
    assert.ok(recommendation.severity);
    assert.ok(recommendation.recommendation);
    assert.ok(recommendation.reason);
  }
});
