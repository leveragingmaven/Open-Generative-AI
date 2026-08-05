// Approved Creative Skill Pack V1 — Story Continuity.
// Fifth Storytelling skill for Creative OS.
// Produced by the Knowledge Compiler and reviewed by the MavenSync team.
//
// This skill evaluates whether narrative elements remain internally consistent
// from beginning to end: that characters, concepts, promises, terminology,
// timelines, and key ideas stay coherent throughout the content. Where Story
// Structure shapes the framework, Narrative Flow the movement, Emotional Pacing
// the rhythm, and Character Perspective the viewpoint, Story Continuity keeps
// the whole piece coherent — consistent naming, completed setup/payoff
// relationships, chronological integrity, and no abandoned threads — while
// preserving creator intent, never inventing missing scenes, dialogue, facts, or
// narrative events, and never forcing continuity onto informational content. It
// evaluates continuity, not creativity. It is shared platform intelligence,
// available to every studio. It is not a recipe, a provider, a studio, or an
// agent.
//
// The default export is the registered Skill Manifest (the Creative Skills
// Registry reads only the manifest). The named exports are the deterministic
// analysis implementation: evaluateStoryContinuity() runs the seven decision
// rules and the five continuity scores, and verifyStoryContinuity() exposes the
// AI Twin's five internal checks. No provider, recipe, or studio logic is
// touched. This skill is the fifth in the Storytelling progression Story
// Structure -> Narrative Flow -> Emotional Pacing -> Character Perspective ->
// Story Continuity, and it builds on those skills: it reuses the story stage
// lexicons for timeline checks, and it follows the established additive-export
// pattern by publishing reusable continuity vocabularies for Story Resolution.

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

export const STORY_CONTINUITY_SKILL_ID = "story-continuity";

// ── Deterministic continuity lexicons ────────────────────────────────────────
// Setup markers: language that introduces a promise, expectation, or thread the
// narrative is expected to address later. Exported additively so Story
// Resolution reuses the same setup vocabulary.
export const SETUP_MARKERS = [
  "promise", "promised", "we will", "we'll", "you will", "you'll",
  "you'll learn", "learn how", "in this course", "by the end", "coming up",
  "stay tuned", "later in", "introducing", "we're introducing", "will cover",
  "we cover", "going to show", "will show", "introduces", "we introduce",
];

// Payoff markers: language that delivers on a promise or resolves a thread.
// Exported additively so Story Resolution reuses the same payoff vocabulary.
export const PAYOFF_MARKERS = [
  "as promised", "as we discussed", "here is", "here's", "here it is",
  "that's how", "that is how", "and that's", "and that is", "which is why",
  "in the end", "the answer", "as a result", "we showed", "you saw",
  "as shown", "now you", "you now", "there it is", "the result", "the outcome",
  "the lesson", "the takeaway",
];

// Reference slot markers: the common nouns used to refer to the subject of the
// communication. Two distinct slots each used repeatedly signal that terminology
// drifted from one label to another. Exported additively for dependent skills.
export const REFERENCE_SLOT_MARKERS = [
  ["app", "apps"], ["application", "applications"], ["platform", "platforms"],
  ["tool", "tools"], ["software"], ["product", "products"], ["course", "courses"],
  ["service", "services"], ["system", "systems"], ["solution", "solutions"],
  ["program", "programs"], ["suite", "suites"], ["module", "modules"],
  ["feature", "features"], ["package", "packages"],
];

// Grouped continuity vocabulary for dependent skills and introspection.
export const CONTINUITY_MARKERS = {
  referenceSlots: REFERENCE_SLOT_MARKERS,
  setupMarkers: SETUP_MARKERS,
  payoffMarkers: PAYOFF_MARKERS,
};

// Informational content language: dry, factual, reference material with no
// narrative progression to keep continuous (Rule 5).
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

// Counts how many distinct reference slots are each used at least twice, which
// signals terminology drift from one label to another.
function countTerminologyDrift(text) {
  const tokens = tokenizeWords(text).map((word) => word.toLowerCase());
  const slotCounts = [];
  for (const slot of REFERENCE_SLOT_MARKERS) {
    const count = tokens.filter((token) => slot.includes(token)).length;
    if (count >= 2) slotCounts.push(slot[0]);
  }
  return slotCounts;
}

