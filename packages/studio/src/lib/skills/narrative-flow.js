// Approved Creative Skill Pack V1 — Narrative Flow.
// Second Storytelling skill for Creative OS.
// Produced by the Knowledge Compiler and reviewed by the MavenSync team.
//
// This skill evaluates whether communication moves smoothly and logically from
// one idea, scene, argument, or event to the next. Where Story Structure asks
// whether a recognizable narrative framework exists, Narrative Flow asks whether
// the communication moves through that framework naturally: continuity,
// transitions, sequencing, and coherence across the entire piece — while
// preserving creator intent, never inventing scenes, dialogue, or story events,
// and never forcing narrative transitions into informational content. It
// evaluates flow, not style. It is shared platform intelligence, available to
// every studio. It is not a recipe, a provider, a studio, or an agent.
//
// The default export is the registered Skill Manifest (the Creative Skills
// Registry reads only the manifest). The named exports are the deterministic
// analysis implementation: evaluateNarrativeFlow() runs the seven decision
// rules and the five flow scores, and verifyNarrativeFlow() exposes the AI
// Twin's five internal checks. No provider, recipe, or studio logic is touched.
// This skill completes the Storytelling progression Story Structure -> Narrative
// Flow, and it builds on Story Structure by reusing its stage lexicons so both
// skills agree on the arc a flow runs through.

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

export const NARRATIVE_FLOW_SKILL_ID = "narrative-flow";

// ── Deterministic transition lexicons ───────────────────────────────────────
// Transition markers: words and phrases that connect one idea to the next.
// Exported additively so future Storytelling skills (Emotional Pacing, Character
// Perspective, Story Continuity) reuse the same transition vocabulary.
export const TRANSITION_MARKERS = [
  // additive
  "also", "in addition", "furthermore", "moreover", "additionally", "plus",
  // contrast
  "but", "however", "yet", "still", "although", "though", "on the other hand",
  "conversely", "whereas", "while", "nevertheless", "nonetheless", "despite",
  "instead", "meanwhile",
  // causal
  "so", "therefore", "thus", "hence", "because", "since", "as a result",
  "consequently", "accordingly", "which means", "that means", "in turn",
  // sequence
  "first", "second", "third", "next", "then", "after", "before", "later",
  "earlier", "finally", "eventually", "after that", "before that", "afterward",
  "afterwards", "now", "soon", "subsequently", "to begin",
  // illustration
  "for example", "for instance", "in fact", "such as", "that is", "i.e.",
  "e.g.", "in other words", "to put it another way",
  // conclusion
  "in conclusion", "in summary", "to summarize", "overall", "ultimately",
  "in short", "all in all",
  // emphasis
  "in particular", "especially", "notably", "specifically", "that is to say",
];

// Transition marker families, grouped by the relationship they signal. Used to
// evaluate whether the transitions present carry the reader logically.
export const TRANSITION_TYPES = {
  additive: ["also", "in addition", "furthermore", "moreover", "additionally", "plus"],
  contrast: ["but", "however", "yet", "still", "although", "though", "on the other hand", "conversely", "whereas", "while", "nevertheless", "nonetheless", "despite", "instead", "meanwhile"],
  causal: ["so", "therefore", "thus", "hence", "because", "since", "as a result", "consequently", "accordingly", "which means", "that means", "in turn"],
  sequence: ["first", "second", "third", "next", "then", "after", "before", "later", "earlier", "finally", "eventually", "after that", "before that", "afterward", "afterwards", "now", "soon", "subsequently", "to begin"],
  illustration: ["for example", "for instance", "in fact", "such as", "that is", "i.e.", "e.g.", "in other words", "to put it another way"],
  conclusion: ["in conclusion", "in summary", "to summarize", "overall", "ultimately", "in short", "all in all"],
  emphasis: ["in particular", "especially", "notably", "specifically", "that is to say"],
};

// Informational content language: dry, factual, reference material that
// intentionally changes topics without needing narrative transitions (Rule 5).
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

