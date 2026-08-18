// Approved Creative Skill Pack V1 — Call to Action Strategy.
// Foundational Marketing skill for Creative OS.
// Produced by the Knowledge Compiler and reviewed by the MavenSync team.
//
// This skill evaluates whether content presents one clear, appropriate, and
// strategically aligned next action for the customer: the primary call to
// action, its clarity, its alignment with the offer and the customer's
// transformation, and the level of commitment it asks for — while preserving
// creator intent and never inventing offers, recommending deceptive urgency,
// fabricating scarcity, or manipulating decisions. It evaluates decision
// pathways, not copywriting. It is shared platform intelligence, available to
// every studio. It is not a recipe, a provider, a studio, or an agent.
//
// The default export is the registered Skill Manifest (the Creative Skills
// Registry reads only the manifest). The named exports are the deterministic
// analysis implementation: evaluateCallToActionStrategy() runs the seven
// decision rules and the five CTA scores, and verifyCallToActionStrategy()
// exposes the AI Twin's five internal checks. No provider, recipe, or studio
// logic is touched. This is the fifth and final skill in the Marketing Core
// Skill Pack: Problem Discovery identifies the problem, Positioning sets the
// frame, Offer Strategy designs the offer, Customer Transformation shapes the
// change, and Call to Action Strategy determines the most appropriate next
// step for the customer.

import { splitIntoSentences, tokenizeWords, countMatches, clamp } from "./communication-utils.js";
import { PROBLEM_THEMES } from "./problem-discovery.js";
import { OFFER_MARKERS, OUTCOME_LEXICON, URGENCY_LEXICON } from "./offer-strategy.js";
import {
  CURRENT_STATE_MARKERS,
  DESIRED_STATE_MARKERS,
  UNREALISTIC_CLAIM_LEXICON,
} from "./customer-transformation.js";

export const CALL_TO_ACTION_STRATEGY_SKILL_ID = "call-to-action-strategy";

// ── Deterministic lexicons and thresholds ────────────────────────────────────
// Call to action types: the action the customer is invited to take. Each type
// carries a commitment tier used to judge whether the ask matches what the
// content has earned (Rule 4).
export const CTA_TYPES = {
  purchase: {
    phrases: [
      "buy now", "buy today", "order now", "order today", "shop now",
      "shop today", "add to cart", "checkout now", "checkout", "buy the",
      "purchase now",
    ],
    commitment: "high",
  },
  join: {
    phrases: [
      "join now", "join today", "join the", "enroll now", "enroll today",
      "enroll", "get instant access", "become a member", "sign up for the",
      "sign up for our",
    ],
    commitment: "high",
  },
  register: {
    phrases: [
      "register now", "register today", "register for", "reserve your spot",
      "book now", "book your seat", "claim your spot", "secure your spot",
      "rsvp",
    ],
    commitment: "medium",
  },
  trial: {
    phrases: [
      "start free trial", "start your free trial", "try free", "try it free",
      "try it now", "try for free", "start your free",
    ],
    commitment: "medium",
  },
  download: {
    phrases: [
      "download now", "download the", "download your", "download our",
      "get the free", "grab the", "grab your",
    ],
    commitment: "low",
  },
  subscribe: {
    phrases: [
      "subscribe now", "subscribe to my", "subscribe to our",
      "sign up for the newsletter", "join my newsletter", "join our newsletter",
      "get the newsletter",
    ],
    commitment: "low",
  },
  contact: {
    phrases: [
      "contact us", "get in touch", "dm me", "dm us", "message me",
      "call now", "call today", "book a call", "schedule a call",
      "request a quote", "request a demo", "book a demo",
    ],
    commitment: "low",
  },
  learn: {
    phrases: [
      "learn more", "read more", "watch now", "watch the", "listen now",
      "see the", "find out more", "click here", "check it out", "keep reading",
      "see how", "link in bio", "link in the description",
    ],
    commitment: "low",
  },
};

// Vague or passive call to action language (Rule 5): invitations that leave
// the customer unsure what specific action to take.
const VAGUE_LEXICON = [
  "if you're interested", "if you are interested", "if you'd like",
  "if you would like", "if you want to", "let me know", "maybe check out",
  "feel free to", "whenever you're ready", "whenever you are ready",
  "up to you", "you can also", "interested parties", "reach out if",
  "keep in mind", "perhaps", "consider trying",
];

