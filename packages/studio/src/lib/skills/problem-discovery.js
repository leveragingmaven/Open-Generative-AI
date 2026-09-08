// Approved Creative Skill Pack V1 — Problem Discovery.
// Foundational Marketing skill for Creative OS.
// Produced by the Knowledge Compiler and reviewed by the MavenSync team.
//
// This skill identifies and sharpens the customer problem the content must
// address: the one dominant problem, its root cause rather than its symptoms,
// grounded in the Creative Brief and Campaign Context — while preserving
// creator intent and never inventing customer frustrations. It is shared
// platform intelligence, available to every studio. It is not a recipe, a
// provider, a studio, or an agent.
//
// The default export is the registered Skill Manifest (the Creative Skills
// Registry reads only the manifest). The named exports are the deterministic
// analysis implementation: evaluateProblemDiscovery() runs the seven decision
// rules and the five problem scores, and verifyProblemDiscovery() exposes the
// AI Twin's five internal checks. No provider, recipe, or studio logic is
// touched. This skill begins the Marketing Skill Pack core: Problem Discovery
// (the problem), then Positioning (the frame), Offer Strategy (the solution),
// Customer Transformation (the outcome), and Call to Action Strategy (the next
// step). It builds on the Communication Skill Pack: Message Clarity ensures
// the problem is understood and Trust Building keeps the problem honest.

import { splitIntoSentences, tokenizeWords, countMatches, clamp } from "./communication-utils.js";

export const PROBLEM_DISCOVERY_SKILL_ID = "problem-discovery";

// ── Deterministic lexicons and thresholds ────────────────────────────────────
// Customer problem themes: each theme maps the phrases the audience uses to a
// canonical problem. The theme with the most hits becomes the primary problem;
// every additional theme competes for attention (Rule 1). Exported so dependent
// skills (Positioning) can align their position against the same problem
// vocabulary the registry recognizes.
export const PROBLEM_THEMES = {
  speed: [
    "too slow", "slow loading", "slow to load", "loads slowly", "slow delivery",
    "takes too long", "takes forever", "wait times", "waiting times", "long wait",
    "lag", "lags", "latency", "slow performance",
  ],
  cost: [
    "too expensive", "too costly", "high cost", "high costs", "costs too much",
    "cost too much", "overpriced", "cannot afford", "can't afford",
    "budget constraints", "tight budget", "pricey", "expensive",
  ],
  quality: [
    "low quality", "poor quality", "bad quality", "inconsistent quality",
    "subpar", "below standard", "mediocre", "not good enough",
  ],
  effort: [
    "wastes time", "waste time", "wastes hours", "waste hours", "wasted hours",
    "time-consuming", "takes too much time", "tedious", "manual work",
    "manually", "hours of work", "hours every week", "too much work",
    "too much effort",
  ],
  complexity: [
    "too complex", "complicated", "hard to use", "difficult to use",
    "confusing", "overwhelming", "steep learning curve", "intimidating",
    "clunky",
  ],
  errors: [
    "bugs", "error", "errors", "mistakes", "crashes", "crashing", "broken",
    "glitches", "downtime", "outages", "fails", "error-prone", "incorrect",
    "defective",
  ],
  support: [
    "no support", "poor support", "slow support", "unresponsive",
    "never answers", "never replies", "no response", "no help", "unhelpful",
    "ignored", "ghosted", "can't reach",
  ],
  trust: [
    "don't trust", "do not trust", "unsure", "uncertain", "worried", "risky",
    "afraid", "not convinced", "skeptical", "doubt", "can't believe",
  ],
  discovery: [
    "can't find", "cannot find", "hard to find", "hidden", "no visibility",
    "lack of visibility", "not showing up", "can't see",
  ],
  growth: [
    "stuck", "not growing", "can't grow", "plateau", "stagnant", "not scaling",
    "no growth", "struggling to grow", "flat sales",
  ],
  retention: [
    "losing customers", "high churn", "cancellations", "customers leaving",
    "unsubscribes", "drop off", "not coming back",
  ],
  engagement: [
    "low engagement", "no engagement", "not engaging",
    "no response from customers", "won't engage", "hard to engage", "silence",
  ],
  waste: [
    "wasting money", "waste money", "wasted spend", "throwing money",
    "wasted budget",
  ],
};

