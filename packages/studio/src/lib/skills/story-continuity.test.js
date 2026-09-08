import assert from "node:assert/strict";
import test from "node:test";
import skill, {
  STORY_CONTINUITY_SKILL_ID,
  analyzeStoryContinuity,
  evaluateStoryContinuity,
  verifyStoryContinuity,
  preserveStoryContinuity,
  buildRecommendations as buildStoryContinuityRecommendations,
  SETUP_MARKERS,
  PAYOFF_MARKERS,
  REFERENCE_SLOT_MARKERS,
  CONTINUITY_MARKERS,
} from "./story-continuity.js";

const SKILL = skill;

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

test("story-continuity follows the approved Creative Skill schema", () => {
  assert.equal(SKILL.skillId, STORY_CONTINUITY_SKILL_ID);
  assert.equal(SKILL.name, "Story Continuity");
  assert.equal(SKILL.category, "storytelling");
  assert.equal(SKILL.status, "active");
  assert.equal(SKILL.priority, "foundational");
  assert.equal(SKILL.shared, true);
  assert.equal(SKILL.discoverable, true);
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

test("story-continuity is shared across every compatible studio", () => {
  for (const studio of ["marketing", "publishing", "ai-twin", "video", "audio", "workflow"]) {
    assert.ok(SKILL.supportedStudios.includes(studio), `missing ${studio}`);
  }
});

test("story-continuity declares advisory dependency metadata", () => {
  assert.deepEqual(SKILL.dependsOn, ["story-structure", "narrative-flow", "emotional-pacing", "character-perspective"]);
  assert.deepEqual(SKILL.complements, ["story-resolution"]);
  assert.deepEqual(SKILL.sharedUtilities, ["communication-utils"]);
});

test("manifest declares the compatible recipes", () => {
  assert.deepEqual(SKILL.compatibleRecipes, [
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

test("R1: terminology drifting between labels recommends consistent naming", () => {
  const result = evaluateStoryContinuity({
    creativeBrief: "New scheduling app for teams.",
    campaignContext: "Launch campaign.",
    draftContent: "Our app is simple. The app saves time. Teams love the app.",
  });
  assert.equal(result.flags.terminologyDrift, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R1"), "R1 recommendation present");
  assert.ok(
    !result.recommendations.some((r) => ["R2", "R3", "R4", "R5", "R6", "R7"].includes(r.ruleId)),
    "only the terminology fix is recommended",
  );
});

test("R2: an introduced promise never delivered recommends completing or removing it", () => {
  const result = evaluateStoryContinuity({
    creativeBrief: "Deliver ongoing value to subscribers.",
    campaignContext: "Email nurture.",
    draftContent: "You'll learn a lot during this program. We'll keep you posted. Stay tuned for what's coming up.",
  });
  assert.equal(result.flags.abandonedPromise, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R2"), "R2 recommendation present");
  assert.ok(
    !result.recommendations.some((r) => ["R1", "R3", "R4", "R5", "R6", "R7"].includes(r.ruleId)),
    "only the promise fix is recommended",
  );
});

test("R3: a resolution before its conflict recommends restoring chronological clarity", () => {
  const result = evaluateStoryContinuity({
    creativeBrief: "Help customers recover wasted time.",
    campaignContext: "Launch campaign.",
    draftContent: "In the end, it worked. We struggled for years.",
  });
  assert.equal(result.flags.timelineInconsistent, true);
  assert.ok(result.signals.timelineInversions >= 1, `inversions ${result.signals.timelineInversions} penalized`);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R3"), "R3 recommendation present");
  assert.ok(
    !result.recommendations.some((r) => ["R1", "R2", "R4", "R5", "R6", "R7"].includes(r.ruleId)),
    "only the timeline fix is recommended",
  );
});

test("R4: story threads that disappear recommend carrying them through to the end", () => {
  const result = evaluateStoryContinuity({
    creativeBrief: "Show the recurring difficulty of scheduling.",
    campaignContext: "Launch campaign.",
    draftContent: "We struggled. It was really difficult. We save time daily. Everything goes smoothly.",
  });
  assert.equal(result.flags.abandonedThreads, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R4"), "R4 recommendation present");
  assert.ok(
    !result.recommendations.some((r) => ["R1", "R2", "R3", "R5", "R6", "R7"].includes(r.ruleId)),
    "only the thread restoration is recommended",
  );
});

test("R5: informational content is not forced into narrative continuity", () => {
  const result = evaluateStoryContinuity({
    creativeBrief: "Document the installation flow.",
    campaignContext: "Reference guide.",
    contentType: "documentation",
    draftContent: "Refer to the documentation for installation. See the table below for configuration.",
  });
  assert.equal(result.flags.informationalContent, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R5"), "R5 recommendation present");
  assert.ok(
    !result.recommendations.some((r) => ["R1", "R2", "R3", "R4", "R6", "R7"].includes(r.ruleId)),
    "no continuity changes on informational content",
  );
});

test("R6/R7: an ungrounded story is rejected and creator intent is preserved", () => {
  const result = evaluateStoryContinuity({
    draftContent: "At first we struggled. Eventually we figured it out. In the end we succeeded.",
  });
  assert.equal(result.flags.fabricatedStory, true);
  assert.ok(result.recommendations.some((r) => r.ruleId === "R6"), "R6 rejection present");
  assert.ok(result.recommendations.some((r) => r.ruleId === "R7"), "R7 intent preservation present");
  assert.ok(
    !result.recommendations.some((r) => ["R1", "R2", "R3", "R4", "R5"].includes(r.ruleId)),
    "no continuity recommendations when the story is ungrounded",
  );
});

test("a coherent, grounded story earns high scores across every dimension", () => {
  const result = evaluateStoryContinuity({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "At first, we struggled with scheduling. After that, we found a better process. In the end, we save two hours each week.",
  });
  assert.equal(result.flags.terminologyDrift, false);
  assert.equal(result.flags.abandonedPromise, false);
  assert.equal(result.flags.timelineInconsistent, false);
  assert.equal(result.flags.abandonedThreads, false);
  assert.equal(result.flags.informationalContent, false);
  assert.equal(result.flags.fabricatedStory, false);
  assert.ok(result.scores.consistency >= 85, `consistency ${result.scores.consistency} should be high`);
  assert.ok(result.scores.timelineIntegrity >= 85, `timeline ${result.scores.timelineIntegrity} should be high`);
  assert.ok(result.scores.terminologyConsistency >= 85, `terminology ${result.scores.terminologyConsistency} should be high`);
  assert.ok(result.scores.promisePayoff >= 70, `promisePayoff ${result.scores.promisePayoff} should be high`);
  assert.ok(result.scores.overallContinuity >= 85, `overall ${result.scores.overallContinuity} should be high`);
  assert.equal(result.recommendations.length, 0, "coherent content needs no continuity recommendations");
});

test("scores are independent, bounded 0-100, and never null", () => {
  const result = evaluateStoryContinuity({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "At first, we struggled with scheduling. After that, we found a better process. In the end, we save two hours each week.",
  });
  for (const key of [
    "consistency",
    "timelineIntegrity",
    "terminologyConsistency",
    "promisePayoff",
    "overallContinuity",
  ]) {
    assert.equal(typeof result.scores[key], "number");
    assert.ok(result.scores[key] >= 0 && result.scores[key] <= 100, `${key} within 0-100`);
  }
  assert.equal(typeof result.continuityScore, "number");
  assert.equal(typeof result.consistencyScore, "number");
  assert.equal(typeof result.timelineScore, "number");
  assert.equal(typeof result.terminologyScore, "number");
  assert.equal(typeof result.promisePayoffScore, "number");
});

test("evaluation is deterministic across repeated calls", () => {
  const input = {
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "At first, we struggled with scheduling. After that, we found a better process. In the end, we save two hours each week.",
  };
  const first = evaluateStoryContinuity(input);
  const second = evaluateStoryContinuity(input);
  assert.deepEqual(first.scores, second.scores);
  assert.deepEqual(first.flags, second.flags);
  assert.deepEqual(first.signals, second.signals);
  assert.deepEqual(first.recommendations, second.recommendations);
});

test("preserveStoryContinuity is a meaning-preserving no-op (continuity is recommended, never rewritten)", () => {
  const original = "At first we struggled. In the end it worked. We save time daily.";
  const { preservedContent, edits } = preserveStoryContinuity(original);
  assert.equal(preservedContent, original);
  assert.deepEqual(edits, []);
});

test("AI Twin verification exposes the five internal checks", () => {
  const verification = verifyStoryContinuity({
    creativeBrief: "Customers waste hours scheduling meetings.",
    campaignContext: "Launch campaign.",
    draftContent: "At first, we struggled with scheduling. After that, we found a better process. In the end, we save two hours each week.",
  });
  assert.equal(verification.skillId, STORY_CONTINUITY_SKILL_ID);
  assert.equal(typeof verification.areConceptsConsistentlyNamed, "boolean");
  assert.equal(typeof verification.arePromisesFulfilled, "boolean");
  assert.equal(typeof verification.doesTimelineRemainLogical, "boolean");
  assert.equal(typeof verification.areNarrativeThreadsCompleted, "boolean");
  assert.equal(typeof verification.doesContinuitySupportUnderstanding, "boolean");
  assert.equal(typeof verification.canImproveWithoutChangingIntent, "boolean");
  assert.equal(verification.areConceptsConsistentlyNamed, true);
  assert.equal(verification.arePromisesFulfilled, true);
  assert.equal(verification.doesTimelineRemainLogical, true);
  assert.equal(verification.areNarrativeThreadsCompleted, true);
  assert.equal(verification.doesContinuitySupportUnderstanding, true);
});

test("analyzeStoryContinuity handles empty and missing content safely", () => {
  const empty = analyzeStoryContinuity({ draftContent: "" });
  assert.equal(empty.signals.wordCount, 0);
  assert.equal(empty.flags.emptyContent, true);
  assert.equal(typeof empty.continuityScore, "number");
  const missing = analyzeStoryContinuity({});
  assert.equal(missing.signals.wordCount, 0);
  assert.equal(missing.flags.emptyContent, true);
  assert.equal(typeof missing.continuityScore, "number");
});

test("honesty constraints are enforced by the manifest", () => {
  assert.ok(SKILL.constraints.includes("never invent missing chapters"));
  assert.ok(SKILL.constraints.includes("never invent missing dialogue"));
  assert.ok(SKILL.constraints.includes("never invent missing facts"));
  assert.ok(SKILL.constraints.includes("never fabricate continuity"));
  assert.ok(SKILL.constraints.includes("never override creator intent"));
});

test("buildStoryContinuityRecommendations returns a stable ordered list", () => {
  const analysis = analyzeStoryContinuity({
    creativeBrief: "New scheduling app for teams.",
    campaignContext: "Launch campaign.",
    draftContent: "Our app is simple. The app saves time. Teams love the app.",
  });
  const recommendations = buildStoryContinuityRecommendations(analysis);
  assert.ok(Array.isArray(recommendations));
  assert.ok(recommendations.length > 0);
  for (const recommendation of recommendations) {
    assert.ok(recommendation.ruleId);
    assert.ok(recommendation.severity);
    assert.ok(recommendation.recommendation);
    assert.ok(recommendation.reason);
  }
});

test("the additive continuity vocabularies are reusable by dependent skills", () => {
  assert.ok(SETUP_MARKERS.length > 0);
  assert.ok(PAYOFF_MARKERS.length > 0);
  assert.ok(REFERENCE_SLOT_MARKERS.length > 0);
  assert.ok(CONTINUITY_MARKERS.referenceSlots.length > 0);
  assert.deepEqual(CONTINUITY_MARKERS.setupMarkers, SETUP_MARKERS);
  assert.deepEqual(CONTINUITY_MARKERS.payoffMarkers, PAYOFF_MARKERS);
  assert.ok(SETUP_MARKERS.includes("we will"));
  assert.ok(PAYOFF_MARKERS.includes("here is"));
});