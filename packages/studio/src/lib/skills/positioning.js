// Approved Creative Skill Pack V1 — Positioning.
// Foundational Marketing skill for Creative OS.
// Produced by the Knowledge Compiler and reviewed by the MavenSync team.
//
// This skill defines how an offer, product, service, or creator should be
// positioned within the customer's mind relative to alternatives: one clear
// market position, authentic differentiation, and alignment with the customer
// problem identified by Problem Discovery — while preserving creator intent
// and never inventing competitive claims. It is responsible for strategic
// differentiation, not for writing copy or generating offers. It is shared
// platform intelligence, available to every studio. It is not a recipe, a
// provider, a studio, or an agent.
//
// The default export is the registered Skill Manifest (the Creative Skills
// Registry reads only the manifest). The named exports are the deterministic
// analysis implementation: evaluatePositioning() runs the seven decision rules
// and the five positioning scores, and verifyPositioning() exposes the AI
// Twin's five internal checks. No provider, recipe, or studio logic is touched.
// This is the second skill in the Marketing Skill Pack: Problem Discovery
// identifies what customer problem matters most; Positioning defines how the
// solution should be perceived relative to alternatives.

import { splitIntoSentences, tokenizeWords, countMatches, clamp } from "./communication-utils.js";
import { PROBLEM_THEMES } from "./problem-discovery.js";

export const POSITIONING_SKILL_ID = "positioning";

// ── Deterministic lexicons and thresholds ────────────────────────────────────
// Position categories: mutually-exclusive frames a market position can occupy.
// More than one category means multiple positions compete (Rule 2). Exported so
// dependent skills (Offer Strategy) can weigh an offer against the position.
export const POSITION_CATEGORIES = {
  budget: [
    "cheapest", "cheap", "affordable", "budget", "low-cost", "low cost",
    "inexpensive", "economical", "cost-effective", "best value",
    "value for money",
  ],
  premium: [
    "premium", "luxury", "high-end", "high end", "exclusive", "deluxe",
    "expensive", "most expensive", "world-class", "top-tier", "elite",
  ],
  speed: [
    "fastest", "quickest", "lightning fast", "instant", "speedy", "blazing",
    "in seconds",
  ],
  ease: [
    "easiest", "simplest", "effortless", "frictionless", "no learning curve",
    "easy to use", "simple to use",
  ],
  power: [
    "most powerful", "powerful", "feature-rich", "pro-grade",
    "professional-grade", "most advanced", "advanced",
  ],
  quality: [
    "highest quality", "best quality", "superior quality", "best-in-class",
    "premium quality",
  ],
};

// Position categories that contradict each other when stated together.
const POSITION_CATEGORY_CONFLICT_PAIRS = [["budget", "premium"]];

// Literal phrase pairs that contradict each other across a position.
const POSITION_CONFLICT_PAIRS = [
  ["cheapest", "premium"], ["cheapest", "luxury"], ["cheapest", "high-end"],
  ["cheapest", "high end"], ["cheapest", "most expensive"],
  ["affordable", "luxury"], ["budget", "premium"], ["budget", "high-end"],
  ["inexpensive", "exclusive"], ["value", "expensive"],
  ["fastest", "slowest"], ["easiest", "hardest"],
];

// Positioning statement signals: language that states who the offer is for and
// what it stands for relative to alternatives (Rule 1).
const POSITIONING_MARKERS = [
  "we are the", "we're the", "we are a", "we are an", "the only", "the leading",
  "the #1", "the number one", "best way to", "easiest way to",
  "fastest way to", "most affordable", "built for", "designed for", "made for",
  "for people who", "for teams", "for businesses", "for creators",
  "unlike", "versus", " vs ", "instead of", "compared to",
  "what sets us apart", "sets us apart", "stand out", "stands out", "unique",
  "not just another", "more than just", "the simplest way", "our difference",
  "we are different", "the best option for",
];

// Differentiation signals: authentic, specific unique value (Rule 3).
const DIFFERENTIATION_MARKERS = [
  "unlike", "the only", "only one", "only company", "first to", "unique",
  "uniquely", "sets us apart", "what makes us different", "stand out",
  "stands out", "not just another", "more than just", "different because",
  "instead of", "compared to", "the #1", "the number one", "no other",
];