// Human-readable labels for each theme, used to report the primary and
// secondary problems back to the creator.
const THEME_LABELS = {
  speed: { label: "Speed and waiting time", phrase: "Slow performance or long waiting times" },
  cost: { label: "Cost and budget pressure", phrase: "High cost or unaffordable pricing" },
  quality: { label: "Quality concerns", phrase: "Inconsistent or unacceptable quality" },
  effort: { label: "Effort and time spent", phrase: "Manual work and wasted time" },
  complexity: { label: "Complexity and confusion", phrase: "Hard-to-use or overwhelming experiences" },
  errors: { label: "Reliability and errors", phrase: "Bugs, failures, and broken experiences" },
  support: { label: "Lack of support", phrase: "Unresponsive or unhelpful help" },
  trust: { label: "Trust and confidence", phrase: "Doubt about the product or vendor" },
  discovery: { label: "Discovery and visibility", phrase: "Hard-to-find products or missing visibility" },
  growth: { label: "Stagnant growth", phrase: "Inability to grow or scale" },
  retention: { label: "Customer retention", phrase: "Losing customers and high churn" },
  engagement: { label: "Low engagement", phrase: "Audiences that do not engage" },
  waste: { label: "Wasted spend", phrase: "Money spent without results" },
};

// General problem markers: direct statements that a problem exists, even when
// no named theme is present (Rule 3).
const PROBLEM_MARKERS = [
  "problem", "problems", "challenge", "challenges", "issue", "issues",
  "pain point", "pain points", "frustrated", "frustrating", "frustration",
  "struggle", "struggles", "struggling", "the real problem", "main problem",
  "biggest problem", "core problem",
];

// Symptom language: surface signs of a deeper problem (Rule 2).
const SYMPTOM_LEXICON = [
  "slow", "slowly", "expensive", "costly", "bug", "bugs", "broken", "crash",
  "crashes", "error", "errors", "hang", "hangs", "lags", "latency",
  "downtime", "outage", "outages", "glitch", "glitches", "defect",
  "defects", "late", "delayed", "delays", "long wait", "waiting",
  "out of stock", "short-staffed", "overbooked",
];

// Root-cause language: markers that connect symptoms to an underlying problem.
const ROOT_CAUSE_MARKERS = [
  "because", "root cause", "underlying", "the real issue", "the real problem",
  "the core problem", "due to", "caused by", "leads to", "leading to",
  "results in", "resulting in", "the reason", "this is why", "that is why",
  "at the heart", "fundamentally", "the deeper issue", "actually want",
  "deep down", "under the surface",
];

// Feature and offer language: product features that can replace the customer
// problem and outcome (Rule 4).
const FEATURE_LEXICON = [
  "our product", "our tool", "our platform", "our software", "our app",
  "we offer", "we provide", "we built", "feature", "features", "includes",
  "including", "built-in", "integrated", "integration", "integrations",
  "dashboard", "module", "modules", "capabilities", "our solution",
  "solutions", "powered by", "advanced", "automation",
];

// Solve-everything language: claims that the offer fixes every problem at once
// (Rule 5).
const SOLVE_EVERYTHING_LEXICON = [
  "solves everything", "solves all", "solve everything", "solve all",
  "all your problems", "every problem", "one tool for everything",
  "fix everything", "fixes everything", "handles everything", "does it all",
  "covers everything", "works for everyone", "the answer to everything",
  "for every business", "no matter what",
];

// Customer terms: language that keeps the problem anchored in the audience's
// world rather than the product's (customer relevance).
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

