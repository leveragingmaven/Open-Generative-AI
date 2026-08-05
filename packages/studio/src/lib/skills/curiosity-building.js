// Approved Creative Skill Pack V1 — Curiosity Building.
// Foundational Communication skill for Creative OS.
// Produced by the Knowledge Compiler and reviewed by the MavenSync team.
//
// This skill increases audience engagement by structuring communication so the
// audience naturally wants to continue. It creates curiosity through sequencing,
// unanswered questions, progressive revelation, and meaningful anticipation.
// It never creates false promises, clickbait, or artificial suspense. It is
// shared platform intelligence, available to every studio. It is not a recipe,
// a provider, a studio, or an agent.
//
// The default export is the registered Skill Manifest (the Creative Skills
// Registry reads only the manifest). The named exports are the deterministic
// analysis implementation: evaluateCuriosityBuilding() runs the seven decision
// rules and the five engagement scores, and verifyCuriosityBuilding() exposes
// the AI Twin's five internal checks. No provider, recipe, or studio logic is
// touched. This skill complements Message Clarity: Message Clarity ensures the
// audience understands the message; Curiosity Building ensures they want to
// continue engaging with it.

import {
  splitIntoSentences,
  tokenizeWords,
  countMatches,
  clamp,
  countRepeatedPhrases,
} from "./communication-utils.js";

export const CURIOSITY_BUILDING_SKILL_ID = "curiosity-building";

// ── Deterministic lexicons and thresholds ────────────────────────────────────
// Phrases that make an opening compelling: they give the audience a reason to
// continue reading or watching.
const HOOK_SIGNALS = [
  "have you ever", "have you", "did you know", "do you know", "ever wondered",
  "ever wonder", "what if", "imagine", "the reason", "the truth",
  "what happens", "the moment", "turns out", "few people", "most people",
  "the one thing", "here's the", "here is the", "the secret to", "surprising",
  "unexpected", "what most people", "interesting", "fascinating",
  "you won't know", "before you", "until you", "how to", "the key to",
  "what really", "here's what", "here is what", "in this guide",
  "in this video", "the last thing",
];

// Second-person address that involves the audience directly.
const DIRECT_ADDRESS = [
  "you", "your", "you'll", "you're", "you will", "yours",
];

// Narrative transitions that keep momentum and smooth the flow between ideas.
const TRANSITION_LEXICON = [
  "first", "then", "next", "after", "after that", "before", "while",
  "meanwhile", "suddenly", "finally", "eventually", "just then", "at last",
  "throughout", "and then", "but", "however", "yet", "so", "because",
  "which means", "in fact", "for example", "that said", "leading", "starts",
  "begins", "from there", "onward", "up next", "more importantly",
  "in other words", "as it turns out", "afterwards", "later", "right after",
  "now", "soon", "at the same time",
];

// Language that reveals the resolution or conclusion. Its presence in the
// opening means the audience already knows the ending before engaging.
const CONCLUSION_SIGNALS = [
  "in conclusion", "to conclude", "to sum up", "to summarize", "ultimately",
  "in short", "the takeaway", "here's the result", "here is the result",
  "the answer is", "the outcome", "the verdict", "in the end",
  "so there you have it", "that's why", "which is why", "for that reason",
  "therefore", "as a result", "so the truth is", "the bottom line",
  "long story short", "the moral", "the key is", "here's what you learned",
  "here is what you learned", "the conclusion is",
];

// Endings that push the audience forward to keep going.
const CONTINUATION_ENDS = [
  "keep reading", "read on", "stay tuned", "find out", "more to come",
  "coming up", "next up", "don't miss", "watch what happens", "wait until",
  "there's more", "you'll see", "you will see", "all that follows",
  "and so much more", "to be continued",
];

