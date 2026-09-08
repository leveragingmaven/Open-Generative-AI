// Approved Creative Skill Pack V1 — Offer Strategy.
// Foundational Marketing skill for Creative OS.
// Produced by the Knowledge Compiler and reviewed by the MavenSync team.
//
// This skill evaluates and strengthens the strategic structure of an offer
// before creative execution: one primary offer that clearly solves the
// customer's identified problem, communicates value through outcomes, and stays
// simple to understand — while preserving creator intent and never inventing
// products, bonuses, guarantees, or scarcity. It focuses on offer design, not
// copywriting or pricing. It is shared platform intelligence, available to
// every studio. It is not a recipe, a provider, a studio, or an agent.
//
// The default export is the registered Skill Manifest (the Creative Skills
// Registry reads only the manifest). The named exports are the deterministic
// analysis implementation: evaluateOfferStrategy() runs the seven decision
// rules and the five offer scores, and verifyOfferStrategy() exposes the AI
// Twin's five internal checks. No provider, recipe, or studio logic is touched.
// This is the third skill in the Marketing Skill Pack: Problem Discovery
// identifies what customer problem matters most, Positioning determines how the
// solution should be perceived, and Offer Strategy evaluates what the customer
// is actually being invited to buy.

import { splitIntoSentences, tokenizeWords, countMatches, clamp } from "./communication-utils.js";
import { PROBLEM_THEMES } from "./problem-discovery.js";
import { POSITION_CATEGORIES } from "./positioning.js";

export const OFFER_STRATEGY_SKILL_ID = "offer-strategy";

// ── Deterministic lexicons and thresholds ────────────────────────────────────
// Offer presence markers: language that invites the customer to receive or
// acquire something (Rule 1). Exported so dependent skills (Customer
// Transformation) can connect offers to the transformation narrative.
export const OFFER_MARKERS = [
  "you get", "you'll get", "you will get", "get access", "get instant access",
  "you'll receive", "you will receive", "receive", "includes", "included",
  "what's included", "what is included", "bundle", "package", "plan", "plans",
  "pricing", "for just", "for only", "pay once", "one-time payment",
  "one time payment", "for free", "free access", "access to", "membership",
  "subscription", "upgrade", "our offer", "this offer", "the offer",
  "what you get", "included in", "join", "enroll", "sign up for",
  "we offer", "we provide",
];

// Offer types: what the customer actually receives (the mechanism). Distinct
// types beyond the primary offer compete for attention (Rule 1).
export const OFFER_TYPES = {
  program: ["course", "program", "training", "workshop", "masterclass", "bootcamp", "certification"],
  digital: ["template", "templates", "toolkit", "checklist", "playbook", "ebook", "e-book", "guide", "notion template", "resource pack"],
  service: ["coaching", "consult", "consultation", "done for you", "done-for-you", "managed"],
  access: ["membership", "subscription", "community", "app", "software", "platform", "dashboard access"],
  bundle: ["bundle", "package", "kit"],
};

// Price language: how much the offer costs (an important offer component).
const PRICE_LEXICON = [
  "for just", "for only", "pay once", "one-time", "one time", "per month",
  "per year", "price", "pricing", "only $", "just $", "$", "payment",
  "billed", "discount", "deal",
];

const PRICE_PATTERN = /\$\s?\d+(?:\.\d+)?/g;

// Customer outcome language: the result the offer delivers (Rules 2 and 4).
// Exported so dependent skills (Customer Transformation) reuse the same
// outcome vocabulary.
export const OUTCOME_LEXICON = [
  "save time", "saves time", "save hours", "saves hours", "save money",
  "saves money", "grow your", "grow their", "increase", "increases",
  "improve", "improves", "boost", "boosts", "achieve", "achieves",
  "outcome", "outcomes", "result", "results", "get more", "win more",
  "winning more", "accomplish", "benefit", "benefits", "so you can",
  "which means", "do more", "get results", "spend less", "transform",
  "transforms",
];

// Feature language: product capabilities that can replace customer outcomes.
// Exported so dependent skills (Customer Transformation) reuse it.
export const FEATURE_LEXICON = [
  "our product", "our tool", "our platform", "our software", "our app",
  "feature", "features", "includes", "built-in", "integrated", "integration",
  "integrations", "dashboard", "module", "modules", "capabilities",
  "our solution", "solutions", "powered by", "automation",
];

