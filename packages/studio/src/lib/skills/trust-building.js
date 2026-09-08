// Approved Creative Skill Pack V1 — Trust Building.
// Foundational Communication skill for Creative OS.
// Produced by the Knowledge Compiler and reviewed by the MavenSync team.
//
// This skill evaluates and strengthens credibility, authenticity, and audience
// confidence through consistency, transparency, and evidence-based
// communication — while preserving honesty and creator intent. It improves
// perceived trustworthiness and never manipulates or fabricates credibility.
// It is shared platform intelligence, available to every studio. It is not a
// recipe, a provider, a studio, or an agent.
//
// The default export is the registered Skill Manifest (the Creative Skills
// Registry reads only the manifest). The named exports are the deterministic
// analysis implementation: evaluateTrustBuilding() runs the seven decision
// rules and the five trust scores, and verifyTrustBuilding() exposes the AI
// Twin's five internal checks. No provider, recipe, or studio logic is touched.
// This skill completes the Communication Skill Pack core: Message Clarity
// ensures the audience understands, Curiosity Building ensures they keep
// engaging, and Trust Building ensures they believe.

import { splitIntoSentences, tokenizeWords, countMatches, clamp } from "./communication-utils.js";

export const TRUST_BUILDING_SKILL_ID = "trust-building";

// ── Deterministic lexicons and thresholds ────────────────────────────────────
// Evidence signals: language that supports a claim. Claims backed by evidence
// are supported (Rule 1); claims without evidence are flagged.
const EVIDENCE_LEXICON = [
  "according to", "studies show", "studies found", "research shows",
  "research found", "study found", "study showed", "data shows", "data show",
  "statistics", "survey", "case study", "testimonial", "reviews", "backed by",
  "supported by", "proven", "measured", "verified", "evidence", "demonstrated",
  "confirmed", "citation", "third party", "independent", "certified",
  "clinical trial", "tested", "our data", "results showed", "results show",
  "percentage", "percent", "reported", "found that", "in 20", "in a study",
  "survey of", "for example", "for instance", "analysis", "benchmark",
  "methodology",
];

// Transparency signals: language that is open about limitations and how claims
// are supported. Transparent messaging raises transparency (Rule 5).
const TRANSPARENCY_LEXICON = [
  "may vary", "results vary", "results may", "individual results",
  "not guaranteed", "not for everyone", "your results may", "could vary",
  "might not", "limitations", "limitation", "available on request", "we disclose",
  "disclosure", "full details", "methodology", "terms and conditions",
  "disclaimer", "as with any", "honestly", "to be honest",
  "in the interest of transparency", "we do not claim", "we are not claiming",
  "we will tell you", "open about", "public data", "we measure", "we publish",
  "see our report", "read more about", "the fine print", "make no guarantees",
  "we are transparent", "no hidden", "without overselling",
  "balanced expectations", "what to expect",
];

// Exaggeration signals: superlatives and inflated claims that overstate (Rule 2).
const EXAGGERATION_LEXICON = [
  "best", "greatest", "fastest", "cheapest", "easiest", "strongest", "smartest",
  "biggest", "largest", "smallest", "quickest", "perfect", "flawlessly",
  "flawless", "miracle", "miracles", "miraculous", "revolutionary", "unbeatable",
  "unsurpassed", "world's best", "worlds best", "number one", "the best ever",
  "best in the world", "unprecedented", "effortless", "effortlessly", "insanely",
  "unmatched", "100%", "guaranteed", "guarantee", "overnight", "instantly",
  "instant",
];

// Absolute expectation terms: language that sets unrealistic expectations (Rule 3).
const ABSOLUTE_LEXICON = [
  "guaranteed", "guarantee", "100%", "no risk", "risk free", "risk-free",
  "forever", "always", "never", "everyone", "nobody", "without fail",
  "instantly", "instant", "overnight", "effortlessly", "effortless",
  "absolutely", "impossible", "every time", "no questions asked", "unlimited",
];

