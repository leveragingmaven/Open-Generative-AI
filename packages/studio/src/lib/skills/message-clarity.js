// Approved Creative Skill Pack V1 — Message Clarity.
// Foundational Communication skill for Creative OS.
// Produced by the Knowledge Compiler and reviewed by the MavenSync team.
//
// This skill improves communication clarity by reducing unnecessary cognitive
// load while preserving meaning, brand voice, and creator intent. It is shared
// platform intelligence, available to every studio. It is not a recipe, a
// provider, a studio, or an agent.
//
// The default export is the registered Skill Manifest (the Creative Skills
// Registry reads only the manifest). The named exports are the deterministic
// analysis implementation: evaluateMessageClarity() runs the seven decision
// rules and the five clarity scores, and verifyMessageClarity() exposes the AI
// Twin's four internal checks. No provider, recipe, or studio logic is touched.

import { splitIntoSentences, tokenizeWords, countMatches, clamp } from "./communication-utils.js";

export const MESSAGE_CLARITY_SKILL_ID = "message-clarity";

// Re-exported for backward compatibility: index.js and external importers reach
// the shared text utilities through this module.
export { splitIntoSentences, tokenizeWords };

// ── Deterministic lexicons and thresholds ────────────────────────────────────
// Sentences that continue the previous idea rather than introduce a new one.
const CONTINUATION_STARTERS = new Set([
  "and", "but", "so", "also", "however", "therefore", "then", "additionally",
  "moreover", "furthermore", "in addition", "as a result", "because", "which",
  "while", "meanwhile", "hence", "thus", "consequently", "besides",
  "this", "it", "that", "these", "those", "they", "there",
]);

// Filler openers that push the real message later (buried-message detection).
const OPENER_PREFIXES = [
  "welcome to", "welcome back", "as you know", "as we all know", "in today's",
  "in the modern", "firstly", "to start", "i wanted to", "let me",
  "quick update", "just a reminder", "we are excited", "we're excited",
  "hello", "hi there", "hey there", "good morning", "good afternoon",
  "good evening",
];

const JARGON_LEXICON = [
  "synergy", "synergies", "leverage", "leveraging", "utilize", "utilizing",
  "facilitate", "facilitating", "comprehensive", "proprietary", "strategic",
  "optimize", "optimization", "paradigm", "holistic", "best-in-class",
  "cutting-edge", "actionable", "bandwidth", "circle back", "touch base",
  "drill down", "low-hanging fruit", "move the needle", "core competency",
  "value-add", "deep dive", "bleeding edge", "state-of-the-art", "seamless",
  "robust", "synergistic", "streamline", "streamlining", "empower",
  "empowering", "revolutionize", "revolutionizing", "disrupt", "disruptive",
  "game-changing", "next-generation", "world-class", "turnkey",
];

// Common acronyms the general audience can be expected to know. Anything else
// that is all-caps and unexplained is treated as jargon / prior knowledge.
const KNOWN_ACRONYMS = new Set([
  "AI", "API", "URL", "PDF", "CEO", "FAQ", "HTML", "CSS", "JS", "ID", "QR",
  "SaaS", "UI", "UX", "VR", "AR", "KPI", "ROI", "CRM", "CMS", "SMS", "SMM",
  "USA", "UK", "EU", "GPS", "HTTP", "HTTPS", "SQL", "DB", "IP", "IT", "TV",
  "PC", "USB", "SSD", "HDD", "RAM", "CPU", "GPU", "NLP", "LLM", "ML", "DL",
  "CTA", "POS", "SKU", "ETA", "ASAP", "RSVP", "CEO", "CFO", "CTO", "VIP",
]);

const BENEFIT_SIGNALS = [
  "you", "your", "you'll", "you will", "yours", "save", "saves", "save you",
  "earn", "earns", "grow", "grows", "improve", "improves", "helps", "help you",
  "get more", "gain", "benefit", "benefits", "value", "reduces", "avoid",
  "prevents", "so that", "which means", "means for you", "for you", "easy for you",
];