// Sentence starts with a transition marker? Determines whether a boundary
// between the previous sentence and this one is explicitly bridged.
function startsWithTransition(sentence) {
  const lower = String(sentence).toLowerCase();
  return TRANSITION_MARKERS.some((marker) => lower.startsWith(marker));
}

// Lexical overlap between two sentences: the fraction of words in the shorter
// sentence that also appear in the longer one. A low ratio means the ideas share
// little vocabulary, so the boundary needs a bridge.
function lexicalOverlap(a, b) {
  const wordsA = new Set(tokenizeWords(a).map((word) => word.toLowerCase()));
  const wordsB = new Set(tokenizeWords(b).map((word) => word.toLowerCase()));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  const shorter = wordsA.size <= wordsB.size ? wordsA : wordsB;
  const longer = wordsA.size <= wordsB.size ? wordsB : wordsA;
  let shared = 0;
  for (const word of shorter) {
    if (longer.has(word)) shared += 1;
  }
  return shared / shorter.size;
}

// Stage sequence of the text using the Story Structure lexicons, so both skills
// agree on the arc (opening=0, conflict=1, progression=2, resolution=3).
function extractStageSequence(sentences) {
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

// Counts stage inversions: a stage appearing before an earlier one (e.g. a
// resolution before the conflict that would justify it). Prerequisite-before-
// conclusion violations are the strongest form.
function countInversions(ranks) {
  let count = 0;
  let prereqAfterConclusion = 0;
  for (let i = 0; i < ranks.length; i += 1) {
    for (let j = i + 1; j < ranks.length; j += 1) {
      if (ranks[i] > ranks[j]) {
        count += 1;
        if (ranks[i] === 3 && ranks[j] <= 1) prereqAfterConclusion += 1;
      }
    }
  }
  return { count, prereqAfterConclusion };
}

export function analyzeNarrativeFlow({
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

  // Transition coverage across sentence boundaries.
  const totalBoundaries = Math.max(0, sentences.length - 1);
  let transitionBoundaries = 0;
  for (let i = 1; i < sentences.length; i += 1) {
    if (startsWithTransition(sentences[i])) transitionBoundaries += 1;
  }
  const transitionHits = countMatches(text, TRANSITION_MARKERS);
  const transitionCoverage = totalBoundaries === 0 ? 1 : transitionBoundaries / totalBoundaries;

  // Boundary quality: adjacent pairs that share no transition AND little or no
  // vocabulary. These read as abrupt shifts or disconnected ideas.
  let abruptBoundaries = 0;
  let disconnectedPairs = 0;
  const boundaryReport = [];
  for (let i = 0; i < sentences.length - 1; i += 1) {
    const current = sentences[i];
    const next = sentences[i + 1];
    const bridged = startsWithTransition(next);
    const overlap = lexicalOverlap(current, next);
    const abrupt = !bridged && overlap < 0.15;
    const disconnected = !bridged && overlap === 0;
    if (abrupt) abruptBoundaries += 1;
    if (disconnected) disconnectedPairs += 1;
    boundaryReport.push({ index: i, bridged, overlap, abrupt, disconnected });
  }

  // Sequencing: out-of-order stages across the arc.
  const stageRanks = extractStageSequence(sentences);
  const { count: inversionCount, prereqAfterConclusion } = countInversions(stageRanks);

  // Story grounding for Rule 6: narrative content (opening, conflict, or
  // resolution language) that the brief and context do not ground is treated as
  // an unverifiable story and rejected.
  const storyMarkerHits = countMatches(text, STORY_STAGES.opening)
    + countMatches(text, CONFLICT_MARKERS)
    + countMatches(text, RESOLUTION_MARKERS);
  const storySignalsPresent = storyMarkerHits > 0;
  const fabricatedStory = storySignalsPresent && !hasGrounding;

  // Whether flow rules apply. Informational content intentionally changes
  // topics; its document structure is honored, not rewritten (Rule 5).
  const informationalHits = countMatches(text, INFORMATIONAL_LEXICON);
  const informationalContent = INFORMATIONAL_TYPES.includes(String(contentType || "").toLowerCase())
    || (informationalHits > 0 && transitionHits === 0);

  const signals = {
    sentenceCount: sentences.length,
    wordCount,
    totalBoundaries,
    transitionBoundaries,
    transitionHits,
    transitionCoverage,
    abruptBoundaries,
    disconnectedPairs,
    inversionCount,
    prereqAfterConclusion,
    stageSequence: [...stageRanks],
    boundaryReport,
    hasGrounding,
  };

  // ── Scoring (each dimension independent, 0-100) ─────────────────────────
  let continuity = 100;
  let transitionQuality = 100;
  let logicalSequence = 100;
  let narrativeCoherence = 100;

  if (emptyContent) {
    continuity = 50;
    transitionQuality = 50;
    logicalSequence = 50;
    narrativeCoherence = 50;
  } else if (informationalContent) {
    continuity = 88;
    transitionQuality = 85;
    logicalSequence = 95;
    narrativeCoherence = 90;
  } else if (fabricatedStory) {
    continuity = 60;
    transitionQuality = 55;
    logicalSequence = 50;
    narrativeCoherence = 45;
  } else {
    continuity -= Math.min(40, disconnectedPairs * 14) + Math.min(25, abruptBoundaries * 6);
    transitionQuality -= Math.min(40, abruptBoundaries * 12) + Math.min(25, disconnectedPairs * 10);
    logicalSequence -= Math.min(50, inversionCount * 15) + (prereqAfterConclusion > 0 ? 25 : 0);
    narrativeCoherence -= Math.min(30, abruptBoundaries * 6)
      + Math.min(30, disconnectedPairs * 8)
      + Math.min(25, inversionCount * 6);
  }

  continuity = clamp(continuity, 0, 100);
  transitionQuality = clamp(transitionQuality, 0, 100);
  logicalSequence = clamp(logicalSequence, 0, 100);
  narrativeCoherence = clamp(narrativeCoherence, 0, 100);

  // Reading Flow: how continuously the whole piece reads, dominated by
  // continuity and transitions.
  const readingFlow = Math.round(
    0.3 * continuity
    + 0.3 * transitionQuality
    + 0.2 * logicalSequence
    + 0.2 * narrativeCoherence,
  );

  const flowScore = readingFlow;

  const flags = {
    emptyContent,
    informationalContent,
    abruptTransitions: !informationalContent && !emptyContent && abruptBoundaries >= 2,
    disconnectedIdeas: !informationalContent && !emptyContent && disconnectedPairs >= 1,
    missingBridges: !informationalContent && !emptyContent && abruptBoundaries > 0 && transitionCoverage < 0.5,
    chronologyConfusing: !informationalContent && !emptyContent && inversionCount >= 2,
    prerequisiteAfterConclusion: !informationalContent && !emptyContent && prereqAfterConclusion > 0,
    fabricatedStory,
  };

  return {
    skillId: NARRATIVE_FLOW_SKILL_ID,
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
      continuity,
      transitionQuality,
      logicalSequence,
      narrativeCoherence,
      readingFlow,
    },
    flowScore,
    continuityScore: continuity,
    transitionScore: transitionQuality,
    sequenceScore: logicalSequence,
    coherenceScore: narrativeCoherence,
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

  // Rule 6 overrides everything: scenes, dialogue, and story events are never
  // invented, and ungrounded narratives are never accepted.
  if (flags.fabricatedStory) {
    push(
      "R6",
      "high",
      "Reject the recommendation: never invent scenes, dialogue, or story events unsupported by the Creative Brief or Campaign Context.",
      "A narrative appears in the content, but no brief or context grounds it.",
    );
    push(
      "R7",
      "high",
      "Preserve creator intent: do not fabricate connecting events the audience may not have experienced.",
      "Flow improvements come from the creator or the brief, never from assumption.",
    );
    return recommendations;
  }

  if (flags.informationalContent) {
    push(
      "R5",
      "info",
      "Do not force narrative transitions into informational content; honor the document structure.",
      "The content intentionally changes topics and does not require storytelling transitions.",
    );
    return recommendations;
  }

  if (flags.missingBridges || (flags.abruptTransitions && analysis.signals.transitionCoverage < 0.5)) {
    push(
      "R1",
      "high",
      "Strengthen continuity where ideas change without a transition.",
      "Several ideas change without an explicit bridge between them.",
    );
  }
  if (flags.disconnectedIdeas) {
    push(
      "R2",
      "medium",
      "Add a logical bridge between the disconnected sections.",
      "Adjacent sections share no connecting idea and read as unrelated.",
    );
  }
  if (flags.prerequisiteAfterConclusion || flags.chronologyConfusing) {
    push(
      "R3",
      "medium",
      "Resequence the information so prerequisite context comes before its conclusions.",
      "The chronology is confusing or conclusions precede the context that explains them.",
    );
  }
  if (analysis.signals.abruptBoundaries >= 3 || (
    analysis.signals.totalBoundaries > 0
    && analysis.signals.abruptBoundaries / analysis.signals.totalBoundaries >= 0.6
  )) {
    push(
      "R4",
      "medium",
      "Use smoother progression so the transitions carry the reader instead of interrupting them.",
      "Abrupt transitions dominate the piece and interrupt understanding.",
    );
  }
  return recommendations;
}

// ── Meaning-preserving flow preservation ─────────────────────────────────────
// Narrative Flow is an evaluation of how ideas connect: rewrites risk inserting
// content or altering meaning, so every improvement is surfaced as a
// recommendation and the creator's copy is never rewritten. preserveNarrativeFlow
// is therefore an identity pass that documents that guarantee.

export function preserveNarrativeFlow(draftContent) {
  const original = String(draftContent || "").trim();
  return { preservedContent: original, edits: [] };
}

// ── Public skill API ─────────────────────────────────────────────────────────

// Runs the full deterministic Narrative Flow analysis. Accepts the skill inputs
// (creativeBrief, campaignContext, audienceProfile, draftContent, contentType,
// brandVoice) and returns preservedContent, the five flow scores, flowScore, and
// recommendations.
export function evaluateNarrativeFlow(input = {}) {
  const analysis = analyzeNarrativeFlow(input);
  const { preservedContent, edits } = preserveNarrativeFlow(input.draftContent);
  const recommendations = buildRecommendations(analysis);
  return {
    ...analysis,
    preservedContent,
    edits,
    narrativeFlowRecommendations: recommendations,
    recommendations,
  };
}

// AI Twin internal verification — no user-facing changes unless the skill
// determines the flow can be improved without inventing events, forcing
// transitions, or changing the creator's intent.
export function verifyNarrativeFlow(input = {}) {
  const analysis = analyzeNarrativeFlow(input);
  const scores = analysis.scores;
  return {
    skillId: NARRATIVE_FLOW_SKILL_ID,
    doIdeasProgressNaturally: scores.continuity >= 70 && !analysis.flags.disconnectedIdeas,
    areTransitionsUnderstandable: scores.transitionQuality >= 70 && !analysis.flags.abruptTransitions,
    doesChronologyMakeSense: scores.logicalSequence >= 70 && !analysis.flags.chronologyConfusing,
    areMajorJumpsExplained: scores.narrativeCoherence >= 70 && !analysis.flags.missingBridges,
    doesCommunicationFeelContinuous: scores.readingFlow >= 70 && !analysis.flags.disconnectedIdeas,
    canImproveWithoutChangingIntent: analysis.flowScore < 70,
    scores,
    flags: analysis.flags,
  };
}

// ── Skill Manifest ───────────────────────────────────────────────────────────
// Registered in the Creative Skills Registry. All v1 required fields are
// present; v2 additive sections (capabilities, decisionRules, knowledge,
// workflow, validation, aiTwin, creativeIntelligence, metadata) are advisory.
// dependsOn, complements, sharedUtilities, and compatibleContentTypes are
// informational metadata only: they describe relationships and do not
// introduce a dependency engine or runtime loading behavior.

export default {
  skillId: NARRATIVE_FLOW_SKILL_ID,
  name: "Narrative Flow",
  shortName: "Flow",
  description: "Evaluate whether communication moves smoothly and logically from one idea, scene, argument, or event to the next — continuity, transitions, sequencing, and coherence across the entire piece — while preserving creator intent, never inventing scenes, dialogue, or story events, and never forcing narrative transitions into informational content.",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  category: "storytelling",
  subcategory: "narrative-flow",
  tags: ["storytelling", "flow", "continuity", "transitions", "sequence", "coherence", "communication"],
  capabilities: ["narrative_flow"],
  supportedStudios: ["marketing", "publishing", "ai-twin", "video", "audio", "workflow"],
  dependsOn: ["story-structure"],
  complements: ["emotional-pacing", "character-perspective"],
  sharedUtilities: ["communication-utils"],
  compatibleContentTypes: [
    "blog",
    "podcast",
    "video-script",
    "presentation",
    "webinar",
    "course-lesson",
    "long-form-article",
    "story-content",
  ],
  creativePrinciples: [
    "progress-naturally: connect each idea to the one before it",
    "transition-intentionally: bridge changes so the reader is never lost",
    "keep-ideas-connected: avoid adjacent unrelated topics",
    "respect-chronology: sequence prerequisites before conclusions",
    "reduce-unnecessary-jumps: explain major shifts before making them",
    "authenticity-preserving: never invent scenes, dialogue, or story events",
    "fit-first: do not force narrative transitions into informational content",
  ],
  vocabulary: [
    { concept: "continuity", meaning: "how connected each idea is to the one before it", informs: "flow" },
    { concept: "transition", meaning: "the explicit bridge that carries a reader from one idea to the next", informs: "flow" },
    { concept: "sequence", meaning: "the order in which ideas and events are presented", informs: "flow" },
    { concept: "coherence", meaning: "how well the piece holds together as a whole", informs: "flow" },
    { concept: "reading flow", meaning: "how continuously the whole piece reads", informs: "flow" },
  ],
  craftGuidance: {
    summary: "Move naturally from one idea to the next so the reader follows without re-reading: connect each idea, bridge changes, respect chronology, and explain major jumps.",
    subject: "the continuity and sequencing of the communication, grounded in the Creative Brief and Campaign Context",
    composition: "each idea builds on the last, transitions where topics change, prerequisites before conclusions",
    tone: "smooth and coherent, never fabricated",
    language: "transition markers that bridge ideas without inventing events",
    structure: "sequenced so the audience always understands how the current idea follows the last",
    flow: "continuous from opening to resolution, with no unexplained jumps",
  },
  constraints: [
    "never invent content",
    "never fabricate transitions",
    "never rewrite story events",
    "never change meaning",
    "never override creator intent",
  ],
  evaluationRules: [
    { quality: "continuity", signal: "ideas are connected to the ones before them", evidence: "transition coverage and disconnected pair count" },
    { quality: "transitionQuality", signal: "changes are explicitly bridged", evidence: "transition boundary ratio and abrupt boundary count" },
    { quality: "logicalSequence", signal: "events and prerequisites appear in order", evidence: "stage-sequence inversions" },
    { quality: "narrativeCoherence", signal: "the piece holds together as a whole", evidence: "boundary quality and inversion counts" },
    { quality: "readingFlow", signal: "the whole piece reads continuously", evidence: "weighted combination of the flow dimensions" },
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
    { id: "R1", if: "ideas change without transition", then: "recommend strengthening continuity", else: "keep the existing continuity", confidence: 1 },
    { id: "R2", if: "scenes or sections appear disconnected", then: "recommend adding a logical bridge", else: "keep the connected structure", confidence: 1 },
    { id: "R3", if: "information appears before prerequisite context", then: "recommend resequencing", else: "keep the current order", confidence: 1 },
    { id: "R4", if: "transitions interrupt reader understanding", then: "recommend smoother progression", else: "keep the smooth flow", confidence: 1 },
    { id: "R5", if: "informational content intentionally changes topics", then: "do not force narrative transitions", else: "proceed with the transitions", confidence: 1 },
    { id: "R6", if: "scenes, dialogue, or story events would be invented", then: "never invent them; reject the recommendation", else: "proceed with grounded flow only", confidence: 1 },
    { id: "R7", if: "continuity and creator intent conflict", then: "preserve creator intent while improving flow", else: "proceed", confidence: 1 },
  ],
  knowledge: {
    bestPractices: [
      "Connect each idea to the one before it.",
      "Bridge changes with a transition.",
      "Sequence prerequisites before their conclusions.",
      "Explain major jumps before making them.",
      "Respect the chronology of the story.",
      "Reduce unnecessary jumps.",
      "Preserve authenticity; never invent scenes, dialogue, or story events.",
    ],
    writingGuidance: [
      "Open each idea on the thread of the last.",
      "Use a transition whenever the topic changes.",
      "Place context before the conclusions that depend on it.",
      "Keep the reader oriented with clear sequencing.",
    ],
    businessGuidance: [
      "A smooth flow keeps the audience engaged without re-reading.",
      "Abrupt shifts make ideas feel unrelated even when they are not.",
    ],
    qualityGuidance: [
      "No scenes, dialogue, or story events are ever fabricated.",
      "Transitions are recommended, never inserted into the copy.",
      "Informational content is never forced into narrative transitions.",
    ],
    optimizationGuidance: [
      "When Continuity or Transition Quality are low, bridge the changes first.",
      "Re-run evaluation after resequencing to confirm chronology reads naturally.",
    ],
  },
  workflow: {
    requiredInputs: ["creativeBrief", "campaignContext"],
    optionalInputs: ["draftContent", "contentType", "audienceProfile", "brandVoice"],
    inferredInputs: ["contentType"],
    phases: [
      { phase: "analyze", description: "deterministically score continuity, transitions, sequence, coherence, and reading flow" },
      { phase: "preserve", description: "never auto-rewrite; flow improvements are surfaced as recommendations only" },
      { phase: "recommend", description: "return ordered recommendations for the Creative Intelligence Engine to apply without inventing scenes or forcing transitions" },
    ],
    completionCriteria: [
      "flow scores returned for all five dimensions",
      "preservedContent is byte-identical to the input; no automatic rewrites",
      "recommendations never invent scenes, dialogue, or story events",
    ],
  },
  validation: {
    requiredAssets: [],
    missingContext: {
      creativeBrief: "the creative brief that states the campaign goal and subject",
      campaignContext: "the campaign context that grounds the narrative",
    },
    unsupportedRequests: [
      "requests to fabricate connecting scenes",
      "requests to invent dialogue",
      "requests to insert new information",
      "requests to force narrative transitions into informational content",
    ],
    qualityGates: [
      "no scene invented",
      "no dialogue invented",
      "no story event invented",
      "no transition forced where it does not belong",
    ],
  },
  aiTwin: {
    internallyVerifies: [
      "do ideas progress naturally?",
      "are transitions understandable?",
      "does chronology make sense?",
      "are major jumps explained?",
      "does the communication feel continuous?",
    ],
    userVisible: "no user-facing changes unless the skill determines the flow can be improved without inventing scenes, forcing transitions, or changing the creator's intent",
  },
  creativeIntelligence: {
    recommendWhen: [
      "ideas change without transitions",
      "adjacent sections are disconnected",
      "events are presented out of sequence",
      "transitions interrupt understanding",
      "the chronology becomes confusing",
    ],
    avoidWhen: [
      "the format is a dry reference with intentionally changing sections",
      "the request requires the message to remain deliberately unstructured",
      "the sequence is externally fixed and cannot be changed",
    ],
    reasoning: "fit-first: recommend when the request targets how smoothly ideas connect, not when transitions would be forced onto deliberately sectioned content",
  },
};