// Complexity language: unnecessary breadth that reduces understanding (Rule 3).
const COMPLEXITY_LEXICON = [
  "comprehensive", "complete suite", "full suite", "all-in-one", "all in one",
  "everything you need", "every feature", "all features", "all-access",
  "all access", "extensive", "enterprise-grade", "complete solution",
  "everything included", "huge", "massive", "50 modules", "unlimited",
];

// False urgency / scarcity language (Rule 6). Exported so dependent skills
// (Call to Action Strategy) reject the same deceptive pressure.
export const URGENCY_LEXICON = [
  "limited time", "limited spots", "only a few left", "act now",
  "before it's gone", "before it is gone", "while supplies last",
  "last chance", "closing soon", "today only", "only today",
  "don't miss out", "do not miss out", "final call", "ends soon",
  "price increases", "going up soon", "only 5 spots", "only a few",
];

// Guarantee language (Rule 6).
const GUARANTEE_LEXICON = [
  "guaranteed results", "results guaranteed", "100% guarantee",
  "money back guarantee", "money-back guarantee", "we guarantee",
  "guaranteed to", "guarantee you'll", "guarantee you will",
  "satisfaction guaranteed",
];

// Bonus language (Rule 6: bonuses are never fabricated).
const BONUS_LEXICON = [
  "bonus", "bonuses", "free bonus", "bonus bundle", "exclusive bonus",
  "bonus training", "bonus pack",
];