// Clickbait / misleading teaser language. When any of these appear, curiosity
// depends on deception and the recommendation is rejected (Rule 6).
const CLICKBAIT_LEXICON = [
  "you won't believe", "you wont believe", "you'll never guess",
  "you will never guess", "will blow your mind", "blow your mind",
  "mind-blowing", "mind blowing", "they don't want you to know",
  "doesn't want you to know", "don't want you to know", "shocking secret",
  "secret they hide", "one weird trick", "this one trick",
  "wait until you see", "you won't want to miss", "no one tells you",
  "what they don't tell you", "the secret is", "must see to believe",
  "you have to see this", "the truth is hidden", "they don't tell you",
];

// ── Text utilities (shared with the Creative Skills library) ────────────────
// splitIntoSentences, tokenizeWords, countMatches, clamp, and
// countRepeatedPhrases live in communication-utils.js and are reused across
// the Communication Skill Pack.

// ── Deterministic analysis ───────────────────────────────────────────────────

export function analyzeCuriosityBuilding({
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
  const openingSentence = String(sentences[0] || "").trim();
  const lastSentence = String(sentences[sentences.length - 1] || "").trim();

  // Opening quality (Rule 1).
  const openingIsQuestion = openingSentence.endsWith("?");
  const openingHookHits = countMatches(openingSentence, HOOK_SIGNALS);
  const openingAddressesAudience = countMatches(openingSentence, DIRECT_ADDRESS) > 0;
  const noCompellingOpening = !openingIsQuestion && openingHookHits === 0 && !openingAddressesAudience;

  // Curiosity signals across the whole piece.
  const questionCount = sentences.filter((sentence) => sentence.endsWith("?")).length;
  const questionMissing = questionCount === 0;
  const hookSignalCount = countMatches(text, HOOK_SIGNALS);
  const transitionCount = countMatches(text, TRANSITION_LEXICON);
  const conclusionCount = countMatches(text, CONCLUSION_SIGNALS);
  const deceptiveHits = countMatches(text, CLICKBAIT_LEXICON);
  const deceptiveCuriosity = deceptiveHits > 0;

  // Premature conclusion (Rule 2 + Rule 4): the resolution is stated in the
  // opening, so the audience already knows the ending before engaging.
  const conclusionInOpening = countMatches(openingSentence, CONCLUSION_SIGNALS) > 0;
  const prematureConclusion = conclusionInOpening;

  // Progressive disclosure: information is not all presented at once.
  const progressiveDisclosure = !prematureConclusion && sentences.length >= 2;

  // Forward momentum: the final sentence pushes the audience to continue.
  const endsWithForwardMomentum =
    lastSentence.endsWith("?")
    || countMatches(lastSentence, CONTINUATION_ENDS) > 0
    || countMatches(lastSentence, TRANSITION_LEXICON) > 0
    || countMatches(lastSentence, HOOK_SIGNALS) > 0;

  // Flat pacing: uniform sentence length and no questions to vary the rhythm.
  const lengths = sentences.map((sentence) => tokenizeWords(sentence).length);
  const lengthSpread = lengths.length ? Math.max(...lengths) - Math.min(...lengths) : 0;
  const flatPacing = sentences.length >= 3 && questionCount === 0 && lengthSpread <= 10;

  // Abrupt transitions (Rule 5): sentences follow without narrative connection.
  const abruptTransitions = sentences.length >= 3 && transitionCount === 0;

  // Excessive repetition reduces interest.
  const repeatedPhrases = countRepeatedPhrases(words);
  const excessiveRepetition = repeatedPhrases > 0;

  const signals = {
    sentenceCount: sentences.length,
    wordCount,
    openingSentence,
    openingIsQuestion,
    openingHookHits,
    openingAddressesAudience,
    questionCount,
    hookSignalCount,
    transitionCount,
    conclusionCount,
    deceptiveHits,
    repeatedPhrases,
    lengthSpread,
    progressiveDisclosure,
    endsWithForwardMomentum,
  };

  // ── Scoring (each dimension independent, 0-100) ─────────────────────────
  let hookStrengthScore = 100;
  if (noCompellingOpening) hookStrengthScore = 30;
  else if (openingIsQuestion) hookStrengthScore = 95;
  else if (openingHookHits >= 2) hookStrengthScore = 90;
  else if (openingHookHits >= 1 || openingAddressesAudience) hookStrengthScore = 80;
  else hookStrengthScore = 70;
  hookStrengthScore = clamp(hookStrengthScore, 0, 100);

  let curiosityLevelScore = 100;
  if (noCompellingOpening) curiosityLevelScore -= 30;
  if (questionMissing) curiosityLevelScore -= 20;
  if (!progressiveDisclosure) curiosityLevelScore -= 20;
  if (flatPacing) curiosityLevelScore -= 15;
  if (deceptiveCuriosity) curiosityLevelScore = 10;
  curiosityLevelScore = clamp(curiosityLevelScore, 0, 100);

  let informationFlowScore = 100;
  if (prematureConclusion) informationFlowScore -= 40;
  if (!progressiveDisclosure) informationFlowScore -= 15;
  if (abruptTransitions) informationFlowScore -= 25;
  if (excessiveRepetition) informationFlowScore -= 20;
  if (flatPacing) informationFlowScore -= 15;
  informationFlowScore = clamp(informationFlowScore, 0, 100);

  let narrativeMomentumScore = 100;
  if (abruptTransitions) narrativeMomentumScore -= 35;
  if (flatPacing) narrativeMomentumScore -= 30;
  if (!endsWithForwardMomentum) narrativeMomentumScore -= 20;
  if (questionMissing) narrativeMomentumScore -= 15;
  narrativeMomentumScore = clamp(narrativeMomentumScore, 0, 100);

  let attentionRetentionScore = 100;
  if (noCompellingOpening) attentionRetentionScore -= 25;
  if (prematureConclusion) attentionRetentionScore -= 20;
  if (excessiveRepetition) attentionRetentionScore -= 20;
  if (flatPacing) attentionRetentionScore -= 15;
  if (abruptTransitions) attentionRetentionScore -= 15;
  if (deceptiveCuriosity) attentionRetentionScore -= 40;
  attentionRetentionScore = clamp(attentionRetentionScore, 0, 100);

  const curiosityScore = Math.round(
    0.25 * hookStrengthScore
    + 0.25 * curiosityLevelScore
    + 0.2 * informationFlowScore
    + 0.15 * narrativeMomentumScore
    + 0.15 * attentionRetentionScore,
  );

  return {
    skillId: CURIOSITY_BUILDING_SKILL_ID,
    version: "1.0.0",
    status: "active",
    inputs: { contentType, platform, audienceProfile: Boolean(audienceProfile), creativeBrief: Boolean(creativeBrief), campaignContext: Boolean(campaignContext), brandVoice: Boolean(brandVoice) },
    signals,
    scores: {
      hookStrength: hookStrengthScore,
      curiosityLevel: curiosityLevelScore,
      informationFlow: informationFlowScore,
      narrativeMomentum: narrativeMomentumScore,
      attentionRetention: attentionRetentionScore,
      curiosity: curiosityScore,
    },
    curiosityScore,
    hookStrengthScore,
    curiosityLevelScore,
    informationFlowScore,
    narrativeMomentumScore,
    attentionRetentionScore,
    flags: {
      noCompellingOpening,
      prematureConclusion,
      questionMissing,
      excessiveRepetition,
      flatPacing,
      abruptTransitions,
      deceptiveCuriosity,
      progressiveDisclosure,
      endsWithForwardMomentum,
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

  // Rule 6 overrides everything: when curiosity depends on misleading
  // information, the recommendation is rejected, never improved.
  if (flags.deceptiveCuriosity) {
    push(
      "R6",
      "high",
      "Reject the teaser language: do not continue with a hook that depends on misleading information.",
      "Clickbait or misleading teaser language was detected.",
    );
    push(
      "R7",
      "high",
      "Preserve trust: replace the deceptive hook with curiosity the audience earns honestly.",
      "Engagement must never sacrifice audience trust.",
    );
    return recommendations;
  }

  if (flags.noCompellingOpening) {
    push(
      "R1",
      "high",
      "Open with a compelling reason to continue — a meaningful question, a surprising fact, or a direct audience benefit.",
      `The opening ("${analysis.signals.openingSentence || "the first sentence"}") provides no reason to continue reading or watching.`,
    );
  }
  if (flags.prematureConclusion) {
    push(
      "R2",
      "high",
      "Reveal information progressively instead of presenting it all at once.",
      "All information is presented immediately in the opening.",
    );
    push(
      "R4",
      "medium",
      "Delay the resolution so the audience discovers the conclusion through the content.",
      "The audience already knows the conclusion before engaging.",
    );
  }
  if (flags.questionMissing) {
    push(
      "R3",
      "medium",
      "Add one meaningful question the content will answer, to create a natural information gap.",
      "No meaningful question creates a reason to continue.",
    );
  }
  if (flags.abruptTransitions) {
    push(
      "R5",
      "medium",
      "Smooth the transitions between sections so the audience flows from one idea to the next.",
      "Transitions feel abrupt; sentences follow without narrative connection.",
    );
  }
  return recommendations;
}

// ── Meaning-preserving structural reordering ─────────────────────────────────
// The skill never rewrites content or fabricates hooks. It applies only one
// safe, reversible structural edit: front-loading the first meaningful question
// when the opening gives no reason to continue (Rule 3). Every other
// improvement is surfaced as a recommendation so the Creative Intelligence
// Engine preserves meaning, tone, and honesty.

export function restructureContent(draftContent) {
  const original = String(draftContent || "").trim();
  if (!original) return { restructuredContent: original, edits: [] };

  const sentences = splitIntoSentences(original);
  if (sentences.length < 2) return { restructuredContent: original, edits: [] };

  const opening = sentences[0].trim();
  const openingIsQuestion = opening.endsWith("?");
  const openingHookHits = countMatches(opening, HOOK_SIGNALS);
  if (openingIsQuestion || openingHookHits > 0) return { restructuredContent: original, edits: [] };

  const questionIndex = sentences.findIndex((sentence, index) => index > 0 && sentence.trim().endsWith("?"));
  if (questionIndex === -1) return { restructuredContent: original, edits: [] };

  const [question] = sentences.splice(questionIndex, 1);
  sentences.unshift(question);
  return {
    restructuredContent: sentences.join(" ").trim(),
    edits: [{ ruleId: "R3", edit: "reorder", detail: `Moved the question "${question}" to the opening to create a reason to continue.` }],
  };
}

// ── Public skill API ─────────────────────────────────────────────────────────

// Runs the full deterministic Curiosity Building analysis over draft content.
// Accepts the skill inputs (draftContent, contentType, platform, audienceProfile,
// creativeBrief, campaignContext, brandVoice) and returns restructuredContent,
// the five engagement scores, engagementRecommendations, and failure flags.
export function evaluateCuriosityBuilding(input = {}) {
  const analysis = analyzeCuriosityBuilding(input);
  const { restructuredContent, edits } = restructureContent(input.draftContent);
  const recommendations = buildRecommendations(analysis);
  return {
    ...analysis,
    restructuredContent,
    edits,
    engagementRecommendations: recommendations,
    recommendations,
  };
}

// AI Twin internal verification — no user-facing changes unless the skill
// determines engagement can be improved without changing intent or trust.
export function verifyCuriosityBuilding(input = {}) {
  const analysis = analyzeCuriosityBuilding(input);
  const scores = analysis.scores;
  return {
    skillId: CURIOSITY_BUILDING_SKILL_ID,
    openingCreatesInterest: scores.hookStrength >= 70,
    naturalReasonToContinue: scores.curiosityLevel >= 70 && !analysis.flags.deceptiveCuriosity,
    informationPacedRight: scores.informationFlow >= 70,
    curiosityEarnedNotManufactured: !analysis.flags.deceptiveCuriosity,
    audienceWillFeelRewarded: scores.attentionRetention >= 70,
    canImproveWithoutChangingIntent: analysis.curiosityScore < 70,
    scores,
    flags: analysis.flags,
  };
}

// ── Skill Manifest ───────────────────────────────────────────────────────────
// Registered in the Creative Skills Registry. All v1 required fields are
// present; v2 additive sections (capabilities, decisionRules, knowledge,
// workflow, validation, aiTwin, creativeIntelligence, metadata) are advisory.

export default {
  skillId: CURIOSITY_BUILDING_SKILL_ID,
  name: "Curiosity Building",
  shortName: "Curiosity",
  description: "Increase audience engagement by structuring communication so the audience naturally wants to continue — through sequencing, unanswered questions, progressive revelation, and meaningful anticipation, never clickbait or deception.",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  category: "communication",
  subcategory: "engagement",
  tags: ["curiosity", "communication", "engagement", "hook", "storytelling"],
  capabilities: ["engagement_growth", "curiosity_building"],
  supportedStudios: ["marketing", "image", "video", "audio", "workflow", "publishing", "ai-twin", "agents"],
  creativePrinciples: [
    "curiosity-first: open with a reason to continue before anything else",
    "earned-not-manufactured: curiosity must be honest and rewarded with real value",
    "progressive-revelation: reveal information gradually so each step raises a new question",
    "trust-preserving: never sacrifice audience trust for engagement",
    "momentum-forward: keep the audience moving from one section to the next",
  ],
  vocabulary: [
    { concept: "hook", meaning: "the opening element that gives the audience a reason to continue engaging", informs: "structure" },
    { concept: "information gap", meaning: "the space between what the audience knows and what they want to know", informs: "message" },
    { concept: "progressive disclosure", meaning: "revealing information gradually so each section raises a question the next answers", informs: "structure" },
    { concept: "narrative momentum", meaning: "the forward drive that carries the audience from one section to the next", informs: "structure" },
    { concept: "earned curiosity", meaning: "interest created honestly through real questions and rewarded with real value", informs: "message" },
  ],
  craftGuidance: {
    summary: "Open with relevance and a reason to continue, reveal information progressively, and earn curiosity honestly.",
    subject: "one audience desire the content will satisfy by the end",
    composition: "open with a meaningful hook, then release information progressively toward a rewarding resolution",
    tone: "preserve brand voice and creator personality; curiosity must never sound manufactured",
    language: "honest, specific language; questions raise real information gaps, never false promises",
    structure: "start with the reason to continue, pace the revelation, and end with forward momentum",
    flow: "smooth transitions so attention carries from one section to the next",
  },
  constraints: [
    "never create clickbait",
    "never fabricate information",
    "never manipulate emotions dishonestly",
    "never exaggerate outcomes",
    "never change factual meaning",
    "never weaken creator credibility",
    "preserve creator intent",
    "earn curiosity; never manufacture it",
  ],
  evaluationRules: [
    { quality: "hook strength", signal: "the opening gives a clear reason to continue", evidence: "opening hook signals and question presence" },
    { quality: "curiosity level", signal: "natural information gaps and unanswered questions exist", evidence: "question count and hook signal count" },
    { quality: "information flow", signal: "information is revealed progressively without premature conclusions", evidence: "conclusion placement and transition presence" },
    { quality: "narrative momentum", signal: "transitions are smooth and endings drive forward", evidence: "transition count and forward-momentum ending" },
    { quality: "attention retention", signal: "content holds interest without repetition, flat pacing, or deception", evidence: "repetition, pacing spread, and deception detection" },
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
  complements: ["human-conversation", "trust-building"],
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
    { id: "R1", if: "the opening lacks a compelling reason to continue", then: "recommend a stronger opening", else: "keep the current opening", confidence: 1 },
    { id: "R2", if: "all information is presented immediately", then: "recommend progressive disclosure", else: "keep the current reveal pace", confidence: 1 },
    { id: "R3", if: "a meaningful question can create curiosity", then: "recommend one", else: "keep the current structure", confidence: 1 },
    { id: "R4", if: "the audience already knows the conclusion before engaging", then: "recommend delaying the resolution", else: "keep the current resolution placement", confidence: 1 },
    { id: "R5", if: "transitions feel abrupt", then: "recommend smoother narrative progression", else: "keep the current transitions", confidence: 1 },
    { id: "R6", if: "suspense depends on misleading information", then: "reject the recommendation", else: "proceed with honest curiosity", confidence: 1 },
    { id: "R7", if: "trust would be sacrificed for engagement", then: "never sacrifice trust", else: "proceed", confidence: 1 },
  ],
  knowledge: {
    bestPractices: [
      "Open with relevance so the audience immediately sees a reason to continue.",
      "Create meaningful questions that the content will genuinely answer.",
      "Reveal information progressively so each section raises the next question.",
      "Build anticipation naturally; let the payoff be earned by the content.",
      "Reward curiosity with valuable information the audience did not expect.",
      "End sections with forward momentum and a reason to keep going.",
      "Preserve honesty throughout; curiosity is never manufactured.",
    ],
    writingGuidance: [
      "Open with the most relevant thing the audience cares about, not with filler.",
      "Use meaningful questions that the content will genuinely answer.",
      "Reveal information progressively so each section creates the next question.",
      "End sections with forward momentum and a reason to keep going.",
      "Reward every raised question with valuable, honest information.",
    ],
    businessGuidance: [
      "Engagement is a retention factor: content the audience wants to finish outperforms content that must be endured.",
      "Curiosity raises attention; honesty converts it into trust.",
    ],
    qualityGuidance: [
      "No clickbait, no exaggeration, no fabricated suspense.",
      "Every hook is earned and every raised question is answered truthfully.",
    ],
    optimizationGuidance: [
      "When engagement scores are low, address the weakest opening or pacing flag first.",
      "Re-run evaluation after edits to confirm engagement improves without deception.",
    ],
  },
  workflow: {
    requiredInputs: ["draftContent"],
    optionalInputs: ["creativeBrief", "campaignContext", "audienceProfile", "brandVoice", "contentType", "platform"],
    inferredInputs: ["contentType", "platform"],
    phases: [
      { phase: "analyze", description: "deterministically score engagement across hook strength, curiosity level, information flow, narrative momentum, and attention retention" },
      { phase: "structure", description: "apply only meaning-preserving structural reorders (front-load a meaningful question) that create a reason to continue" },
      { phase: "recommend", description: "return ordered recommendations for the Creative Intelligence Engine to apply honestly" },
    ],
    completionCriteria: [
      "engagement scores returned for all five dimensions",
      "restructuredContent preserves meaning and never fabricates",
      "recommendations are honest, ordered, and never rely on deception",
    ],
  },
  validation: {
    requiredAssets: [],
    missingContext: { draftContent: "draft copy or script text to analyze for engagement" },
    unsupportedRequests: [
      "requests to generate clickbait",
      "requests to fabricate suspense",
      "requests to exaggerate outcomes",
    ],
    qualityGates: [
      "no misleading claims created",
      "no information invented",
      "curiosity is earned, never manufactured",
    ],
  },
  aiTwin: {
    internallyVerifies: [
      "does the opening create interest?",
      "is there a natural reason to continue?",
      "is information revealed at the right pace?",
      "is curiosity earned rather than manufactured?",
      "will the audience feel rewarded for continuing?",
    ],
    userVisible: "no user-facing changes unless the skill determines engagement can be improved without changing intent or sacrificing trust",
  },
  creativeIntelligence: {
    recommendWhen: [
      "engagement is the bottleneck and the audience stops reading early",
      "content opens flat with no reason to continue",
      "the entire conclusion is revealed in the opening",
      "transitions feel abrupt or pacing is flat",
    ],
    avoidWhen: [
      "the brief explicitly requires a flat, declarative, or FAQ-style presentation",
      "the audience expects immediate disclosure (e.g., summaries or reference material)",
      "content must remain deliberately unengaging, such as legal or compliance copy",
    ],
    reasoning: "fit-first: recommend when the request targets engagement and retention, not when the format forbids it",
  },
};