// General call to action markers: any direct invitation to take a next step,
// combining the typed actions with a few generic imperative openings and the
// vague invitations (a vague ask is still an ask, just a poor one).
const CTA_MARKERS = [...new Set([
  ...Object.values(CTA_TYPES).flatMap((type) => type.phrases),
  ...VAGUE_LEXICON,
  "sign up", "start now", "start today", "take action", "act today",
  "do it now", "get started", "let's do it", "let's get started",
  "click the link", "tap the link", "head over", "check out",
])];

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

// Detects which call to action types a text claims. Returns per-type hit counts
// and the types ordered by prominence.
function detectCtaTypes(text) {
  const counts = {};
  for (const [type, config] of Object.entries(CTA_TYPES)) {
    const hits = countMatches(text, config.phrases);
    if (hits > 0) counts[type] = hits;
  }
  const types = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  return { counts, types };
}

// Extracts the sentence that states the call to action most strongly.
function extractCtaSentence(sentences) {
  const allTypePhrases = Object.values(CTA_TYPES).flatMap((config) => config.phrases);
  let best = null;
  let bestHits = 0;
  for (const sentence of sentences) {
    const hits = countMatches(sentence, allTypePhrases) + countMatches(sentence, CTA_MARKERS);
    if (hits > bestHits) {
      best = sentence;
      bestHits = hits;
    }
  }
  return best;
}

