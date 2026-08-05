// Approved Creative Skill Pack V1 — Customer Transformation.
// Foundational Marketing skill for Creative OS.
// Produced by the Knowledge Compiler and reviewed by the MavenSync team.
//
// This skill evaluates and strengthens the transformation narrative of content:
// the customer's journey from a current struggle to a desired outcome, carried
// by the offer — while preserving creator intent and never inventing struggles,
// outcomes, unrealistic guarantees, or life-changing claims. It is shared
// platform intelligence, available to every studio. It is not a recipe, a
// provider, a studio, or an agent.
//
// The default export is the registered Skill Manifest (the Creative Skills
// Registry reads only the manifest). The named exports are the deterministic
// analysis implementation: evaluateCustomerTransformation() runs the seven
// decision rules and the five transformation scores, and
// verifyCustomerTransformation() exposes the AI Twin's five internal checks.
// No provider, recipe, or studio logic is touched. This is the fourth skill in
// the Marketing Skill Pack: Problem Discovery identifies the problem, Positioning
// sets the frame, Offer Strategy designs the offer, and Customer Transformation
// evaluates how the content moves the customer from their current state to the
// desired outcome the offer delivers. Call to Action Strategy (the next step)
// completes the pack core.

import { splitIntoSentences, tokenizeWords, countMatches, clamp } from "./communication-utils.js";
import { PROBLEM_THEMES } from "./problem-discovery.js";
import { POSITION_CATEGORIES } from "./positioning.js";
import { OFFER_MARKERS, OUTCOME_LEXICON, FEATURE_LEXICON } from "./offer-strategy.js";

export const CUSTOMER_TRANSFORMATION_SKILL_ID = "customer-transformation";

// ── Deterministic lexicons and thresholds ────────────────────────────────────
// Current-state markers: language that places the customer in their starting
// struggle before the outcome (Rule 3, current state definition). Exported so
// dependent skills (Call to Action Strategy) align the next step with the same
// transformation vocabulary.
export const CURRENT_STATE_MARKERS = [
  "problem", "problems", "frustrated", "frustrating", "frustration",
  "struggle", "struggles", "struggling", "pain point", "pain points",
  "waste", "wastes", "wasting", "takes too long", "too long", "too slow",
  "too hard", "hard to", "difficult", "can't", "cannot", "unable",
  "tired of", "sick of", "overwhelmed", "burnt out", "burned out",
  "battle", "battling", "challenge", "challenges", "issue", "issues",
  "annoying", "tedious", "currently", "right now",
];

// Desired-state markers: language that points to the outcome the customer
// wants once the problem is solved (Rules 2 and 4). Exported so dependent
// skills (Call to Action Strategy) share the same outcome vocabulary.
export const DESIRED_STATE_MARKERS = [
  "imagine", "imagine if", "imagine being", "imagine a", "what if",
  "picture", "envision", "you'll finally", "you will finally", "finally",
  "so you can", "so that you can", "which means", "that means",
  "you'll have", "you will have", "you'll be", "you will be",
  "become", "become a", "achieve", "achieve your", "goal", "goals",
  "dream", "dreams", "no more", "instead of", "the day you",
  "look forward to", "want to feel", "finally have", "get to",
  "once you", "once you're", "once you are",
];

// Transformation bridge markers: language that connects the current struggle
// to the desired outcome (transformation presence).
const BRIDGE_MARKERS = [
  "instead of", "no more", "so you can", "so that", "which means",
  "that means", "turn your", "turns your", "turning", "go from",
  "goes from", "going from", "take you from", "takes you from",
  "move from", "moves from", "shift from", "leave behind",
  "break free", "break free from", "swap", "replace the", "replaces the",
];

// Unrealistic claim language: guarantees and promises the transformation can
// never honestly support (Rule 6). Life-changing claims, guaranteed results,
// and overnight outcomes are rejected outright. Exported so dependent skills
// (Call to Action Strategy) reject the same deceptive pressure.
export const UNREALISTIC_CLAIM_LEXICON = [
  "change your life", "changes your life", "life-changing", "life changing",
  "completely transform", "totally transform", "get rich", "make you rich",
  "six figures in", "6 figures in", "overnight success", "instant results",
  "guaranteed results", "results guaranteed", "guaranteed to",
  "100% guarantee", "money back guarantee", "money-back guarantee",
  "unlimited income", "effortless income", "automatic income", "miracle",
  "secret formula", "no risk at all", "double your income",
  "triple your income", "only way to", "guarantee you'll",
  "guarantee you will", "become a millionaire", "quit your job tomorrow",
  "results in 30 days", "results in 24 hours",
];