// Detects which problem themes a text expresses. Returns the per-theme hit
// counts and the distinct themes ordered by prominence.
function detectProblems(text) {
  const themes = {};
  for (const [theme, phrases] of Object.entries(PROBLEM_THEMES)) {
    const hits = countMatches(text, phrases);
    if (hits > 0) themes[theme] = hits;
  }
  const distinct = Object.keys(themes).sort((a, b) => themes[b] - themes[a]);
  return { themes, distinct };
}

// Detects whether the problem shifts from one theme to a different theme
// between the first and second half of the content (problem shifting).
function detectProblemShift(sentences) {
  if (sentences.length < 2) return 0;
  const half = Math.floor(sentences.length / 2);
  const firstHalf = detectProblems(sentences.slice(0, half).join(" ")).distinct;
  const secondHalf = detectProblems(sentences.slice(half).join(" ")).distinct;
  if (firstHalf.length === 0 || secondHalf.length === 0) return 0;
  const overlap = firstHalf.some((theme) => secondHalf.includes(theme));
  return overlap ? 0 : 1;
}

export function analyzeProblemDiscovery({
  creativeBrief = null,
  campaignContext = null,
  audienceProfile = null,
  draftContent = "",
  contentType = "general",
  offerInformation = null,
} = {}) {
  const text = String(draftContent || "").trim();
  const words = tokenizeWords(text);
  const wordCount = words.length;
  const sentences = splitIntoSentences(text);
  const briefText = flattenInput(creativeBrief);
  const contextText = flattenInput(campaignContext);
  const groundingText = [briefText, contextText].filter(Boolean).join(" ");
  const hasGrounding = Boolean(groundingText.trim());

  // Problem detection in the content under review.
  const draftProblems = detectProblems(text);
  const distinctThemes = draftProblems.distinct;
  const problemMarkerHits = countMatches(text, PROBLEM_MARKERS);
  const problemPresent = distinctThemes.length > 0 || problemMarkerHits > 0;

  // Grounded problems: themes the Creative Brief and Campaign Context support.
  const groundedThemes = detectProblems(groundingText).distinct;
  const aligned = problemPresent && hasGrounding
    && groundedThemes.some((theme) => distinctThemes.includes(theme));

  // Rule 2 — symptoms versus root cause.
  const symptomHits = countMatches(text, SYMPTOM_LEXICON);
  const rootCauseHits = countMatches(text, ROOT_CAUSE_MARKERS);
  const symptomsOnly = problemPresent && symptomHits > 0 && rootCauseHits === 0;

  // Rule 4 — features replacing the customer problem and outcome.
  const featureHits = countMatches(text, FEATURE_LEXICON);
  const featureLed = featureHits > 0 && problemMarkerHits === 0;

  // Rule 5 — solving everything at once.
  const solveEverythingHits = countMatches(text, SOLVE_EVERYTHING_LEXICON);
  const solvingEverything = solveEverythingHits > 0;

  // Rule 1 — competing problems.
  const competingProblems = distinctThemes.length >= 2;
  const problemShifting = detectProblemShift(sentences) > 0;

  // Rule 3 — no identifiable problem.
  const emptyContent = wordCount === 0;
  const noIdentifiableProblem = !problemPresent && wordCount > 0 && !featureLed;

  // Rule 6 — the skill never invents a frustration the brief and context do
  // not support. Problems inferred from content with no grounding at all are
  // treated as inventions and rejected.
  const ungroundedInference = problemPresent && !hasGrounding;

  // Customer relevance.
  const customerHits = countMatches(text, CUSTOMER_TERMS);

  const signals = {
    sentenceCount: sentences.length,
    wordCount,
    distinctProblemCount: distinctThemes.length,
    problemThemes: { ...draftProblems.themes },
    problemMarkerHits,
    symptomHits,
    rootCauseHits,
    featureHits,
    solveEverythingHits,
    customerHits,
    hasGrounding,
    aligned,
    problemShiftCount: problemShifting ? 1 : 0,
  };

  // ── Scoring (each dimension independent, 0-100) ─────────────────────────
  let problemFocusScore = 100;
  let rootProblemAccuracyScore = 100;
  let strategicAlignmentScore = 100;
  let customerRelevanceScore = 100;
  let problemSimplicityScore = 100;

  if (emptyContent) {
    problemFocusScore = 50;
    rootProblemAccuracyScore = 50;
    strategicAlignmentScore = 50;
    customerRelevanceScore = 50;
    problemSimplicityScore = 50;
  } else {
    if (noIdentifiableProblem) {
      problemFocusScore -= 80;
      rootProblemAccuracyScore -= 75;
      strategicAlignmentScore -= 70;
      customerRelevanceScore -= 75;
      problemSimplicityScore -= 85;
    }
    if (competingProblems) problemFocusScore -= 25 * (distinctThemes.length - 1);
    if (problemShifting) {
      problemFocusScore -= 15;
      problemSimplicityScore -= 15;
    }
    if (solvingEverything) {
      problemSimplicityScore -= 45;
      problemFocusScore -= 20;
      rootProblemAccuracyScore -= 15;
      customerRelevanceScore -= 10;
    }
    if (symptomsOnly) rootProblemAccuracyScore -= 40;
    if (featureLed) customerRelevanceScore -= 30;
    if (problemPresent && customerHits === 0) customerRelevanceScore -= 20;
    if (!hasGrounding) strategicAlignmentScore -= 60;
    else if (!aligned) strategicAlignmentScore -= 45;
  }

  problemFocusScore = clamp(problemFocusScore, 0, 100);
  rootProblemAccuracyScore = clamp(rootProblemAccuracyScore, 0, 100);
  strategicAlignmentScore = clamp(strategicAlignmentScore, 0, 100);
  customerRelevanceScore = clamp(customerRelevanceScore, 0, 100);
  problemSimplicityScore = clamp(problemSimplicityScore, 0, 100);

  // ── Outputs: primary and secondary problems ──────────────────────────────
  const themeEntries = Object.entries(draftProblems.themes)
    .sort((a, b) => b[1] - a[1]);
  const primaryProblem = themeEntries.length > 0
    ? {
        theme: themeEntries[0][0],
        label: THEME_LABELS[themeEntries[0][0]].label,
        phrase: THEME_LABELS[themeEntries[0][0]].phrase,
        hits: themeEntries[0][1],
      }
    : null;
  const secondaryProblems = themeEntries.slice(1).map(([theme, hits]) => ({
    theme,
    label: THEME_LABELS[theme].label,
    phrase: THEME_LABELS[theme].phrase,
    hits,
  }));

  // ── Confidence and derived outputs ───────────────────────────────────────
  let problemConfidence;
  if (emptyContent) problemConfidence = 10;
  else if (noIdentifiableProblem) problemConfidence = 15;
  else if (!hasGrounding) problemConfidence = 25;
  else problemConfidence = Math.round(
    0.4 * problemFocusScore
    + 0.3 * rootProblemAccuracyScore
    + 0.3 * strategicAlignmentScore,
  );

  // The inverse of simplicity: a simple, singular problem statement is low
  // complexity to communicate.
  const problemComplexityScore = Math.round(100 - problemSimplicityScore);

  return {
    skillId: PROBLEM_DISCOVERY_SKILL_ID,
    version: "1.0.0",
    status: "active",
    inputs: {
      contentType,
      creativeBrief: Boolean(creativeBrief),
      campaignContext: Boolean(campaignContext),
      audienceProfile: Boolean(audienceProfile),
      offerInformation: Boolean(offerInformation),
      draftContent: Boolean(text),
    },
    signals,
    scores: {
      problemFocus: problemFocusScore,
      rootProblemAccuracy: rootProblemAccuracyScore,
      strategicAlignment: strategicAlignmentScore,
      customerRelevance: customerRelevanceScore,
      problemSimplicity: problemSimplicityScore,
    },
    problemFocusScore,
    rootProblemAccuracyScore,
    strategicAlignmentScore,
    customerRelevanceScore,
    problemSimplicityScore,
    problemComplexityScore,
    problemConfidence,
    primaryProblem,
    secondaryProblems,
    flags: {
      competingProblems,
      symptomsOnly,
      noIdentifiableProblem,
      featureLed,
      solvingEverything,
      ungroundedInference,
      problemShifting,
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

  // Rule 6 overrides everything: a problem the brief and context do not
  // support is never invented.
  if (flags.ungroundedInference) {
    push(
      "R6",
      "high",
      "Reject the recommendation: never invent customer frustrations unsupported by the Creative Brief or Campaign Context.",
      "Problems appear in the content, but no brief or context grounds them.",
    );
    push(
      "R7",
      "high",
      "Preserve creator intent: do not fabricate a problem the audience may not have.",
      "A real problem comes from the brief or context, never from assumption.",
    );
    return recommendations;
  }

  if (flags.competingProblems) {
    push(
      "R1",
      "high",
      "Choose the one dominant problem the content will solve.",
      `${analysis.signals.distinctProblemCount} unrelated problems compete for the audience's attention.`,
    );
  }
  if (flags.symptomsOnly) {
    push(
      "R2",
      "medium",
      "Address the underlying problem, not just the symptom.",
      "The content describes symptoms without identifying a root cause.",
    );
  }
  if (flags.noIdentifiableProblem) {
    push(
      "R3",
      "high",
      "Flag for clarification: no identifiable customer problem in the content or brief.",
      "The content does not state a problem the customer faces.",
    );
  }
  if (flags.featureLed) {
    push(
      "R4",
      "medium",
      "Lead with the customer problem and the outcome they want, not the product features.",
      "Features appear without a customer problem to anchor them.",
    );
  }
  if (flags.solvingEverything) {
    push(
      "R5",
      "medium",
      "Narrow the scope: focus this content on a single problem.",
      "The content claims to solve every problem at once.",
    );
  }
  return recommendations;
}

// ── Meaning-preserving problem preservation ──────────────────────────────────
// Problem Discovery is a strategic analysis: sharpening the problem is a
// rewrite risk, so every improvement is surfaced as a recommendation and the
// creator's copy is never rewritten. preserveProblemDiscovery is therefore an
// identity pass that documents that guarantee.

export function preserveProblemDiscovery(draftContent) {
  const original = String(draftContent || "").trim();
  return { preservedContent: original, edits: [] };
}

// ── Public skill API ─────────────────────────────────────────────────────────

// Runs the full deterministic Problem Discovery analysis. Accepts the skill
// inputs (creativeBrief, campaignContext, audienceProfile, draftContent,
// contentType, offerInformation) and returns preservedContent, the five
// problem scores, problemConfidence, primaryProblem, secondaryProblems, and
// recommendations.
export function evaluateProblemDiscovery(input = {}) {
  const analysis = analyzeProblemDiscovery(input);
  const { preservedContent, edits } = preserveProblemDiscovery(input.draftContent);
  const recommendations = buildRecommendations(analysis);
  return {
    ...analysis,
    preservedContent,
    edits,
    problemDiscoveryRecommendations: recommendations,
    recommendations,
  };
}

// AI Twin internal verification — no user-facing changes unless the skill
// determines the problem can be sharpened without inventing frustrations or
// changing the creator's intent.
export function verifyProblemDiscovery(input = {}) {
  const analysis = analyzeProblemDiscovery(input);
  const scores = analysis.scores;
  return {
    skillId: PROBLEM_DISCOVERY_SKILL_ID,
    problemClear: scores.problemFocus >= 70,
    rootCauseIdentified: scores.rootProblemAccuracy >= 70 && !analysis.flags.symptomsOnly,
    alignedWithBrief: scores.strategicAlignment >= 70,
    customerRelevant: scores.customerRelevance >= 70,
    scopeFocused: scores.problemSimplicity >= 70 && !analysis.flags.solvingEverything,
    canImproveWithoutChangingIntent: analysis.problemFocusScore < 70,
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
  skillId: PROBLEM_DISCOVERY_SKILL_ID,
  name: "Problem Discovery",
  shortName: "Problem",
  description: "Identify and sharpen the customer problem the content must address: one dominant problem, its root cause rather than its symptoms, grounded in the Creative Brief and Campaign Context — while preserving creator intent and never inventing customer frustrations.",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  category: "marketing",
  subcategory: "problem",
  tags: ["problem", "marketing", "strategy", "positioning", "customer", "discovery"],
  capabilities: ["problem_identification"],
  supportedStudios: ["marketing", "video", "audio", "publishing", "workflow", "ai-twin", "agents"],
  dependsOn: ["message-clarity", "trust-building"],
  complements: ["positioning", "customer-transformation"],
  sharedUtilities: ["communication-utils"],
  creativePrinciples: [
    "problem-first: lead with the customer's problem and desired outcome",
    "one-problem-at-a-time: focus each piece of content on one dominant problem",
    "root-cause-seeking: distinguish the underlying problem from its symptoms",
    "brief-grounded: identify problems only when supported by the Creative Brief and Campaign Context",
    "intent-preserving: never invent frustrations or shift the creator's problem",
  ],
  vocabulary: [
    { concept: "customer problem", meaning: "the core frustration or unmet need the audience wants solved", informs: "message" },
    { concept: "primary problem", meaning: "the single dominant problem the content should address", informs: "message" },
    { concept: "symptom", meaning: "a surface sign of an underlying problem", informs: "message" },
    { concept: "root cause", meaning: "the underlying issue that produces the symptoms", informs: "message" },
    { concept: "outcome", meaning: "the result the customer wants once the problem is solved", informs: "message" },
  ],
  craftGuidance: {
    summary: "Identify the customer's one dominant problem from the brief and content, distinguish the root cause from symptoms, and keep the problem first in every message.",
    subject: "the customer's problem and desired outcome, grounded in the Creative Brief and Campaign Context",
    composition: "one dominant problem per piece of content, stated before features or solutions",
    tone: "customer-centric and grounded, never assuming or inventing frustrations",
    language: "problem and outcome language the audience uses, over product features",
    structure: "problem first, then the evidence from the brief, then the solution",
    flow: "from problem to root cause to outcome so the audience recognizes itself",
  },
  constraints: [
    "never invent customer frustrations",
    "never recommend a problem unsupported by the brief or campaign context",
    "never replace the customer problem with features",
    "never solve every problem at once",
    "never shift the problem mid-content",
    "preserve creator intent",
  ],
  evaluationRules: [
    { quality: "problemFocus", signal: "the content concentrates on one dominant customer problem", evidence: "distinct problem-theme count and shift detection" },
    { quality: "rootProblemAccuracy", signal: "the underlying problem is identified rather than its symptoms", evidence: "symptom and root-cause marker counts" },
    { quality: "strategicAlignment", signal: "the identified problem is grounded in the Creative Brief and Campaign Context", evidence: "theme overlap between content and brief/context" },
    { quality: "customerRelevance", signal: "the problem matters to the audience and is stated in customer terms", evidence: "customer language and problem presence" },
    { quality: "problemSimplicity", signal: "the problem statement is simple, singular, and clearly scoped", evidence: "solving-everything and scope markers" },
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
    { id: "R1", if: "multiple unrelated problems compete in the content", then: "recommend choosing one dominant problem", else: "keep the single problem focus", confidence: 1 },
    { id: "R2", if: "only symptoms are described without a root cause", then: "recommend identifying the underlying problem", else: "keep the current problem framing", confidence: 1 },
    { id: "R3", if: "no identifiable customer problem exists in the content or brief", then: "flag for clarification and lower confidence", else: "proceed with the stated problem", confidence: 1 },
    { id: "R4", if: "features replace the customer problem and outcome", then: "recommend leading with the problem", else: "keep the problem-first framing", confidence: 1 },
    { id: "R5", if: "the content tries to solve every problem at once", then: "recommend narrowing the scope", else: "keep the single-problem scope", confidence: 1 },
    { id: "R6", if: "a customer frustration would be unsupported by the brief or campaign context", then: "never invent it; reject the recommendation", else: "proceed with grounded problems only", confidence: 1 },
    { id: "R7", if: "problem discovery conflicts with creator intent", then: "preserve creator intent", else: "proceed", confidence: 1 },
  ],
  knowledge: {
    bestPractices: [
      "State the customer's one dominant problem before any feature or solution.",
      "Ground every identified problem in the Creative Brief and Campaign Context.",
      "Separate symptoms from the underlying problem you are truly solving.",
      "Keep one problem per message; pick the dominant one when several compete.",
      "Write problems in the language the customer uses.",
    ],
    writingGuidance: [
      "Open with the problem the customer feels, not the product's features.",
      "Describe the root cause so the audience recognizes the deeper issue.",
      "Name the outcome the customer wants once the problem is solved.",
      "Avoid claiming the offer solves everything at once.",
    ],
    businessGuidance: [
      "A sharp problem makes the solution obvious; a scattered problem confuses the audience.",
      "Messaging that names one real problem outperforms messaging that names many.",
    ],
    qualityGuidance: [
      "No problem is ever invented; every identified problem is traceable to the brief or context.",
      "Features support the problem; they never replace it.",
    ],
    optimizationGuidance: [
      "When Problem Focus is low, pick the dominant problem and drop the rest.",
      "Re-run evaluation after editing to confirm one clear, grounded problem remains.",
    ],
  },
  workflow: {
    requiredInputs: ["creativeBrief", "campaignContext"],
    optionalInputs: ["draftContent", "contentType", "audienceProfile", "offerInformation"],
    inferredInputs: ["contentType"],
    phases: [
      { phase: "analyze", description: "deterministically score the problem across focus, root accuracy, alignment, relevance, and simplicity" },
      { phase: "preserve", description: "never auto-rewrite; problem improvements are surfaced as recommendations only" },
      { phase: "recommend", description: "return ordered recommendations for the Creative Intelligence Engine to apply without inventing frustrations" },
    ],
    completionCriteria: [
      "problem scores returned for all five dimensions",
      "preservedContent is byte-identical to the input; no automatic rewrites",
      "the primary problem, when identified, is grounded in the brief or campaign context",
    ],
  },
  validation: {
    requiredAssets: [],
    missingContext: {
      creativeBrief: "the creative brief that states the campaign goal and subject",
      campaignContext: "the campaign context that grounds the customer problem",
    },
    unsupportedRequests: [
      "requests to invent a customer problem",
      "requests to fabricate customer frustrations",
      "requests to invent audience pain points",
    ],
    qualityGates: [
      "no problem invented",
      "one dominant problem identified",
      "problem grounded in brief or context",
    ],
  },
  aiTwin: {
    internallyVerifies: [
      "is the primary customer problem clear?",
      "is the root cause identified, not just the symptom?",
      "is the problem aligned with the brief and campaign context?",
      "does the problem matter to the customer?",
      "is the scope focused on a single problem?",
    ],
    userVisible: "no user-facing changes unless the skill determines the problem can be sharpened without inventing frustrations or changing the creator's intent",
  },
  creativeIntelligence: {
    recommendWhen: [
      "the brief or content does not state a clear customer problem",
      "several problems compete for the audience's attention",
      "the content leads with features instead of the problem",
      "only symptoms are described without a root cause",
    ],
    avoidWhen: [
      "the format is purely promotional and the problem is already fixed by the brief",
      "the request requires the message to remain deliberately ambiguous",
      "the audience problem is externally defined and cannot be changed",
    ],
    reasoning: "fit-first: recommend when the request targets identifying the customer problem before the writing, not when the brief is deliberately unspecified",
  },
};