// Stage sequence of the text using the Story Structure lexicons (opening=0,
// conflict=1, progression=2, resolution=3), for timeline checks.
function extractStageRanks(sentences) {
  const ranks = [];
  for (const sentence of sentences) {
    const counts = [
      countMatches(sentence, STORY_STAGES.opening),
      countMatches(sentence, CONFLICT_MARKERS),
      countMatches(sentence, STORY_STAGES.progression),
      countMatches(sentence, RESOLUTION_MARKERS),
    ];
    const max = Math.max(...counts);
    if (max > 0) ranks.push(counts.indexOf(max));
  }
  return ranks;
}

// Counts stage inversions: a later stage appearing before an earlier one (e.g. a
// resolution before the conflict that explains it).
function countInversions(ranks) {
  let count = 0;
  for (let i = 0; i < ranks.length; i += 1) {
    for (let j = i + 1; j < ranks.length; j += 1) {
      if (ranks[i] > ranks[j]) count += 1;
    }
  }
  return count;
}

// Story marker count within a slice of sentences.
function storyMarkersIn(sentences) {
  const text = sentences.join(" ");
  return countMatches(text, STORY_STAGES.opening)
    + countMatches(text, CONFLICT_MARKERS)
    + countMatches(text, STORY_STAGES.progression)
    + countMatches(text, RESOLUTION_MARKERS);
}

