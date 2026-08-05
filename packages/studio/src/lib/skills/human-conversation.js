// Approved Creative Skill Pack V1 — Human Conversation.
// Foundational Communication skill for Creative OS.
// Produced by the Knowledge Compiler and reviewed by the MavenSync team.
//
// This skill improves how communication feels to a human audience: rhythm,
// pacing, sentence variation, conversational transitions, and natural
// expression — while preserving meaning, facts, brand voice, and creator
// intent. It is a delivery skill, not a content skill. It is shared platform
// intelligence, available to every studio. It is not a recipe, a provider, a
// prompt library, or Voice Performance Intelligence.
//
// The default export is the registered Skill Manifest (the Creative Skills
// Registry reads only the manifest). The named exports are the deterministic
// analysis implementation: evaluateHumanConversation() runs the seven decision
// rules and the six conversation scores, and verifyHumanConversation() exposes
// the AI Twin's five internal checks. No provider, recipe, or studio logic is
// touched. This skill extends the Communication Skill Pack: Message Clarity
// ensures the audience understands the message, Curiosity Building encourages
// them to continue, and Human Conversation makes the delivery feel natural.

import {
  splitIntoSentences,
  tokenizeWords,
  countMatches,
  clamp,
  countRepeatedPhrases,
} from "./communication-utils.js";

export const HUMAN_CONVERSATION_SKILL_ID = "human-conversation";

// ── Deterministic lexicons and thresholds ────────────────────────────────────
// Formal vocabulary that sounds stiff or robotic for a general audience.
const FORMAL_WORDS = [
  "utilize", "utilizes", "utilizing", "utilization", "commence", "commences",
  "commenced", "commencing", "terminate", "terminates", "terminated", "assist",
  "assists", "approximately", "purchase", "purchased", "purchasing",
  "additional", "regarding", "subsequent", "prior to", "in order to",
  "endeavor", "ascertain", "facilitate", "facilitates", "possess", "possesses",
  "obtain", "obtains", "notwithstanding", "herein", "hereby", "hereto",
  "whereas", "aforesaid", "per your request", "please be advised",
  "attached herewith", "kindly", "pursuant", "subsequently",
];

// Mechanical transitions: formulaic connective phrases that interrupt flow.
const MECHANICAL_TRANSITIONS = [
  "however,", "furthermore,", "moreover,", "additionally,", "in addition,",
  "consequently,", "therefore,", "thus,", "accordingly,", "nevertheless,",
  "nonetheless,", "in conclusion,", "to summarize,", "in summary,",
  "as previously mentioned,", "as stated above,", "first and foremost,",
  "firstly,", "secondly,", "thirdly,", "lastly,",
];

// Natural conversational bridges (positive signal).
const NATURAL_TRANSITIONS = [
  "so", "and", "but", "now", "well,", "actually,", "honestly,", "to be honest,",
  "the thing is,", "here's the thing,", "that said,", "by the way,", "plus,",
  "also,", "then,", "after that,", "before we go on,", "speaking of,",
  "turns out,", "long story short,", "when it comes to,", "as for,",
  "at the end of the day,", "on top of that,", "you see,", "in fact,",
  "really,", "you know,",
];

// Phrases that claim a personal lived experience. Introducing these without
// grounding in Campaign Context or the Creative Brief fabricates experience
// (Rule 6), so the recommendation is rejected.
const FABRICATED_EXPERIENCE_MARKERS = [
  "i remember", "i remember when", "i recall", "in my experience",
  "from my experience", "i once", "i've seen", "i have seen", "i lived",
  "i grew up", "my personal story", "let me tell you about my",
  "let me tell you about the time", "when i was", "back when i", "i personally",
  "i witnessed", "i'll never forget", "i will never forget", "this happened to me",
  "it happened to me", "i used to", "i always said", "that reminds me of",
  "my own experience", "i remember the day", "i was there", "one time i",
  "i once tried", "my journey", "my story", "from my own life",
  "i can tell you from experience",
];