export function analyzeCallToActionStrategy({
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
  const emptyContent = wordCount === 0;

  // The customer's transformation journey, reusing the same current-state and
  // desired-state vocabulary as Customer Transformation.
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
  const outcomeHits = countMatches(text, OUTCOME_LEXICON);
  if (outcomeHits > 0) futureStatePresent = true;
  const transformationPresent = currentStatePresent && futureStatePresent;

  // Offer presence, reusing Offer Strategy's offer and outcome vocabulary.
  const offerMarkerHits = countMatches(text, OFFER_MARKERS);
  const offerPresent = offerMarkerHits > 0;

  // Call to action presence, types, and competition.
  const { counts: ctaTypeCounts, types: distinctCtaTypes } = detectCtaTypes(text);
  const specificCtaHits = Object.values(ctaTypeCounts).reduce((sum, count) => sum + count, 0);
  const ctaMarkerHits = countMatches(text, CTA_MARKERS);
  const ctaPresent = ctaMarkerHits > 0 || specificCtaHits > 0;
  const competingCtas = distinctCtaTypes.length >= 3;
  const vagueHits = countMatches(text, VAGUE_LEXICON);
  const vagueCta = ctaPresent && vagueHits > 0 && specificCtaHits === 0;

  const dominantCtaType = distinctCtaTypes.length > 0 ? distinctCtaTypes[0] : null;
  const dominantCtaCommitment = dominantCtaType ? CTA_TYPES[dominantCtaType].commitment : null;
  const highCommitmentCta = dominantCtaCommitment === "high";

  // Rule 3 — the CTA must naturally follow the identified transformation.
  const misalignedCta = ctaPresent && transformationPresent && outcomeHits === 0;

  // Rule 4 — the CTA must not ask for more commitment than the content earned.
  const earnedFoundation = offerPresent && transformationPresent && outcomeHits > 0;
  const commitmentMismatch = highCommitmentCta && !earnedFoundation;

  // Rule 6 — deceptive urgency, misleading scarcity, fabricated deadlines, and
  // deceptive pressure are rejected. Reuses Offer Strategy's urgency vocabulary
  // and Customer Transformation's unrealistic-claim vocabulary.
  const urgencyHits = countMatches(text, URGENCY_LEXICON);
  const unrealisticClaimHits = countMatches(text, UNREALISTIC_CLAIM_LEXICON);
  const deceptiveUrgency = urgencyHits > 0 || unrealisticClaimHits > 0;

  const signals = {
    sentenceCount: sentences.length,
    wordCount,
    ctaMarkerHits,
    specificCtaHits,
    distinctCtaTypeCount: distinctCtaTypes.length,
    ctaTypeCounts: { ...ctaTypeCounts },
    vagueHits,
    urgencyHits,
    unrealisticClaimHits,
    offerMarkerHits,
    outcomeHits,
    currentStatePresent,
    futureStatePresent,
    transformationPresent,
  };

  // ── Scoring (each dimension independent, 0-100) ─────────────────────────
  let ctaClarity = 100;
  let strategicAlignment = 100;
  let decisionSimplicity = 100;
  let commitmentAppropriateness = 100;
  let actionConfidence = 100;

  if (emptyContent) {
    ctaClarity = 50;
    strategicAlignment = 50;
    decisionSimplicity = 50;
    commitmentAppropriateness = 50;
    actionConfidence = 50;
  } else {
    if (!ctaPresent) {
      ctaClarity -= 85;
      strategicAlignment -= 70;
      decisionSimplicity -= 80;
      commitmentAppropriateness -= 40;
      actionConfidence -= 85;
    }
    if (vagueCta) {
      ctaClarity -= 50;
      decisionSimplicity -= 30;
      actionConfidence -= 40;
    }
    if (competingCtas) {
      ctaClarity -= 35 * (distinctCtaTypes.length - 1);
      decisionSimplicity -= 45;
      actionConfidence -= 30;
    }
    if (misalignedCta) strategicAlignment -= 55;
    if (ctaPresent && !transformationPresent) strategicAlignment -= 40;
    if (ctaPresent && offerPresent && outcomeHits === 0) strategicAlignment -= 30;
    if (commitmentMismatch) {
      commitmentAppropriateness -= 65;
      actionConfidence -= 20;
    }
    if (deceptiveUrgency) {
      ctaClarity -= 40;
      strategicAlignment -= 55;
      commitmentAppropriateness -= 50;
      actionConfidence -= 60;
    }
  }

  ctaClarity = clamp(ctaClarity, 0, 100);
  strategicAlignment = clamp(strategicAlignment, 0, 100);
  decisionSimplicity = clamp(decisionSimplicity, 0, 100);
  commitmentAppropriateness = clamp(commitmentAppropriateness, 0, 100);
  actionConfidence = clamp(actionConfidence, 0, 100);

  const ctaScore = Math.round(
    0.25 * ctaClarity
    + 0.25 * strategicAlignment
    + 0.15 * decisionSimplicity
    + 0.15 * commitmentAppropriateness
    + 0.2 * actionConfidence,
  );

  let decisionConfidence;
  if (emptyContent) decisionConfidence = 10;
  else if (!ctaPresent) decisionConfidence = 15;
  else decisionConfidence = Math.round(
    0.4 * ctaClarity
    + 0.3 * actionConfidence
    + 0.3 * strategicAlignment,
  );

  return {
    skillId: CALL_TO_ACTION_STRATEGY_SKILL_ID,
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
      ctaClarity,
      strategicAlignment,
      decisionSimplicity,
      commitmentAppropriateness,
      actionConfidence,
    },
    ctaClarityScore: ctaClarity,
    strategicAlignmentScore: strategicAlignment,
    decisionSimplicityScore: decisionSimplicity,
    commitmentAppropriatenessScore: commitmentAppropriateness,
    actionConfidenceScore: actionConfidence,
    clarityScore: ctaClarity,
    alignmentScore: strategicAlignment,
    ctaScore,
    decisionConfidence,
    primaryCTA: {
      present: ctaPresent,
      statement: ctaPresent ? extractCtaSentence(sentences) : null,
      type: dominantCtaType,
      commitment: dominantCtaCommitment,
      vague: vagueCta,
    },
    ctaType: dominantCtaType,
    flags: {
      missingCta: !ctaPresent,
      competingCtas,
      misalignedCta,
      commitmentMismatch,
      vagueCta,
      deceptiveUrgency,
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

  // Rule 6 overrides everything: false urgency, misleading scarcity,
  // fabricated deadlines, and deceptive pressure are rejected.
  if (flags.deceptiveUrgency) {
    push(
      "R6",
      "high",
      "Reject the recommendation: never recommend false urgency, misleading scarcity, fabricated deadlines, or deceptive pressure.",
      "Urgency, scarcity, deadline, or pressure language was detected without support.",
    );
    push(
      "R7",
      "high",
      "Preserve creator intent while keeping the decision path honest.",
      "The next step must stay grounded, never manufactured.",
    );
    return recommendations;
  }

  if (flags.missingCta) {
    push(
      "R1",
      "high",
      "Define one primary call to action: the clear next step the customer should take.",
      "No clear call to action exists in the content.",
    );
  }
  if (flags.competingCtas) {
    push(
      "R2",
      "high",
      "Select one primary action and present it alone.",
      `${analysis.signals.distinctCtaTypeCount} calls to action compete for the customer's attention.`,
    );
  }
  if (flags.misalignedCta) {
    push(
      "R3",
      "medium",
      "Align the call to action with the customer transformation the content establishes.",
      "The CTA is present, but nothing connects it to the transformation outcome.",
    );
  }
  if (flags.commitmentMismatch) {
    push(
      "R4",
      "medium",
      "Recommend a more appropriate next step: ask for a commitment the offer has earned.",
      "The CTA asks for a larger commitment than the offer and transformation have built up.",
    );
  }
  if (flags.vagueCta) {
    push(
      "R5",
      "medium",
      "Make the call to action specific and unmistakable.",
      "The CTA is vague or passive and does not name a concrete action.",
    );
  }
  return recommendations;
}

// ── Meaning-preserving CTA preservation ──────────────────────────────────────
// Call to Action Strategy is a strategic evaluation: sharpening the next step
// is a rewrite risk, so every improvement is surfaced as a recommendation and
// the creator's copy is never rewritten. preserveCallToAction is therefore an
// identity pass that documents that guarantee.

export function preserveCallToAction(draftContent) {
  const original = String(draftContent || "").trim();
  return { preservedContent: original, edits: [] };
}

// ── Public skill API ─────────────────────────────────────────────────────────

// Runs the full deterministic Call to Action Strategy analysis. Accepts the
// skill inputs (creativeBrief, campaignContext, audienceProfile,
// offerInformation, draftContent, contentType, brandVoice) and returns
// preservedContent, the five CTA scores, ctaScore, primaryCTA, ctaType,
// decisionConfidence, and recommendations.
export function evaluateCallToActionStrategy(input = {}) {
  const analysis = analyzeCallToActionStrategy(input);
  const { preservedContent, edits } = preserveCallToAction(input.draftContent);
  const recommendations = buildRecommendations(analysis);
  return {
    ...analysis,
    preservedContent,
    edits,
    callToActionRecommendations: recommendations,
    recommendations,
  };
}

// AI Twin internal verification — no user-facing changes unless the skill
// determines the next step can be sharpened without inventing offers, adding
// deceptive urgency, or changing the creator's intent.
export function verifyCallToActionStrategy(input = {}) {
  const analysis = analyzeCallToActionStrategy(input);
  const scores = analysis.scores;
  return {
    skillId: CALL_TO_ACTION_STRATEGY_SKILL_ID,
    nextStepClear: scores.ctaClarity >= 70,
    onePrimaryAction: scores.decisionSimplicity >= 70 && !analysis.flags.competingCtas,
    ctaMatchesReadiness: scores.commitmentAppropriateness >= 70,
    alignedWithOfferAndTransformation: scores.strategicAlignment >= 70 && !analysis.flags.misalignedCta,
    customerKnowsNextStep: scores.actionConfidence >= 70,
    canImproveWithoutChangingIntent: analysis.ctaScore < 70,
    scores,
    flags: analysis.flags,
  };
}

// ── Skill Manifest ───────────────────────────────────────────────────────────
// Registered in the Creative Skills Registry. All v1 required fields are
// present; v2 additive sections (capabilities, decisionRules, knowledge,
// workflow, validation, aiTwin, creativeIntelligence, metadata) are advisory.
// dependsOn, complements, sharedUtilities, compatibleContentTypes, and
// compatibleCampaignTemplates are
// informational metadata only: they describe relationships and do not
// introduce a dependency engine or runtime loading behavior.

export default {
  skillId: CALL_TO_ACTION_STRATEGY_SKILL_ID,
  name: "Call to Action Strategy",
  shortName: "CTA",
  description: "Evaluate whether content presents one clear, appropriate, and strategically aligned next action: the primary call to action, its clarity, its alignment with the offer and the customer's transformation, and the level of commitment it asks for — while preserving creator intent and never inventing offers, recommending deceptive urgency, fabricating scarcity, or manipulating decisions.",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  category: "marketing",
  subcategory: "call-to-action",
  tags: ["call-to-action", "cta", "marketing", "conversion", "strategy", "decision"],
  capabilities: ["call_to_action_strategy"],
  supportedStudios: ["marketing", "publishing", "ai-twin", "workflow", "video", "audio"],
  dependsOn: ["offer-strategy", "customer-transformation"],
  complements: ["trust-building"],
  sharedUtilities: ["communication-utils"],
  compatibleContentTypes: [
    "sales-page",
    "landing-page",
    "email-campaign",
    "webinar",
    "funnel-strategy",
    "social-campaign",
    "checkout-flow",
  ],
  compatibleCampaignTemplates: ["product-launch"],
  creativePrinciples: [
    "one-action: present one primary action per message",
    "transformation-aligned: align the CTA with the customer transformation",
    "commitment-matched: match the commitment level to customer readiness",
    "obvious-next-step: keep the next step specific and unmistakable",
    "honesty-preserving: no false urgency, misleading scarcity, fabricated deadlines, or deceptive pressure",
  ],
  vocabulary: [
    { concept: "primary call to action", meaning: "the single next action the customer is invited to take", informs: "message" },
    { concept: "CTA type", meaning: "the kind of action requested, such as purchase, register, or learn", informs: "message" },
    { concept: "commitment level", meaning: "how much the requested action asks of the customer", informs: "structure" },
    { concept: "decision path", meaning: "the clear, logical route from message to next step", informs: "structure" },
    { concept: "deceptive urgency", meaning: "false scarcity, fabricated deadlines, or pressure that misleads", informs: "message" },
  ],
  craftGuidance: {
    summary: "Present one clear, trustworthy next action that naturally follows the customer's transformation journey and matches their readiness.",
    subject: "the customer's next step, grounded in the Creative Brief, Campaign Context, Offer Strategy, and Customer Transformation",
    composition: "one primary action, aligned with the offer and the transformation, matched to customer readiness",
    tone: "direct and honest, without manufactured pressure",
    language: "specific imperative actions over vague or passive invitations",
    structure: "transformation, then offer, then the one obvious next step",
    flow: "from the desired outcome to the single action that delivers it",
  },
  constraints: [
    "never invent offers",
    "never fabricate deadlines",
    "never recommend deceptive scarcity",
    "never manipulate emotions dishonestly",
    "never change factual meaning",
    "never override creator intent",
  ],
  evaluationRules: [
    { quality: "ctaClarity", signal: "the primary call to action is specific and unmistakable", evidence: "CTA type and marker counts" },
    { quality: "strategicAlignment", signal: "the CTA aligns with the offer and the customer transformation", evidence: "transformation, offer, and outcome presence" },
    { quality: "decisionSimplicity", signal: "one obvious next step with minimal friction", evidence: "competing and vague CTA counts" },
    { quality: "commitmentAppropriateness", signal: "the CTA asks for a commitment the offer has earned", evidence: "CTA commitment tier and earned foundation" },
    { quality: "actionConfidence", signal: "the customer would know exactly what to do next", evidence: "CTA clarity, specificity, and honesty" },
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
    { id: "R1", if: "no clear call to action exists", then: "recommend defining one primary CTA", else: "keep the stated next step", confidence: 1 },
    { id: "R2", if: "multiple competing calls to action exist", then: "recommend selecting one primary action", else: "keep the single action focus", confidence: 1 },
    { id: "R3", if: "the CTA does not naturally follow the customer transformation", then: "recommend stronger alignment", else: "keep the aligned next step", confidence: 1 },
    { id: "R4", if: "the CTA asks for a larger commitment than the offer has earned", then: "recommend a more appropriate next step", else: "keep the matched commitment", confidence: 1 },
    { id: "R5", if: "the CTA is vague or passive", then: "recommend a more specific action", else: "keep the specific action", confidence: 1 },
    { id: "R6", if: "false urgency, misleading scarcity, fabricated deadlines, or deceptive pressure would be introduced", then: "never recommend them; reject the modification", else: "proceed with honest next steps only", confidence: 1 },
    { id: "R7", if: "decision clarity and creator intent conflict", then: "preserve creator intent while improving decision clarity", else: "proceed", confidence: 1 },
  ],
  knowledge: {
    bestPractices: [
      "Present one primary action per message.",
      "Match the commitment level to customer readiness.",
      "Align the CTA with the customer transformation.",
      "Keep the next step obvious and specific.",
      "Reinforce trust before asking for commitment.",
      "Remove unnecessary decision friction.",
      "Never use false urgency, misleading scarcity, fabricated deadlines, or deceptive pressure.",
    ],
    writingGuidance: [
      "State exactly what the customer should do next.",
      "Use one direct imperative per message.",
      "Connect the action to the outcome the offer delivers.",
      "Never invent offers or fabricate deadlines.",
    ],
    businessGuidance: [
      "A clear next step converts; a competing set of asks confuses.",
      "Asking for more than the content has earned breaks trust.",
    ],
    qualityGuidance: [
      "No offers are ever invented.",
      "No deadlines or scarcity are ever fabricated.",
      "Decisions are never manipulated dishonestly.",
      "Factual meaning and creator intent are never altered.",
    ],
    optimizationGuidance: [
      "When CTA Clarity is low, reduce competing asks to one primary action.",
      "Re-run evaluation after edits to confirm one honest, aligned next step remains.",
    ],
  },
  workflow: {
    requiredInputs: ["creativeBrief", "campaignContext"],
    optionalInputs: ["draftContent", "contentType", "audienceProfile", "offerInformation", "brandVoice"],
    inferredInputs: ["contentType"],
    phases: [
      { phase: "analyze", description: "deterministically score the CTA across clarity, alignment, simplicity, commitment, and action confidence" },
      { phase: "preserve", description: "never auto-rewrite; CTA improvements are surfaced as recommendations only" },
      { phase: "recommend", description: "return ordered recommendations for the Creative Intelligence Engine to apply without inventing offers or pressure" },
    ],
    completionCriteria: [
      "CTA scores returned for all five dimensions",
      "preservedContent is byte-identical to the input; no automatic rewrites",
      "recommendations never invent offers, deadlines, scarcity, or deceptive pressure",
    ],
  },
  validation: {
    requiredAssets: [],
    missingContext: {
      creativeBrief: "the creative brief that states the campaign goal and subject",
      campaignContext: "the campaign context that grounds the next step",
    },
    unsupportedRequests: [
      "requests to invent offers",
      "requests to fabricate deadlines",
      "requests to recommend deceptive scarcity",
      "requests to manipulate decisions dishonestly",
    ],
    qualityGates: [
      "no offer invented",
      "no deadline fabricated",
      "no deceptive urgency recommended",
    ],
  },
  aiTwin: {
    internallyVerifies: [
      "what is the customer's next step?",
      "is there only one primary action?",
      "does the CTA match the customer's readiness?",
      "is the action aligned with the offer and transformation?",
      "would the customer know exactly what to do next?",
    ],
    userVisible: "no user-facing changes unless the skill determines the next step can be sharpened without inventing offers, adding deceptive urgency, or changing the creator's intent",
  },
  creativeIntelligence: {
    recommendWhen: [
      "no clear call to action exists in the content",
      "multiple calls to action compete for attention",
      "the CTA does not follow the customer transformation",
      "the CTA asks for more commitment than the content has earned",
      "the CTA is vague or passive",
    ],
    avoidWhen: [
      "the format requires an open-ended ask with no single action",
      "the request requires the next step to remain deliberately unspecified",
      "the call to action is externally fixed and cannot be changed",
    ],
    reasoning: "fit-first: recommend when the request targets the decision pathway the customer takes next, not when the next step is externally fixed",
  },
};
