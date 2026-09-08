import assert from "node:assert/strict";
import test from "node:test";
import {
  SKILL_LIBRARY,
  getSkill,
  evaluateNarrativeFlow,
  verifyNarrativeFlow,
  analyzeNarrativeFlow,
  preserveNarrativeFlow,
  buildNarrativeFlowRecommendations,
  NARRATIVE_FLOW_SKILL_ID,
  TRANSITION_MARKERS,
  TRANSITION_TYPES,
} from "./index.js";
import { applyCreativeSkill } from "../creative-brief/CreativeSkill.js";

const SKILL = getSkill(NARRATIVE_FLOW_SKILL_ID);

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

test("narrative-flow is registered and discoverable", () => {
  assert.ok(SKILL_LIBRARY[NARRATIVE_FLOW_SKILL_ID], "registered in SKILL_LIBRARY");
  assert.equal(SKILL.skillId, NARRATIVE_FLOW_SKILL_ID);
  assert.equal(SKILL.name, "Narrative Flow");
  assert.equal(SKILL.category, "storytelling");
  assert.equal(SKILL.status, "active");
  assert.equal(SKILL.priority, "foundational");
  assert.equal(SKILL.shared, true);
  assert.equal(SKILL.discoverable, true);
});

test("narrative-flow follows the approved Creative Skill schema", () => {
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

test("narrative-flow is shared across every compatible studio", () => {
  for (const studio of ["marketing", "publishing", "ai-twin", "video", "audio", "workflow"]) {
    assert.ok(SKILL.supportedStudios.includes(studio), `missing ${studio}`);
  }
});

test("narrative-flow declares advisory dependency metadata", () => {
  assert.deepEqual(SKILL.dependsOn, ["story-structure"]);
  assert.deepEqual(SKILL.complements, ["emotional-pacing", "character-perspective"]);
  assert.deepEqual(SKILL.sharedUtilities, ["communication-utils"]);
});

test("manifest declares the compatible recipes", () => {
  assert.deepEqual(SKILL.compatibleRecipes, [
    "blog",
    "podcast",
    "video-script",
    "presentation",
    "webinar",
    "course-lesson",
    "long-form-article",
    "story-content",
  ]);
});

test("manifest declares all seven decision rules", () => {
  const ids = SKILL.decisionRules.map((rule) => rule.id);
  assert.deepEqual(ids, ["R1", "R2", "R3", "R4", "R5", "R6", "R7"]);
});

test("Test 1: abrupt topic changes recommend smoother transitions", () => {
  const result = evaluateNarrativeFlow({
    creativeBrief: "Promote the new product line.",
    campaignContext: "Launch campaign.",
    draftContent: "The camera captures stunning detail. Our pricing starts at ninety-nine dollars. The team works from the east office. Shipping takes two business days.",
  });
  assert.equal(result.flags.abruptTransitions, true);
  assert.equal(result.flags.disconnectedIdeas, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R1"), "R1 recommendation present");
  assert.ok(result.transitionScore < 70, `transitionScore ${result.transitionScore} should be penalized`);
  assert.ok(result.signals.abruptBoundaries >= 2, "multiple abrupt boundaries detected");
});

test("Test 2: events presented out of sequence recommend resequencing", () => {
  const result = evaluateNarrativeFlow({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "In the end, we finally solved it. The struggle lasted for years. Now we save hours every week. The setbacks kept coming. Finally the launch worked.",
  });
  assert.equal(result.flags.chronologyConfusing, true);
  assert.equal(result.flags.prerequisiteAfterConclusion, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R3"), "R3 recommendation present");
  assert.ok(result.sequenceScore < 85, `sequenceScore ${result.sequenceScore} should be penalized`);
  assert.ok(result.signals.inversionCount >= 2, "stage inversions detected");
});

test("Test 3: missing bridge between sections recommends transition improvement", () => {
  const result = evaluateNarrativeFlow({
    creativeBrief: "Describe the office systems.",
    campaignContext: "Internal update.",
    draftContent: "Our calendars synchronize across devices. The server room stays cool. The design system uses rounded corners.",
  });
  assert.equal(result.flags.disconnectedIdeas, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R2"), "R2 recommendation present");
  assert.equal(result.signals.disconnectedPairs, 1);
});

test("Test 4: excellent continuity throughout returns high scores", () => {
  const result = evaluateNarrativeFlow({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "We started with a simple idea. Then the scheduling problem grew. But we kept iterating. As a result, the process became faster. Finally, the launch worked well.",
  });
  assert.equal(result.flags.abruptTransitions, false);
  assert.equal(result.flags.disconnectedIdeas, false);
  assert.equal(result.flags.missingBridges, false);
  assert.equal(result.flags.chronologyConfusing, false);
  assert.equal(result.flags.fabricatedStory, false);
  assert.ok(result.continuityScore >= 90, `continuityScore ${result.continuityScore} should be high`);
  assert.ok(result.transitionScore >= 90, `transitionScore ${result.transitionScore} should be high`);
  assert.ok(result.sequenceScore >= 90, `sequenceScore ${result.sequenceScore} should be high`);
  assert.ok(result.coherenceScore >= 90, `coherenceScore ${result.coherenceScore} should be high`);
  assert.ok(result.flowScore >= 90, `flowScore ${result.flowScore} should be high`);
  assert.equal(result.recommendations.length, 0, "smooth flow needs no recommendations");
});

test("Test 5: technical documentation intentionally changing sections is not forced", () => {
  const result = evaluateNarrativeFlow({
    creativeBrief: "Document the installation and configuration.",
    campaignContext: "Reference guide.",
    contentType: "documentation",
    draftContent: "See section four for installation. Chapter five covers the configuration parameters. The appendix lists the default values and the command line syntax.",
  });
  assert.equal(result.flags.informationalContent, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R5"), "R5 recommendation present");
  assert.ok(
    !result.recommendations.some((r) => ["R1", "R2", "R3", "R4", "R6", "R7"].includes(r.ruleId)),
    "no narrative transitions on informational content",
  );
});

test("Test 6: ungrounded narrative events reject the modification", () => {
  const result = evaluateNarrativeFlow({
    draftContent: "At first everything went wrong. We struggled, but eventually we figured it out and now we are succeeding.",
  });
  assert.equal(result.flags.fabricatedStory, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R6"), "R6 rejection present");
  assert.ok(result.recommendations.some((r) => r.ruleId === "R7"), "R7 intent preservation present");
  assert.ok(
    !result.recommendations.some((r) => ["R1", "R2", "R3", "R4", "R5"].includes(r.ruleId)),
    "no flow recommendations when the narrative is ungrounded",
  );
});

test("scores are independent, bounded 0-100, and never null", () => {
  const result = evaluateNarrativeFlow({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "We started with a simple idea. Then the scheduling problem grew. But we kept iterating. As a result, the process became faster. Finally, the launch worked well.",
  });
  for (const key of ["continuity", "transitionQuality", "logicalSequence", "narrativeCoherence", "readingFlow"]) {
    assert.equal(typeof result.scores[key], "number");
    assert.ok(result.scores[key] >= 0 && result.scores[key] <= 100, `${key} within 0-100`);
  }
  assert.equal(typeof result.flowScore, "number");
  assert.equal(typeof result.transitionScore, "number");
  assert.equal(typeof result.continuityScore, "number");
  assert.equal(typeof result.sequenceScore, "number");
  assert.equal(typeof result.coherenceScore, "number");
});

test("flowScore aggregates the independent dimensions", () => {
  const result = evaluateNarrativeFlow({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "We started with a simple idea. Then the scheduling problem grew. But we kept iterating. As a result, the process became faster. Finally, the launch worked well.",
  });
  assert.equal(result.flowScore, result.scores.readingFlow);
  assert.equal(result.transitionScore, result.scores.transitionQuality);
  assert.equal(result.continuityScore, result.scores.continuity);
  assert.equal(result.sequenceScore, result.scores.logicalSequence);
  assert.equal(result.coherenceScore, result.scores.narrativeCoherence);
});

test("evaluation is deterministic across repeated calls", () => {
  const input = {
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "In the end, we finally solved it. The struggle lasted for years. Now we save hours every week. The setbacks kept coming. Finally the launch worked.",
  };
  const first = evaluateNarrativeFlow(input);
  const second = evaluateNarrativeFlow(input);
  assert.deepEqual(first.scores, second.scores);
  assert.deepEqual(first.flags, second.flags);
  assert.deepEqual(first.signals, second.signals);
  assert.deepEqual(first.recommendations, second.recommendations);
});

test("preserveNarrativeFlow is a meaning-preserving no-op (flow is recommended, never rewritten)", () => {
  const original = "The struggle lasted for years. Finally, the launch worked well.";
  const { preservedContent, edits } = preserveNarrativeFlow(original);
  assert.equal(preservedContent, original);
  assert.deepEqual(edits, []);
});

test("AI Twin verification exposes the five internal checks", () => {
  const verification = verifyNarrativeFlow({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "We started with a simple idea. Then the scheduling problem grew. But we kept iterating. As a result, the process became faster. Finally, the launch worked well.",
  });
  assert.equal(verification.skillId, NARRATIVE_FLOW_SKILL_ID);
  assert.equal(typeof verification.doIdeasProgressNaturally, "boolean");
  assert.equal(typeof verification.areTransitionsUnderstandable, "boolean");
  assert.equal(typeof verification.doesChronologyMakeSense, "boolean");
  assert.equal(typeof verification.areMajorJumpsExplained, "boolean");
  assert.equal(typeof verification.doesCommunicationFeelContinuous, "boolean");
  assert.equal(typeof verification.canImproveWithoutChangingIntent, "boolean");
  assert.equal(verification.doIdeasProgressNaturally, true);
  assert.equal(verification.areTransitionsUnderstandable, true);
  assert.equal(verification.doesChronologyMakeSense, true);
  assert.equal(verification.areMajorJumpsExplained, true);
  assert.equal(verification.doesCommunicationFeelContinuous, true);
});

test("narrative-flow works with the shared enrichment integration", () => {
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
  assert.equal(enriched.skill.skillId, NARRATIVE_FLOW_SKILL_ID);
  assert.deepEqual(enriched.constraints, SKILL.constraints);
  assert.ok(enriched.style.includes("plain"));
});

test("unknown skill IDs still throw after registration change", () => {
  assert.throws(() => getSkill("does-not-exist"), /Unknown creative skill/);
});

test("SKILL_LIBRARY remains frozen", () => {
  assert.ok(Object.isFrozen(SKILL_LIBRARY));
});

test("analyzeNarrativeFlow handles empty and missing content safely", () => {
  const empty = analyzeNarrativeFlow({ draftContent: "" });
  assert.equal(empty.signals.wordCount, 0);
  assert.equal(empty.flags.emptyContent, true);
  assert.equal(typeof empty.flowScore, "number");
  const missing = analyzeNarrativeFlow({});
  assert.equal(missing.signals.wordCount, 0);
  assert.equal(missing.signals.totalBoundaries, 0);
  assert.equal(typeof missing.flowScore, "number");
});

test("honesty constraints are enforced by the manifest", () => {
  assert.ok(SKILL.constraints.includes("never invent content"));
  assert.ok(SKILL.constraints.includes("never fabricate transitions"));
  assert.ok(SKILL.constraints.includes("never rewrite story events"));
  assert.ok(SKILL.constraints.includes("never change meaning"));
  assert.ok(SKILL.constraints.includes("never override creator intent"));
});

test("buildNarrativeFlowRecommendations returns a stable ordered list", () => {
  const analysis = analyzeNarrativeFlow({
    creativeBrief: "Promote the new product line.",
    campaignContext: "Launch campaign.",
    draftContent: "The camera captures stunning detail. Our pricing starts at ninety-nine dollars. The team works from the east office. Shipping takes two business days.",
  });
  const recommendations = buildNarrativeFlowRecommendations(analysis);
  assert.ok(Array.isArray(recommendations));
  assert.ok(recommendations.length > 0);
  for (const recommendation of recommendations) {
    assert.ok(recommendation.ruleId);
    assert.ok(recommendation.severity);
    assert.ok(recommendation.recommendation);
    assert.ok(recommendation.reason);
  }
});

test("the additive transition vocabularies are reusable by dependent skills", () => {
  assert.ok(TRANSITION_MARKERS.length > 0);
  assert.ok(TRANSITION_MARKERS.includes("however"));
  assert.ok(TRANSITION_MARKERS.includes("as a result"));
  assert.ok(TRANSITION_MARKERS.includes("finally"));
  for (const family of Object.values(TRANSITION_TYPES)) {
    assert.ok(Array.isArray(family));
    assert.ok(family.length > 0);
  }
});

test("narrative-flow reuses the story-structure stage sequence for sequencing", () => {
  const result = evaluateNarrativeFlow({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "In the end, we finally solved it. The struggle was intense. Now we save hours every week. The setbacks kept coming. Finally the launch worked.",
  });
  assert.deepEqual(result.signals.stageSequence, [3, 1, 3, 1, 3]);
});

test("the boundary report details every transition", () => {
  const result = evaluateNarrativeFlow({
    creativeBrief: "Promote the new product line.",
    campaignContext: "Launch campaign.",
    draftContent: "The camera captures stunning detail. Our pricing starts at ninety-nine dollars. The team works from the east office. Shipping takes two business days.",
  });
  assert.ok(Array.isArray(result.signals.boundaryReport));
  assert.equal(result.signals.boundaryReport.length, result.signals.totalBoundaries);
  for (const boundary of result.signals.boundaryReport) {
    assert.equal(typeof boundary.index, "number");
    assert.equal(typeof boundary.bridged, "boolean");
    assert.equal(typeof boundary.overlap, "number");
    assert.equal(typeof boundary.abrupt, "boolean");
    assert.equal(typeof boundary.disconnected, "boolean");
  }
});