const ACTION_LEXICON = [
  "sign up", "subscribe", "buy", "get started", "start now", "download",
  "call now", "call us", "click here", "visit our", "visit us", "register",
  "join", "order", "book", "learn more", "contact us", "request a demo",
  "request a quote", "reserve", "shop now", "start free trial", "get access",
  "register today", "schedule", "enroll", "apply now", "start your",
  "get your", "claim your", "discover",
];

const LOGIC_CONNECTORS = [
  "because", "so that", "therefore", "as a result", "first", "then", "next",
  "finally", "however", "in addition", "for example", "for instance",
  "which means", "consequently", "after", "before", "while", "although",
  "since", "not only", "as well as", "similarly", "likewise",
];

const REFERENCE_PRONOUNS = new Set([
  "this", "that", "these", "those", "it", "they", "them", "their",
]);

const COMPOUND_JOIN = /,\s*(?:and|but|or)\s+|;\s*/;

const JARGON_THRESHOLD = 2;

// ── Text utilities (shared with the Creative Skills library) ────────────────
// splitIntoSentences, tokenizeWords, countMatches, and clamp live in
// communication-utils.js and are reused across the Communication Skill Pack.

function isOpener(sentence) {
  const start = String(sentence || "").trim().toLowerCase();
  return OPENER_PREFIXES.some((prefix) => start.startsWith(prefix));
}

function startsWithContinuation(sentence) {
  const first = String(sentence || "").trim().toLowerCase().split(/\s+/)[0];
  return CONTINUATION_STARTERS.has(first);
}

// ── Deterministic analysis ───────────────────────────────────────────────────

