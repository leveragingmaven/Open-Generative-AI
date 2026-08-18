import assert from "node:assert/strict";
import test from "node:test";
import {
  SKILL_LIBRARY,
  getSkill,
  evaluateCharacterPerspective,
  verifyCharacterPerspective,
  analyzeCharacterPerspective,
  preserveCharacterPerspective,
  buildCharacterPerspectiveRecommendations,
  CHARACTER_PERSPECTIVE_SKILL_ID,
  FIRST_PERSON_MARKERS,
  SECOND_PERSON_MARKERS,
  THIRD_PERSON_MARKERS,
  PERSPECTIVE_MARKERS,
} from "./index.js";
import { applyCreativeSkill } from "../creative-brief/CreativeSkill.js";

const SKILL = getSkill(CHARACTER_PERSPECTIVE_SKILL_ID);

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

test("character-perspective is registered and discoverable", () => {
  assert.ok(SKILL_LIBRARY[CHARACTER_PERSPECTIVE_SKILL_ID], "registered in SKILL_LIBRARY");
  assert.equal(SKILL.skillId, CHARACTER_PERSPECTIVE_SKILL_ID);
  assert.equal(SKILL.name, "Character Perspective");
  assert.equal(SKILL.category, "storytelling");
  assert.equal(SKILL.status, "active");
  assert.equal(SKILL.priority, "foundational");
  assert.equal(SKILL.shared, true);
  assert.equal(SKILL.discoverable, true);
});