// Evidence language: support that can ground urgency, guarantees, and claims.
const EVIDENCE_LEXICON = [
  "according to", "studies show", "research", "survey", "surveyed",
  "benchmark", "benchmarks", "tested", "case study", "measured", "verified",
  "data shows", "our data", "results showed", "results show", "third party",
  "independent", "review", "reviews", "rating", "ratings", "score", "scored",
  "certified", "in writing", "refund policy", "terms and conditions",
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

// Detects which offer types a text claims. Returns per-type hit counts and the
// types ordered by prominence.
function detectOfferTypes(text) {
  const counts = {};
  for (const [type, phrases] of Object.entries(OFFER_TYPES)) {
    const hits = countMatches(text, phrases);
    if (hits > 0) counts[type] = hits;
  }
  const types = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  return { counts, types };
}

// Detects which customer problem themes a text expresses, reusing the same
// vocabulary as Problem Discovery so offers align with the same problems.
function detectProblemThemes(text) {
  const themes = [];
  for (const [theme, phrases] of Object.entries(PROBLEM_THEMES)) {
    if (countMatches(text, phrases) > 0) themes.push(theme);
  }
  return themes;
}

// Extracts distinct price points ($29, $99, ...) from a text.
function extractPricePoints(text) {
  const matches = String(text || "").match(PRICE_PATTERN) || [];
  return matches.map((match) => match.replace(/\s/g, ""));
}

// Extracts the sentence that states the offer most strongly: the sentence with
// the most offer, type, price, outcome, and guarantee signals.
function extractOfferSentence(sentences) {
  let best = null;
  let bestHits = 0;
  for (const sentence of sentences) {
    let hits = countMatches(sentence, OFFER_MARKERS)
      + countMatches(sentence, PRICE_LEXICON)
      + countMatches(sentence, OUTCOME_LEXICON)
      + countMatches(sentence, GUARANTEE_LEXICON);
    for (const phrases of Object.values(OFFER_TYPES)) {
      hits += countMatches(sentence, phrases);
    }
    if (hits > bestHits) {
      best = sentence;
      bestHits = hits;
    }
  }
  return best;
}

export function analyzeOfferStrategy({
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
  const briefText = flattenInput(creativeBrief);
  const contextText = flattenInput(campaignContext);
  const groundingText = [briefText, contextText].filter(Boolean).join(" ");
  const combinedText = [groundingText, text].filter(Boolean).join(" ");
  const emptyContent = wordCount === 0;

  // Offer presence and type detection (Rule 1).
  const offerMarkerHits = countMatches(text, OFFER_MARKERS);
  const offerPresent = offerMarkerHits > 0;
  const { counts: offerTypeCounts, types: distinctOfferTypes } = detectOfferTypes(text);
  const mechanismHits = Object.values(offerTypeCounts).reduce((sum, count) => sum + count, 0);

  // Competing offers (Rule 1): three or more distinct offer types, or three or
  // more distinct price points, mean several offers compete.
  const distinctPricePoints = new Set(extractPricePoints(text)).size;
  const competingOffers = distinctOfferTypes.length >= 3 || distinctPricePoints >= 3;

  // Price and components (Rule 5).
  const priceHits = countMatches(text, PRICE_LEXICON) + distinctPricePoints;
  const outcomeHits = countMatches(text, OUTCOME_LEXICON);
  const missingComponents = offerPresent
    ? [
        ...(mechanismHits === 0 ? ["mechanism"] : []),
        ...(outcomeHits === 0 ? ["outcome"] : []),
        ...(priceHits === 0 ? ["price"] : []),
      ]
    : [];
  const missingOfferComponents = offerPresent && missingComponents.includes("mechanism");

  // Value communication (Rule 4): features without outcomes.
  const featureHits = countMatches(text, FEATURE_LEXICON);
  const featuresOverValue = featureHits > 0 && outcomeHits === 0;

  // Complexity (Rule 3).
  const complexityHits = countMatches(text, COMPLEXITY_LEXICON);
  const unnecessaryComplexity = offerPresent && complexityHits > 0;

  // Alignment with the identified customer problem (Rule 2).
  const problemThemes = detectProblemThemes(combinedText);
  const problemIdentified = problemThemes.length > 0;
  const misalignedWithProblem = problemIdentified && offerPresent && outcomeHits === 0 && !featuresOverValue;

  // Unsupported urgency, guarantees, and bonuses (Rule 6).
  const urgencyHits = countMatches(text, URGENCY_LEXICON);
  const guaranteeHits = countMatches(text, GUARANTEE_LEXICON);
  const bonusHits = countMatches(text, BONUS_LEXICON);
  const evidenceHits = countMatches(text, EVIDENCE_LEXICON);
  const unsupportedUrgencyOrGuarantee = (urgencyHits > 0 || guaranteeHits > 0) && evidenceHits === 0;

  // Positioning context: an offer anchored by an explicit market position (or a
  // customer outcome) signals strategic strength.
  const positionHits = Object.values(POSITION_CATEGORIES).reduce(
    (sum, phrases) => sum + countMatches(text, phrases),
    0,
  );

  const dominantOfferType = distinctOfferTypes.length > 0 ? distinctOfferTypes[0] : null;
  const dominantOfferTypeHits = dominantOfferType ? offerTypeCounts[dominantOfferType] : 0;

  const signals = {
    sentenceCount: sentences.length,
    wordCount,
    offerMarkerHits,
    distinctOfferTypeCount: distinctOfferTypes.length,
    offerTypeCounts: { ...offerTypeCounts },
    distinctPricePoints,
    featureHits,
    outcomeHits,
    complexityHits,
    urgencyHits,
    guaranteeHits,
    bonusHits,
    evidenceHits,
    positionHits,
    problemThemes,
  };

  // ── Scoring (each dimension independent, 0-100) ─────────────────────────
  let offerClarity = 100;
  let valueCommunication = 100;
  let simplicity = 100;
  let problemAlignment = 100;
  let strategicStrength = 100;

  if (emptyContent) {
    offerClarity = 50;
    valueCommunication = 50;
    simplicity = 50;
    problemAlignment = 50;
    strategicStrength = 50;
  } else {
    if (!offerPresent) {
      offerClarity -= 85;
      strategicStrength -= 60;
      simplicity -= 40;
      valueCommunication -= 40;
    }
    if (competingOffers) {
      offerClarity -= 40 * (Math.max(distinctOfferTypes.length, 2) - 1);
      strategicStrength -= 30;
      simplicity -= 25;
    }
    if (unnecessaryComplexity) {
      simplicity -= 55;
      offerClarity -= 25;
    }
    if (featuresOverValue) {
      valueCommunication -= 55;
      offerClarity -= 25;
      problemAlignment -= 20;
    }
    if (misalignedWithProblem) {
      problemAlignment -= 60;
      strategicStrength -= 30;
    }
    if (missingOfferComponents) {
      strategicStrength -= 35;
      offerClarity -= 20;
    }
    if (unsupportedUrgencyOrGuarantee) {
      strategicStrength -= 50;
      valueCommunication -= 20;
    }
    if (offerPresent && outcomeHits === 0) valueCommunication -= 30;
    if (offerPresent && positionHits === 0 && outcomeHits === 0) strategicStrength -= 15;
  }

  offerClarity = clamp(offerClarity, 0, 100);
  valueCommunication = clamp(valueCommunication, 0, 100);
  simplicity = clamp(simplicity, 0, 100);
  problemAlignment = clamp(problemAlignment, 0, 100);
  strategicStrength = clamp(strategicStrength, 0, 100);

  const offerScore = Math.round(
    0.3 * offerClarity
    + 0.2 * valueCommunication
    + 0.2 * simplicity
    + 0.2 * problemAlignment
    + 0.1 * strategicStrength,
  );

  // ── Outputs: primary offer ───────────────────────────────────────────────
  const primaryOffer = {
    present: offerPresent,
    statement: extractOfferSentence(sentences),
    type: dominantOfferType,
    components: {
      mechanism: mechanismHits > 0,
      outcome: outcomeHits > 0,
      price: priceHits > 0,
    },
    missingComponents,
  };

  return {
    skillId: OFFER_STRATEGY_SKILL_ID,
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
      offerClarity,
      valueCommunication,
      simplicity,
      problemAlignment,
      strategicStrength,
    },
    primaryOffer,
    offerScore,
    clarityScore: offerClarity,
    valueClarityScore: valueCommunication,
    simplicityScore: simplicity,
    problemAlignmentScore: problemAlignment,
    strengthScore: strategicStrength,
    dominantOffer: dominantOfferType ? {
      type: dominantOfferType,
      hits: dominantOfferTypeHits,
    } : null,
    flags: {
      competingOffers,
      misalignedWithProblem,
      unnecessaryComplexity,
      featuresOverValue,
      missingOfferComponents,
      unsupportedUrgencyOrGuarantee,
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

  // Rule 6 overrides everything: false urgency, fabricated bonuses,
  // unsupported guarantees, and misleading scarcity are rejected.
  if (flags.unsupportedUrgencyOrGuarantee) {
    push(
      "R6",
      "high",
      "Reject the recommendation: never recommend false urgency, fabricated bonuses, unsupported guarantees, or misleading scarcity.",
      "Urgency, scarcity, or guarantee language was detected without supporting evidence.",
    );
    push(
      "R7",
      "high",
      "Preserve creator intent while improving strategic clarity.",
      "The offer must stay honest and grounded, never manufactured.",
    );
    return recommendations;
  }

  if (flags.competingOffers) {
    push(
      "R1",
      "high",
      "Choose one primary offer and present it clearly.",
      `${analysis.signals.distinctOfferTypeCount} offer types or ${analysis.signals.distinctPricePoints} price points compete for attention.`,
    );
  }
  if (flags.misalignedWithProblem) {
    push(
      "R2",
      "medium",
      "Align the offer with the customer problem identified in the brief and context.",
      "The offer is stated, but nothing connects it to the identified customer problem.",
    );
  }
  if (flags.unnecessaryComplexity) {
    push(
      "R3",
      "medium",
      "Simplify the offer so the customer understands it at a glance.",
      "Complex or all-encompassing offer language reduces understanding.",
    );
  }
  if (flags.featuresOverValue) {
    push(
      "R4",
      "medium",
      "Emphasize the customer outcome the offer delivers, not just the features.",
      "The offer value is unclear because features dominate the benefits.",
    );
  }
  if (flags.missingOfferComponents) {
    push(
      "R5",
      "medium",
      "Identify the missing offer elements without inventing content.",
      `The offer does not state what the customer receives${analysis.primaryOffer.missingComponents.length > 1 ? " or its outcome and price" : ""}.`,
    );
  }
  return recommendations;
}

// ── Meaning-preserving offer preservation ────────────────────────────────────
// Offer Strategy is a strategic evaluation: sharpening the offer is a rewrite
// risk, so every improvement is surfaced as a recommendation and the creator's
// copy is never rewritten. preserveOfferStrategy is therefore an identity pass
// that documents that guarantee.

export function preserveOfferStrategy(draftContent) {
  const original = String(draftContent || "").trim();
  return { preservedContent: original, edits: [] };
}

// ── Public skill API ─────────────────────────────────────────────────────────

// Runs the full deterministic Offer Strategy analysis. Accepts the skill inputs
// (creativeBrief, campaignContext, audienceProfile, offerInformation,
// draftContent, contentType, brandVoice) and returns preservedContent, the five
// offer scores, offerScore, primaryOffer, and recommendations.
export function evaluateOfferStrategy(input = {}) {
  const analysis = analyzeOfferStrategy(input);
  const { preservedContent, edits } = preserveOfferStrategy(input.draftContent);
  const recommendations = buildRecommendations(analysis);
  return {
    ...analysis,
    preservedContent,
    edits,
    offerStrategyRecommendations: recommendations,
    recommendations,
  };
}

// AI Twin internal verification — no user-facing changes unless the skill
// determines the offer can be strengthened without fabricating claims or
// changing the creator's intent.
export function verifyOfferStrategy(input = {}) {
  const analysis = analyzeOfferStrategy(input);
  const scores = analysis.scores;
  return {
    skillId: OFFER_STRATEGY_SKILL_ID,
    primaryOfferClear: scores.offerClarity >= 70,
    solvesIdentifiedProblem: scores.problemAlignment >= 70 && !analysis.flags.misalignedWithProblem,
    valueImmediatelyObvious: scores.valueCommunication >= 70,
    offerSimpleToUnderstand: scores.simplicity >= 70,
    customerKnowsWhatTheyReceive: scores.strategicStrength >= 70
      && !analysis.flags.missingOfferComponents
      && !analysis.flags.unsupportedUrgencyOrGuarantee,
    canImproveWithoutChangingIntent: analysis.offerScore < 70,
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
  skillId: OFFER_STRATEGY_SKILL_ID,
  name: "Offer Strategy",
  shortName: "Offer",
  description: "Evaluate and strengthen the strategic structure of an offer: one primary offer that clearly solves the customer's identified problem, communicates value through outcomes, and stays simple to understand — while preserving creator intent and never inventing products, bonuses, guarantees, or scarcity.",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  category: "marketing",
  subcategory: "offer",
  tags: ["offer", "marketing", "strategy", "value", "conversion", "pricing"],
  capabilities: ["offer_strategy"],
  supportedStudios: ["marketing", "video", "audio", "publishing", "workflow", "ai-twin", "agents"],
  dependsOn: ["problem-discovery", "positioning"],
  complements: ["customer-transformation", "call-to-action-strategy"],
  sharedUtilities: ["communication-utils"],
  creativePrinciples: [
    "one-offer: present one primary offer per message",
    "problem-aligned: align the offer with the customer's identified problem",
    "outcome-first: lead with customer outcomes before features",
    "simplicity-preserving: keep the offer easy to understand",
    "honesty-preserving: no false urgency, fabricated bonuses, or unsupported guarantees",
  ],
  vocabulary: [
    { concept: "primary offer", meaning: "the single offer the customer is invited to receive or buy", informs: "message" },
    { concept: "value proposition", meaning: "the outcome the offer delivers for the customer", informs: "message" },
    { concept: "offer component", meaning: "what the customer receives, the outcome, and the price", informs: "structure" },
    { concept: "offer complexity", meaning: "unnecessary breadth that reduces understanding", informs: "structure" },
    { concept: "false urgency", meaning: "manufactured scarcity or pressure that misleads", informs: "message" },
  ],
  craftGuidance: {
    summary: "Present one primary offer that solves the customer's identified problem, communicates value through outcomes, and stays simple.",
    subject: "what the customer is invited to buy, grounded in the Creative Brief, Campaign Context, Problem Discovery, and Positioning",
    composition: "one primary offer, one primary problem, outcomes before features",
    tone: "clear and honest, without manufactured pressure",
    language: "outcomes and value over features and jargon",
    structure: "offer first, then what's included, then the outcome, then the price",
    flow: "from problem to offer to outcome to next step",
  },
  constraints: [
    "never invent products",
    "never invent bonuses",
    "never recommend deceptive scarcity",
    "never fabricate guarantees",
    "never change factual meaning",
    "never override creator intent",
    "present one primary offer",
  ],
  evaluationRules: [
    { quality: "offerClarity", signal: "one clear primary offer is identifiable", evidence: "offer type and price-point counts" },
    { quality: "valueCommunication", signal: "value is stated as customer outcomes", evidence: "outcome versus feature language counts" },
    { quality: "simplicity", signal: "the offer is free of unnecessary complexity", evidence: "complexity lexicon hits" },
    { quality: "problemAlignment", signal: "the offer clearly solves the identified customer problem", evidence: "problem theme and outcome presence" },
    { quality: "strategicStrength", signal: "the offer is complete, positioned, and honest", evidence: "offer component and claim detection" },
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
    { id: "R1", if: "multiple competing offers exist", then: "recommend one primary offer", else: "keep the single offer focus", confidence: 1 },
    { id: "R2", if: "the offer does not clearly solve the identified customer problem", then: "recommend stronger alignment", else: "keep the aligned offer", confidence: 1 },
    { id: "R3", if: "unnecessary complexity reduces understanding", then: "recommend simplification", else: "keep the current simplicity", confidence: 1 },
    { id: "R4", if: "the value proposition is unclear", then: "recommend emphasizing customer outcomes rather than features", else: "keep the outcome-led value", confidence: 1 },
    { id: "R5", if: "important offer elements are missing", then: "identify them without inventing content", else: "keep the complete offer", confidence: 1 },
    { id: "R6", if: "false urgency, fabricated bonuses, unsupported guarantees, or misleading scarcity would be introduced", then: "never recommend them; reject the modification", else: "proceed with honest offers only", confidence: 1 },
    { id: "R7", if: "offer clarity and creator intent conflict", then: "preserve creator intent while improving strategic clarity", else: "proceed", confidence: 1 },
  ],
  knowledge: {
    bestPractices: [
      "Present one primary offer per message.",
      "Align the offer with the customer's primary problem.",
      "Lead with outcomes before features.",
      "Keep the offer easy to understand.",
      "Never use false urgency, fabricated bonuses, or unsupported guarantees.",
    ],
    writingGuidance: [
      "State exactly what the customer receives.",
      "Name the outcome the offer delivers.",
      "Keep the offer simple and specific.",
      "Never invent bonuses or guarantees.",
    ],
    businessGuidance: [
      "A clear offer converts; a complex one confuses.",
      "Value is communicated by outcomes, not feature lists.",
    ],
    qualityGuidance: [
      "No products, bonuses, or guarantees are ever invented.",
      "Factual meaning and creator intent are never altered.",
    ],
    optimizationGuidance: [
      "When Offer Clarity is low, reduce competing offers to one primary offer.",
      "Re-run evaluation after edits to confirm a simple, aligned offer remains.",
    ],
  },
  workflow: {
    requiredInputs: ["creativeBrief", "campaignContext"],
    optionalInputs: ["draftContent", "contentType", "audienceProfile", "offerInformation", "brandVoice"],
    inferredInputs: ["contentType"],
    phases: [
      { phase: "analyze", description: "deterministically score the offer across clarity, value, simplicity, alignment, and strategic strength" },
      { phase: "preserve", description: "never auto-rewrite; offer improvements are surfaced as recommendations only" },
      { phase: "recommend", description: "return ordered recommendations for the Creative Intelligence Engine to apply without inventing content" },
    ],
    completionCriteria: [
      "offer scores returned for all five dimensions",
      "preservedContent is byte-identical to the input; no automatic rewrites",
      "recommendations never invent products, bonuses, guarantees, or scarcity",
    ],
  },
  validation: {
    requiredAssets: [],
    missingContext: {
      creativeBrief: "the creative brief that states the campaign goal and subject",
      campaignContext: "the campaign context that grounds the offer",
    },
    unsupportedRequests: [
      "requests to invent products",
      "requests to invent bonuses",
      "requests to recommend deceptive scarcity",
      "requests to fabricate guarantees",
    ],
    qualityGates: [
      "no offer invented",
      "no bonuses fabricated",
      "no false urgency recommended",
    ],
  },
  aiTwin: {
    internallyVerifies: [
      "what is the primary offer?",
      "does it solve the identified customer problem?",
      "is the value immediately obvious?",
      "is the offer simple to understand?",
      "would a customer know exactly what they are receiving?",
    ],
    userVisible: "no user-facing changes unless the skill determines the offer can be strengthened without fabricating claims or changing the creator's intent",
  },
  creativeIntelligence: {
    recommendWhen: [
      "multiple offers compete in the content",
      "the offer value is unclear or feature-heavy",
      "the offer does not clearly solve the identified customer problem",
      "unnecessary complexity reduces understanding",
      "urgency, guarantees, or bonuses appear without support",
    ],
    avoidWhen: [
      "the pricing and offer structure are externally fixed",
      "the format requires a multi-offer roundup",
      "the brief forbids changing the offer",
    ],
    reasoning: "fit-first: recommend when the request targets the strategic structure of the offer, not when the offer is externally fixed",
  },
};
