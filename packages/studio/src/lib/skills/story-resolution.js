// Approved Creative Skill Pack V1 — Story Resolution.
// Sixth and final Storytelling skill for Creative OS.
// Produced by the Knowledge Compiler and reviewed by the MavenSync team.
//
// This skill evaluates whether communication concludes with a complete,
// coherent, and meaningful resolution that fulfills the expectations
// established throughout the narrative: that the primary conflict is resolved,
// promises established earlier are delivered, the intended transformation is
// reinforced, and the ending is effective and emotionally clear — while
// preserving creator intent, never inventing missing endings, scenes, dialogue,
// facts, or outcomes, and never forcing a narrative ending onto informational
// content. It evaluates narrative resolution, not creative writing quality. It
// is shared platform intelligence, available to every studio. It is not a
// recipe, a provider, a studio, or an agent.
//
// The default export is the registered Skill Manifest (the Creative Skills
// Registry reads only the manifest). The named exports are the deterministic
// analysis implementation: evaluateStoryResolution() runs the seven decision
// rules and the five resolution scores, and verifyStoryResolution() exposes the
// AI Twin's five internal checks. No provider, recipe, or studio logic is
// touched. This skill is the sixth in the Storytelling progression Story
// Structure -> Narrative Flow -> Emotional Pacing -> Character Perspective ->
// Story Continuity -> Story Resolution, and it builds on those skills: it reuses
// the story stage lexicons for timeline checks, the transition vocabulary for
// progression, the continuity promise/payoff vocabulary for fulfillment, and
// the emotional lexicons for closure, and it follows the established
// additive-export pattern by publishing reusable resolution vocabularies.

import {
  splitIntoSentences,
  tokenizeWords,
  countMatches,
  clamp,
} from "./communication-utils.js";
import {
  STORY_STAGES,
  CONFLICT_MARKERS,
  RESOLUTION_MARKERS,
} from "./story-structure.js";
import { TRANSITION_MARKERS } from "./narrative-flow.js";
import {
  SETUP_MARKERS,
  PAYOFF_MARKERS,
} from "./story-continuity.js";

export const STORY_RESOLUTION_SKILL_ID = "story-resolution";

// ── Deterministic resolution lexicons ────────────────────────────────────────
// Closure markers: language that signals a narrative landing — the story is
// wrapping up and delivering its conclusion. Exported additively so dependent
// skills (Call to Action Strategy, Trust Building) reuse the same vocabulary.
export const CLOSURE_MARKERS = [
  "in the end", "finally", "at last", "to wrap up", "in conclusion",
  "all in all", "bottom line", "the takeaway", "the lesson", "in summary",
  "and that's how", "and that is how", "it all came together", "put together",
  "tied together", "closed the loop", "in short", "that's the", "that is the",
  "the result", "the outcome", "looking back", "as a result",
];

// Transformation markers: language that marks the before-and-after journey the
// narrative drives — the intended change the story delivers. Exported
// additively for dependent skills and introspection.
export const TRANSFORMATION_MARKERS = [
  "before", "after", "used to", "back then", "then came", "went from",
  "turned into", "became", "transformed", "transformed into", "changed",
  "shifted", "moved from", "grew into", "evolved", "no longer", "once was",
  "now i", "now we", "today i", "today we", "now it", "the difference",
  "the change", "went through", "made the switch",
];

// Recognized resolution patterns: the distinct ways a narrative can land.
// Exported additively so the Creative Intelligence Engine and dependent skills
// can introspect how a story concludes.
export const RESOLUTION_PATTERNS = {
  complete: { label: "complete", description: "conflict resolved and promises delivered with a clear landing", markers: "closure + payoff + transformation" },
  unresolved: { label: "unresolved", description: "a conflict is introduced but the narrative ends before resolving it", markers: "conflict without closure" },
  abrupt: { label: "abrupt", description: "an ending exists but lands without closure, payoff, or emotional landing", markers: "resolution without closure" },
  open: { label: "open", description: "a deliberate cliffhanger or open loop, not a completed resolution", markers: "resolution with payoff but no closure" },
  none: { label: "none", description: "no recognizable narrative resolution is present", markers: "no resolution signal" },
};