test("character-perspective follows the approved Creative Skill schema", () => {
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

test("character-perspective is shared across every compatible studio", () => {
  for (const studio of ["marketing", "publishing", "ai-twin", "video", "audio", "workflow"]) {
    assert.ok(SKILL.supportedStudios.includes(studio), `missing ${studio}`);
  }
});

test("character-perspective declares advisory dependency metadata", () => {
  assert.deepEqual(SKILL.dependsOn, ["story-structure", "narrative-flow", "emotional-pacing"]);
  assert.deepEqual(SKILL.complements, ["story-continuity"]);
  assert.deepEqual(SKILL.sharedUtilities, ["communication-utils"]);
});

test("manifest declares the compatible content types", () => {
  assert.deepEqual(SKILL.compatibleContentTypes, [
    "video-script",
    "podcast",
    "story-content",
    "webinar",
    "presentation",
    "blog",
    "educational-content",
    "sales-presentation",
  ]);
});

test("manifest declares all seven decision rules", () => {
  const ids = SKILL.decisionRules.map((rule) => rule.id);
  assert.deepEqual(ids, ["R1", "R2", "R3", "R4", "R5", "R6", "R7"]);
});

test("Test 1: unexpected perspective shifts recommend maintaining consistency", () => {
  const result = evaluateCharacterPerspective({
    creativeBrief: "Announce the product launch.",
    campaignContext: "Launch campaign.",
    draftContent: "We launched the product last month. Our team handled the rollout. We tracked every metric. You should join the webinar.",
  });
  assert.equal(result.flags.perspectiveShift, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R1"), "R1 recommendation present");
  assert.ok(result.consistencyScore < 85, `consistencyScore ${result.consistencyScore} should be penalized`);
  assert.equal(result.perspectiveType, "first-person");
});

test("Test 2: audience losing perspective recommends reinforcing the intended viewpoint", () => {
  const result = evaluateCharacterPerspective({
    creativeBrief: "Sell the calendar app.",
    campaignContext: "Launch campaign.",
    draftContent: "The calendar app saves time. The scheduling is automatic. The reminders are built in. The dashboard shows everything.",
  });
  assert.equal(result.flags.unclearViewpoint, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R2"), "R2 recommendation present");
  assert.equal(result.perspectiveType, "neutral");
});

test("Test 3: multiple viewpoints without transitions recommend clearer transitions", () => {
  const result = evaluateCharacterPerspective({
    creativeBrief: "Describe the sales workflow.",
    campaignContext: "Team training.",
    draftContent: "You handle the sales call. They prepare the demo. You follow up with the client. They close the deal. You celebrate the win.",
  });
  assert.equal(result.flags.multiPerspective, true);
  assert.equal(result.flags.perspectiveShift, true);
  assert.equal(result.perspectiveType, "mixed");
  assert.ok(result.recommendations.some((r) => r.ruleId === "R3"), "R3 recommendation present");
});

test("Test 4: excellent perspective consistency returns high scores", () => {
  const result = evaluateCharacterPerspective({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "You waste hours scheduling meetings. Then you struggle to find time to focus. As a result, you feel overwhelmed. Finally, you save hours every week and feel proud and relieved.",
  });
  assert.equal(result.flags.perspectiveShift, false);
  assert.equal(result.flags.unclearViewpoint, false);
  assert.equal(result.flags.multiPerspective, false);
  assert.equal(result.flags.focusDrift, false);
  assert.equal(result.flags.fabricatedStory, false);
  assert.equal(result.perspectiveType, "second-person");
  assert.ok(result.consistencyScore >= 90, `consistencyScore ${result.consistencyScore} should be high`);
  assert.ok(result.audienceAlignmentScore >= 90, `audienceAlignmentScore ${result.audienceAlignmentScore} should be high`);
  assert.ok(result.empathyScore >= 90, `empathyScore ${result.empathyScore} should be high`);
  assert.ok(result.narrativeFocusScore >= 90, `narrativeFocusScore ${result.narrativeFocusScore} should be high`);
  assert.ok(result.perspectiveScore >= 90, `perspectiveScore ${result.perspectiveScore} should be high`);
  assert.equal(result.recommendations.length, 0, "a stable perspective needs no recommendations");
});

test("Test 5: technical documentation with no narrative perspective is not forced", () => {
  const result = evaluateCharacterPerspective({
    creativeBrief: "Document the configuration.",
    campaignContext: "Reference guide.",
    contentType: "documentation",
    draftContent: "This guide documents the configuration. See chapter two for the parameters. The appendix lists the default values.",
  });
  assert.equal(result.flags.informationalContent, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R5"), "R5 recommendation present");
  assert.ok(
    !result.recommendations.some((r) => ["R1", "R2", "R3", "R4", "R6", "R7"].includes(r.ruleId)),
    "no perspective recommendations on informational content",
  );
});

test("Test 6: ungrounded narrative rejects the modification", () => {
  const result = evaluateCharacterPerspective({
    draftContent: "We struggled for years. Then I finally felt proud. They helped us succeed.",
  });
  assert.equal(result.flags.fabricatedStory, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R6"), "R6 rejection present");
  assert.ok(result.recommendations.some((r) => r.ruleId === "R7"), "R7 intent preservation present");
  assert.ok(
    !result.recommendations.some((r) => ["R1", "R2", "R3", "R4", "R5"].includes(r.ruleId)),
    "no perspective recommendations when the story is ungrounded",
  );
});

test("perspectiveType reports the intended viewpoint", () => {
  const first = evaluateCharacterPerspective({
    creativeBrief: "Announce the product launch.",
    campaignContext: "Launch campaign.",
    draftContent: "We launched the product last month. Our team handled the rollout. We tracked every metric. You should join the webinar.",
  });
  assert.equal(first.perspectiveType, "first-person");

  const second = evaluateCharacterPerspective({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "You waste hours scheduling meetings. Then you struggle to find time to focus. As a result, you feel overwhelmed. Finally, you save hours every week.",
  });
  assert.equal(second.perspectiveType, "second-person");

  const third = evaluateCharacterPerspective({
    creativeBrief: "Tell the founder story.",
    campaignContext: "Brand story.",
    draftContent: "He started the company at home. His team shipped the first version. She joined the board later. Their story inspired the launch.",
  });
  assert.equal(third.perspectiveType, "third-person");

  const neutral = evaluateCharacterPerspective({
    creativeBrief: "Sell the calendar app.",
    campaignContext: "Launch campaign.",
    draftContent: "The calendar app saves time. The scheduling is automatic. The reminders are built in. The dashboard shows everything.",
  });
  assert.equal(neutral.perspectiveType, "neutral");
});

test("scores are independent, bounded 0-100, and never null", () => {
  const result = evaluateCharacterPerspective({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "You waste hours scheduling meetings. Then you struggle to find time to focus. As a result, you feel overwhelmed. Finally, you save hours every week and feel proud and relieved.",
  });
  for (const key of ["consistency", "audienceAlignment", "empathy", "narrativeFocus", "viewpointStability"]) {
    assert.equal(typeof result.scores[key], "number");
    assert.ok(result.scores[key] >= 0 && result.scores[key] <= 100, `${key} within 0-100`);
  }
  assert.equal(typeof result.perspectiveScore, "number");
  assert.equal(typeof result.consistencyScore, "number");
  assert.equal(typeof result.audienceAlignmentScore, "number");
  assert.equal(typeof result.empathyScore, "number");
  assert.equal(typeof result.narrativeFocusScore, "number");
  assert.equal(typeof result.viewpointStabilityScore, "number");
});

test("perspectiveScore aggregates the independent dimensions", () => {
  const result = evaluateCharacterPerspective({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "You waste hours scheduling meetings. Then you struggle to find time to focus. As a result, you feel overwhelmed. Finally, you save hours every week and feel proud and relieved.",
  });
  assert.equal(result.perspectiveScore, result.perspectiveScore);
  assert.equal(result.consistencyScore, result.scores.consistency);
  assert.equal(result.audienceAlignmentScore, result.scores.audienceAlignment);
  assert.equal(result.empathyScore, result.scores.empathy);
  assert.equal(result.narrativeFocusScore, result.scores.narrativeFocus);
  assert.equal(result.viewpointStabilityScore, result.scores.viewpointStability);
});

test("evaluation is deterministic across repeated calls", () => {
  const input = {
    creativeBrief: "Describe the sales workflow.",
    campaignContext: "Team training.",
    draftContent: "You handle the sales call. They prepare the demo. You follow up with the client. They close the deal. You celebrate the win.",
  };
  const first = evaluateCharacterPerspective(input);
  const second = evaluateCharacterPerspective(input);
  assert.deepEqual(first.scores, second.scores);
  assert.deepEqual(first.flags, second.flags);
  assert.deepEqual(first.signals, second.signals);
  assert.deepEqual(first.recommendations, second.recommendations);
});

test("preserveCharacterPerspective is a meaning-preserving no-op (perspective is recommended, never rewritten)", () => {
  const original = "You waste hours scheduling meetings. Finally, you save hours every week.";
  const { preservedContent, edits } = preserveCharacterPerspective(original);
  assert.equal(preservedContent, original);
  assert.deepEqual(edits, []);
});

test("AI Twin verification exposes the five internal checks", () => {
  const verification = verifyCharacterPerspective({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "You waste hours scheduling meetings. Then you struggle to find time to focus. As a result, you feel overwhelmed. Finally, you save hours every week and feel proud and relieved.",
  });
  assert.equal(verification.skillId, CHARACTER_PERSPECTIVE_SKILL_ID);
  assert.equal(typeof verification.whosePerspectiveIsClear, "boolean");
  assert.equal(typeof verification.audienceRemainsOriented, "boolean");
  assert.equal(typeof verification.viewpointTransitionsUnderstandable, "boolean");
  assert.equal(typeof verification.empathySupportsCommunication, "boolean");
  assert.equal(typeof verification.intendedProtagonistMaintained, "boolean");
  assert.equal(typeof verification.canImproveWithoutChangingIntent, "boolean");
  assert.equal(verification.whosePerspectiveIsClear, true);
  assert.equal(verification.audienceRemainsOriented, true);
  assert.equal(verification.viewpointTransitionsUnderstandable, true);
  assert.equal(verification.empathySupportsCommunication, true);
  assert.equal(verification.intendedProtagonistMaintained, true);
});

test("character-perspective works with the shared enrichment integration", () => {
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
  assert.equal(enriched.skill.skillId, CHARACTER_PERSPECTIVE_SKILL_ID);
  assert.deepEqual(enriched.constraints, SKILL.constraints);
  assert.ok(enriched.style.includes("plain"));
});

test("unknown skill IDs still throw after registration change", () => {
  assert.throws(() => getSkill("does-not-exist"), /Unknown creative skill/);
});

test("SKILL_LIBRARY remains frozen", () => {
  assert.ok(Object.isFrozen(SKILL_LIBRARY));
});

test("analyzeCharacterPerspective handles empty and missing content safely", () => {
  const empty = analyzeCharacterPerspective({ draftContent: "" });
  assert.equal(empty.signals.wordCount, 0);
  assert.equal(empty.flags.emptyContent, true);
  assert.equal(empty.perspectiveType, "neutral");
  assert.equal(typeof empty.perspectiveScore, "number");
  const missing = analyzeCharacterPerspective({});
  assert.equal(missing.signals.wordCount, 0);
  assert.equal(missing.scores.consistency, 50);
  assert.equal(typeof missing.perspectiveScore, "number");
});

test("honesty constraints are enforced by the manifest", () => {
  assert.ok(SKILL.constraints.includes("never fabricate dialogue"));
  assert.ok(SKILL.constraints.includes("never invent experiences"));
  assert.ok(SKILL.constraints.includes("never invent characters"));
  assert.ok(SKILL.constraints.includes("never change factual meaning"));
  assert.ok(SKILL.constraints.includes("never override creator intent"));
});

test("buildCharacterPerspectiveRecommendations returns a stable ordered list", () => {
  const analysis = analyzeCharacterPerspective({
    creativeBrief: "Announce the product launch.",
    campaignContext: "Launch campaign.",
    draftContent: "We launched the product last month. Our team handled the rollout. We tracked every metric. You should join the webinar.",
  });
  const recommendations = buildCharacterPerspectiveRecommendations(analysis);
  assert.ok(Array.isArray(recommendations));
  assert.ok(recommendations.length > 0);
  for (const recommendation of recommendations) {
    assert.ok(recommendation.ruleId);
    assert.ok(recommendation.severity);
    assert.ok(recommendation.recommendation);
    assert.ok(recommendation.reason);
  }
});

test("the additive perspective vocabularies are reusable by dependent skills", () => {
  assert.ok(FIRST_PERSON_MARKERS.length > 0);
  assert.ok(SECOND_PERSON_MARKERS.length > 0);
  assert.ok(THIRD_PERSON_MARKERS.length > 0);
  assert.ok(FIRST_PERSON_MARKERS.includes("we"));
  assert.ok(SECOND_PERSON_MARKERS.includes("you"));
  assert.ok(THIRD_PERSON_MARKERS.includes("she"));
  assert.deepEqual(PERSPECTIVE_MARKERS.firstPerson, FIRST_PERSON_MARKERS);
  assert.deepEqual(PERSPECTIVE_MARKERS.secondPerson, SECOND_PERSON_MARKERS);
  assert.deepEqual(PERSPECTIVE_MARKERS.thirdPerson, THIRD_PERSON_MARKERS);
});

test("the perspective report details every sentence's viewpoint", () => {
  const result = evaluateCharacterPerspective({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "You waste hours scheduling meetings. Then you struggle to find time to focus. As a result, you feel overwhelmed. Finally, you save hours every week and feel proud and relieved.",
  });
  assert.ok(Array.isArray(result.signals.sentenceReport));
  assert.equal(result.signals.sentenceReport.length, result.signals.sentenceCount);
  for (const entry of result.signals.sentenceReport) {
    assert.equal(typeof entry.sentence, "string");
    assert.ok(
      entry.person === null || ["first", "second", "third"].includes(entry.person),
      `unexpected person ${entry.person}`,
    );
    assert.equal(typeof entry.startsWithTransition, "boolean");
  }
});