export function analyzeStoryContinuity({
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

  // Terminology consistency: reference slots drifting between labels.
  const driftSlots = countTerminologyDrift(text);
  const terminologyDriftCount = driftSlots.length;

  // Promise / payoff: promises introduced early should be delivered later.
  const setupHits = countMatches(text, SETUP_MARKERS);
  const payoffHits = countMatches(text, PAYOFF_MARKERS);

  // Timeline integrity: stage inversions indicate chronology is confusing.
  const stageRanks = extractStageRanks(sentences);
  const timelineInversions = countInversions(stageRanks);

  // Abandoned threads: key story elements (opening or conflict language) appear
  // in the first half but none of the story markers continue into the second.
  const half = Math.ceil(total / 2);
  const firstHalf = sentences.slice(0, half);
  const secondHalf = sentences.slice(half);
  const firstHalfMarkers = storyMarkersIn(firstHalf);
  const secondHalfMarkers = storyMarkersIn(secondHalf);

  // Story grounding for Rule 6: narrative content that the brief and context do
  // not ground is treated as unverifiable and rejected.
  const storyMarkerHits = storyMarkersIn(sentences);
  const storySignalsPresent = storyMarkerHits > 0;
  const fabricatedStory = storySignalsPresent && !hasGrounding;

  // Whether continuity rules apply. Informational content intentionally has no
  // narrative progression; its structure is honored (Rule 5).
  const informationalHits = countMatches(text, INFORMATIONAL_LEXICON);
  const informationalContent = INFORMATIONAL_TYPES.includes(String(contentType || "").toLowerCase())
    || (informationalHits > 0 && storyMarkerHits === 0 && setupHits === 0 && payoffHits === 0);

  const abandonedThreads = !informationalContent
    && !emptyContent
    && firstHalfMarkers >= 2
    && secondHalfMarkers === 0;

  const signals = {
    sentenceCount: total,
    wordCount,
    terminologyDriftCount,
    driftSlots,
    setupHits,
    payoffHits,
    timelineInversions,
    stageSequence: [...stageRanks],
    firstHalfMarkers,
    secondHalfMarkers,
    hasGrounding,
  };

  // ── Scoring (each dimension independent, 0-100) ─────────────────────────
  let consistency = 100;
  let timeline = 100;
  let terminology = 100;
  let promisePayoff = 100;

  if (emptyContent) {
    consistency = 50;
    timeline = 50;
    terminology = 50;
    promisePayoff = 50;
  } else if (informationalContent) {
    consistency = 90;
    timeline = 90;
    terminology = 90;
    promisePayoff = 90;
  } else if (fabricatedStory) {
    consistency = 50;
    timeline = 50;
    terminology = 60;
    promisePayoff = 55;
  } else {
    consistency -= Math.min(90, terminologyDriftCount * 45);
    if (abandonedThreads) consistency -= 40;
    if (timelineInversions > 0) consistency -= 30;

    timeline -= Math.min(60, timelineInversions * 30);

    terminology -= Math.min(100, terminologyDriftCount * 50);

    if (setupHits > 0 && payoffHits > 0) promisePayoff -= 0;
    else if (setupHits > 0 && payoffHits === 0) promisePayoff -= 60;
    else if (setupHits === 0 && payoffHits > 0) promisePayoff -= 30;
    else promisePayoff -= 25;
  }

  consistency = clamp(consistency, 0, 100);
  timeline = clamp(timeline, 0, 100);
  terminology = clamp(terminology, 0, 100);
  promisePayoff = clamp(promisePayoff, 0, 100);

  const overallContinuity = Math.round(
    0.3 * consistency
    + 0.2 * timeline
    + 0.25 * terminology
    + 0.25 * promisePayoff,
  );

  const continuityScore = overallContinuity;

  const flags = {
    emptyContent,
    informationalContent,
    terminologyDrift: !informationalContent && !emptyContent && terminologyDriftCount >= 1,
    abandonedPromise: !informationalContent && !emptyContent && setupHits > 0 && payoffHits === 0,
    timelineInconsistent: !informationalContent && !emptyContent && timelineInversions >= 1,
    abandonedThreads: !informationalContent && !emptyContent && abandonedThreads,
    fabricatedStory,
  };

  return {
    skillId: STORY_CONTINUITY_SKILL_ID,
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
      consistency,
      timelineIntegrity: timeline,
      terminologyConsistency: terminology,
      promisePayoff,
      overallContinuity,
    },
    continuityScore,
    consistencyScore: consistency,
    timelineScore: timeline,
    terminologyScore: terminology,
    promisePayoffScore: promisePayoff,
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

  // Rule 6 overrides everything: missing scenes, facts, and narrative events are
  // never invented, and ungrounded stories are never accepted.
  if (flags.fabricatedStory) {
    push(
      "R6",
      "high",
      "Reject the recommendation: never invent missing scenes, dialogue, facts, or narrative events unsupported by the Creative Brief or Campaign Context.",
      "A narrative appears in the content, but no brief or context grounds it.",
    );
    push(
      "R7",
      "high",
      "Preserve creator intent: do not fabricate continuity the audience cannot verify.",
      "Continuity comes from the creator or the brief, never from assumption.",
    );
    return recommendations;
  }

  if (flags.informationalContent) {
    push(
      "R5",
      "info",
      "Do not force storytelling continuity into informational content; honor its deliberately non-narrative structure.",
      "The content is informational and contains no narrative progression.",
    );
    return recommendations;
  }

  if (flags.terminologyDrift) {
    push(
      "R1",
      "medium",
      "Use one consistent name for each concept throughout the content.",
      "Concepts change terminology unexpectedly between labels.",
    );
  }
  if (flags.abandonedPromise) {
    push(
      "R2",
      "medium",
      "Complete the promise or remove the narrative thread it opened.",
      "A narrative promise is introduced but never addressed.",
    );
  }
  if (flags.timelineInconsistent) {
    push(
      "R3",
      "medium",
      "Restore chronological clarity so events appear in the order they happened.",
      "Timeline progression has become inconsistent.",
    );
  }
  if (flags.abandonedThreads) {
    push(
      "R4",
      "medium",
      "Restore continuity by carrying the introduced story elements through to the end.",
      "Key story elements disappear without explanation.",
    );
  }
  return recommendations;
}

// ── Meaning-preserving story continuity preservation ─────────────────────────
// Story Continuity is an evaluation of coherence: rewrites risk inventing missing
// facts or scenes, so every improvement is surfaced as a recommendation and the
// creator's copy is never rewritten. preserveStoryContinuity is therefore an
// identity pass that documents that guarantee.

export function preserveStoryContinuity(draftContent) {
  const original = String(draftContent || "").trim();
  return { preservedContent: original, edits: [] };
}

// ── Public skill API ─────────────────────────────────────────────────────────

// Runs the full deterministic Story Continuity analysis. Accepts the skill
// inputs (creativeBrief, campaignContext, audienceProfile, draftContent,
// contentType, brandVoice) and returns preservedContent, the five continuity
// scores, continuityScore, and recommendations.
export function evaluateStoryContinuity(input = {}) {
  const analysis = analyzeStoryContinuity(input);
  const { preservedContent, edits } = preserveStoryContinuity(input.draftContent);
  const recommendations = buildRecommendations(analysis);
  return {
    ...analysis,
    preservedContent,
    edits,
    storyContinuityRecommendations: recommendations,
    recommendations,
  };
}

// AI Twin internal verification — no user-facing changes unless the skill
// determines continuity can be improved without inventing missing information,
// scenes, or facts, or changing the creator's intent.
export function verifyStoryContinuity(input = {}) {
  const analysis = analyzeStoryContinuity(input);
  const scores = analysis.scores;
  return {
    skillId: STORY_CONTINUITY_SKILL_ID,
    areConceptsConsistentlyNamed: scores.terminologyConsistency >= 70 && !analysis.flags.terminologyDrift,
    arePromisesFulfilled: scores.promisePayoff >= 70 && !analysis.flags.abandonedPromise,
    doesTimelineRemainLogical: scores.timelineIntegrity >= 70 && !analysis.flags.timelineInconsistent,
    areNarrativeThreadsCompleted: scores.consistency >= 70 && !analysis.flags.abandonedThreads,
    doesContinuitySupportUnderstanding: scores.overallContinuity >= 70,
    canImproveWithoutChangingIntent: analysis.continuityScore < 70,
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
  skillId: STORY_CONTINUITY_SKILL_ID,
  name: "Story Continuity",
  shortName: "Continuity",
  description: "Evaluate whether narrative elements remain internally consistent from beginning to end — consistent naming, completed setup/payoff relationships, chronological integrity, and no abandoned threads — while preserving creator intent, never inventing missing scenes, dialogue, facts, or narrative events, and never forcing continuity onto informational content.",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  category: "storytelling",
  subcategory: "story-continuity",
  tags: ["storytelling", "continuity", "consistency", "timeline", "terminology", "promise", "communication"],
  capabilities: ["story_continuity"],
  supportedStudios: ["marketing", "publishing", "ai-twin", "video", "audio", "workflow"],
  dependsOn: ["story-structure", "narrative-flow", "emotional-pacing", "character-perspective"],
  complements: ["story-resolution"],
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
    "maintain-consistent-terminology: name each concept one way throughout",
    "resolve-introduced-concepts: complete what the narrative opens",
    "preserve-chronological-flow: keep events in the order they happened",
    "complete-setup-and-payoff: deliver on every promise the piece makes",
    "reinforce-logical-progression: carry story elements through to the end",
    "authenticity-preserving: never invent missing scenes, facts, or events",
    "fit-first: do not force continuity onto informational content",
  ],
  vocabulary: [
    { concept: "narrative consistency", meaning: "how coherent the story is from beginning to end", informs: "continuity" },
    { concept: "timeline integrity", meaning: "whether events appear in chronological order", informs: "continuity" },
    { concept: "terminology consistency", meaning: "whether concepts keep one name throughout", informs: "continuity" },
    { concept: "promise / payoff", meaning: "whether introduced threads are delivered or closed", informs: "continuity" },
    { concept: "overall story continuity", meaning: "the combined coherence of the whole piece", informs: "continuity" },
  ],
  craftGuidance: {
    summary: "Keep every element coherent from beginning to end: consistent naming, chronological clarity, completed promises, and story threads that carry through.",
    subject: "the internal consistency of the communication, grounded in the Creative Brief and Campaign Context",
    composition: "stable terminology, ordered events, and delivered setup/payoff relationships",
    tone: "coherent and grounded, never fabricated",
    language: "consistent labels and markers that keep promises visible",
    structure: "a story that introduces nothing it cannot carry to the end",
    flow: "continuity that never leaves the audience wondering what happened to a thread",
  },
  constraints: [
    "never invent missing chapters",
    "never invent missing dialogue",
    "never invent missing facts",
    "never fabricate continuity",
    "never override creator intent",
  ],
  evaluationRules: [
    { quality: "consistency", signal: "the story holds together from beginning to end", evidence: "terminology drift, abandoned threads, and timeline inversions" },
    { quality: "timelineIntegrity", signal: "events appear in chronological order", evidence: "story stage-sequence inversions" },
    { quality: "terminologyConsistency", signal: "concepts keep one name throughout", evidence: "distinct reference slots used repeatedly" },
    { quality: "promisePayoff", signal: "introduced threads are delivered or closed", evidence: "setup and payoff marker balance" },
    { quality: "overallContinuity", signal: "the whole piece remains coherent", evidence: "weighted combination of the continuity dimensions" },
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
    { id: "R1", if: "concepts change terminology unexpectedly", then: "recommend consistent naming", else: "keep the stable terminology", confidence: 1 },
    { id: "R2", if: "narrative promises are introduced but never addressed", then: "recommend completing or removing them", else: "keep the delivered promises", confidence: 1 },
    { id: "R3", if: "timeline progression becomes inconsistent", then: "recommend restoring chronological clarity", else: "keep the chronological order", confidence: 1 },
    { id: "R4", if: "key story elements disappear without explanation", then: "recommend restoring continuity", else: "keep the carried-through elements", confidence: 1 },
    { id: "R5", if: "informational content intentionally contains no narrative progression", then: "do not force storytelling continuity", else: "proceed with the narrative", confidence: 1 },
    { id: "R6", if: "missing information, scenes, or facts would be invented", then: "never invent them; reject the recommendation", else: "proceed with grounded continuity only", confidence: 1 },
    { id: "R7", if: "continuity and creator intent conflict", then: "preserve creator intent while strengthening coherence", else: "proceed", confidence: 1 },
  ],
  knowledge: {
    bestPractices: [
      "Maintain consistent terminology throughout.",
      "Resolve every concept the narrative introduces.",
      "Preserve chronological flow.",
      "Complete setup/payoff relationships.",
      "Reinforce logical progression.",
      "Keep story elements present from beginning to end.",
      "Never invent missing scenes, dialogue, facts, or events.",
    ],
    writingGuidance: [
      "Name each concept one way and keep it.",
      "Deliver on every promise the piece makes.",
      "Keep events in the order they happened.",
      "Carry the introduced story elements through to the end.",
    ],
    businessGuidance: [
      "Consistent naming keeps the audience confident in the message.",
      "A promise that is never delivered breaks trust in the story.",
    ],
    qualityGuidance: [
      "No missing scenes, dialogue, facts, or events are ever fabricated.",
      "Continuity is recommended, never rewritten.",
      "Informational content is never forced into narrative continuity.",
    ],
    optimizationGuidance: [
      "When Terminology Consistency is low, unify the labels first.",
      "Re-run evaluation after completing a promise to confirm the thread closes.",
    ],
  },
  workflow: {
    requiredInputs: ["creativeBrief", "campaignContext"],
    optionalInputs: ["draftContent", "contentType", "audienceProfile", "brandVoice"],
    inferredInputs: ["contentType"],
    phases: [
      { phase: "analyze", description: "deterministically score consistency, timeline, terminology, promise/payoff, and overall continuity" },
      { phase: "preserve", description: "never auto-rewrite; continuity improvements are surfaced as recommendations only" },
      { phase: "recommend", description: "return ordered recommendations for the Creative Intelligence Engine to apply without inventing missing information" },
    ],
    completionCriteria: [
      "continuity scores returned for all five dimensions",
      "preservedContent is byte-identical to the input; no automatic rewrites",
      "recommendations never invent missing scenes, dialogue, facts, or narrative events",
    ],
  },
  validation: {
    requiredAssets: [],
    missingContext: {
      creativeBrief: "the creative brief that states the campaign goal and subject",
      campaignContext: "the campaign context that grounds the narrative",
    },
    unsupportedRequests: [
      "requests to invent missing chapters",
      "requests to invent missing dialogue",
      "requests to invent missing facts",
      "requests to fabricate continuity",
      "requests to force storytelling continuity into informational content",
    ],
    qualityGates: [
      "no missing chapter invented",
      "no missing dialogue invented",
      "no missing fact invented",
      "no continuity fabricated",
    ],
  },
  aiTwin: {
    internallyVerifies: [
      "are concepts consistently named?",
      "are promises fulfilled?",
      "does the timeline remain logical?",
      "are narrative threads completed?",
      "does continuity support understanding?",
    ],
    userVisible: "no user-facing changes unless the skill determines continuity can be improved without inventing missing information, scenes, or facts, or changing the creator's intent",
  },
  creativeIntelligence: {
    recommendWhen: [
      "terminology changes unexpectedly",
      "promises are abandoned",
      "timeline becomes inconsistent",
      "story elements disappear",
      "narrative contradictions appear",
    ],
    avoidWhen: [
      "the format is a dry reference with deliberately non-narrative structure",
      "the request requires the piece to remain deliberately loose",
      "the continuity is externally fixed and cannot be changed",
    ],
    reasoning: "fit-first: recommend when the request targets internal coherence, not when continuity would be forced onto content that deliberately has none",
  },
};