// Aggressive competitive claims: claims that outperform or beat rivals without
// support (Rule 6).
const COMPETITIVE_CLAIM_MARKERS = [
  "better than", "beats", "superior to", "outperforms", "outclasses",
  "trounces", "smashes", "destroys the competition", "no one else",
  "nobody else", "the best on the market", "miles ahead", "not even close",
  "clearly superior", "way better", "beats the competition",
];

// Evidence language: support that can ground a competitive claim (Rule 6).
const EVIDENCE_LEXICON = [
  "according to", "studies show", "research", "survey", "surveyed",
  "benchmark", "benchmarks", "tested", "testing", "case study", "measured",
  "verified", "data shows", "our data", "results showed", "results show",
  "third party", "independent", "review", "reviews", "rating", "ratings",
  "score", "scored", "certified", "audited", "comparison test",
  "side by side",
];

// Feature and offer language: product features that can replace a customer
// outcome (Rule 5).
const FEATURE_LEXICON = [
  "our product", "our tool", "our platform", "our software", "our app",
  "we offer", "we provide", "feature", "features", "includes", "built-in",
  "integrated", "integration", "integrations", "dashboard", "module",
  "modules", "capabilities", "our solution", "solutions", "powered by",
  "automation",
];

// Customer outcome language: the result the customer wants once the problem is
// solved (Rule 5).
const OUTCOME_LEXICON = [
  "save time", "saves time", "saving time", "save hours", "saves hours",
  "save money", "saves money", "grow your", "grow their", "increase",
  "increases", "improve", "improves", "boost", "boosts", "achieve",
  "achieves", "outcome", "outcomes", "result", "results", "get more",
  "win more", "accomplish", "benefit", "benefits", "so you can",
  "which means", "do more", "get results", "spend less",
];

// Position categories that contradict the customer problems identified by
// Problem Discovery (Rule 4).
const POSITION_PROBLEM_CONFLICTS = [
  { position: "premium", problem: "cost" },
  { position: "budget", problem: "quality" },
];

// ── Deterministic analysis ───────────────────────────────────────────────────

// Flattens a brief, context, profile, or offer value into searchable text so
// objects (as produced by the Creative Brief) and plain strings are treated
// identically.
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

// Detects which position categories a text claims. Returns per-category hit
// counts and the categories ordered by prominence.
function detectPositionCategories(text) {
  const counts = {};
  for (const [category, phrases] of Object.entries(POSITION_CATEGORIES)) {
    const hits = countMatches(text, phrases);
    if (hits > 0) counts[category] = hits;
  }
  const categories = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  return { counts, categories };
}

// Detects which customer problem themes a text expresses, reusing the same
// vocabulary as Problem Discovery so positions align with the same problems.
function detectProblemThemes(text) {
  const themes = [];
  for (const [theme, phrases] of Object.entries(PROBLEM_THEMES)) {
    if (countMatches(text, phrases) > 0) themes.push(theme);
  }
  return themes;
}

// Extracts the sentence that states the position most strongly: the sentence
// with the most positioning, differentiation, and category signals.
function extractPositioningSentence(sentences) {
  let best = null;
  let bestHits = 0;
  for (const sentence of sentences) {
    const hits = countMatches(sentence, POSITIONING_MARKERS)
      + countMatches(sentence, DIFFERENTIATION_MARKERS)
      + countMatches(sentence, POSITION_CATEGORIES.budget)
      + countMatches(sentence, POSITION_CATEGORIES.premium)
      + countMatches(sentence, POSITION_CATEGORIES.speed)
      + countMatches(sentence, POSITION_CATEGORIES.ease)
      + countMatches(sentence, POSITION_CATEGORIES.power)
      + countMatches(sentence, POSITION_CATEGORIES.quality);
    if (hits > bestHits) {
      best = sentence;
      bestHits = hits;
    }
  }
  return best;
}