export function analyzeMessageClarity({
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

  const isExpertAudience = Boolean(
    audienceProfile && (audienceProfile.expertiseLevel === "expert" || audienceProfile.readingLevel === "technical"),
  );
  const jargonThreshold = isExpertAudience ? 4 : JARGON_THRESHOLD;

  // Idea detection (Rule 1 + Rule 6).
  // A primary idea is a sentence that introduces a distinct claim: it is not a
  // filler opener, does not continue a prior sentence, and is not itself just a
  // call to action. Counting CTA sentences as ideas would misclassify a clear
  // "benefit, then act" piece as having competing ideas.
  const containsActionPhrase = (sentence) =>
    ACTION_LEXICON.some((phrase) => sentence.toLowerCase().includes(phrase));
  const substantive = sentences.filter((sentence) => !isOpener(sentence));
  const primaryIdeas = substantive.filter(
    (sentence) => !startsWithContinuation(sentence) && !containsActionPhrase(sentence),
  );
  const ideaCount = Math.max(1, primaryIdeas.length);
  const multipleCompetingIdeas = ideaCount > 1;
  const primaryMessageBuried = isOpener(sentences[0]) && substantive.length > 0;

  // Compound-sentence detection (Rule 2).
  const compoundSentences = splitIntoSentences(text).filter((sentence) => COMPOUND_JOIN.test(sentence));

  // Jargon detection (Rule 3).
  const unknownAcronyms = words.filter(
    (word) => /^[A-Z]{2,6}$/.test(word) && !KNOWN_ACRONYMS.has(word),
  );
  const jargonTerms = words.filter((word) => JARGON_LEXICON.includes(word.toLowerCase()));
  const jargonCount = jargonTerms.length + unknownAcronyms.length;
  const longWordCount = words.filter((word) => word.length >= 12).length;
  const excessiveJargon = jargonCount >= jargonThreshold;

  // Benefit detection (Rule 4).
  const benefitHits = countMatches(text, BENEFIT_SIGNALS);
  const audienceBenefitHidden = benefitHits === 0;

  // Action detection (Rule 5).
  const actionHits = countMatches(text, ACTION_LEXICON);
  const actionMissing = actionHits === 0;

  // Logical flow + prior-knowledge dependence.
  const connectorCount = countMatches(text, LOGIC_CONNECTORS);
  const logicalFlowBreak = sentences.length >= 3 && connectorCount === 0;
  const firstStartsWithReference = REFERENCE_PRONOUNS.has(
    String(sentences[0] || "").trim().toLowerCase().split(/\s+/)[0],
  );
  const dependsOnPriorKnowledge = firstStartsWithReference || unknownAcronyms.length > 0;

  const signals = {
    sentenceCount: sentences.length,
    wordCount,
    longWordCount,
    ideaCount,
    jargonCount,
    benefitHits,
    actionHits,
    connectorCount,
    longWordRatio: wordCount ? longWordCount / wordCount : 0,
    avgSentenceLength: sentences.length ? wordCount / sentences.length : 0,
  };

  // ── Scoring (each dimension independent, 0-100) ─────────────────────────
  let messageFocusScore = 100;
  if (multipleCompetingIdeas) messageFocusScore -= Math.min(60, (ideaCount - 1) * 30);
  if (primaryMessageBuried) messageFocusScore -= 20;
  messageFocusScore = clamp(messageFocusScore, 0, 100);

  let cognitiveLoadScore = 100;
  cognitiveLoadScore -= Math.min(50, jargonCount * 15);
  if (signals.longWordRatio > 0.2) cognitiveLoadScore -= Math.min(20, (signals.longWordRatio - 0.2) * 60);
  if (signals.avgSentenceLength > 25) cognitiveLoadScore -= Math.min(15, (signals.avgSentenceLength - 25) * 1.5);
  cognitiveLoadScore = clamp(cognitiveLoadScore, 0, 100);

  const benefitVisibilityScore = audienceBenefitHidden ? 30 : 100;
  const actionClarityScore = actionMissing ? 40 : 100;

  let logicalFlowScore = 100;
  if (logicalFlowBreak) logicalFlowScore -= 30;
  if (dependsOnPriorKnowledge) logicalFlowScore -= 25;
  logicalFlowScore = clamp(logicalFlowScore, 0, 100);

  const clarityScore = Math.round(
    0.25 * messageFocusScore
    + 0.2 * cognitiveLoadScore
    + 0.2 * benefitVisibilityScore
    + 0.15 * actionClarityScore
    + 0.2 * logicalFlowScore,
  );

  return {
    skillId: MESSAGE_CLARITY_SKILL_ID,
    version: "1.0.0",
    status: "active",
    inputs: { contentType, platform, audienceProfile: Boolean(audienceProfile), creativeBrief: Boolean(creativeBrief), campaignContext: Boolean(campaignContext), brandVoice: Boolean(brandVoice) },
    signals,
    scores: {
      messageFocus: messageFocusScore,
      cognitiveLoad: cognitiveLoadScore,
      benefitVisibility: benefitVisibilityScore,
      actionClarity: actionClarityScore,
      logicalFlow: logicalFlowScore,
      clarity: clarityScore,
    },
    clarityScore,
    cognitiveLoadScore,
    benefitVisibilityScore,
    actionClarityScore,
    messageFocusScore,
    logicalFlowScore,
    flags: {
      multipleCompetingIdeas,
      compoundSentences: compoundSentences.length > 0,
      excessiveJargon,
      audienceBenefitHidden,
      actionMissing,
      logicalFlowBreak,
      dependsOnPriorKnowledge,
      primaryMessageBuried,
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

  if (flags.multipleCompetingIdeas) {
    push(
      "R1",
      "high",
      "Keep one primary message and make it the single dominant idea of this content.",
      `${analysis.signals.ideaCount} competing primary ideas were detected.`,
    );
  }
  if (flags.compoundSentences) {
    push(
      "R2",
      "medium",
      "Split sentences that carry multiple unrelated ideas into separate sentences.",
      "Compound sentences joined by and/but/or or semicolons increase cognitive load.",
    );
  }
  if (flags.excessiveJargon) {
    push(
      "R3",
      "high",
      "Simplify jargon and explain necessary terms in language the audience already understands.",
      `${analysis.signals.jargonCount} jargon or unexplained terms were detected.`,
    );
  }
  if (flags.audienceBenefitHidden) {
    push(
      "R4",
      "high",
      "Make the audience benefit explicit instead of leaving it implied.",
      "The content states what the product is, not what it does for the reader.",
    );
  }
  if (flags.actionMissing) {
    push(
      "R5",
      "medium",
      "Add one clear next action so the reader knows what to do after reading.",
      "No clear call to action was detected.",
    );
  }
  if (flags.primaryMessageBuried) {
    push(
      "R6",
      "medium",
      "Move the primary message earlier so it appears before filler or framing.",
      "The first sentence is an opener that delays the real message.",
    );
  }
  if (flags.dependsOnPriorKnowledge) {
    push(
      "R7",
      "medium",
      "Define references, acronyms, and context the reader cannot be assumed to know.",
      "Meaning currently depends on prior knowledge.",
    );
  }
  if (flags.logicalFlowBreak) {
    push(
      "R8",
      "low",
      "Connect sentences with logical transitions so each follows from the last.",
      "Sentences follow one another without explicit connection.",
    );
  }
  return recommendations;
}

// ── Meaning-preserving structural clarification ──────────────────────────────
// The skill never rewrites meaning. It applies only safe, reversible edits:
// splitting compound sentences (Rule 2) and moving a buried message earlier
// (Rule 6). Every other improvement is surfaced as a recommendation.

export function clarifyContent(draftContent) {
  const original = String(draftContent || "").trim();
  if (!original) return { clarifiedContent: original, edits: [] };

  const sentences = splitIntoSentences(original);
  if (!sentences.length) return { clarifiedContent: original, edits: [] };

  const edits = [];
  let result = sentences.slice();

  // Rule 6: move a leading filler opener after the substantive message.
  if (isOpener(result[0]) && result.length > 1) {
    const opener = result.shift();
    result.push(opener);
    edits.push({ ruleId: "R6", edit: "reorder", detail: "Moved the opener after the primary message." });
  }

  // Rule 2: split compound sentences at safe boundaries.
  result = result.flatMap((sentence) => {
    if (!COMPOUND_JOIN.test(sentence)) return [sentence];
    const parts = String(sentence).replace(/\s+/g, " ").trim().split(COMPOUND_JOIN);
    const fragments = parts
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    if (fragments.length > 1) {
      edits.push({ ruleId: "R2", edit: "split", detail: `Split "${sentence}" into separate sentences.` });
      return fragments.map((part, index) => {
        const trimmed = part.trim();
        const hasTerminator = /[.!?]$/.test(trimmed);
        const cleaned = hasTerminator ? trimmed : `${trimmed}.`;
        return index === 0 ? cleaned : `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}`;
      });
    }
    return [sentence];
  });

  return { clarifiedContent: result.join(" ").trim(), edits };
}

// ── Public skill API ─────────────────────────────────────────────────────────

// Runs the full deterministic Message Clarity analysis over draft content.
// Accepts the skill inputs (draftContent, contentType, platform, audienceProfile,
// creativeBrief, campaignContext, brandVoice) and returns clarifiedContent,
// the five clarity scores, recommendations, and failure flags.
export function evaluateMessageClarity(input = {}) {
  const analysis = analyzeMessageClarity(input);
  const { clarifiedContent, edits } = clarifyContent(input.draftContent);
  return {
    ...analysis,
    clarifiedContent,
    edits,
    recommendations: buildRecommendations(analysis),
  };
}

// AI Twin internal verification — no user-facing changes unless the skill
// determines clarity can be improved without changing intent.
export function verifyMessageClarity(input = {}) {
  const analysis = analyzeMessageClarity(input);
  const scores = analysis.scores;
  return {
    skillId: MESSAGE_CLARITY_SKILL_ID,
    immediatelyUnderstandable: scores.cognitiveLoad >= 70 && !analysis.flags.excessiveJargon,
    singlePrimaryMessage: scores.messageFocus >= 70,
    benefitObvious: scores.benefitVisibility >= 70,
    actionClear: scores.actionClarity >= 70,
    canImproveWithoutChangingIntent: analysis.clarityScore < 70,
    scores,
    flags: analysis.flags,
  };
}

// ── Skill Manifest ───────────────────────────────────────────────────────────
// Registered in the Creative Skills Registry. All v1 required fields are
// present; v2 additive sections (capabilities, decisionRules, knowledge,
// workflow, validation, aiTwin, creativeIntelligence, metadata) are advisory.

export default {
  skillId: MESSAGE_CLARITY_SKILL_ID,
  name: "Message Clarity",
  shortName: "Clarity",
  description: "Improve communication clarity by reducing unnecessary cognitive load while preserving meaning, brand voice, and creator intent.",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  category: "communication",
  subcategory: "clarity",
  tags: ["clarity", "communication", "copy", "writing", "readability"],
  capabilities: ["message_clarification"],
  supportedStudios: ["marketing", "image", "video", "audio", "workflow", "publishing", "ai-twin", "agents"],
  creativePrinciples: [
    "clarity-first: reduce cognitive load before adding ornament",
    "meaning-preserving: never change factual meaning or positioning",
    "audience-first: simplify jargon to the audience's level",
    "benefit-explicit: make the audience benefit visible",
    "action-forward: every message points to a clear next step",
  ],
  vocabulary: [
    { concept: "primary message", meaning: "the single dominant idea the content exists to communicate", informs: "message" },
    { concept: "cognitive load", meaning: "the mental effort a reader spends decoding the message; low load keeps the idea easy to grasp", informs: "style" },
    { concept: "audience benefit", meaning: "the concrete positive outcome for the reader, stated explicitly rather than implied", informs: "message" },
    { concept: "clear next action", meaning: "one unambiguous step the reader can take after reading", informs: "structure" },
    { concept: "logical flow", meaning: "the ordering and connection of sentences so each follows from the last", informs: "structure" },
  ],
  craftGuidance: {
    summary: "Communicate one idea, in plain language, with the benefit and the next action explicit.",
    subject: "one primary message per piece; everything else supports it",
    composition: "front-load the primary message, then support it with connected, ordered ideas",
    tone: "preserve brand voice and creator personality; never rewrite them",
    language: "prefer simple words the audience already knows; explain necessary terms",
    structure: "lead with the message, make the benefit obvious, close with one clear action",
    flow: "connect sentences so the reader never has to infer the missing link",
  },
  constraints: [
    "never change factual meaning",
    "never rewrite personality",
    "never invent information",
    "never modify brand positioning",
    "preserve creator intent",
    "improve clarity only",
  ],
  evaluationRules: [
    { quality: "message focus", signal: "one dominant message is identifiable and not competing", evidence: "idea count and buried-message check" },
    { quality: "cognitive load", signal: "plain language, few jargon terms, sentences within comfortable length", evidence: "jargon count, long-word ratio, average sentence length" },
    { quality: "benefit visibility", signal: "the audience benefit is explicit rather than implied", evidence: "benefit marker and second-person presence" },
    { quality: "action clarity", signal: "one clear next action is present", evidence: "action phrase detection" },
    { quality: "logical flow", signal: "sentences connect and no meaning depends on missing prior knowledge", evidence: "connector presence and dangling-reference check" },
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
  dependsOn: [],
  complements: ["curiosity-building", "human-conversation", "trust-building"],
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
    { id: "R1", if: "multiple primary ideas exist", then: "recommend a single dominant message", else: "keep the single primary message", confidence: 1 },
    { id: "R2", if: "sentences contain multiple unrelated ideas", then: "recommend splitting them", else: "keep sentence boundaries", confidence: 1 },
    { id: "R3", if: "jargon exceeds audience understanding", then: "recommend simpler language", else: "keep existing language", confidence: 1 },
    { id: "R4", if: "benefits are implied", then: "make them explicit", else: "keep benefits as stated", confidence: 1 },
    { id: "R5", if: "no clear action exists", then: "recommend one", else: "keep the existing action", confidence: 1 },
    { id: "R6", if: "the primary message is buried", then: "move it earlier", else: "keep the current order", confidence: 1 },
    { id: "R7", if: "meaning depends on prior knowledge", then: "define references and terms", else: "keep references", confidence: 1 },
    { id: "R8", if: "meaning would change", then: "never change meaning; improve clarity only", else: "proceed", confidence: 1 },
  ],
  knowledge: {
    bestPractices: [
      "Front-load the primary message so it is the first thing a reader encounters.",
      "One idea per message; a piece with many ideas needs a dominant anchor.",
      "State the audience benefit explicitly; an implied benefit is often missed.",
      "End with one clear next action.",
    ],
    writingGuidance: [
      "Prefer short, common words over jargon the audience must already know.",
      "Keep sentences comfortably short; break compound sentences into separate ones.",
      "Connect sentences with logical transitions so the reader never infers the missing link.",
      "Write for the audience's vocabulary, not the author's.",
    ],
    businessGuidance: [
      "Clarity is a conversion factor: a clear benefit and a clear action outperform clever wording.",
      "Reduce cognitive load to keep attention on the offer, not the decoding effort.",
    ],
    qualityGuidance: [
      "Meaning, facts, personality, and brand positioning are never altered.",
      "No information is invented; every edit is meaning-preserving and reversible.",
    ],
    optimizationGuidance: [
      "When clarity scores are low, address the highest-severity recommendation first.",
      "Re-run evaluation after edits to confirm scores improve without changing intent.",
    ],
  },
  workflow: {
    requiredInputs: ["draftContent"],
    optionalInputs: ["creativeBrief", "campaignContext", "audienceProfile", "brandVoice", "contentType", "platform"],
    inferredInputs: ["contentType", "platform"],
    phases: [
      { phase: "analyze", description: "deterministically score clarity across message focus, cognitive load, benefit visibility, action clarity, and logical flow" },
      { phase: "clarify", description: "apply only meaning-preserving structural edits (split compounds, un-bury the message)" },
      { phase: "recommend", description: "return ordered recommendations for the Creative Intelligence Engine to apply without changing intent" },
    ],
    completionCriteria: [
      "clarity scores returned for all five dimensions",
      "clarifiedContent preserves meaning",
      "recommendations are actionable and ordered",
    ],
  },
  validation: {
    requiredAssets: [],
    missingContext: { draftContent: "draft copy or script text to analyze" },
    unsupportedRequests: [
      "requests to rewrite personality",
      "requests to invent new facts",
      "requests to change brand positioning",
    ],
    qualityGates: [
      "no factual meaning changed",
      "no information invented",
      "recommendations are actionable",
    ],
  },
  aiTwin: {
    internallyVerifies: [
      "is the message immediately understandable?",
      "is there one primary message?",
      "is the audience benefit obvious?",
      "is the action clear?",
    ],
    userVisible: "no user-facing changes unless the skill determines clarity can be improved without changing intent",
  },
  creativeIntelligence: {
    recommendWhen: [
      "communication needs clarifying before generation",
      "copy or script draft is unfocused",
      "audience benefit is unclear",
      "next action is missing",
    ],
    avoidWhen: [
      "the message must remain intentionally ambiguous",
      "jargon is deliberate brand vocabulary",
    ],
    reasoning: "fit-first: recommend when the request targets message quality, not visual production",
  },
};
