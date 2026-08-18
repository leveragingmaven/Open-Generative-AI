// Approved Creative Skill Pack V1 — Emotional Pacing.
// Third Storytelling skill for Creative OS.
// Produced by the Knowledge Compiler and reviewed by the MavenSync team.
//
// This skill evaluates whether communication creates an appropriate emotional
// journey that supports understanding, engagement, and memorability. Where Story
// Structure asks whether a narrative framework exists and Narrative Flow asks
// whether it moves smoothly, Emotional Pacing asks whether the emotional rhythm
// of the piece supports that narrative: emotional progression, variation,
// balance, and consistency — while preserving creator intent, never inventing
// emotional experiences or reactions, never exaggerating emotion, and never
// forcing emotion into informational content. It evaluates emotional rhythm, not
// emotional writing quality. It is shared platform intelligence, available to
// every studio. It is not a recipe, a provider, a studio, or an agent.
//
// The default export is the registered Skill Manifest (the Creative Skills
// Registry reads only the manifest). The named exports are the deterministic
// analysis implementation: evaluateEmotionalPacing() runs the seven decision
// rules and the five pacing scores, and verifyEmotionalPacing() exposes the AI
// Twin's five internal checks. No provider, recipe, or studio logic is touched.
// This skill is the third in the Storytelling progression Story Structure ->
// Narrative Flow -> Emotional Pacing, and it builds on both: it reuses the story
// stage lexicons to check that emotion follows the arc, and it reuses the
// narrative transition markers to judge whether emotional shifts are explained.

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

export const EMOTIONAL_PACING_SKILL_ID = "emotional-pacing";

// ── Deterministic emotional lexicons ────────────────────────────────────────
// Positive emotional markers: language that names a positive feeling, outcome,
// or state. Exported additively so future Storytelling skills reuse the same
// positive emotion vocabulary.
export const POSITIVE_EMOTION_MARKERS = [
  "excited", "excitement", "thrilled", "delighted", "overjoyed", "grateful",
  "thankful", "hopeful", "inspired", "confident", "proud", "relieved", "happy",
  "joyful", "joy", "optimistic", "energized", "empowered", "love", "loved",
  "amazing", "incredible", "wonderful", "fantastic", "brilliant", "great",
  "success", "successful", "breakthrough", "win", "wins", "winning", "achieved",
  "achievement", "transformed", "triumph", "succeeded", "overcome", "overcame",
  "dream", "rewarded", "celebrated", "milestone", "improved", "improving",
];

// Negative emotional markers: language that names a negative feeling, outcome,
// or state. Exported additively so future Storytelling skills reuse the same
// negative emotion vocabulary.
export const NEGATIVE_EMOTION_MARKERS = [
  "frustrating", "frustrated", "frustration", "pain", "painful", "struggle",
  "struggled", "struggling", "fear", "afraid", "scared", "worried", "worry",
  "anxious", "anxiety", "overwhelmed", "exhausted", "tired", "hopeless",
  "powerless", "defeated", "ashamed", "embarrassed", "nervous", "stressed",
  "terrible", "awful", "nightmare", "failure", "failed", "losing", "lost",
  "doubt", "doubted", "disappointed", "disappointment", "discouraged",
  "suffered", "hurt", "angry", "furious", "fearful", "devastating",
  "devastated", "devastatingly",
];

// Emotional intensity markers: words that inflate or intensify the emotion of a
// sentence. Used to detect exaggerated emotional impact and manipulation risk.
// Exported additively so future Storytelling skills reuse the same intensity
// vocabulary.
export const EMOTIONAL_INTENSITY_MARKERS = [
  "totally", "completely", "absolutely", "incredibly", "unbelievably",
  "utterly", "massively", "extremely", "deeply", "never", "always", "forever",
  "unimaginably", "phenomenally",
];

// Informational content language: dry, factual, reference material that
// intentionally minimizes emotional expression (Rule 5).
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

function startsWithTransition(sentence) {
  const lower = String(sentence).toLowerCase();
  return TRANSITION_MARKERS.some((marker) => lower.startsWith(marker));
}