export function analyzePositioning({
  creativeBrief = null,
  campaignContext = null,
  audienceProfile = null,
  offerInformation = null,
  draftContent = "",
  contentType = "general",
  brandVoice = null,
} = {}) {
  const text = String(draftContent || "").trim();
  const words = tokenizeWords(text);
  const wordCount = words.length;
  const sentences = splitIntoSentences(text);
  const lower = text.toLowerCase();
  const briefText = flattenInput(creativeBrief);
  const contextText = flattenInput(campaignContext);
  const groundingText = [briefText, contextText].filter(Boolean).join(" ");
  const hasGrounding = Boolean(groundingText.trim());

  // Positioning presence (Rule 1).
  const positioningHits = countMatches(text, POSITIONING_MARKERS);
  const positioningPresent = positioningHits > 0;
  const emptyContent = wordCount === 0;

  // Differentiation (Rule 3).
  const differentiationHits = countMatches(text, DIFFERENTIATION_MARKERS);
  const differentiationPresent = differentiationHits > 0;
  const weakDifferentiation = positioningPresent && !differentiationPresent;

  // Competing and conflicting positions (Rule 2).
  const { counts: positionCounts, categories: positionCategories } = detectPositionCategories(text);
  const categoryConflict = POSITION_CATEGORY_CONFLICT_PAIRS.some(
    ([a, b]) => positionCategories.includes(a) && positionCategories.includes(b),
  );
  let literalConflictCount = 0;
  for (const [a, b] of POSITION_CONFLICT_PAIRS) {
    if (lower.includes(a) && lower.includes(b)) literalConflictCount += 1;
  }
  const conflictingPositions = categoryConflict || literalConflictCount > 0;
  const competingPositions = positionCategories.length >= 2;

  // Unsupported competitive claims (Rule 6).
  const competitiveClaimHits = countMatches(text, COMPETITIVE_CLAIM_MARKERS);
  const evidenceHits = countMatches(text, EVIDENCE_LEXICON)
    + words.filter((word) => /\d/.test(word)).length;
  const unsupportedCompetitiveClaims = competitiveClaimHits > 0 && evidenceHits === 0;

  // Feature-first positioning (Rule 5).
  const featureHits = countMatches(text, FEATURE_LEXICON);
  const outcomeHits = countMatches(text, OUTCOME_LEXICON);
  const featuresOverOutcomes = featureHits > 0 && !positioningPresent && outcomeHits === 0;
  const missingPositioning = !positioningPresent && !featuresOverOutcomes && wordCount > 0;

  // Alignment with the identified customer problem (Rule 4).
  const problemThemes = detectProblemThemes([groundingText, text].filter(Boolean).join(" "));
  const conflictsWithCustomerProblem = positionCategories.some((category) =>
    POSITION_PROBLEM_CONFLICTS.some((conflict) => conflict.position === category && problemThemes.includes(conflict.problem)),
  );

  const dominantCategory = positionCategories.length > 0 ? positionCategories[0] : null;
  const dominantPositionCount = dominantCategory ? positionCounts[dominantCategory] : 0;

  const signals = {
    sentenceCount: sentences.length,
    wordCount,
    positioningHits,
    differentiationHits,
    competitiveClaimHits,
    evidenceHits,
    featureHits,
    outcomeHits,
    positionCategories,
    positionCounts: { ...positionCounts },
    problemThemes,
    hasGrounding,
  };

  // ── Scoring (each dimension independent, 0-100) ─────────────────────────
  let positioningClarity = 100;
  let differentiation = 100;
  let customerRelevance = 100;
  let strategicConsistency = 100;
  let marketFocus = 100;

  if (emptyContent) {
    positioningClarity = 50;
    differentiation = 50;
    customerRelevance = 50;
    strategicConsistency = 50;
    marketFocus = 50;
  } else {
    if (!positioningPresent) {
      positioningClarity -= 85;
      marketFocus -= 60;
      strategicConsistency -= 50;
      customerRelevance -= 40;
      differentiation -= 40;
    }
    if (conflictingPositions) {
      positioningClarity -= 45;
      strategicConsistency -= 40;
    }
    if (competingPositions) {
      positioningClarity -= 15 * (positionCategories.length - 1);
      marketFocus -= 20 * (positionCategories.length - 1);
    }
    if (weakDifferentiation) differentiation -= 60;
    if (conflictsWithCustomerProblem) {
      customerRelevance -= 55;
      strategicConsistency -= 30;
    }
    if (featuresOverOutcomes) {
      customerRelevance -= 40;
      marketFocus -= 30;
    }
    if (unsupportedCompetitiveClaims) differentiation -= 40;
  }

  positioningClarity = clamp(positioningClarity, 0, 100);
  differentiation = clamp(differentiation, 0, 100);
  customerRelevance = clamp(customerRelevance, 0, 100);
  strategicConsistency = clamp(strategicConsistency, 0, 100);
  marketFocus = clamp(marketFocus, 0, 100);

  const positioningScore = Math.round(
    0.3 * positioningClarity
    + 0.25 * differentiation
    + 0.2 * customerRelevance
    + 0.15 * strategicConsistency
    + 0.1 * marketFocus,
  );

  // ── Outputs: positioning statement ───────────────────────────────────────
  const positioningStatement = {
    present: positioningPresent,
    statement: extractPositioningSentence(sentences),
    category: dominantCategory,
    differentiation: differentiationPresent,
  };

  return {
    skillId: POSITIONING_SKILL_ID,
    version: "1.0.0",
    status: "active",
    inputs: {
      contentType,
      creativeBrief: Boolean(creativeBrief),
      campaignContext: Boolean(campaignContext),
      audienceProfile: Boolean(audienceProfile),
      offerInformation: Boolean(offerInformation),
      brandVoice: Boolean(brandVoice),
      draftContent: Boolean(text),
    },
    signals,
    scores: {
      positioningClarity,
      differentiation,
      customerRelevance,
      strategicConsistency,
      marketFocus,
    },
    positioningStatement,
    positioningScore,
    clarityScore: positioningClarity,
    differentiationScore: differentiation,
    consistencyScore: strategicConsistency,
    relevanceScore: customerRelevance,
    marketFocusScore: marketFocus,
    dominantPosition: dominantCategory ? {
      category: dominantCategory,
      hits: dominantPositionCount,
    } : null,
    flags: {
      missingPositioning,
      conflictingPositions,
      competingPositions,
      weakDifferentiation,
      conflictsWithCustomerProblem,
      featuresOverOutcomes,
      unsupportedCompetitiveClaims,
      emptyContent,
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

  // Rule 6 overrides everything: unsupported competitive claims are rejected,
  // never strengthened.
  if (flags.unsupportedCompetitiveClaims) {
    push(
      "R6",
      "high",
      "Reject the recommendation: never invent competitive claims or unsupported differentiators.",
      "Competitive or superiority claims were detected without supporting evidence.",
    );
    push(
      "R7",
      "high",
      "Preserve creator intent while strengthening strategic positioning.",
      "Positioning must be grounded in authentic value, never manufactured.",
    );
    return recommendations;
  }

  if (flags.missingPositioning) {
    push(
      "R1",
      "high",
      "Create a positioning statement: who this is for and why it beats the alternative.",
      "No identifiable positioning statement was found in the content.",
    );
  }
  if (flags.conflictingPositions || flags.competingPositions) {
    push(
      "R2",
      "high",
      "Choose one dominant position and state it consistently.",
      `${analysis.signals.positionCategories.length} competing or conflicting positions were detected.`,
    );
  }
  if (flags.weakDifferentiation) {
    push(
      "R3",
      "medium",
      "Emphasize the authentic unique value that sets this offer apart.",
      "The position is stated, but no differentiation signal was detected.",
    );
  }
  if (flags.conflictsWithCustomerProblem) {
    push(
      "R4",
      "medium",
      "Align the position with the identified customer problem.",
      "The stated position contradicts the customer problem identified in the brief and context.",
    );
  }
  if (flags.featuresOverOutcomes) {
    push(
      "R5",
      "medium",
      "Emphasize the customer outcome the offer delivers, not just the features.",
      "The content focuses primarily on product features without a customer outcome.",
    );
  }
  return recommendations;
}

// ── Meaning-preserving positioning preservation ──────────────────────────────
// Positioning is a strategic frame: sharpening it is a rewrite risk, so every
// improvement is surfaced as a recommendation and the creator's copy is never
// rewritten. preservePositioning is therefore an identity pass that documents
// that guarantee.

export function preservePositioning(draftContent) {
  const original = String(draftContent || "").trim();
  return { preservedContent: original, edits: [] };
}

// ── Public skill API ─────────────────────────────────────────────────────────

// Runs the full deterministic Positioning analysis. Accepts the skill inputs
// (creativeBrief, campaignContext, audienceProfile, offerInformation,
// draftContent, contentType, brandVoice) and returns preservedContent, the
// five positioning scores, positioningScore, positioningStatement, and
// recommendations.
export function evaluatePositioning(input = {}) {
  const analysis = analyzePositioning(input);
  const { preservedContent, edits } = preservePositioning(input.draftContent);
  const recommendations = buildRecommendations(analysis);
  return {
    ...analysis,
    preservedContent,
    edits,
    positioningRecommendations: recommendations,
    recommendations,
  };
}

// AI Twin internal verification — no user-facing changes unless the skill
// determines the position can be strengthened without inventing claims or
// changing the creator's intent.
export function verifyPositioning(input = {}) {
  const analysis = analyzePositioning(input);
  const scores = analysis.scores;
  return {
    skillId: POSITIONING_SKILL_ID,
    positionClear: scores.positioningClarity >= 70,
    differentiationObvious: scores.differentiation >= 70 && !analysis.flags.weakDifferentiation,
    alignedWithProblem: scores.customerRelevance >= 70 && !analysis.flags.conflictsWithCustomerProblem,
    consistentPositioning: scores.strategicConsistency >= 70,
    customerUnderstandsDifference: scores.differentiation >= 70 && !analysis.flags.unsupportedCompetitiveClaims,
    canImproveWithoutChangingIntent: analysis.positioningScore < 70,
    scores,
    flags: analysis.flags,
  };
}

// ── Skill Manifest ───────────────────────────────────────────────────────────
// Registered in the Creative Skills Registry. All v1 required fields are
// present; v2 additive sections (capabilities, decisionRules, knowledge,
// workflow, validation, aiTwin, creativeIntelligence, metadata) are advisory.
// dependsOn, complements, and sharedUtilities are informational metadata only:
// they describe relationships and do not introduce a dependency engine or
// runtime loading behavior.

export default {
  skillId: POSITIONING_SKILL_ID,
  name: "Positioning",
  shortName: "Position",
  description: "Define how an offer, product, service, or creator should be positioned in the customer's mind relative to alternatives: one clear market position, authentic differentiation, and alignment with the customer problem — while preserving creator intent and never inventing competitive claims.",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  category: "marketing",
  subcategory: "positioning",
  tags: ["positioning", "marketing", "strategy", "differentiation", "market", "brand"],
  capabilities: ["positioning_strategy"],
  supportedStudios: ["marketing", "video", "audio", "publishing", "workflow", "ai-twin", "agents"],
  dependsOn: ["problem-discovery"],
  complements: ["offer-strategy", "customer-transformation"],
  sharedUtilities: ["communication-utils"],
  creativePrinciples: [
    "one-position: own one clear market position per offer",
    "differentiate-authentically: differentiate through real, verifiable unique value",
    "problem-aligned: connect positioning to the customer problem and desired outcome",
    "consistent-reinforcement: maintain the same position across every message",
    "honest-comparison: never invent competitive advantages or comparisons",
  ],
  vocabulary: [
    { concept: "positioning", meaning: "how the offer is perceived in the customer's mind relative to alternatives", informs: "message" },
    { concept: "differentiation", meaning: "the authentic unique value that makes the offer a better choice", informs: "message" },
    { concept: "market position", meaning: "the single category or frame the offer owns", informs: "message" },
    { concept: "competitive claim", meaning: "a statement about how the offer compares to rivals", informs: "message" },
    { concept: "customer outcome", meaning: "the result the customer achieves once the offer solves the problem", informs: "message" },
  ],
  craftGuidance: {
    summary: "Own one clear market position, differentiate through authentic value, and connect that position to the customer problem and outcome.",
    subject: "the offer's position in the customer's mind, grounded in the Creative Brief, Campaign Context, and the problem discovered by Problem Discovery",
    composition: "one dominant position, stated consistently, with a single authentic differentiator",
    tone: "confident and grounded, never fabricated or exaggerated",
    language: "position and outcome language over product features",
    structure: "position first, then the differentiator, then the customer outcome",
    flow: "from who it is for to why it is different to what they achieve",
  },
  constraints: [
    "never invent competitive advantages",
    "never fabricate customer results",
    "never create unsupported comparisons",
    "never exaggerate uniqueness",
    "never alter factual meaning",
    "never override creator intent",
    "own one clear market position",
  ],
  evaluationRules: [
    { quality: "positioningClarity", signal: "one clear positioning statement is identifiable", evidence: "positioning marker detection and statement extraction" },
    { quality: "differentiation", signal: "the position states authentic unique value", evidence: "differentiation marker presence" },
    { quality: "customerRelevance", signal: "the position aligns with the customer problem and outcome", evidence: "position/problem conflict detection and outcome language" },
    { quality: "strategicConsistency", signal: "the same position is reinforced without contradiction", evidence: "position category and conflict-pair detection" },
    { quality: "marketFocus", signal: "the content focuses on one market position", evidence: "competing position category count" },
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
    { id: "R1", if: "no positioning statement can be identified", then: "recommend creating one", else: "keep the stated position", confidence: 1 },
    { id: "R2", if: "multiple conflicting positions exist", then: "recommend one dominant position", else: "keep the single position", confidence: 1 },
    { id: "R3", if: "differentiation is weak", then: "recommend emphasizing authentic unique value", else: "keep the stated differentiator", confidence: 1 },
    { id: "R4", if: "positioning conflicts with the identified customer problem", then: "recommend alignment", else: "keep the aligned position", confidence: 1 },
    { id: "R5", if: "positioning focuses primarily on features", then: "recommend emphasizing customer outcomes", else: "keep the outcome-first framing", confidence: 1 },
    { id: "R6", if: "competitive claims or unsupported differentiators would be invented", then: "never recommend them; reject the modification", else: "proceed with grounded positioning only", confidence: 1 },
    { id: "R7", if: "strategic positioning and creator intent conflict", then: "preserve creator intent while strengthening the position", else: "proceed", confidence: 1 },
  ],
  knowledge: {
    bestPractices: [
      "Own one clear market position and repeat it consistently.",
      "Differentiate through authentic, verifiable unique value.",
      "Connect the position to the customer problem and outcome.",
      "Avoid feature-first positioning; lead with the position and outcome.",
      "Never compare the offer to rivals without evidence.",
    ],
    writingGuidance: [
      "State who the offer is for and why it is the better choice.",
      "Name one authentic differentiator and repeat it.",
      "Show the customer outcome the position delivers.",
      "Keep the same position across every channel and asset.",
    ],
    businessGuidance: [
      "A clear position makes the choice obvious; a scattered position makes it arbitrary.",
      "Differentiation owned by one authentic claim outperforms many invented ones.",
    ],
    qualityGuidance: [
      "No competitive advantage, customer result, or comparison is ever invented.",
      "Factual meaning and creator intent are never altered.",
    ],
    optimizationGuidance: [
      "When Positioning Clarity is low, create or sharpen the positioning statement.",
      "Re-run evaluation after edits to confirm one consistent position remains.",
    ],
  },
  workflow: {
    requiredInputs: ["creativeBrief", "campaignContext"],
    optionalInputs: ["draftContent", "contentType", "audienceProfile", "offerInformation", "brandVoice"],
    inferredInputs: ["contentType"],
    phases: [
      { phase: "analyze", description: "deterministically score the position across clarity, differentiation, relevance, consistency, and market focus" },
      { phase: "preserve", description: "never auto-rewrite; positioning improvements are surfaced as recommendations only" },
      { phase: "recommend", description: "return ordered recommendations for the Creative Intelligence Engine to apply without inventing claims" },
    ],
    completionCriteria: [
      "positioning scores returned for all five dimensions",
      "preservedContent is byte-identical to the input; no automatic rewrites",
      "recommendations never invent competitive claims, results, or comparisons",
    ],
  },
  validation: {
    requiredAssets: [],
    missingContext: {
      creativeBrief: "the creative brief that states the campaign goal and subject",
      campaignContext: "the campaign context that grounds the market position",
    },
    unsupportedRequests: [
      "requests to invent competitive advantages",
      "requests to fabricate customer results",
      "requests to create unsupported comparisons",
      "requests to exaggerate uniqueness",
    ],
    qualityGates: [
      "no competitive advantage invented",
      "one dominant position identified",
      "position grounded in the brief and the discovered problem",
    ],
  },
  aiTwin: {
    internallyVerifies: [
      "what is the primary position?",
      "is the differentiation obvious?",
      "does the position align with the customer problem?",
      "does the communication consistently reinforce the same position?",
      "would a customer understand why this solution is different?",
    ],
    userVisible: "no user-facing changes unless the skill determines the position can be strengthened without inventing claims or changing the creator's intent",
  },
  creativeIntelligence: {
    recommendWhen: [
      "the content does not state who the offer is for or why it is different",
      "several positions compete or contradict each other",
      "the content leads with features instead of a customer outcome",
      "the position does not align with the customer problem identified",
    ],
    avoidWhen: [
      "the brief deliberately requires a generic, category-standard position",
      "the format is purely transactional with the position fixed by the brief",
      "the position is externally defined and cannot be changed",
    ],
    reasoning: "fit-first: recommend when the request targets strategic differentiation, not when the brief already fixes a standard position",
  },
};