// Customer terms: language that keeps the transformation anchored in the
// audience's world rather than the product's (outcome relevance).
const CUSTOMER_TERMS = [
  "you", "your", "yours", "you'll", "you will", "customer", "customers",
  "audience", "users", "clients", "people", "prospects", "they", "their",
  "subscribers", "members",
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

// Detects which customer problem themes a text expresses, reusing the same
// vocabulary as Problem Discovery so the current state stays consistent with
// the identified problem.
function detectProblemThemes(text) {
  const themes = {};
  for (const [theme, phrases] of Object.entries(PROBLEM_THEMES)) {
    const hits = countMatches(text, phrases);
    if (hits > 0) themes[theme] = hits;
  }
  return themes;
}

// Picks the sentence that states a signal most strongly, returning null when
// no sentence carries any signal.
function extractSentence(sentences, lexicon, extraHits) {
  let best = null;
  let bestHits = 0;
  for (const sentence of sentences) {
    let hits = countMatches(sentence, lexicon) + (extraHits ? extraHits(sentence) : 0);
    if (hits > bestHits) {
      best = sentence;
      bestHits = hits;
    }
  }
  return best;
}

export function analyzeCustomerTransformation({
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
  const hasGrounding = Boolean(groundingText.trim());
  const combinedText = [groundingText, text].filter(Boolean).join(" ");
  const emptyContent = wordCount === 0;

  // Current state: the customer's starting struggle, aligned with the same
  // problem themes Problem Discovery recognizes.
  const problemThemeCounts = detectProblemThemes(text);
  const problemThemeHits = Object.values(problemThemeCounts).reduce((sum, count) => sum + count, 0);
  const currentStateMarkerHits = countMatches(text, CURRENT_STATE_MARKERS);
  const currentThemes = Object.keys(problemThemeCounts).sort(
    (a, b) => problemThemeCounts[b] - problemThemeCounts[a],
  );

  // Desired state: the outcome the customer wants once the problem is solved.
  const desiredStateMarkerHits = countMatches(text, DESIRED_STATE_MARKERS);
  const outcomeHits = countMatches(text, OUTCOME_LEXICON);

  // Current and desired states are detected per sentence so a phrase such as
  // "saving hours every week" is read as the outcome, not as a current
  // struggle, even when it echoes problem-theme vocabulary. A sentence states
  // the current state when its struggle language dominates; it states the
  // desired state when its outcome language dominates.
  const problemThemePhrases = Object.values(PROBLEM_THEMES).flat();
  const allCurrentLexicon = [...CURRENT_STATE_MARKERS, ...problemThemePhrases];
  const allDesiredLexicon = [...DESIRED_STATE_MARKERS, ...OUTCOME_LEXICON];
  let currentStatePresent = false;
  let futureStatePresent = false;
  for (const sentence of sentences) {
    const currentHits = countMatches(sentence, allCurrentLexicon);
    const desiredHits = countMatches(sentence, allDesiredLexicon);
    if (currentHits > 0 && currentHits >= desiredHits) currentStatePresent = true;
    if (desiredHits > 0 && desiredHits > currentHits) futureStatePresent = true;
  }
  if (outcomeHits > 0) futureStatePresent = true;

  // Transformation presence: both a starting point and a destination.
  const bridgeHits = countMatches(text, BRIDGE_MARKERS);
  const transformationPresent = currentStatePresent && futureStatePresent;

  // Offer connection (Rule 4): an offer that carries the transformation states
  // outcomes and bridges the current state to the desired state. An offer with
  // no outcome and no bridge is disconnected from any transformation narrative.
  const offerMarkerHits = countMatches(text, OFFER_MARKERS);
  const offerPresent = offerMarkerHits > 0;
  const disconnectedOffer = offerPresent && outcomeHits === 0 && bridgeHits === 0;

  // Features replacing the transformation (Rule 5).
  const featureHits = countMatches(text, FEATURE_LEXICON);
  const featuresOverOutcomes = featureHits > 0 && outcomeHits === 0;

  // Unrealistic guarantees, life-changing claims, and unsupported outcomes
  // (Rule 6).
  const unrealisticClaimHits = countMatches(text, UNREALISTIC_CLAIM_LEXICON);
  const unrealisticClaims = unrealisticClaimHits > 0;

  // Positioning context: a transformation anchored by an explicit market
  // position signals strategic strength.
  const positionHits = Object.values(POSITION_CATEGORIES).reduce(
    (sum, phrases) => sum + countMatches(text, phrases),
    0,
  );

  const customerHits = countMatches(text, CUSTOMER_TERMS);

  const signals = {
    sentenceCount: sentences.length,
    wordCount,
    currentStateMarkerHits,
    problemThemeHits,
    desiredStateMarkerHits,
    outcomeHits,
    bridgeHits,
    offerMarkerHits,
    featureHits,
    unrealisticClaimHits,
    positionHits,
    customerHits,
    currentThemes,
    hasGrounding,
  };

  // ── Scoring (each dimension independent, 0-100) ─────────────────────────
  let transformationClarity = 100;
  let currentStateDefinition = 100;
  let futureStateDefinition = 100;
  let offerAlignment = 100;
  let outcomeRelevance = 100;

  if (emptyContent) {
    transformationClarity = 50;
    currentStateDefinition = 50;
    futureStateDefinition = 50;
    offerAlignment = 50;
    outcomeRelevance = 50;
  } else {
    if (!transformationPresent) transformationClarity -= 80;
    if (disconnectedOffer) {
      transformationClarity -= 30;
      offerAlignment -= 60;
    }
    if (featuresOverOutcomes) {
      transformationClarity -= 15;
      outcomeRelevance -= 40;
    }
    if (unrealisticClaims) {
      transformationClarity -= 85;
      outcomeRelevance -= 75;
      futureStateDefinition -= 50;
    }
    if (!currentStatePresent) currentStateDefinition -= 80;
    else if (problemThemeHits === 0) currentStateDefinition -= 25;
    if (!futureStatePresent) futureStateDefinition -= 80;
    else if (outcomeHits === 0) futureStateDefinition -= 30;
    if (!offerPresent) offerAlignment -= 45;
    else if (outcomeHits === 0) offerAlignment -= 30;
    if (offerPresent && positionHits === 0 && outcomeHits === 0) offerAlignment -= 15;
    if (outcomeHits === 0) outcomeRelevance -= 60;
    if (outcomeHits > 0 && customerHits === 0) outcomeRelevance -= 15;
  }

  transformationClarity = clamp(transformationClarity, 0, 100);
  currentStateDefinition = clamp(currentStateDefinition, 0, 100);
  futureStateDefinition = clamp(futureStateDefinition, 0, 100);
  offerAlignment = clamp(offerAlignment, 0, 100);
  outcomeRelevance = clamp(outcomeRelevance, 0, 100);

  const transformationScore = Math.round(
    0.25 * transformationClarity
    + 0.2 * currentStateDefinition
    + 0.2 * futureStateDefinition
    + 0.2 * offerAlignment
    + 0.15 * outcomeRelevance,
  );

  // ── Outputs: current state, desired state, transformation statement ─────
  const currentState = {
    present: currentStatePresent,
    markerHits: currentStateMarkerHits,
    themeHits: problemThemeHits,
    themes: currentThemes,
    statement: currentStatePresent
      ? extractSentence(
          sentences,
          CURRENT_STATE_MARKERS,
          (sentence) => countMatches(sentence, Object.values(PROBLEM_THEMES).flat()),
        )
      : null,
  };

  const desiredState = {
    present: futureStatePresent,
    markerHits: desiredStateMarkerHits,
    outcomeHits,
    statement: futureStatePresent
      ? extractSentence(sentences, DESIRED_STATE_MARKERS, (sentence) => countMatches(sentence, OUTCOME_LEXICON))
      : null,
  };

  const transformationStatement = transformationPresent
    ? extractSentence(
        sentences,
        CURRENT_STATE_MARKERS.concat(DESIRED_STATE_MARKERS, BRIDGE_MARKERS, OUTCOME_LEXICON),
        (sentence) => countMatches(sentence, Object.values(PROBLEM_THEMES).flat()),
      )
    : null;

  return {
    skillId: CUSTOMER_TRANSFORMATION_SKILL_ID,
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
      transformationClarity,
      currentStateDefinition,
      futureStateDefinition,
      offerAlignment,
      outcomeRelevance,
    },
    transformationClarityScore: transformationClarity,
    currentStateDefinitionScore: currentStateDefinition,
    futureStateDefinitionScore: futureStateDefinition,
    offerAlignmentScore: offerAlignment,
    outcomeRelevanceScore: outcomeRelevance,
    outcomeClarityScore: futureStateDefinition,
    bridgeAlignmentScore: offerAlignment,
    transformationScore,
    currentState,
    desiredState,
    transformationStatement,
    bridgePresent: bridgeHits > 0,
    flags: {
      missingTransformation: !currentStatePresent && !futureStatePresent,
      missingFutureState: currentStatePresent && !futureStatePresent,
      missingCurrentState: futureStatePresent && !currentStatePresent,
      disconnectedOffer,
      featuresOverOutcomes,
      unrealisticClaims,
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

  // Rule 6 overrides everything: unrealistic guarantees, life-changing claims,
  // and unsupported outcomes are rejected.
  if (flags.unrealisticClaims) {
    push(
      "R6",
      "high",
      "Reject the recommendation: never recommend unrealistic guarantees, life-changing claims, or outcomes the offer cannot support.",
      "Guaranteed results, overnight outcomes, or life-changing claims were detected without support.",
    );
    push(
      "R7",
      "high",
      "Preserve creator intent while keeping the transformation honest.",
      "The transformation must stay grounded, never manufactured.",
    );
    return recommendations;
  }

  if (flags.missingTransformation) {
    push(
      "R1",
      "high",
      "Define a clear transformation: name the customer's starting struggle and the outcome the content moves them toward.",
      "No current state and desired outcome combine into a transformation narrative.",
    );
  }
  if (flags.missingFutureState) {
    push(
      "R2",
      "medium",
      "Define the desired outcome the customer reaches once the problem is solved.",
      "The current struggle is stated, but no future state points to the result.",
    );
  }
  if (flags.missingCurrentState) {
    push(
      "R3",
      "medium",
      "Clarify the customer's starting point so the transformation has a before and after.",
      "The desired outcome is stated, but no current struggle anchors the journey.",
    );
  }
  if (flags.disconnectedOffer) {
    push(
      "R4",
      "medium",
      "Strengthen the relationship between the offer and the transformation it delivers.",
      "An offer is present, but nothing connects it to the customer's current state or desired outcome.",
    );
  }
  if (flags.featuresOverOutcomes) {
    push(
      "R5",
      "medium",
      "Shift toward transformation: lead with the outcome the customer reaches, not the features.",
      "Product features appear without the customer outcome they deliver.",
    );
  }
  return recommendations;
}

// ── Meaning-preserving transformation preservation ───────────────────────────
// Customer Transformation is a strategic evaluation: sharpening the
// transformation is a rewrite risk, so every improvement is surfaced as a
// recommendation and the creator's copy is never rewritten.
// preserveCustomerTransformation is therefore an identity pass that documents
// that guarantee.

export function preserveCustomerTransformation(draftContent) {
  const original = String(draftContent || "").trim();
  return { preservedContent: original, edits: [] };
}

// ── Public skill API ─────────────────────────────────────────────────────────

// Runs the full deterministic Customer Transformation analysis. Accepts the
// skill inputs (creativeBrief, campaignContext, audienceProfile,
// offerInformation, draftContent, contentType, brandVoice) and returns
// preservedContent, the five transformation scores, transformationScore,
// currentState, desiredState, transformationStatement, and recommendations.
export function evaluateCustomerTransformation(input = {}) {
  const analysis = analyzeCustomerTransformation(input);
  const { preservedContent, edits } = preserveCustomerTransformation(input.draftContent);
  const recommendations = buildRecommendations(analysis);
  return {
    ...analysis,
    preservedContent,
    edits,
    customerTransformationRecommendations: recommendations,
    recommendations,
  };
}

// AI Twin internal verification — no user-facing changes unless the skill
// determines the transformation can be sharpened without inventing struggles or
// outcomes, making unrealistic claims, or changing the creator's intent.
export function verifyCustomerTransformation(input = {}) {
  const analysis = analyzeCustomerTransformation(input);
  const scores = analysis.scores;
  return {
    skillId: CUSTOMER_TRANSFORMATION_SKILL_ID,
    transformationClear: scores.transformationClarity >= 70,
    currentStateDefined: scores.currentStateDefinition >= 70,
    desiredOutcomeDefined: scores.futureStateDefinition >= 70,
    offerSupportsTransformation: scores.offerAlignment >= 70 && !analysis.flags.disconnectedOffer,
    transformationRealistic: scores.outcomeRelevance >= 70 && !analysis.flags.unrealisticClaims,
    canImproveWithoutChangingIntent: analysis.transformationScore < 70,
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
  skillId: CUSTOMER_TRANSFORMATION_SKILL_ID,
  name: "Customer Transformation",
  shortName: "Transformation",
  description: "Evaluate and strengthen the transformation narrative of content: the customer's journey from a current struggle to a desired outcome, carried by the offer — while preserving creator intent and never inventing struggles, outcomes, unrealistic guarantees, or life-changing claims.",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  category: "marketing",
  subcategory: "transformation",
  tags: ["transformation", "marketing", "strategy", "outcome", "story", "customer"],
  capabilities: ["customer_transformation"],
  supportedStudios: ["marketing", "publishing", "ai-twin", "workflow", "video", "audio"],
  dependsOn: ["problem-discovery", "positioning", "offer-strategy"],
  complements: ["call-to-action-strategy"],
  sharedUtilities: ["communication-utils"],
  creativePrinciples: [
    "transformation-first: frame content as a journey from a current struggle to a desired outcome",
    "current-state-grounded: define the customer's starting point before the outcome",
    "future-state-clear: state the desired outcome in concrete customer terms",
    "offer-connected: connect the offer to the transformation it delivers",
    "honesty-preserving: no unrealistic guarantees, life-changing claims, or unsupported outcomes",
  ],
  vocabulary: [
    { concept: "current state", meaning: "the customer's starting struggle before the transformation", informs: "message" },
    { concept: "desired state", meaning: "the outcome the customer reaches once the problem is solved", informs: "message" },
    { concept: "transformation statement", meaning: "the before-and-after narrative the content carries", informs: "message" },
    { concept: "bridge", meaning: "the connection between the current struggle and the desired outcome", informs: "structure" },
    { concept: "unrealistic claim", meaning: "a guarantee or promise the transformation cannot honestly support", informs: "message" },
  ],
  craftGuidance: {
    summary: "Frame content as the customer's journey from a current struggle to a desired outcome, carried by the offer.",
    subject: "the customer's transformation, grounded in the Creative Brief, Campaign Context, Problem Discovery, Positioning, and Offer Strategy",
    composition: "current state first, then the bridge, then the desired outcome, then the offer",
    tone: "hopeful and honest, without manufactured promise",
    language: "customer outcomes and before-and-after language over features",
    structure: "struggle, then change, then outcome, then the offer that delivers it",
    flow: "from the customer's present to their future, carried by the offer",
  },
  constraints: [
    "never invent a customer struggle",
    "never invent a customer outcome",
    "never recommend unrealistic guarantees or life-changing claims",
    "never recommend outcomes the offer cannot support",
    "never change factual meaning",
    "never override creator intent",
  ],
  evaluationRules: [
    { quality: "transformationClarity", signal: "a clear current-state-to-desired-state transformation is identifiable", evidence: "current, future, and bridge language counts" },
    { quality: "currentStateDefinition", signal: "the customer's starting struggle is clearly defined", evidence: "problem theme and current-state marker counts" },
    { quality: "futureStateDefinition", signal: "the desired outcome is clearly stated in customer terms", evidence: "desired-state marker and outcome counts" },
    { quality: "offerAlignment", signal: "the offer is connected to the transformation it delivers", evidence: "offer, outcome, and bridge presence" },
    { quality: "outcomeRelevance", signal: "the outcomes are customer-relevant, concrete, and realistic", evidence: "outcome, customer, and unrealistic-claim counts" },
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
    { id: "R1", if: "no current-to-desired transformation narrative exists", then: "recommend defining one", else: "keep the transformation focus", confidence: 1 },
    { id: "R2", if: "the current struggle is stated without a desired outcome", then: "recommend defining the desired future state", else: "keep the stated outcome", confidence: 1 },
    { id: "R3", if: "the desired outcome is stated without a current struggle", then: "recommend clarifying the starting point", else: "keep the stated starting point", confidence: 1 },
    { id: "R4", if: "an offer appears disconnected from the transformation", then: "recommend strengthening the relationship", else: "keep the connected offer", confidence: 1 },
    { id: "R5", if: "features replace the customer outcome", then: "recommend shifting toward the transformation", else: "keep the outcome-led narrative", confidence: 1 },
    { id: "R6", if: "unrealistic guarantees, life-changing claims, or unsupported outcomes would be introduced", then: "never recommend them; reject the modification", else: "proceed with honest transformations only", confidence: 1 },
    { id: "R7", if: "the transformation narrative and creator intent conflict", then: "preserve creator intent while keeping the transformation honest", else: "proceed", confidence: 1 },
  ],
  knowledge: {
    bestPractices: [
      "Name the customer's current struggle before the desired outcome.",
      "State the desired outcome in concrete customer terms.",
      "Connect the offer to the transformation it delivers.",
      "Keep the before-and-after journey honest and supported.",
      "Never use unrealistic guarantees, life-changing claims, or unsupported outcomes.",
    ],
    writingGuidance: [
      "Open with the customer's starting point, then the change, then the outcome.",
      "Bridge the struggle to the outcome so the audience recognizes itself.",
      "Anchor the transformation in the offer that delivers it.",
      "Never promise results the offer cannot honestly support.",
    ],
    businessGuidance: [
      "A clear transformation makes the offer meaningful; features alone do not.",
      "Honest before-and-after narratives build trust and convert.",
    ],
    qualityGuidance: [
      "No struggles or outcomes are ever invented.",
      "No unrealistic guarantees or life-changing claims are ever recommended.",
      "Factual meaning and creator intent are never altered.",
    ],
    optimizationGuidance: [
      "When Transformation Clarity is low, complete the journey: struggle, bridge, outcome.",
      "Re-run evaluation after edits to confirm an honest, offer-connected transformation remains.",
    ],
  },
  workflow: {
    requiredInputs: ["creativeBrief", "campaignContext"],
    optionalInputs: ["draftContent", "contentType", "audienceProfile", "offerInformation", "brandVoice"],
    inferredInputs: ["contentType"],
    phases: [
      { phase: "analyze", description: "deterministically score the transformation across clarity, current state, future state, offer alignment, and outcome relevance" },
      { phase: "preserve", description: "never auto-rewrite; transformation improvements are surfaced as recommendations only" },
      { phase: "recommend", description: "return ordered recommendations for the Creative Intelligence Engine to apply without inventing struggles, outcomes, or claims" },
    ],
    completionCriteria: [
      "transformation scores returned for all five dimensions",
      "preservedContent is byte-identical to the input; no automatic rewrites",
      "recommendations never invent struggles, outcomes, guarantees, or life-changing claims",
    ],
  },
  validation: {
    requiredAssets: [],
    missingContext: {
      creativeBrief: "the creative brief that states the campaign goal and subject",
      campaignContext: "the campaign context that grounds the transformation",
    },
    unsupportedRequests: [
      "requests to invent a customer struggle",
      "requests to invent a customer outcome",
      "requests to recommend unrealistic guarantees",
      "requests to recommend life-changing claims",
      "requests to promise outcomes the offer cannot support",
    ],
    qualityGates: [
      "no struggle invented",
      "no outcome invented",
      "no unrealistic guarantee recommended",
    ],
  },
  aiTwin: {
    internallyVerifies: [
      "is the transformation narrative clear?",
      "is the customer's current state defined?",
      "is the desired outcome defined?",
      "does the offer support the transformation?",
      "is the transformation realistic and honest?",
    ],
    userVisible: "no user-facing changes unless the skill determines the transformation can be sharpened without inventing struggles or outcomes, making unrealistic claims, or changing the creator's intent",
  },
  creativeIntelligence: {
    recommendWhen: [
      "the content states outcomes or features without a transformation narrative",
      "the current struggle is stated without a desired outcome",
      "the desired outcome is stated without a current struggle",
      "the offer appears disconnected from the transformation it should deliver",
      "features replace the customer outcome",
    ],
    avoidWhen: [
      "the format requires only a call to action with no narrative",
      "the request requires the message to remain deliberately ambiguous",
      "the transformation is externally fixed and cannot be changed",
    ],
    reasoning: "fit-first: recommend when the request targets the customer's before-and-after journey, not when the transformation is externally fixed",
  },
};