// Per-sentence emotional magnitude (presence of emotion) and valence (positive
// versus negative). Intensity markers contribute to magnitude but not valence.
function sentenceEmotion(sentence) {
  const positive = countMatches(sentence, POSITIVE_EMOTION_MARKERS);
  const negative = countMatches(sentence, NEGATIVE_EMOTION_MARKERS);
  const intensity = countMatches(sentence, EMOTIONAL_INTENSITY_MARKERS);
  const magnitude = positive + negative + intensity;
  let valence = 0;
  if (positive > negative) valence = 1;
  else if (negative > positive) valence = -1;
  return { positive, negative, intensity, magnitude, valence };
}

// Story stage of a sentence using the Story Structure lexicons, so Emotional
// Pacing can check that emotion follows the arc (opening=0, conflict=1,
// progression=2, resolution=3).
function sentenceStage(sentence) {
  const counts = [
    countMatches(sentence, STORY_STAGES.opening),
    countMatches(sentence, CONFLICT_MARKERS),
    countMatches(sentence, STORY_STAGES.progression),
    countMatches(sentence, RESOLUTION_MARKERS),
  ];
  const max = Math.max(...counts);
  return max > 0 ? counts.indexOf(max) : null;
}

export function analyzeEmotionalPacing({
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

  const emotionalHits = countMatches(text, POSITIVE_EMOTION_MARKERS)
    + countMatches(text, NEGATIVE_EMOTION_MARKERS);
  const intensityHits = countMatches(text, EMOTIONAL_INTENSITY_MARKERS);
  const total = sentences.length;

  // Per-sentence emotional profile.
  const sentenceReport = sentences.map((sentence) => ({
    sentence,
    ...sentenceEmotion(sentence),
    stage: sentenceStage(sentence),
  }));
  const magnitudes = sentenceReport.map((entry) => entry.magnitude);
  const valences = sentenceReport.map((entry) => entry.valence);
  const emotionalSentences = sentenceReport.filter((entry) => entry.magnitude > 0).length;
  const emotionCoverage = total === 0 ? 0 : emotionalSentences / total;
  const posCount = valences.filter((valence) => valence > 0).length;
  const negCount = valences.filter((valence) => valence < 0).length;

  // Emotional variation: how many distinct non-neutral valences appear.
  const variety = (posCount > 0 ? 1 : 0) + (negCount > 0 ? 1 : 0);

  // Emotional consistency: abrupt shifts are adjacent sentences of opposite
  // valence whose change is not explained by a transition.
  let abruptShifts = 0;
  for (let i = 0; i < sentences.length - 1; i += 1) {
    if (
      valences[i] !== 0
      && valences[i + 1] !== 0
      && valences[i] !== valences[i + 1]
      && !startsWithTransition(sentences[i + 1])
    ) {
      abruptShifts += 1;
    }
  }

  // Emotional progression: does emotion build over time rather than peaking
  // immediately? A climax that appears in the first sentence and never again
  // reads as an unearned peak, so the peak is only early when its last
  // occurrence sits at the start.
  const maxMagnitude = Math.max(...magnitudes, 0);
  const emotionalPeakIndex = magnitudes.lastIndexOf(maxMagnitude);
  const earlyClimax = total >= 3
    && emotionalPeakIndex === 0
    && magnitudes.some((magnitude, index) => index > 0 && magnitude < maxMagnitude);
  const emotionalMagnitudes = magnitudes.filter((magnitude) => magnitude > 0);
  const emotionalCount = emotionalMagnitudes.length;
  let risingArc = false;
  if (emotionalCount >= 2) {
    const half = Math.ceil(emotionalCount / 2);
    const firstHalf = emotionalMagnitudes.slice(0, half);
    const secondHalf = emotionalMagnitudes.slice(half);
    const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
    risingArc = mean(secondHalf) > mean(firstHalf);
  }

  // Emotional alignment with the narrative arc (Rule 4): a story that builds
  // tension should carry negative emotion at its conflict, and a story that
  // resolves should carry positive emotion at its resolution.
  const conflictStagePresent = sentenceReport.some((entry) => entry.stage === 1);
  const resolutionStagePresent = sentenceReport.some((entry) => entry.stage === 3);
  const narrativeEmotionConflict = (conflictStagePresent && negCount === 0)
    || (resolutionStagePresent && posCount === 0);

  // Story grounding for Rule 6: narrative content (opening, conflict, or
  // resolution language) that the brief and context do not ground is treated as
  // unverifiable and rejected.
  const storyMarkerHits = countMatches(text, STORY_STAGES.opening)
    + countMatches(text, CONFLICT_MARKERS)
    + countMatches(text, RESOLUTION_MARKERS);
  const storySignalsPresent = storyMarkerHits > 0;
  const fabricatedEmotion = storySignalsPresent && !hasGrounding;

  // Whether pacing rules apply. Informational content intentionally minimizes
  // emotional expression; its neutrality is honored (Rule 5).
  const informationalHits = countMatches(text, INFORMATIONAL_LEXICON);
  const informationalContent = INFORMATIONAL_TYPES.includes(String(contentType || "").toLowerCase())
    || (informationalHits > 0 && emotionalHits === 0);

  const flatTone = total > 0 && (emotionalSentences === 0 || emotionCoverage < 0.2);
  const manipulationRisk = !informationalContent && !emptyContent
    && intensityHits >= 3 && emotionalHits === 0;

  const signals = {
    sentenceCount: total,
    wordCount,
    emotionalHits,
    intensityHits,
    emotionalSentences,
    emotionCoverage,
    posCount,
    negCount,
    variety,
    abruptShifts,
    emotionalPeakIndex,
    earlyClimax,
    risingArc,
    conflictStagePresent,
    resolutionStagePresent,
    sentenceReport,
    hasGrounding,
  };

  // ── Scoring (each dimension independent, 0-100) ─────────────────────────
  let emotionalProgression = 100;
  let emotionalVariation = 100;
  let emotionalBalance = 100;
  let emotionalConsistency = 100;

  if (emptyContent) {
    emotionalProgression = 50;
    emotionalVariation = 50;
    emotionalBalance = 50;
    emotionalConsistency = 50;
  } else if (informationalContent) {
    emotionalProgression = 90;
    emotionalVariation = 90;
    emotionalBalance = 90;
    emotionalConsistency = 90;
  } else if (fabricatedEmotion) {
    emotionalProgression = 55;
    emotionalVariation = 60;
    emotionalBalance = 50;
    emotionalConsistency = 50;
  } else {
    if (flatTone) {
      emotionalProgression -= 60;
      emotionalVariation -= 70;
      emotionalBalance -= 50;
      emotionalConsistency -= 30;
    } else {
      if (earlyClimax) emotionalProgression -= 40;
      if (emotionalCount >= 2 && !risingArc) emotionalProgression -= 25;

      if (variety === 0) emotionalVariation -= 70;
      else if (variety === 1) emotionalVariation -= 40;
      if (emotionalCount >= 3 && new Set(emotionalMagnitudes).size === 1) emotionalVariation -= 20;

      if (posCount > 0 && negCount > 0) emotionalBalance -= Math.min(40, Math.abs(posCount - negCount) * 8);
      else if (posCount > 0 || negCount > 0) emotionalBalance -= 45;
      else emotionalBalance -= 50;

      emotionalConsistency -= Math.min(50, abruptShifts * 25);
      if (narrativeEmotionConflict) emotionalConsistency -= 35;
    }
  }

  emotionalProgression = clamp(emotionalProgression, 0, 100);
  emotionalVariation = clamp(emotionalVariation, 0, 100);
  emotionalBalance = clamp(emotionalBalance, 0, 100);
  emotionalConsistency = clamp(emotionalConsistency, 0, 100);

  // Audience Engagement Support: how well the emotional rhythm supports
  // understanding and engagement, dominated by progression and variation.
  const audienceEngagement = Math.round(
    0.3 * emotionalProgression
    + 0.25 * emotionalVariation
    + 0.2 * emotionalBalance
    + 0.25 * emotionalConsistency,
  );

  const emotionalPacingScore = audienceEngagement;

  const flags = {
    emptyContent,
    informationalContent,
    flatTone: !informationalContent && !emptyContent && flatTone,
    abruptEmotionalShifts: !informationalContent && !emptyContent && abruptShifts >= 1,
    earlyClimax: !informationalContent && !emptyContent && earlyClimax,
    narrativeEmotionConflict: !informationalContent && !emptyContent && narrativeEmotionConflict,
    manipulationRisk,
    fabricatedEmotion,
  };

  return {
    skillId: EMOTIONAL_PACING_SKILL_ID,
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
      emotionalProgression,
      emotionalVariation,
      emotionalBalance,
      emotionalConsistency,
      audienceEngagement,
    },
    emotionalPacingScore,
    emotionalProgressionScore: emotionalProgression,
    emotionalVariationScore: emotionalVariation,
    emotionalBalanceScore: emotionalBalance,
    emotionalConsistencyScore: emotionalConsistency,
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

  // Rule 6 overrides everything: emotional experiences, reactions, and personal
  // feelings are never invented, and ungrounded emotion is never accepted.
  if (flags.fabricatedEmotion) {
    push(
      "R6",
      "high",
      "Reject the recommendation: never fabricate emotional experiences, emotional reactions, or personal feelings unsupported by the Creative Brief or Campaign Context.",
      "A narrative with emotional weight appears, but no brief or context grounds it.",
    );
    push(
      "R7",
      "high",
      "Preserve creator intent: do not invent emotions the audience may not have felt.",
      "Real emotion comes from the creator or the brief, never from assumption.",
    );
    return recommendations;
  }

  if (flags.informationalContent) {
    push(
      "R5",
      "info",
      "Do not force emotional storytelling into informational content; honor its intentionally neutral tone.",
      "The content is informational and intentionally minimizes emotional expression.",
    );
    return recommendations;
  }

  if (flags.flatTone) {
    push(
      "R1",
      "medium",
      "Introduce greater emotional variation so the tone is not flat throughout.",
      "Emotional tone remains flat across the content.",
    );
  }
  if (flags.abruptEmotionalShifts) {
    push(
      "R2",
      "medium",
      "Use smoother emotional progression so shifts are supported by context.",
      "Emotional shifts occur without supporting context.",
    );
  }
  if (flags.earlyClimax) {
    push(
      "R3",
      "medium",
      "Redistribute emotional emphasis so the climax is earned rather than immediate.",
      "Emotional intensity peaks too early in the content.",
    );
  }
  if (flags.narrativeEmotionConflict) {
    push(
      "R4",
      "medium",
      "Strengthen alignment between the emotional journey and the narrative structure.",
      "Emotional progression conflicts with the narrative structure.",
    );
  }
  return recommendations;
}

// ── Meaning-preserving emotional pacing preservation ─────────────────────────
// Emotional Pacing is an evaluation of rhythm: rewrites risk inventing emotion
// or exaggerating impact, so every improvement is surfaced as a recommendation
// and the creator's copy is never rewritten. preserveEmotionalPacing is
// therefore an identity pass that documents that guarantee.

export function preserveEmotionalPacing(draftContent) {
  const original = String(draftContent || "").trim();
  return { preservedContent: original, edits: [] };
}

// ── Public skill API ─────────────────────────────────────────────────────────

// Runs the full deterministic Emotional Pacing analysis. Accepts the skill
// inputs (creativeBrief, campaignContext, audienceProfile, draftContent,
// contentType, brandVoice) and returns preservedContent, the five pacing
// scores, emotionalPacingScore, and recommendations.
export function evaluateEmotionalPacing(input = {}) {
  const analysis = analyzeEmotionalPacing(input);
  const { preservedContent, edits } = preserveEmotionalPacing(input.draftContent);
  const recommendations = buildRecommendations(analysis);
  return {
    ...analysis,
    preservedContent,
    edits,
    emotionalPacingRecommendations: recommendations,
    recommendations,
  };
}

// AI Twin internal verification — no user-facing changes unless the skill
// determines the emotional rhythm can be improved without inventing emotion,
// forcing it, or changing the creator's intent.
export function verifyEmotionalPacing(input = {}) {
  const analysis = analyzeEmotionalPacing(input);
  const scores = analysis.scores;
  return {
    skillId: EMOTIONAL_PACING_SKILL_ID,
    doesEmotionalIntensityProgressNaturally: scores.emotionalProgression >= 70 && !analysis.flags.flatTone && !analysis.flags.earlyClimax,
    isThereAppropriateEmotionalVariation: scores.emotionalVariation >= 70 && !analysis.flags.flatTone,
    doEmotionalShiftsSupportUnderstanding: scores.emotionalConsistency >= 70 && !analysis.flags.abruptEmotionalShifts,
    isEmotionAuthentic: !analysis.flags.fabricatedEmotion,
    doesPacingStrengthenCommunication: scores.audienceEngagement >= 70 && !analysis.flags.flatTone,
    canImproveWithoutChangingIntent: analysis.emotionalPacingScore < 70,
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
  skillId: EMOTIONAL_PACING_SKILL_ID,
  name: "Emotional Pacing",
  shortName: "Pacing",
  description: "Evaluate whether communication creates an appropriate emotional journey that supports understanding, engagement, and memorability — emotional progression, variation, balance, and consistency — while preserving creator intent, never inventing emotional experiences or reactions, never exaggerating emotion, and never forcing emotion into informational content.",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  category: "storytelling",
  subcategory: "emotional-pacing",
  tags: ["storytelling", "emotion", "pacing", "rhythm", "journey", "communication"],
  capabilities: ["emotional_pacing"],
  supportedStudios: ["marketing", "publishing", "ai-twin", "video", "audio", "workflow"],
  dependsOn: ["story-structure", "narrative-flow"],
  complements: ["character-perspective", "story-continuity"],
  sharedUtilities: ["communication-utils"],
  compatibleContentTypes: [
    "video-script",
    "podcast",
    "story-content",
    "presentation",
    "webinar",
    "blog",
    "educational-content",
    "sales-presentation",
  ],
  creativePrinciples: [
    "build-emotion-gradually: let intensity rise toward meaningful moments",
    "balance-tension-and-relief: alternate emotional states intentionally",
    "match-progression: align the emotional journey with the story arc",
    "reinforce-meaningful-moments: emphasize what matters, not everything",
    "preserve-authenticity: never invent emotional experiences or reactions",
    "vary-intentionally: use emotional variation to support understanding",
    "fit-first: do not force emotional storytelling into informational content",
  ],
  vocabulary: [
    { concept: "emotional progression", meaning: "how emotional intensity rises and falls over time", informs: "pacing" },
    { concept: "emotional variation", meaning: "the range of distinct emotional states present", informs: "pacing" },
    { concept: "emotional balance", meaning: "the mix of positive and negative emotional expression", informs: "pacing" },
    { concept: "emotional consistency", meaning: "how well emotional shifts are supported and aligned", informs: "pacing" },
    { concept: "audience engagement", meaning: "how well the emotional rhythm supports understanding", informs: "pacing" },
  ],
  craftGuidance: {
    summary: "Shape an emotional journey that rises and falls naturally, supports the narrative arc, and keeps the audience engaged without ever inventing or exaggerating feeling.",
    subject: "the emotional rhythm of the communication, grounded in the Creative Brief and Campaign Context",
    composition: "tension where the story builds, release where it resolves, variation across the piece",
    tone: "authentic, never manipulated or exaggerated",
    language: "emotion markers and intensity that reflect real feeling, never invented reactions",
    structure: "emotional peaks aligned with meaningful moments in the narrative",
    flow: "emotion that progresses with the story, so the audience feels the journey",
  },
  constraints: [
    "never fabricate emotional experiences",
    "never invent reactions",
    "never exaggerate emotion",
    "never manipulate audiences",
    "never override creator intent",
  ],
  evaluationRules: [
    { quality: "emotionalProgression", signal: "emotional intensity rises and falls naturally", evidence: "magnitude trend and peak position" },
    { quality: "emotionalVariation", signal: "the piece uses an appropriate range of emotional states", evidence: "distinct valences and magnitude spread" },
    { quality: "emotionalBalance", signal: "positive and negative emotion are proportioned", evidence: "positive and negative sentence counts" },
    { quality: "emotionalConsistency", signal: "emotional shifts are supported and aligned with the arc", evidence: "abrupt shift count and narrative-stage alignment" },
    { quality: "audienceEngagement", signal: "the emotional rhythm supports understanding", evidence: "weighted combination of the pacing dimensions" },
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
    { id: "R1", if: "emotional tone remains flat throughout", then: "recommend greater emotional variation", else: "keep the existing variation", confidence: 1 },
    { id: "R2", if: "emotional shifts occur without supporting context", then: "recommend smoother progression", else: "keep the smooth rhythm", confidence: 1 },
    { id: "R3", if: "emotional intensity peaks too early", then: "recommend redistributing emotional emphasis", else: "keep the earned climax", confidence: 1 },
    { id: "R4", if: "emotional progression conflicts with the narrative structure", then: "recommend stronger alignment", else: "keep the aligned journey", confidence: 1 },
    { id: "R5", if: "informational content intentionally minimizes emotional expression", then: "do not force emotional storytelling", else: "proceed with the emotional journey", confidence: 1 },
    { id: "R6", if: "emotional experiences, reactions, or personal feelings would be fabricated", then: "never fabricate them; reject the recommendation", else: "proceed with authentic emotion only", confidence: 1 },
    { id: "R7", if: "emotional rhythm and creator intent conflict", then: "preserve creator intent while improving pacing", else: "proceed", confidence: 1 },
  ],
  knowledge: {
    bestPractices: [
      "Build emotion gradually toward meaningful moments.",
      "Balance tension and relief across the piece.",
      "Match emotional progression to story progression.",
      "Reinforce the moments that matter most.",
      "Preserve authenticity; never invent emotional experiences or reactions.",
      "Use emotional variation intentionally.",
      "Avoid emotional manipulation and exaggeration.",
    ],
    writingGuidance: [
      "Let intensity rise as the story builds.",
      "Place the strongest emotional moment where the narrative earns it.",
      "Give the audience room to feel between peaks.",
      "Keep emotional shifts connected to what came before.",
    ],
    businessGuidance: [
      "An earned emotional journey makes a message memorable.",
      "Emotion that peaks too early leaves the audience nothing to feel.",
    ],
    qualityGuidance: [
      "No emotional experiences or reactions are ever fabricated.",
      "Emotion is recommended, never inserted or exaggerated.",
      "Informational content is never forced into emotional storytelling.",
    ],
    optimizationGuidance: [
      "When Emotional Progression is low, move the strongest emotion toward the resolution.",
      "Re-run evaluation after redistributing emphasis to confirm the arc reads naturally.",
    ],
  },
  workflow: {
    requiredInputs: ["creativeBrief", "campaignContext"],
    optionalInputs: ["draftContent", "contentType", "audienceProfile", "brandVoice"],
    inferredInputs: ["contentType"],
    phases: [
      { phase: "analyze", description: "deterministically score progression, variation, balance, consistency, and engagement" },
      { phase: "preserve", description: "never auto-rewrite; pacing improvements are surfaced as recommendations only" },
      { phase: "recommend", description: "return ordered recommendations for the Creative Intelligence Engine to apply without inventing emotion or exaggerating impact" },
    ],
    completionCriteria: [
      "pacing scores returned for all five dimensions",
      "preservedContent is byte-identical to the input; no automatic rewrites",
      "recommendations never fabricate emotional experiences, reactions, or personal feelings",
    ],
  },
  validation: {
    requiredAssets: [],
    missingContext: {
      creativeBrief: "the creative brief that states the campaign goal and subject",
      campaignContext: "the campaign context that grounds the narrative",
    },
    unsupportedRequests: [
      "requests to invent emotional reactions",
      "requests to fabricate personal feelings",
      "requests to exaggerate emotional impact",
      "requests to manipulate emotional responses",
      "requests to force emotional storytelling into informational content",
    ],
    qualityGates: [
      "no emotional experience fabricated",
      "no reaction invented",
      "no emotion exaggerated",
      "no emotional manipulation",
    ],
  },
  aiTwin: {
    internallyVerifies: [
      "does emotional intensity progress naturally?",
      "is there appropriate emotional variation?",
      "do emotional shifts support understanding?",
      "is emotion authentic?",
      "does pacing strengthen communication?",
    ],
    userVisible: "no user-facing changes unless the skill determines the emotional rhythm can be improved without inventing emotion, exaggerating impact, or changing the creator's intent",
  },
  creativeIntelligence: {
    recommendWhen: [
      "emotional tone is consistently flat",
      "emotional shifts appear abrupt",
      "emotional peaks occur without setup",
      "emotional progression conflicts with narrative flow",
      "emotional manipulation replaces authentic communication",
    ],
    avoidWhen: [
      "the format is a dry reference with intentionally neutral tone",
      "the request requires the message to remain deliberately unemotional",
      "the emotional journey is externally fixed and cannot be changed",
    ],
    reasoning: "fit-first: recommend when the request targets how emotion builds over time, not when emotional storytelling would be forced onto deliberately neutral content",
  },
};