// ── Text utilities (shared with the Creative Skills library) ────────────────
// splitIntoSentences, tokenizeWords, countMatches, clamp, and
// countRepeatedPhrases live in communication-utils.js and are reused across
// the Communication Skill Pack.

function stdDev(values) {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// The structure signature of a sentence is its first two words. Consecutive
// sentences sharing the same signature have identical structure (Rule 1).
function sentenceSignature(sentence) {
  const words = tokenizeWords(sentence);
  return words.slice(0, 2).join(" ").toLowerCase();
}

// ── Deterministic analysis ───────────────────────────────────────────────────

export function analyzeHumanConversation({
  draftContent = "",
  contentType = "general",
  platform = null,
  audienceProfile = null,
  creativeBrief = null,
  campaignContext = null,
  brandVoice = null,
} = {}) {
  const text = String(draftContent || "").trim();
  const sentences = splitIntoSentences(text);
  const words = tokenizeWords(text);
  const wordCount = words.length;

  const isFormalAudience = Boolean(
    audienceProfile
    && (audienceProfile.formalityLevel === "formal"
      || audienceProfile.context === "business"
      || audienceProfile.expertiseLevel === "expert"),
  );
  const formalThreshold = isFormalAudience ? 4 : 2;

  // Sentence lengths and variety.
  const sentenceLengths = sentences.map((sentence) => tokenizeWords(sentence).length);
  const avgSentenceLength = sentenceLengths.length
    ? sentenceLengths.reduce((sum, length) => sum + length, 0) / sentenceLengths.length
    : 0;
  const lengthSpread = sentenceLengths.length
    ? Math.max(...sentenceLengths) - Math.min(...sentenceLengths)
    : 0;
  const lengthStdDev = stdDev(sentenceLengths);
  const shortSentenceCount = sentenceLengths.filter((length) => length <= 6).length;
  const mediumSentenceCount = sentenceLengths.filter((length) => length > 6 && length <= 15).length;
  const longSentenceCount = sentenceLengths.filter((length) => length > 15).length;

  // Rule 1: repetitive sentence structure.
  let maxConsecutiveSameStart = 1;
  if (sentences.length > 1) {
    let run = 1;
    let previousSignature = sentenceSignature(sentences[0]);
    for (let i = 1; i < sentences.length; i += 1) {
      const signature = sentenceSignature(sentences[i]);
      if (signature && signature === previousSignature) {
        run += 1;
        maxConsecutiveSameStart = Math.max(maxConsecutiveSameStart, run);
      } else {
        run = 1;
        previousSignature = signature;
      }
    }
  }
  const repetitiveStructure = maxConsecutiveSameStart >= 3;

  // Rule 2: mechanical transitions.
  const mechanicalTransitionHits = countMatches(text, MECHANICAL_TRANSITIONS);
  const naturalTransitionHits = countMatches(text, NATURAL_TRANSITIONS);
  const mechanicalTransitions = mechanicalTransitionHits >= 2;

  // Rule 3: overly formal wording for the intended audience.
  const formalHits = countMatches(text, FORMAL_WORDS);
  const overlyFormal = formalHits >= formalThreshold;

  // Rule 4: repeated words or phrases reduce readability.
  const repeatedPhrases = countRepeatedPhrases(words);
  const excessiveRepetition = repeatedPhrases > 0;

  // Rule 5: every sentence has a similar length.
  const monotoneLength = sentences.length >= 4 && lengthSpread <= 2 && lengthStdDev <= 1.5;

  // Rule 6: fabricated personal experiences.
  const fabricatedExperienceHits = countMatches(text, FABRICATED_EXPERIENCE_MARKERS);
  const fabricatedExperience = fabricatedExperienceHits > 0;

  // Most-repeated word (transparency signal).
  const wordFrequency = new Map();
  for (const word of words) {
    const key = word.toLowerCase();
    if (key.length < 3) continue;
    wordFrequency.set(key, (wordFrequency.get(key) || 0) + 1);
  }
  let topWord = null;
  let topWordCount = 0;
  for (const [word, count] of wordFrequency) {
    if (count > topWordCount) {
      topWord = word;
      topWordCount = count;
    }
  }

  const signals = {
    sentenceCount: sentences.length,
    wordCount,
    avgSentenceLength: Math.round(avgSentenceLength * 10) / 10,
    sentenceLengths,
    lengthSpread,
    lengthStdDev: Math.round(lengthStdDev * 100) / 100,
    shortSentenceCount,
    mediumSentenceCount,
    longSentenceCount,
    maxConsecutiveSameStart,
    mechanicalTransitionHits,
    naturalTransitionHits,
    formalHits,
    repeatedPhrases,
    fabricatedExperienceHits,
    topWord,
    topWordCount,
  };

  // ── Scoring (each dimension independent, 0-100) ─────────────────────────
  let sentenceVariationScore = 100;
  if (repetitiveStructure) sentenceVariationScore -= 40;
  if (monotoneLength) sentenceVariationScore -= 30;
  sentenceVariationScore = clamp(sentenceVariationScore, 0, 100);

  let rhythmScore = 100;
  if (monotoneLength) rhythmScore -= 35;
  if (repetitiveStructure) rhythmScore -= 15;
  if (avgSentenceLength > 20) rhythmScore -= 15;
  rhythmScore = clamp(rhythmScore, 0, 100);

  let naturalFlowScore = 100;
  if (mechanicalTransitions) naturalFlowScore -= 30;
  if (overlyFormal) naturalFlowScore -= 20;
  if (excessiveRepetition) naturalFlowScore -= 15;
  if (repetitiveStructure) naturalFlowScore -= 10;
  naturalFlowScore = clamp(naturalFlowScore, 0, 100);

  let readabilityScore = 100;
  if (avgSentenceLength > 20) readabilityScore -= 20;
  if (overlyFormal) readabilityScore -= 25;
  if (excessiveRepetition) readabilityScore -= 20;
  if (mechanicalTransitions) readabilityScore -= 10;
  readabilityScore = clamp(readabilityScore, 0, 100);

  let authenticityScore = 100;
  if (fabricatedExperience) authenticityScore = 10;
  if (overlyFormal) authenticityScore -= 15;
  if (mechanicalTransitions) authenticityScore -= 10;
  authenticityScore = clamp(authenticityScore, 0, 100);

  const conversationQuality = Math.round(
    0.25 * sentenceVariationScore
    + 0.2 * rhythmScore
    + 0.25 * naturalFlowScore
    + 0.15 * readabilityScore
    + 0.15 * authenticityScore,
  );

  return {
    skillId: HUMAN_CONVERSATION_SKILL_ID,
    version: "1.0.0",
    status: "active",
    inputs: { contentType, platform, audienceProfile: Boolean(audienceProfile), creativeBrief: Boolean(creativeBrief), campaignContext: Boolean(campaignContext), brandVoice: Boolean(brandVoice) },
    signals,
    scores: {
      conversationQuality,
      naturalFlow: naturalFlowScore,
      rhythm: rhythmScore,
      sentenceVariation: sentenceVariationScore,
      readability: readabilityScore,
      authenticity: authenticityScore,
    },
    conversationScore: conversationQuality,
    rhythmScore,
    sentenceVariationScore,
    naturalFlowScore,
    readabilityScore,
    authenticityScore,
    flags: {
      repetitiveStructure,
      mechanicalTransitions,
      overlyFormal,
      excessiveRepetition,
      monotoneLength,
      fabricatedExperience,
    },
  };
}

// ── Recommendation building (deterministic, ordered) ─────────────────────────

export function buildRecommendations(analysis) {
  const recommendations = [];
  const flags = analysis.flags || {};
  const push = (ruleId, severity, recommendation, reason) => {
    recommendations.push({ ruleId, severity, recommendation, reason });
  };

  // Rule 6 overrides everything: fabricated experiences are rejected, never
  // polished.
  if (flags.fabricatedExperience) {
    push(
      "R6",
      "high",
      "Reject the modification: do not introduce fictional personal experiences.",
      "Fabricated personal-experience language was detected.",
    );
    push(
      "R7",
      "high",
      "Preserve the creator's identity: improve delivery only, never rewrite identity or invent experiences.",
      "Authenticity and creator intent must be preserved.",
    );
    return recommendations;
  }

  if (flags.repetitiveStructure) {
    push(
      "R1",
      "high",
      "Vary the sentence structure so consecutive sentences do not open the same way.",
      `${analysis.signals.maxConsecutiveSameStart} consecutive sentences share the same opening structure.`,
    );
  }
  if (flags.mechanicalTransitions) {
    push(
      "R2",
      "medium",
      "Replace mechanical transitions with natural conversational bridges.",
      "Transitions sound robotic and interrupt the flow.",
    );
  }
  if (flags.overlyFormal) {
    push(
      "R3",
      "medium",
      "Use more natural alternatives for overly formal wording, while preserving professionalism.",
      `${analysis.signals.formalHits} formal terms were detected.`,
    );
  }
  if (flags.excessiveRepetition) {
    push(
      "R4",
      "medium",
      "Vary repeated words and phrases to improve readability.",
      `${analysis.signals.repeatedPhrases} repeated phrase families were detected.`,
    );
  }
  if (flags.monotoneLength) {
    push(
      "R5",
      "medium",
      "Mix short, medium, and longer sentences for a healthier rhythm.",
      `Sentences have a similar length (spread of ${analysis.signals.lengthSpread} words).`,
    );
  }
  return recommendations;
}

// ── Meaning-preserving delivery refinement ───────────────────────────────────
// Human Conversation is a delivery skill: its improvements live at the word
// level, so no automatic edit is safe without risking meaning or voice. The
// skill surfaces every improvement as a recommendation and never rewrites the
// creator's copy. refineContent is therefore an identity pass that documents
// the guarantee that delivery is improved through recommendation only.

export function refineContent(draftContent) {
  const original = String(draftContent || "").trim();
  return { refinedContent: original, edits: [] };
}

// ── Public skill API ─────────────────────────────────────────────────────────

// Runs the full deterministic Human Conversation analysis over draft content.
// Accepts the skill inputs (draftContent, contentType, platform, audienceProfile,
// creativeBrief, campaignContext, brandVoice) and returns refinedContent,
// the six conversation scores, conversationRecommendations, and failure flags.
export function evaluateHumanConversation(input = {}) {
  const analysis = analyzeHumanConversation(input);
  const { refinedContent, edits } = refineContent(input.draftContent);
  const recommendations = buildRecommendations(analysis);
  return {
    ...analysis,
    refinedContent,
    edits,
    conversationRecommendations: recommendations,
    recommendations,
  };
}

// AI Twin internal verification — no user-facing changes unless the skill
// determines delivery can be improved without changing meaning or identity.
export function verifyHumanConversation(input = {}) {
  const analysis = analyzeHumanConversation(input);
  const scores = analysis.scores;
  return {
    skillId: HUMAN_CONVERSATION_SKILL_ID,
    soundsLikeNaturalConversation: scores.naturalFlow >= 70,
    rhythmVaried: scores.rhythm >= 70,
    transitionsSmooth: scores.naturalFlow >= 70 && !analysis.flags.mechanicalTransitions,
    soundsHumanWithoutPretending: scores.authenticity >= 70 && !analysis.flags.fabricatedExperience,
    authenticityPreserved: scores.authenticity >= 70,
    canImproveWithoutChangingIntent: analysis.conversationScore < 70,
    scores,
    flags: analysis.flags,
  };
}

// ── Skill Manifest ───────────────────────────────────────────────────────────
// Registered in the Creative Skills Registry. All v1 required fields are
// present; v2 additive sections (capabilities, decisionRules, knowledge,
// workflow, validation, aiTwin, creativeIntelligence, metadata) are advisory.

export default {
  skillId: HUMAN_CONVERSATION_SKILL_ID,
  name: "Human Conversation",
  shortName: "Conversation",
  description: "Improve how communication feels to a human audience — rhythm, pacing, sentence variation, conversational transitions, and natural expression — while preserving meaning, facts, brand voice, and creator intent.",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  category: "communication",
  subcategory: "conversation",
  tags: ["conversation", "communication", "authenticity", "natural-language", "tone", "rhythm"],
  capabilities: ["conversational_delivery"],
  supportedStudios: ["marketing", "video", "audio", "publishing", "workflow", "ai-twin", "agents"],
  creativePrinciples: [
    "human-first: communicate the way people actually talk",
    "delivery-not-content: improve how the message sounds, never what it means",
    "rhythm-varied: mix sentence lengths for natural pacing",
    "authenticity-preserving: sound human without pretending to be someone else",
    "voice-preserving: keep the creator's personality intact",
  ],
  vocabulary: [
    { concept: "conversational flow", meaning: "how naturally sentences connect in spoken and written delivery", informs: "structure" },
    { concept: "rhythm", meaning: "the pattern of short and long sentences that makes text feel alive", informs: "style" },
    { concept: "sentence variation", meaning: "mixing structure and length so no two sentences feel identical", informs: "structure" },
    { concept: "natural transition", meaning: "a bridge between ideas that sounds like everyday speech", informs: "structure" },
    { concept: "authenticity", meaning: "sounding genuine without invented stories or exaggerated personality", informs: "message" },
  ],
  craftGuidance: {
    summary: "Write the way people talk: vary rhythm, bridge ideas conversationally, and improve delivery without changing meaning.",
    subject: "the creator's own message and voice, never a fabricated persona",
    composition: "mix short, medium, and long sentences; open sentences differently; bridge ideas conversationally",
    tone: "preserve brand voice and the creator's personality; never exaggerate or imitate",
    language: "prefer spoken readability and natural phrasing; keep formal wording for formal audiences only",
    structure: "vary sentence openings and lengths; connect ideas with natural bridges",
    flow: "read aloud well, with rhythm the ear can follow",
  },
  constraints: [
    "never invent memories",
    "never invent stories",
    "never fabricate lived experiences",
    "never imitate another person",
    "never change factual meaning",
    "never alter creator intent",
    "improve delivery only; never rewrite identity",
  ],
  evaluationRules: [
    { quality: "conversation quality", signal: "the composite of natural flow, rhythm, variation, readability, and authenticity", evidence: "weighted conversation score" },
    { quality: "natural flow", signal: "transitions connect ideas conversationally rather than mechanically", evidence: "mechanical vs natural transition counts" },
    { quality: "rhythm", signal: "sentence lengths vary and are comfortably paced", evidence: "length spread, standard deviation, average length" },
    { quality: "sentence variation", signal: "consecutive sentences do not share the same structure or length", evidence: "consecutive same-start runs and length spread" },
    { quality: "readability", signal: "formal wording and repetition are minimized", evidence: "formal term count and repeated-phrase detection" },
    { quality: "authenticity", signal: "delivery sounds human without invented experiences or exaggerated personality", evidence: "fabricated-experience marker detection" },
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
  dependsOn: ["message-clarity"],
  complements: ["curiosity-building", "trust-building"],
  sharedUtilities: ["communication-utils"],
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
    { id: "R1", if: "multiple consecutive sentences have identical structure", then: "recommend greater sentence variation", else: "keep the current structure", confidence: 1 },
    { id: "R2", if: "transitions feel mechanical", then: "recommend more natural conversational bridges", else: "keep the current transitions", confidence: 1 },
    { id: "R3", if: "wording sounds overly formal for the intended audience", then: "recommend more natural alternatives while preserving professionalism", else: "keep the current wording", confidence: 1 },
    { id: "R4", if: "repeated words or phrases reduce readability", then: "recommend variation", else: "keep the current phrasing", confidence: 1 },
    { id: "R5", if: "every sentence has a similar length", then: "recommend a healthier mix of short, medium, and longer sentences", else: "keep the current lengths", confidence: 1 },
    { id: "R6", if: "fictional personal experiences would be introduced", then: "never introduce them; reject the modification", else: "proceed with known context only", confidence: 1 },
    { id: "R7", if: "the creator's personality would change", then: "never change it; improve delivery only", else: "proceed", confidence: 1 },
  ],
  knowledge: {
    bestPractices: [
      "Mix sentence lengths naturally so rhythm never goes flat.",
      "Use conversational transitions instead of formulaic connectors.",
      "Preserve authenticity; delivery should sound human, never manufactured.",
      "Favor spoken readability; write what sounds right read aloud.",
      "Allow occasional informal phrasing when it fits the audience.",
      "Maintain consistency with Brand Voice at all times.",
      "Optimize for human connection, not perfection.",
    ],
    writingGuidance: [
      "Vary how sentences open so no two consecutive sentences start the same.",
      "Alternate short and long sentences to control pacing.",
      "Replace mechanical connectors with natural bridges the audience already uses.",
      "Keep formal vocabulary for formal audiences; prefer plain words otherwise.",
      "Read the draft aloud to catch rhythm problems no reader should have to.",
    ],
    businessGuidance: [
      "Natural delivery lowers friction: communication that feels human earns trust.",
      "Authenticity is a trust factor; invented experiences destroy credibility.",
    ],
    qualityGuidance: [
      "No invented memories, stories, or lived experiences — ever.",
      "Meaning, facts, opinions, and personality are never changed.",
    ],
    optimizationGuidance: [
      "When conversation scores are low, address the highest-severity flag first.",
      "Re-run evaluation after edits to confirm delivery improves without changing meaning.",
    ],
  },
  workflow: {
    requiredInputs: ["draftContent"],
    optionalInputs: ["creativeBrief", "campaignContext", "audienceProfile", "brandVoice", "contentType", "platform"],
    inferredInputs: ["contentType", "platform"],
    phases: [
      { phase: "analyze", description: "deterministically score delivery across conversation quality, natural flow, rhythm, sentence variation, readability, and authenticity" },
      { phase: "refine", description: "never auto-rewrite; delivery improvements are surfaced as recommendations only" },
      { phase: "recommend", description: "return ordered recommendations for the Creative Intelligence Engine to apply without changing meaning or voice" },
    ],
    completionCriteria: [
      "conversation scores returned for all six dimensions",
      "refinedContent is byte-identical to the input; no automatic rewrites",
      "recommendations are actionable and never fabricate experience",
    ],
  },
  validation: {
    requiredAssets: [],
    missingContext: { draftContent: "draft copy or script text to analyze for conversational delivery" },
    unsupportedRequests: [
      "requests to invent personal stories or experiences",
      "requests to imitate another person",
      "requests to rewrite the creator's identity",
    ],
    qualityGates: [
      "no fabricated experiences introduced",
      "no factual meaning changed",
      "recommendations are actionable and preserve voice",
    ],
  },
  aiTwin: {
    internallyVerifies: [
      "does this sound like natural conversation?",
      "is the rhythm varied?",
      "are transitions smooth?",
      "does it sound human without pretending to be human?",
      "is authenticity preserved?",
    ],
    userVisible: "no user-facing changes unless the skill determines delivery can be improved without changing meaning or identity",
  },
  creativeIntelligence: {
    recommendWhen: [
      "copy or script reads stiff, robotic, or formulaic",
      "consecutive sentences share the same structure or length",
      "transitions sound mechanical",
      "wording is overly formal for the intended audience",
    ],
    avoidWhen: [
      "the brief deliberately requires formal, legal, or compliance tone",
      "the format demands fixed sentence structure (e.g., technical specs)",
      "delivery must remain intentionally impersonal",
    ],
    reasoning: "fit-first: recommend when the request targets delivery quality, not content or format constraints",
  },
};