// Fabricated-authority markers: claims of endorsements, awards, or credentials
// that present unverifiable authority. Introducing these is rejected (Rule 6).
const FABRICATED_AUTHORITY_MARKERS = [
  "endorsed by", "celebrity", "as seen on", "featured in", "world-renowned",
  "world renowned", "award-winning", "award winning", "top-rated", "top rated",
  "recommended by doctors", "doctor recommended", "physician recommended",
  "expert approved", "backed by experts", "trusted by thousands",
  "trusted by millions", "loved by millions", "the world's leading",
  "the leading provider", "official partner", "official supplier",
  "personal advisor to", "presidential advisor", "nobel", "national award",
  "best-selling author", "five star", "5 star", "verified by", "certified by",
  "approved by", "ranked number one", "industry leader", "leaders in",
  "experts say", "thousands of happy customers", "millions of users",
];

// Internal contradiction pairs: when both terms appear the messaging conflicts
// with itself (Rule 4).
const CONTRADICTION_PAIRS = [
  ["cheapest", "premium"], ["cheapest", "luxury"], ["cheapest", "expensive"],
  ["cheapest", "high-end"], ["cheapest", "most expensive"], ["fastest", "slower"],
  ["fastest", "slow"], ["fastest", "sluggish"], ["always", "sometimes"],
  ["always", "occasionally"], ["never", "sometimes"], ["never", "often"],
  ["never", "occasionally"], ["guaranteed", "may vary"], ["100%", "might not"],
  ["everyone", "not everyone"], ["everyone", "some customers"], ["no risk", "risk"],
  ["free", "charges"], ["unlimited", "limited"], ["best", "worst"],
];

// ── Deterministic analysis ───────────────────────────────────────────────────

