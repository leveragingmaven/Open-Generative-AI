import assert from "node:assert/strict";
import test from "node:test";
import {
  SKILL_LIBRARY,
  getSkill,
  evaluateStoryStructure,
  verifyStoryStructure,
  analyzeStoryStructure,
  preserveStoryStructure,
  buildStoryStructureRecommendations,
  STORY_STRUCTURE_SKILL_ID,
  STORY_STAGES,
  CONFLICT_MARKERS,
  RESOLUTION_MARKERS,
} from "./index.js";
import { applyCreativeSkill } from "../creative-brief/CreativeSkill.js";

const SKILL = getSkill(STORY_STRUCTURE_SKILL_ID);

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

test("story-structure is registered and discoverable", () => {
  assert.ok(SKILL_LIBRARY[STORY_STRUCTURE_SKILL_ID], "registered in SKILL_LIBRARY");
  assert.equal(SKILL.skillId, STORY_STRUCTURE_SKILL_ID);
  assert.equal(SKILL.name, "Story Structure");
  assert.equal(SKILL.category, "storytelling");
  assert.equal(SKILL.status, "active");
  assert.equal(SKILL.priority, "foundational");
  assert.equal(SKILL.shared, true);
  assert.equal(SKILL.discoverable, true);
});

test("story-structure follows the approved Creative Skill schema", () => {
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

test("story-structure is shared across every compatible studio", () => {
  for (const studio of ["marketing", "publishing", "ai-twin", "video", "audio", "workflow"]) {
    assert.ok(SKILL.supportedStudios.includes(studio), `missing ${studio}`);
  }
});

test("story-structure declares advisory dependency metadata", () => {
  assert.deepEqual(SKILL.dependsOn, ["message-clarity", "curiosity-building"]);
  assert.deepEqual(SKILL.complements, ["emotional-pacing", "narrative-flow"]);
  assert.deepEqual(SKILL.sharedUtilities, ["communication-utils"]);
});

test("manifest declares the compatible content types", () => {
  assert.deepEqual(SKILL.compatibleContentTypes, [
    "video-script",
    "podcast",
    "presentation",
    "webinar",
    "blog",
    "social-story",
    "educational-content",
    "sales-presentation",
  ]);
});

test("manifest declares all seven decision rules", () => {
  const ids = SKILL.decisionRules.map((rule) => rule.id);
  assert.deepEqual(ids, ["R1", "R2", "R3", "R4", "R5", "R6", "R7"]);
});

test("Test 1: a story that opens with its resolution recommends restructuring the sequence", () => {
  const result = evaluateStoryStructure({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "In the end, we finally figured it out. We struggled with scheduling for years, but our team's solution turned everything around.",
  });
  assert.equal(result.flags.resolutionBeforeConflict, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R3"), "R3 recommendation present");
  assert.equal(result.storyPattern, "solution-first");
  assert.ok(
    !result.recommendations.some((r) => ["R1", "R2", "R4", "R5", "R6", "R7"].includes(r.ruleId)),
    "only the sequence fix is recommended",
  );
});

test("Test 2: storytelling without a conflict recommends identifying the challenge", () => {
  const result = evaluateStoryStructure({
    creativeBrief: "Launch email for our new platform.",
    campaignContext: "Feature campaign.",
    draftContent: "At first, the launch was quiet. Gradually we reached more customers. In the end, we had a steady pipeline.",
  });
  assert.equal(result.flags.missingConflict, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R2"), "R2 recommendation present");
  assert.equal(result.storyPattern, "incomplete");
});

test("Test 3: a narrative that jumps between unrelated parts recommends strengthening progression", () => {
  const result = evaluateStoryStructure({
    creativeBrief: "Launch email for our course.",
    campaignContext: "Launch campaign.",
    draftContent: "The struggle with scheduling went on for years. Now we save hours every week. The whole process was painful. Finally, the team made it through. The setbacks kept coming though.",
  });
  assert.equal(result.flags.narrativeJumps, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R4"), "R4 recommendation present");
  assert.ok(result.signals.regressionCount >= 2, `regressionCount ${result.signals.regressionCount} penalized`);
  assert.ok(result.progressionScore < 85, `progressionScore ${result.progressionScore} should be penalized`);
});

test("Test 4: a complete story arc scores high across every dimension", () => {
  const result = evaluateStoryStructure({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "At first, we wasted hours scheduling meetings. The struggle went on for years. Gradually, we found a better way. In the end, the launch finally worked.",
  });
  assert.equal(result.flags.missingStructure, false);
  assert.equal(result.flags.resolutionBeforeConflict, false);
  assert.equal(result.flags.missingConflict, false);
  assert.equal(result.flags.narrativeJumps, false);
  assert.equal(result.flags.informationalContent, false);
  assert.equal(result.flags.fabricatedStory, false);
  assert.equal(result.storyPattern, "complete-arc");
  assert.ok(result.openingScore >= 85, `openingScore ${result.openingScore} should be high`);
  assert.ok(result.conflictScore >= 85, `conflictScore ${result.conflictScore} should be high`);
  assert.ok(result.progressionScore >= 85, `progressionScore ${result.progressionScore} should be high`);
  assert.ok(result.resolutionScore >= 85, `resolutionScore ${result.resolutionScore} should be high`);
  assert.ok(result.storyStructureScore >= 85, `storyStructureScore ${result.storyStructureScore} should be high`);
  assert.equal(result.recommendations.length, 0, "a complete arc needs no structural recommendations");
});

test("Test 5: informational content is not forced into a narrative structure", () => {
  const result = evaluateStoryStructure({
    creativeBrief: "Document the configuration parameters.",
    campaignContext: "Reference guide.",
    contentType: "documentation",
    draftContent: "This reference guide documents the configuration parameters. See section four for the command line syntax and the default values.",
  });
  assert.equal(result.flags.informationalContent, true);
  assert.equal(result.storyPattern, "informational");
  assert.ok(result.recommendations.some((r) => r.ruleId === "R5"), "R5 recommendation present");
  assert.ok(
    !result.recommendations.some((r) => ["R1", "R2", "R3", "R4", "R6", "R7"].includes(r.ruleId)),
    "no narrative restructuring on informational content",
  );
});

test("Test 6: a story the brief and context do not ground rejects the modification", () => {
  const result = evaluateStoryStructure({
    draftContent: "At first everything went wrong. We struggled, but eventually we figured it out and now we are succeeding.",
  });
  assert.equal(result.flags.fabricatedStory, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R6"), "R6 rejection present");
  assert.ok(result.recommendations.some((r) => r.ruleId === "R7"), "R7 intent preservation present");
  assert.ok(
    !result.recommendations.some((r) => ["R1", "R2", "R3", "R4", "R5"].includes(r.ruleId)),
    "no structural recommendations when the story is ungrounded",
  );
});

test("content with no recognizable narrative recommends establishing a beginning, middle, and end", () => {
  const result = evaluateStoryStructure({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "You waste hours scheduling meetings. Our Calendar Pro course is built to help. Get instant access.",
  });
  assert.equal(result.flags.missingStructure, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R1"), "R1 recommendation present");
  assert.equal(result.storyPattern, "none");
});

test("storyPattern describes the detected narrative structure", () => {
  const result = evaluateStoryStructure({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "At first, we wasted hours scheduling meetings. The struggle went on for years. Gradually, we found a better way. In the end, the launch finally worked.",
  });
  assert.equal(result.storyPattern, "complete-arc");
});

test("scores are independent, bounded 0-100, and never null", () => {
  const result = evaluateStoryStructure({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "At first, we wasted hours scheduling meetings. The struggle went on for years. Gradually, we found a better way. In the end, the launch finally worked.",
  });
  for (const key of ["opening", "conflict", "progression", "resolution", "structuralCompleteness"]) {
    assert.equal(typeof result.scores[key], "number");
    assert.ok(result.scores[key] >= 0 && result.scores[key] <= 100, `${key} within 0-100`);
  }
  assert.equal(typeof result.storyStructureScore, "number");
  assert.equal(typeof result.openingScore, "number");
  assert.equal(typeof result.conflictScore, "number");
  assert.equal(typeof result.progressionScore, "number");
  assert.equal(typeof result.resolutionScore, "number");
});

test("evaluation is deterministic across repeated calls", () => {
  const input = {
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "At first, we wasted hours scheduling meetings. The struggle went on for years. Gradually, we found a better way. In the end, the launch finally worked.",
  };
  const first = evaluateStoryStructure(input);
  const second = evaluateStoryStructure(input);
  assert.deepEqual(first.scores, second.scores);
  assert.deepEqual(first.flags, second.flags);
  assert.deepEqual(first.signals, second.signals);
  assert.deepEqual(first.recommendations, second.recommendations);
});

test("preserveStoryStructure is a meaning-preserving no-op (structure is recommended, never rewritten)", () => {
  const original = "At first, we wasted hours. The struggle went on. In the end, we found a way.";
  const { preservedContent, edits } = preserveStoryStructure(original);
  assert.equal(preservedContent, original);
  assert.deepEqual(edits, []);
});

test("AI Twin verification exposes the five internal checks", () => {
  const verification = verifyStoryStructure({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "At first, we wasted hours scheduling meetings. The struggle went on for years. Gradually, we found a better way. In the end, the launch finally worked.",
  });
  assert.equal(verification.skillId, STORY_STRUCTURE_SKILL_ID);
  assert.equal(typeof verification.beginningClear, "boolean");
  assert.equal(typeof verification.challengeUnderstandable, "boolean");
  assert.equal(typeof verification.progressesLogically, "boolean");
  assert.equal(typeof verification.resolutionEarned, "boolean");
  assert.equal(typeof verification.structureImprovesUnderstanding, "boolean");
  assert.equal(typeof verification.canImproveWithoutChangingIntent, "boolean");
  assert.equal(verification.beginningClear, true);
  assert.equal(verification.challengeUnderstandable, true);
  assert.equal(verification.progressesLogically, true);
  assert.equal(verification.resolutionEarned, true);
  assert.equal(verification.structureImprovesUnderstanding, true);
});

test("story-structure works with the shared enrichment integration", () => {
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
  assert.equal(enriched.skill.skillId, STORY_STRUCTURE_SKILL_ID);
  assert.deepEqual(enriched.constraints, SKILL.constraints);
  assert.ok(enriched.style.includes("plain"));
});

test("unknown skill IDs still throw after registration change", () => {
  assert.throws(() => getSkill("does-not-exist"), /Unknown creative skill/);
});

test("SKILL_LIBRARY remains frozen", () => {
  assert.ok(Object.isFrozen(SKILL_LIBRARY));
});

test("analyzeStoryStructure handles empty and missing content safely", () => {
  const empty = analyzeStoryStructure({ draftContent: "" });
  assert.equal(empty.signals.wordCount, 0);
  assert.equal(empty.flags.emptyContent, true);
  assert.equal(typeof empty.storyStructureScore, "number");
  const missing = analyzeStoryStructure({});
  assert.equal(missing.signals.wordCount, 0);
  assert.equal(missing.storyPattern, "none");
  assert.equal(typeof missing.storyStructureScore, "number");
});

test("honesty constraints are enforced by the manifest", () => {
  assert.ok(SKILL.constraints.includes("never fabricate stories"));
  assert.ok(SKILL.constraints.includes("never invent lived experiences"));
  assert.ok(SKILL.constraints.includes("never change factual meaning"));
  assert.ok(SKILL.constraints.includes("never exaggerate events"));
  assert.ok(SKILL.constraints.includes("never override creator intent"));
});

test("buildStoryStructureRecommendations returns a stable ordered list", () => {
  const analysis = analyzeStoryStructure({
    creativeBrief: "Launch email for our course.",
    campaignContext: "Launch campaign.",
    draftContent: "The struggle with scheduling went on for years. Now we save hours every week. The whole process was painful. Finally, the team made it through. The setbacks kept coming though.",
  });
  const recommendations = buildStoryStructureRecommendations(analysis);
  assert.ok(Array.isArray(recommendations));
  assert.ok(recommendations.length > 0);
  for (const recommendation of recommendations) {
    assert.ok(recommendation.ruleId);
    assert.ok(recommendation.severity);
    assert.ok(recommendation.recommendation);
    assert.ok(recommendation.reason);
  }
});

test("the additive story lexicons are reusable by dependent skills", () => {
  assert.ok(STORY_STAGES.opening.length > 0);
  assert.ok(STORY_STAGES.conflict.length > 0);
  assert.ok(STORY_STAGES.progression.length > 0);
  assert.ok(STORY_STAGES.resolution.length > 0);
  assert.ok(CONFLICT_MARKERS.length > 0);
  assert.ok(RESOLUTION_MARKERS.length > 0);
  assert.ok(CONFLICT_MARKERS.includes("struggle"));
  assert.ok(RESOLUTION_MARKERS.includes("finally"));
});