// Grouped resolution vocabulary for dependent skills and introspection.
export const RESOLUTION_VOCAB = {
  closureMarkers: CLOSURE_MARKERS,
  transformationMarkers: TRANSFORMATION_MARKERS,
  resolutionPatterns: RESOLUTION_PATTERNS,
};

// Informational content language: dry, factual, reference material with no
// narrative conclusion to deliver (Rule 5).
const INFORMATIONAL_TYPES = [
  "informational", "documentation", "document", "reference",
  "reference-guide", "user-guide", "manual", "faq", "knowledge-base",
  "specification", "spec", "technical", "api-reference", "course-lesson",
];

const INFORMATIONAL_LEXICON = [
  "documentation", "reference", "see section", "table below", "figure",
  "parameter", "parameters", "argument", "arguments", "returns",
  "return value", "default value", "config", "configuration", "configure",
  "installation", "install", "run the command", "command line", "syntax",
  "specification", "manual", "usage", "api", "endpoint", "schema",
  "prerequisites", "how to install", "function", "class", "method",
  "module", "database", "data type", "example usage", "chapter",
];

// ── Deterministic analysis ───────────────────────────────────────────────────

function flattenInput(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(flattenInput).filter(Boolean).join(" ");
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

// Emotional arc: whether the closing portion of the text lands on a positive
// emotional note, which supports emotional closure.
function emotionalClosurePresent(sentences, positiveMarkers, negativeMarkers) {
  if (sentences.length === 0) return false;
  const tail = sentences.slice(-Math.min(2, sentences.length)).join(" ");
  const positive = countMatches(tail, positiveMarkers);
  const negative = countMatches(tail, negativeMarkers);
  return positive > 0 && negative === 0;
}

export function analyzeStoryResolution({
  creativeBrief = null,
  campaignContext = null,
  audienceProfile = null,
  draftContent = "",
  contentType = "general",
  brandVoice = null,
} = {}) {
  const text = String(draftContent || "").trim();
  const words = tokenizeWords(text);
  const wordCount = words.length;
  const sentences = splitIntoSentences(text);
  const briefText = flattenInput(creativeBrief);
  const contextText = flattenInput(campaignContext);
  const groundingText = [briefText, contextText].filter(Boolean).join(" ");
  const hasGrounding = Boolean(groundingText.trim());
  const emptyContent = wordCount === 0;
  const total = sentences.length;

  // Promise / payoff: promises introduced earlier should be delivered by the
  // ending (reuses the Story Continuity vocabulary, Rules 2).
  const setupHits = countMatches(text, SETUP_MARKERS);
  const payoffHits = countMatches(text, PAYOFF_MARKERS);

  // Conflict and resolution presence from the Story Structure lexicons.
  const conflictHits = countMatches(text, CONFLICT_MARKERS);
  const resolutionHits = countMatches(text, RESOLUTION_MARKERS);
  const conflictPresent = conflictHits > 0;
  const resolutionPresent = resolutionHits > 0;

  // Progression and transformation.
  const progressionTransitions = countMatches(text, TRANSITION_MARKERS);
  const transformationHits = countMatches(text, TRANSFORMATION_MARKERS);

  // Closure markers signal a narrative landing.
  const closureHits = countMatches(text, CLOSURE_MARKERS);

  // Emotional closure: positive language, no lingering negative, at the end.
  const positiveEmotion = countMatches(text, ["finally", "succeeded", "solved", "fixed", "worked", "easy", "happy", "confident", "learned", "grew"]);
  const negativeEmotion = countMatches(text, ["struggle", "failed", "pain", "hard", "impossible", "stuck", "lost"]);
  const emotionalClosure = emotionalClosurePresent(sentences, ["finally", "succeeded", "solved", "fixed", "worked", "easy", "happy", "confident", "learned", "grew"], ["struggle", "failed", "pain", "hard", "impossible", "stuck", "lost"]);

  const storyMarkerHits = conflictHits + resolutionHits + progressionTransitions + transformationHits;
  const storySignalsPresent = storyMarkerHits > 0;
  const fabricatedStory = storySignalsPresent && !hasGrounding;

  // Whether resolution rules apply. Informational content intentionally has no
  // narrative ending; its structure is honored (Rule 5).
  const informationalHits = countMatches(text, INFORMATIONAL_LEXICON);
  const informationalContent = INFORMATIONAL_TYPES.includes(String(contentType || "").toLowerCase())
    || (informationalHits > 0 && storyMarkerHits === 0 && setupHits === 0 && payoffHits === 0);

  // ── Flags (each derived independently) ─────────────────────────────────────
  const notApplied = informationalContent || emptyContent || fabricatedStory;

  const unresolvedConflict = !notApplied && conflictPresent && !resolutionPresent;
  const abandonedPromise = !notApplied && setupHits > 0 && payoffHits === 0;
  const incompleteTransformation = !notApplied && conflictPresent && resolutionPresent && transformationHits === 0;
  const abruptEnding = !notApplied && resolutionPresent && closureHits === 0 && payoffHits === 0 && transformationHits === 0;

  // Ending pattern classification.
  let endingPattern;
  if (informationalContent) endingPattern = "none";
  else if (!storySignalsPresent) endingPattern = "none";
  else if (fabricatedStory) endingPattern = "none";
  else if (unresolvedConflict) endingPattern = "unresolved";
  else if (abruptEnding) endingPattern = "abrupt";
  else if (resolutionPresent && payoffHits > 0 && closureHits === 0) endingPattern = "open";
  else endingPattern = "complete";

  const signals = {
    sentenceCount: total,
    wordCount,
    setupHits,
    payoffHits,
    conflictHits,
    resolutionHits,
    progressionTransitions,
    transformationHits,
    closureHits,
    positiveEmotion,
    negativeEmotion,
    emotionalClosure,
    hasGrounding,
    endingPattern,
  };

  // ── Scoring (each dimension independent, 0-100) ─────────────────────────
  let closure = 100;
  let promiseFulfillment = 100;
  let transformationCompletion = 100;
  let endingEffectiveness = 100;

  if (emptyContent) {
    closure = 50;
    promiseFulfillment = 50;
    transformationCompletion = 50;
    endingEffectiveness = 50;
  } else if (informationalContent) {
    closure = 90;
    promiseFulfillment = 90;
    transformationCompletion = 90;
    endingEffectiveness = 90;
  } else if (fabricatedStory) {
    closure = 40;
    promiseFulfillment = 55;
    transformationCompletion = 45;
    endingEffectiveness = 40;
  } else {
    // Narrative Closure: the conflict should be resolved by the ending.
    if (unresolvedConflict) closure -= 60;

    // Promise Fulfillment: promises established earlier should be delivered.
    if (setupHits > 0 && payoffHits > 0) promiseFulfillment -= 0;
    else if (setupHits > 0 && payoffHits === 0) promiseFulfillment -= 75;
    else if (setupHits === 0 && payoffHits > 0) promiseFulfillment -= 30;
    else promiseFulfillment -= 15;

    // Transformation Completion: the before-and-after journey should resolve.
    if (conflictPresent && resolutionPresent) {
      if (transformationHits === 0) transformationCompletion -= 55;
    } else if (conflictPresent) {
      transformationCompletion -= 40;
    } else {
      transformationCompletion -= 20;
    }

    // Ending Effectiveness: the landing should be clear and emotionally felt.
    if (abruptEnding) endingEffectiveness -= 70;
    if (resolutionPresent && closureHits === 0) endingEffectiveness -= 35;
    if (!resolutionPresent && conflictPresent) endingEffectiveness -= 30;
    if (!emotionalClosure && resolutionPresent) endingEffectiveness -= 15;
  }

  closure = clamp(closure, 0, 100);
  promiseFulfillment = clamp(promiseFulfillment, 0, 100);
  transformationCompletion = clamp(transformationCompletion, 0, 100);
  endingEffectiveness = clamp(endingEffectiveness, 0, 100);

  const storyResolutionScore = Math.round(
    0.3 * closure
    + 0.2 * promiseFulfillment
    + 0.25 * transformationCompletion
    + 0.25 * endingEffectiveness,
  );

  const resolutionScore = storyResolutionScore;

  const flags = {
    emptyContent,
    informationalContent,
    unresolvedConflict,
    abandonedPromise,
    incompleteTransformation,
    abruptEnding,
    fabricatedStory,
  };

  return {
    skillId: STORY_RESOLUTION_SKILL_ID,
    version: "1.0.0",
    status: "active",
    inputs: {
      contentType,
      creativeBrief: Boolean(creativeBrief),
      campaignContext: Boolean(campaignContext),
      audienceProfile: Boolean(audienceProfile),
      brandVoice: Boolean(brandVoice),
      draftContent: Boolean(text),
    },
    signals,
    scores: {
      closure,
      promiseFulfillment,
      transformationCompletion,
      endingEffectiveness,
      overallResolution: storyResolutionScore,
    },
    resolutionScore,
    closureScore: closure,
    promiseFulfillmentScore: promiseFulfillment,
    transformationCompletionScore: transformationCompletion,
    endingEffectivenessScore: endingEffectiveness,
    endingPattern,
    flags,
  };
}

// ── Recommendation building (deterministic, ordered) ─────────────────────────

export function buildRecommendations(analysis) {
  const recommendations = [];
  const flags = analysis.flags || {};
  const push = (ruleId, severity, recommendation, reason) => {
    recommendations.push({ ruleId, severity, recommendation, reason });
  };

  // Rule 6 overrides everything: missing scenes, dialogue, facts, and outcomes
  // are never invented, and ungrounded stories are never accepted.
  if (flags.fabricatedStory) {
    push(
      "R6",
      "high",
      "Reject the recommendation: never invent missing scenes, dialogue, facts, or outcomes unsupported by the Creative Brief or Campaign Context.",
      "A narrative appears in the content, but no brief or context grounds it.",
    );
    push(
      "R7",
      "high",
      "Preserve creator intent: do not fabricate an ending the audience cannot verify.",
      "A resolution comes from the creator or the brief, never from assumption.",
    );
    return recommendations;
  }

  if (flags.informationalContent) {
    push(
      "R5",
      "info",
      "Do not force a narrative ending into informational content; honor its deliberately non-narrative structure.",
      "The content is informational and intentionally has no narrative conclusion.",
    );
    return recommendations;
  }

  if (flags.unresolvedConflict) {
    push(
      "R1",
      "medium",
      "Strengthen the resolution: resolve the primary conflict before the communication ends.",
      "The narrative introduces a conflict but does not resolve it.",
    );
  }
  if (flags.abandonedPromise) {
    push(
      "R2",
      "medium",
      "Complete the promise or remove the narrative thread it opened.",
      "Promises established earlier remain unfulfilled.",
    );
  }
  if (flags.incompleteTransformation) {
    push(
      "R3",
      "medium",
      "Reinforce the transformation journey: make the before-and-after change explicit.",
      "The before-and-after transformation is unclear or incomplete.",
    );
  }
  if (flags.abruptEnding) {
    push(
      "R4",
      "medium",
      "Strengthen the narrative landing: end with clarity and emotional closure.",
      "The conclusion feels abrupt.",
    );
  }
  return recommendations;
}

// ── Meaning-preserving story resolution preservation ─────────────────────────
// Story Resolution is an evaluation of closure: rewriting the ending risks
// inventing missing scenes or outcomes, so every improvement is surfaced as a
// recommendation and the creator's copy is never rewritten.
// preserveStoryResolution is therefore an identity pass that documents that
// guarantee.

export function preserveStoryResolution(draftContent) {
  const original = String(draftContent || "").trim();
  return { preservedContent: original, edits: [] };
}

// ── Public skill API ─────────────────────────────────────────────────────────

// Runs the full deterministic Story Resolution analysis. Accepts the skill
// inputs (creativeBrief, campaignContext, audienceProfile, draftContent,
// contentType, brandVoice) and returns preservedContent, the five resolution
// scores, resolutionScore, endingPattern, and recommendations.
export function evaluateStoryResolution(input = {}) {
  const analysis = analyzeStoryResolution(input);
  const { preservedContent, edits } = preserveStoryResolution(input.draftContent);
  const recommendations = buildRecommendations(analysis);
  return {
    ...analysis,
    preservedContent,
    edits,
    storyResolutionRecommendations: recommendations,
    recommendations,
  };
}

// AI Twin internal verification — no user-facing changes unless the skill
// determines resolution can be improved without inventing missing scenes,
// outcomes, or facts, or changing the creator's intent.
export function verifyStoryResolution(input = {}) {
  const analysis = analyzeStoryResolution(input);
  const scores = analysis.scores;
  return {
    skillId: STORY_RESOLUTION_SKILL_ID,
    primaryConflictResolved: scores.closure >= 70 && !analysis.flags.unresolvedConflict,
    promisesFulfilled: scores.promiseFulfillment >= 70 && !analysis.flags.abandonedPromise,
    transformationComplete: scores.transformationCompletion >= 70 && !analysis.flags.incompleteTransformation,
    endingEmotionallySatisfying: scores.endingEffectiveness >= 70 && !analysis.flags.abruptEnding,
    endingReinforcesMessage: scores.overallResolution >= 70,
    canImproveWithoutChangingIntent: analysis.resolutionScore < 70,
    scores,
    flags: analysis.flags,
  };
}

// ── Skill Manifest ───────────────────────────────────────────────────────────
// Registered in the Creative Skills Registry. All v1 required fields are
// present; v2 additive sections (capabilities, decisionRules, knowledge,
// workflow, validation, aiTwin, creativeIntelligence, metadata) are advisory.
// dependsOn, complements, sharedUtilities, and compatibleRecipes are
// informational metadata only: they describe relationships and do not
// introduce a dependency engine or runtime loading behavior.

export default {
  skillId: STORY_RESOLUTION_SKILL_ID,
  name: "Story Resolution",
  shortName: "Resolution",
  description: "Evaluate whether communication concludes with a complete, coherent, and meaningful resolution that fulfills the expectations established throughout the narrative — a resolved primary conflict, delivered promises, a reinforced transformation, and an effective, emotionally clear ending — while preserving creator intent, never inventing missing endings, scenes, dialogue, facts, or outcomes, and never forcing a narrative conclusion onto informational content.",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  category: "storytelling",
  subcategory: "story-resolution",
  tags: ["storytelling", "resolution", "closure", "ending", "transformation", "promise", "communication"],
  capabilities: ["story_resolution"],
  supportedStudios: ["marketing", "publishing", "ai-twin", "video", "audio", "workflow"],
  dependsOn: ["story-structure", "narrative-flow", "emotional-pacing", "character-perspective", "story-continuity"],
  complements: ["call-to-action-strategy", "trust-building"],
  sharedUtilities: ["communication-utils"],
  compatibleRecipes: [
    "video-script",
    "podcast",
    "story-content",
    "webinar",
    "presentation",
    "blog",
    "educational-content",
    "sales-presentation",
  ],
  creativePrinciples: [
    "resolve-the-central-conflict: bring the primary conflict to a clear end",
    "deliver-on-promises: fulfill what the narrative establishes earlier",
    "reinforce-transformation: make the before-and-after change explicit",
    "end-with-clarity: deliver a narrative landing that is emotionally clear",
    "match-the-ending: tie the conclusion to the communication goal",
    "authenticity-preserving: never invent missing endings, scenes, or outcomes",
    "fit-first: do not force a narrative ending onto informational content",
  ],
  vocabulary: [
    { concept: "narrative closure", meaning: "whether the primary conflict is brought to a clear end", informs: "resolution" },
    { concept: "promise fulfillment", meaning: "whether earlier promises are delivered or closed", informs: "resolution" },
    { concept: "transformation completion", meaning: "whether the intended before-and-after change is reinforced", informs: "resolution" },
    { concept: "ending effectiveness", meaning: "whether the conclusion lands with clarity and emotional closure", informs: "resolution" },
    { concept: "overall story resolution", meaning: "the combined completeness of the conclusion", informs: "resolution" },
  ],
  craftGuidance: {
    summary: "End every narrative with a complete, meaningful conclusion: resolve the conflict, deliver the promises, reinforce the transformation, and land with emotional clarity.",
    subject: "the completeness of the communication's conclusion, grounded in the Creative Brief and Campaign Context",
    composition: "a resolved conflict, delivered promises, an explicit transformation, and an effective landing",
    tone: "coherent and grounded, never fabricated",
    language: "closure and payoff markers that signal an earned ending",
    structure: "a narrative that brings everything it opens to a satisfying close",
    flow: "from conflict through transformation to a conclusion that reinforces the message",
  },
  constraints: [
    "never invent missing endings",
    "never fabricate missing outcomes",
    "never create unsupported conclusions",
    "never rewrite the story",
    "never override creator intent",
  ],
  evaluationRules: [
    { quality: "closure", signal: "the primary conflict is resolved by the ending", evidence: "conflict and resolution marker balance" },
    { quality: "promiseFulfillment", signal: "earlier promises are delivered or closed", evidence: "setup and payoff marker balance" },
    { quality: "transformationCompletion", signal: "the intended before-and-after change is reinforced", evidence: "transformation marker presence" },
    { quality: "endingEffectiveness", signal: "the conclusion lands with clarity and emotional closure", evidence: "closure marker presence and emotional arc" },
    { quality: "overallResolution", signal: "the whole conclusion is complete and meaningful", evidence: "weighted combination of the resolution dimensions" },
  ],
  provenance: {
    source: "knowledge-compiler",
    reviewedBy: "MavenSync Team",
    approvedAt: "2026-08-04",
    supersedes: null,
  },
  status: "active",
  priority: "foundational",
  shared: true,
  discoverable: true,
  metadata: {
    difficulty: "easy",
    estimatedCost: "$",
    expectedRuntime: "instant",
    outputTypes: ["text"],
    license: "internal",
    reviewStatus: "approved",
    priority: "foundational",
    shared: true,
    discoverable: true,
  },
  decisionRules: [
    { id: "R1", if: "the narrative ends without resolving the primary conflict", then: "recommend strengthening the resolution", else: "keep the resolved ending", confidence: 1 },
    { id: "R2", if: "promises established earlier remain unfulfilled", then: "recommend completing or removing them", else: "keep the delivered promises", confidence: 1 },
    { id: "R3", if: "the transformation is unclear", then: "recommend reinforcing the before-and-after journey", else: "keep the reinforced transformation", confidence: 1 },
    { id: "R4", if: "the conclusion feels abrupt", then: "recommend a stronger narrative landing", else: "keep the clear ending", confidence: 1 },
    { id: "R5", if: "informational content intentionally contains no narrative ending", then: "do not force storytelling", else: "proceed with the narrative", confidence: 1 },
    { id: "R6", if: "missing scenes, dialogue, or outcomes would be invented", then: "never invent them; reject the recommendation", else: "proceed with grounded resolution only", confidence: 1 },
    { id: "R7", if: "resolution and creator intent conflict", then: "preserve creator intent while improving narrative completion", else: "proceed", confidence: 1 },
  ],
  knowledge: {
    bestPractices: [
      "Resolve the central conflict.",
      "Reinforce the intended transformation.",
      "Deliver on promises established earlier.",
      "End with emotional clarity.",
      "Match the ending to the communication goal.",
      "Preserve creator intent.",
      "Never invent missing endings, scenes, facts, or outcomes.",
    ],
    writingGuidance: [
      "Bring every conflict and thread to a clear close.",
      "Make the before-and-after transformation explicit.",
      "Land the ending with a clear, emotionally felt conclusion.",
    ],
    businessGuidance: [
      "A complete ending leaves the audience confident in the message.",
      "An abrupt or unfulfilled ending undermines the trust the narrative built.",
    ],
    qualityGuidance: [
      "No missing endings, scenes, facts, or outcomes are ever fabricated.",
      "Resolution is recommended, never rewritten.",
      "Informational content is never forced into a narrative conclusion.",
    ],
    optimizationGuidance: [
      "When Closure or Ending Effectiveness is low, strengthen the landing first.",
      "Re-run evaluation after resolving a conflict to confirm the ending closes.",
    ],
  },
  workflow: {
    requiredInputs: ["creativeBrief", "campaignContext"],
    optionalInputs: ["draftContent", "contentType", "audienceProfile", "brandVoice"],
    inferredInputs: ["contentType"],
    phases: [
      { phase: "analyze", description: "deterministically score closure, promise fulfillment, transformation completion, ending effectiveness, and overall resolution" },
      { phase: "preserve", description: "never auto-rewrite; resolution improvements are surfaced as recommendations only" },
      { phase: "recommend", description: "return ordered recommendations for the Creative Intelligence Engine to apply without inventing missing endings" },
    ],
    completionCriteria: [
      "resolution scores returned for all five dimensions",
      "preservedContent is byte-identical to the input; no automatic rewrites",
      "recommendations never invent missing scenes, dialogue, facts, or outcomes",
    ],
  },
  validation: {
    requiredAssets: [],
    missingContext: {
      creativeBrief: "the creative brief that states the campaign goal and subject",
      campaignContext: "the campaign context that grounds the narrative",
    },
    unsupportedRequests: [
      "requests to invent missing endings",
      "requests to fabricate missing outcomes",
      "requests to create unsupported conclusions",
      "requests to rewrite the story",
      "requests to force a conclusion onto informational content",
    ],
    qualityGates: [
      "no ending invented",
      "no outcome fabricated",
      "no unsupported conclusion created",
    ],
  },
  aiTwin: {
    internallyVerifies: [
      "does the story resolve naturally?",
      "are earlier promises fulfilled?",
      "is the transformation complete?",
      "does the ending feel emotionally satisfying?",
      "does the conclusion reinforce the intended message?",
    ],
    userVisible: "no user-facing changes unless the skill determines resolution can be improved without inventing missing scenes, outcomes, or facts, or changing the creator's intent",
  },
  creativeIntelligence: {
    recommendWhen: [
      "the primary conflict is introduced but never resolved",
      "promises established earlier remain unfulfilled",
      "the transformation is unclear or incomplete",
      "the conclusion feels abrupt",
      "the ending contradicts earlier narrative",
    ],
    avoidWhen: [
      "the format is a dry reference with deliberately non-narrative structure",
      "the request requires the message to remain deliberately open-ended",
      "the conclusion is externally fixed and cannot be changed",
    ],
    reasoning: "fit-first: recommend when the request targets narrative completion, not when a conclusion would be forced onto content that deliberately has none",
  },
};