export function analyzeTrustBuilding({
  draftContent = "",
  contentType = "general",
  platform = null,
  audienceProfile = null,
  creativeBrief = null,
  campaignContext = null,
  brandVoice = null,
} = {}) {
  const text = String(draftContent || "").trim();
  const words = tokenizeWords(text);
  const wordCount = words.length;
  const lower = text.toLowerCase();

  // Evidence and claim counts (Rule 1).
  const evidenceHits = countMatches(text, EVIDENCE_LEXICON);
  const numericTokenCount = words.filter((word) => /\d/.test(word)).length;
  const evidenceCount = evidenceHits + (numericTokenCount > 0 ? 1 : 0);
  const exaggerationHits = countMatches(text, EXAGGERATION_LEXICON);
  const claimCount = exaggerationHits;
  const unsupportedClaims = claimCount > 0 && evidenceCount === 0;

  // Exaggeration (Rule 2) and unrealistic expectations (Rule 3).
  const absoluteTermHits = countMatches(text, ABSOLUTE_LEXICON);
  const exaggeratedPromises = exaggerationHits >= 2;
  const unrealisticExpectations = absoluteTermHits > 0;

  // Transparency (Rule 5).
  const transparencyHits = countMatches(text, TRANSPARENCY_LEXICON);
  const transparencyMissing = transparencyHits === 0 && evidenceCount === 0;

  // Consistency (Rule 4): internal contradictions.
  let contradictionCount = 0;
  for (const [a, b] of CONTRADICTION_PAIRS) {
    if (lower.includes(a) && lower.includes(b)) contradictionCount += 1;
  }
  const inconsistentMessaging = contradictionCount > 0;

  // Fabricated authority (Rule 6).
  const fabricatedAuthorityHits = countMatches(text, FABRICATED_AUTHORITY_MARKERS);
  const fabricatedAuthority = fabricatedAuthorityHits > 0;

  const signals = {
    sentenceCount: splitIntoSentences(text).length,
    wordCount,
    evidenceHits,
    numericTokenCount,
    evidenceCount,
    claimCount,
    exaggerationHits,
    absoluteTermHits,
    transparencyHits,
    contradictionCount,
    fabricatedAuthorityHits,
  };

  // ── Scoring (each dimension independent, 0-100) ─────────────────────────
  let credibilityScore = 100;
  if (fabricatedAuthority) credibilityScore = 10;
  if (unsupportedClaims) credibilityScore -= 35;
  if (exaggeratedPromises) credibilityScore -= 20;
  if (inconsistentMessaging) credibilityScore -= 15;
  credibilityScore = clamp(credibilityScore, 0, 100);

  let authenticityScore = 100;
  if (fabricatedAuthority) authenticityScore = 10;
  if (exaggeratedPromises) authenticityScore -= 25;
  if (unsupportedClaims) authenticityScore -= 15;
  if (inconsistentMessaging) authenticityScore -= 10;
  authenticityScore = clamp(authenticityScore, 0, 100);

  let transparencyScore = 100;
  if (fabricatedAuthority) transparencyScore -= 40;
  if (transparencyMissing) transparencyScore -= 30;
  if (absoluteTermHits > 0 && transparencyHits === 0) transparencyScore -= 20;
  if (inconsistentMessaging) transparencyScore -= 15;
  transparencyScore = clamp(transparencyScore, 0, 100);

  let consistencyScore = 100;
  if (inconsistentMessaging) consistencyScore -= 40;
  if (fabricatedAuthority) consistencyScore -= 20;
  consistencyScore = clamp(consistencyScore, 0, 100);

  const trustScore = Math.round(
    0.3 * credibilityScore
    + 0.2 * authenticityScore
    + 0.2 * transparencyScore
    + 0.3 * consistencyScore,
  );

  return {
    skillId: TRUST_BUILDING_SKILL_ID,
    version: "1.0.0",
    status: "active",
    inputs: { contentType, platform, audienceProfile: Boolean(audienceProfile), creativeBrief: Boolean(creativeBrief), campaignContext: Boolean(campaignContext), brandVoice: Boolean(brandVoice) },
    signals,
    scores: {
      trust: trustScore,
      credibility: credibilityScore,
      authenticity: authenticityScore,
      transparency: transparencyScore,
      consistency: consistencyScore,
    },
    trustScore,
    credibilityScore,
    consistencyScore,
    authenticityScore,
    transparencyScore,
    flags: {
      unsupportedClaims,
      exaggeratedPromises,
      unrealisticExpectations,
      inconsistentMessaging,
      fabricatedAuthority,
      transparencyMissing,
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

  // Rule 6 overrides everything: fabricated authority is rejected, never
  // strengthened.
  if (flags.fabricatedAuthority) {
    push(
      "R6",
      "high",
      "Reject the recommendation: never fabricate authority, testimonials, or experience.",
      "Unverifiable authority, endorsement, or credential claims were detected.",
    );
    push(
      "R7",
      "high",
      "Preserve authenticity over persuasion: do not manufacture credibility.",
      "Trust must be earned honestly, never invented.",
    );
    return recommendations;
  }

  if (flags.unsupportedClaims) {
    push(
      "R1",
      "high",
      "Support important claims with evidence, or reduce the certainty of the claim.",
      `${analysis.signals.claimCount} claims were detected without supporting evidence.`,
    );
  }
  if (flags.exaggeratedPromises) {
    push(
      "R2",
      "high",
      "Use more accurate wording instead of exaggeration.",
      `${analysis.signals.exaggerationHits} exaggerated terms were detected.`,
    );
  }
  if (flags.unrealisticExpectations) {
    push(
      "R3",
      "medium",
      "Set realistic expectations the audience can rely on.",
      "Absolute or guarantee-style promises create expectations the content may not meet.",
    );
  }
  if (flags.inconsistentMessaging) {
    push(
      "R4",
      "high",
      "Align the messaging with Brand Voice and Campaign Context so claims stay consistent.",
      `${analysis.signals.contradictionCount} internal contradictions were detected.`,
    );
  }
  if (flags.transparencyMissing) {
    push(
      "R5",
      "medium",
      "Be transparent about limitations and how claims are supported.",
      "The message offers no evidence or openness about limitations.",
    );
  }
  return recommendations;
}

// ── Meaning-preserving trust preservation ────────────────────────────────────
// Trust improvements live at the word level (adding evidence, rephrasing
// claims), so no automatic edit is safe without risking meaning or honesty.
// The skill surfaces every improvement as a recommendation and never rewrites
// the creator's copy. preserveContent is therefore an identity pass that
// documents the guarantee that trust is built through recommendation only.

export function preserveContent(draftContent) {
  const original = String(draftContent || "").trim();
  return { preservedContent: original, edits: [] };
}

// ── Public skill API ─────────────────────────────────────────────────────────

// Runs the full deterministic Trust Building analysis over draft content.
// Accepts the skill inputs (draftContent, contentType, platform, audienceProfile,
// creativeBrief, campaignContext, brandVoice) and returns preservedContent,
// the five trust scores, trustRecommendations, and failure flags.
export function evaluateTrustBuilding(input = {}) {
  const analysis = analyzeTrustBuilding(input);
  const { preservedContent, edits } = preserveContent(input.draftContent);
  const recommendations = buildRecommendations(analysis);
  return {
    ...analysis,
    preservedContent,
    edits,
    trustRecommendations: recommendations,
    recommendations,
  };
}

// AI Twin internal verification — no user-facing changes unless the skill
// determines trust can be strengthened without fabrication or exaggeration.
export function verifyTrustBuilding(input = {}) {
  const analysis = analyzeTrustBuilding(input);
  const scores = analysis.scores;
  return {
    skillId: TRUST_BUILDING_SKILL_ID,
    believable: scores.credibility >= 70,
    claimsSupported: scores.credibility >= 70 && !analysis.flags.unsupportedClaims,
    soundsAuthentic: scores.authenticity >= 70,
    buildsConfidence: analysis.trustScore >= 70,
    trustPreservedWithoutExaggeration: scores.authenticity >= 70 && !analysis.flags.exaggeratedPromises && !analysis.flags.fabricatedAuthority,
    canImproveWithoutChangingIntent: analysis.trustScore < 70,
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
  skillId: TRUST_BUILDING_SKILL_ID,
  name: "Trust Building",
  shortName: "Trust",
  description: "Evaluate and strengthen credibility, authenticity, and audience confidence through consistency, transparency, and evidence-based communication — while preserving honesty and creator intent.",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  category: "communication",
  subcategory: "trust",
  tags: ["trust", "communication", "credibility", "authenticity", "transparency", "persuasion"],
  capabilities: ["credibility_evaluation"],
  supportedStudios: ["marketing", "video", "audio", "publishing", "workflow", "ai-twin", "agents"],
  dependsOn: ["message-clarity", "curiosity-building"],
  complements: ["human-conversation"],
  sharedUtilities: ["communication-utils"],
  creativePrinciples: [
    "honesty-first: prefer honesty over persuasion",
    "evidence-based: support important claims or reduce certainty",
    "transparency-forward: be open about limitations and how claims are supported",
    "consistency-preserving: keep messaging aligned with Brand Voice and Campaign Context",
    "authenticity-protecting: never fabricate authority, testimonials, or experience",
  ],
  vocabulary: [
    { concept: "credibility", meaning: "the audience's belief that the source is believable and trustworthy", informs: "message" },
    { concept: "unsupported claim", meaning: "an assertion with no evidence behind it that overstates certainty", informs: "message" },
    { concept: "transparency", meaning: "openness about limitations and how claims are supported", informs: "message" },
    { concept: "consistency", meaning: "messages that stay aligned with each other, Brand Voice, and Campaign Context", informs: "structure" },
    { concept: "authenticity", meaning: "sounding genuine and honest without manufactured credibility", informs: "message" },
  ],
  craftGuidance: {
    summary: "Support important claims, be transparent about limitations, keep messaging consistent, and prefer honesty over persuasion.",
    subject: "the truth of the message, grounded in Campaign Context and the Creative Brief",
    composition: "pair every important claim with evidence; balance promises with realistic expectations",
    tone: "preserve brand voice and creator intent; authentic and measured, never inflated",
    language: "accurate wording over superlatives; transparent about what is and is not known",
    structure: "claims first, then the support; limitations stated openly rather than hidden",
    flow: "consistent, believable, and grounded so each claim builds on the last",
  },
  constraints: [
    "never invent proof",
    "never fabricate reviews",
    "never fabricate credentials",
    "never manipulate trust",
    "never change factual meaning",
    "preserve creator intent",
    "never invent testimonials, authority, or experience",
  ],
  evaluationRules: [
    { quality: "trust", signal: "the composite of credibility, authenticity, transparency, and consistency", evidence: "weighted trust score" },
    { quality: "credibility", signal: "claims are supported by evidence or stated with reduced certainty", evidence: "evidence and claim counts" },
    { quality: "authenticity", signal: "communication is honest and never fabricates authority or experience", evidence: "fabricated-authority marker detection" },
    { quality: "transparency", signal: "limitations and support are disclosed openly", evidence: "transparency language and evidence presence" },
    { quality: "consistency", signal: "messaging does not contradict itself or Brand Voice", evidence: "internal contradiction detection" },
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
    { id: "R1", if: "claims lack supporting evidence", then: "recommend adding support or reducing certainty", else: "keep the claims as stated", confidence: 1 },
    { id: "R2", if: "unnecessary exaggeration exists", then: "recommend more accurate wording", else: "keep the current wording", confidence: 1 },
    { id: "R3", if: "communication creates unrealistic expectations", then: "recommend realistic expectations", else: "keep the current expectations", confidence: 1 },
    { id: "R4", if: "messaging conflicts with Brand Voice or Campaign Context", then: "flag the inconsistency", else: "keep the messaging aligned", confidence: 1 },
    { id: "R5", if: "stronger transparency increases trust", then: "recommend transparency", else: "keep the current disclosure", confidence: 1 },
    { id: "R6", if: "fabricated authority, testimonials, or experiences would be introduced", then: "never recommend them; reject the modification", else: "proceed with honest credibility signals", confidence: 1 },
    { id: "R7", if: "authenticity and persuasion conflict", then: "preserve authenticity over persuasion", else: "proceed", confidence: 1 },
  ],
  knowledge: {
    bestPractices: [
      "Support important claims with evidence, or state them with reduced certainty.",
      "Be transparent about limitations and how claims are supported.",
      "Maintain message consistency across every channel and context.",
      "Preserve authentic communication; never manufacture credibility.",
      "Prefer honesty over persuasion in every recommendation.",
    ],
    writingGuidance: [
      "Pair each important claim with evidence, a number, or a verifiable source.",
      "Replace absolute guarantees with realistic, qualified expectations.",
      "Acknowledge limitations openly instead of hiding them.",
      "Avoid superlatives unless the evidence genuinely supports them.",
    ],
    businessGuidance: [
      "Trust is the bridge between communication and influence: without it, persuasion fails.",
      "Overclaiming wins the moment and loses the relationship; honesty builds durable confidence.",
    ],
    qualityGuidance: [
      "No invented proof, reviews, credentials, or experience — ever.",
      "Factual meaning and creator intent are never altered.",
    ],
    optimizationGuidance: [
      "When trust scores are low, address the highest-severity flag first.",
      "Re-run evaluation after edits to confirm trust improves without exaggeration.",
    ],
  },
  workflow: {
    requiredInputs: ["draftContent"],
    optionalInputs: ["creativeBrief", "campaignContext", "audienceProfile", "brandVoice", "contentType", "platform"],
    inferredInputs: ["contentType", "platform"],
    phases: [
      { phase: "analyze", description: "deterministically score trust across credibility, authenticity, transparency, and consistency" },
      { phase: "preserve", description: "never auto-rewrite; trust improvements are surfaced as recommendations only" },
      { phase: "recommend", description: "return ordered recommendations for the Creative Intelligence Engine to apply honestly" },
    ],
    completionCriteria: [
      "trust scores returned for all five dimensions",
      "preservedContent is byte-identical to the input; no automatic rewrites",
      "recommendations never fabricate proof, authority, or experience",
    ],
  },
  validation: {
    requiredAssets: [],
    missingContext: { draftContent: "draft copy or script text to evaluate for trustworthiness" },
    unsupportedRequests: [
      "requests to invent testimonials",
      "requests to invent authority",
      "requests to exaggerate credentials",
      "requests to fabricate experience",
    ],
    qualityGates: [
      "no proof invented",
      "no authority fabricated",
      "recommendations are honest and actionable",
    ],
  },
  aiTwin: {
    internallyVerifies: [
      "is this believable?",
      "are claims appropriately supported?",
      "does this sound authentic?",
      "does the communication build confidence?",
      "is trust preserved without exaggeration?",
    ],
    userVisible: "no user-facing changes unless the skill determines trust can be strengthened without fabrication or exaggeration",
  },
  creativeIntelligence: {
    recommendWhen: [
      "copy makes claims without supporting evidence",
      "promises sound exaggerated or unrealistic",
      "messaging risks contradicting Brand Voice or Campaign Context",
      "audience confidence is the bottleneck",
    ],
    avoidWhen: [
      "the brief deliberately requires sensational or urgent tone",
      "the audience expects promotional hyperbole by format",
      "legal or compliance copy where claims are externally fixed",
    ],
    reasoning: "fit-first: recommend when the request targets credibility and audience confidence, not when the format requires hype",
  },
};
