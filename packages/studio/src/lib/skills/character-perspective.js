// Approved Creative Skill Pack V1 — Character Perspective.
// Fourth Storytelling skill for Creative OS.
// Produced by the Knowledge Compiler and reviewed by the MavenSync team.
//
// This skill evaluates whether communication consistently maintains the intended
// narrative perspective and audience focus throughout the content — whether the
// audience always knows whose experience is being communicated. Where Story
// Structure, Narrative Flow, and Emotional Pacing shape the framework, movement,
// and emotional rhythm of a narrative, Character Perspective keeps the point of
// view stable: viewpoint consistency, audience alignment, empathy, and narrative
// focus — while preserving creator intent, never inventing characters, dialogue,
// or experiences, and never forcing perspective into informational content. It
// evaluates perspective consistency, not character creation. It is shared
// platform intelligence, available to every studio. It is not a recipe, a
// provider, a studio, or an agent.
//
// The default export is the registered Skill Manifest (the Creative Skills
// Registry reads only the manifest). The named exports are the deterministic
// analysis implementation: evaluateCharacterPerspective() runs the seven
// decision rules and the five perspective scores, and verifyCharacterPerspective()
// exposes the AI Twin's five internal checks. No provider, recipe, or studio
// logic is touched. This skill is the fourth in the Storytelling progression
// Story Structure -> Narrative Flow -> Emotional Pacing -> Character Perspective,
// and it builds on those skills: it reuses the story stage lexicons for grounding
// checks, the narrative transition markers to judge whether perspective shifts
// are explained, and the emotional lexicons to evaluate empathy.

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
import {
  POSITIVE_EMOTION_MARKERS,
  NEGATIVE_EMOTION_MARKERS,
} from "./emotional-pacing.js";

export const CHARACTER_PERSPECTIVE_SKILL_ID = "character-perspective";

// ── Deterministic perspective lexicons ───────────────────────────────────────
// First-person markers: pronouns that put the narrator or the creator's group at
// the center of the experience. Exported additively so future Storytelling
// skills reuse the same first-person vocabulary.
export const FIRST_PERSON_MARKERS = [
  "i", "i'm", "i've", "i'll", "i'd", "me", "my", "mine", "myself",
  "we", "we're", "we've", "we'll", "we'd", "us", "our", "ours", "ourselves",
];

// Second-person markers: pronouns that put the audience at the center of the
// experience. Exported additively so future Storytelling skills reuse the same
// second-person vocabulary.
export const SECOND_PERSON_MARKERS = [
  "you", "you're", "you've", "you'll", "you'd", "your", "yours",
  "yourself", "yourselves",
];

// Third-person markers: pronouns that follow a protagonist other than the
// narrator or audience. Exported additively so future Storytelling skills reuse
// the same third-person vocabulary.
export const THIRD_PERSON_MARKERS = [
  "he", "he's", "he'd", "him", "his", "himself",
  "she", "she's", "she'd", "her", "hers", "herself",
  "they", "they're", "they've", "they'd", "them", "their", "theirs", "themselves",
];

// Grouped perspective vocabulary for dependent skills and introspection.
export const PERSPECTIVE_MARKERS = {
  firstPerson: FIRST_PERSON_MARKERS,
  secondPerson: SECOND_PERSON_MARKERS,
  thirdPerson: THIRD_PERSON_MARKERS,
};

const PERSPECTIVE_PERSON = {
  first: "first",
  second: "second",
  third: "third",
};

// Informational content language: dry, factual, reference material with no
// narrative perspective (Rule 5).
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

// Dominant grammatical person of a sentence based on its pronoun tokens. Returns
// "first", "second", "third", or null when no person dominates (no pronouns or
// a tie).
function sentencePerson(sentence) {
  const tokens = tokenizeWords(sentence).map((word) => word.toLowerCase());
  const first = tokens.filter((token) => FIRST_PERSON_MARKERS.includes(token)).length;
  const second = tokens.filter((token) => SECOND_PERSON_MARKERS.includes(token)).length;
  const third = tokens.filter((token) => THIRD_PERSON_MARKERS.includes(token)).length;
  const max = Math.max(first, second, third);
  if (max === 0) return null;
  const leaders = [
    [PERSPECTIVE_PERSON.first, first],
    [PERSPECTIVE_PERSON.second, second],
    [PERSPECTIVE_PERSON.third, third],
  ].filter(([, count]) => count === max);
  if (leaders.length !== 1) return null;
  return leaders[0][0];
}

export function analyzeCharacterPerspective({
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
  const total = sentences.length;

  // Per-sentence perspective profile.
  const sentenceReport = sentences.map((sentence) => ({
    sentence,
    person: sentencePerson(sentence),
    startsWithTransition: startsWithTransition(sentence),
  }));

  // Document totals and per-person sentence counts.
  const firstTotal = sentenceReport.filter((entry) => entry.person === PERSPECTIVE_PERSON.first).length;
  const secondTotal = sentenceReport.filter((entry) => entry.person === PERSPECTIVE_PERSON.second).length;
  const thirdTotal = sentenceReport.filter((entry) => entry.person === PERSPECTIVE_PERSON.third).length;
  const personSentenceCounts = {
    first: firstTotal,
    second: secondTotal,
    third: thirdTotal,
  };
  const definiteSentences = firstTotal + secondTotal + thirdTotal;
  const coverage = total === 0 ? 0 : definiteSentences / total;

  // Perspective shifts: adjacent sentences with different definite persons.
  // Shifts explained by a transition are acceptable; unexplained shifts are not.
  let shifts = 0;
  let explainedShifts = 0;
  let unexplainedShifts = 0;
  for (let i = 0; i < sentences.length - 1; i += 1) {
    const current = sentenceReport[i].person;
    const next = sentenceReport[i + 1].person;
    if (current && next && current !== next) {
      shifts += 1;
      if (sentenceReport[i + 1].startsWithTransition) explainedShifts += 1;
      else unexplainedShifts += 1;
    }
  }

  // Meaningful multi-perspective usage: at least two persons carry two or more
  // sentences, signaling an intentional choice rather than drift.
  const meaningfulPersons = Object.entries(personSentenceCounts)
    .filter(([, count]) => count >= 2)
    .map(([person]) => person);
  const multiPerspective = meaningfulPersons.length >= 2;

  // Narrative focus: does the protagonist of the first half stay the protagonist
  // of the second half? A drift signals the audience loses whose story this is.
  const half = Math.ceil(total / 2);
  const firstHalf = sentenceReport.slice(0, half);
  const secondHalf = sentenceReport.slice(half);
  const dominantPerson = (entries) => {
    const counts = { first: 0, second: 0, third: 0 };
    for (const entry of entries) {
      if (entry.person) counts[entry.person] += 1;
    }
    const leaders = Object.entries(counts).filter(([, count]) => count === Math.max(...Object.values(counts)) && count > 0);
    return leaders.length === 1 ? leaders[0][0] : null;
  };
  const firstHalfPerson = dominantPerson(firstHalf);
  const secondHalfPerson = dominantPerson(secondHalf);
  const focusDrift = Boolean(firstHalfPerson && secondHalfPerson && firstHalfPerson !== secondHalfPerson);

  // Perspective type: the intended viewpoint of the piece.
  let perspectiveType = "neutral";
  const allPronouns = firstTotal + secondTotal + thirdTotal;
  if (allPronouns > 0) {
    if (meaningfulPersons.length === 1) {
      perspectiveType = `${meaningfulPersons[0]}-person`;
    } else if (meaningfulPersons.length >= 2) {
      perspectiveType = "mixed";
    } else {
      const [dominant] = Object.entries(personSentenceCounts)
        .sort((a, b) => b[1] - a[1])[0];
      perspectiveType = `${dominant}-person`;
    }
  }

  // Empathy: whether the content carries emotional language that supports
  // understanding the experience being communicated.
  const empathyHits = countMatches(text, POSITIVE_EMOTION_MARKERS)
    + countMatches(text, NEGATIVE_EMOTION_MARKERS);
  const positiveHits = countMatches(text, POSITIVE_EMOTION_MARKERS);
  const negativeHits = countMatches(text, NEGATIVE_EMOTION_MARKERS);

  // Story grounding for Rule 6: narrative content (opening, conflict, or
  // resolution language) that the brief and context do not ground is treated as
  // unverifiable and rejected.
  const storyMarkerHits = countMatches(text, STORY_STAGES.opening)
    + countMatches(text, CONFLICT_MARKERS)
    + countMatches(text, RESOLUTION_MARKERS);
  const storySignalsPresent = storyMarkerHits > 0;
  const fabricatedStory = storySignalsPresent && !hasGrounding;

  // Whether perspective rules apply. Informational content has no narrative
  // perspective; its neutrality is honored (Rule 5).
  const informationalHits = countMatches(text, INFORMATIONAL_LEXICON);
  const informationalContent = INFORMATIONAL_TYPES.includes(String(contentType || "").toLowerCase())
    || (informationalHits > 0 && allPronouns === 0 && empathyHits === 0);

  const signals = {
    sentenceCount: total,
    wordCount,
    firstTotal,
    secondTotal,
    thirdTotal,
    definiteSentences,
    coverage,
    shifts,
    explainedShifts,
    unexplainedShifts,
    multiPerspective,
    meaningfulPersons,
    focusDrift,
    firstHalfPerson,
    secondHalfPerson,
    empathyHits,
    positiveHits,
    negativeHits,
    sentenceReport,
    hasGrounding,
  };

  // ── Scoring (each dimension independent, 0-100) ─────────────────────────
  let consistency = 100;
  let audienceAlignment = 100;
  let empathy = 100;
  let narrativeFocus = 100;
  let viewpointStability = 100;

  if (emptyContent) {
    consistency = 50;
    audienceAlignment = 50;
    empathy = 50;
    narrativeFocus = 50;
    viewpointStability = 50;
  } else if (informationalContent) {
    consistency = 90;
    audienceAlignment = 90;
    empathy = 85;
    narrativeFocus = 90;
    viewpointStability = 90;
  } else if (fabricatedStory) {
    consistency = 50;
    audienceAlignment = 55;
    empathy = 55;
    narrativeFocus = 50;
    viewpointStability = 60;
  } else {
    consistency -= Math.min(60, unexplainedShifts * 30);
    if (allPronouns === 0) consistency -= 25;

    if (coverage < 0.2) audienceAlignment -= 50;
    audienceAlignment -= Math.min(40, unexplainedShifts * 20);
    if (multiPerspective && unexplainedShifts >= 1) audienceAlignment -= 15;

    if (empathyHits === 0) empathy -= 60;
    else if (!(positiveHits > 0 && negativeHits > 0)) empathy -= 20;

    if (focusDrift) narrativeFocus -= 60;
    narrativeFocus -= Math.min(30, unexplainedShifts * 15);

    viewpointStability -= Math.min(60, shifts * 15);
  }

  consistency = clamp(consistency, 0, 100);
  audienceAlignment = clamp(audienceAlignment, 0, 100);
  empathy = clamp(empathy, 0, 100);
  narrativeFocus = clamp(narrativeFocus, 0, 100);
  viewpointStability = clamp(viewpointStability, 0, 100);

  const perspectiveScore = Math.round(
    0.25 * consistency
    + 0.2 * audienceAlignment
    + 0.2 * empathy
    + 0.2 * narrativeFocus
    + 0.15 * viewpointStability,
  );

  const flags = {
    emptyContent,
    informationalContent,
    perspectiveShift: !informationalContent && !emptyContent && unexplainedShifts >= 1,
    unclearViewpoint: !informationalContent && !emptyContent && coverage < 0.2 && total >= 4,
    multiPerspective: !informationalContent && !emptyContent && multiPerspective,
    focusDrift: !informationalContent && !emptyContent && focusDrift,
    fabricatedStory,
  };

  return {
    skillId: CHARACTER_PERSPECTIVE_SKILL_ID,
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
      consistency,
      audienceAlignment,
      empathy,
      narrativeFocus,
      viewpointStability,
    },
    perspectiveType,
    perspectiveScore,
    consistencyScore: consistency,
    audienceAlignmentScore: audienceAlignment,
    empathyScore: empathy,
    narrativeFocusScore: narrativeFocus,
    viewpointStabilityScore: viewpointStability,
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

  // Rule 6 overrides everything: characters, dialogue, and experiences are never
  // invented, and ungrounded stories are never accepted.
  if (flags.fabricatedStory) {
    push(
      "R6",
      "high",
      "Reject the recommendation: never invent characters, dialogue, or personal experiences unsupported by the Creative Brief or Campaign Context.",
      "A narrative appears in the content, but no brief or context grounds it.",
    );
    push(
      "R7",
      "high",
      "Preserve creator intent: do not invent a narrator or protagonist the audience may not recognize.",
      "Perspective comes from the creator or the brief, never from assumption.",
    );
    return recommendations;
  }

  if (flags.informationalContent) {
    push(
      "R5",
      "info",
      "Do not force storytelling or a narrative perspective into informational content; keep it factual.",
      "The content is informational and contains no narrative perspective.",
    );
    return recommendations;
  }

  if (flags.perspectiveShift && !flags.multiPerspective) {
    push(
      "R1",
      "medium",
      "Maintain one consistent viewpoint so the audience always knows whose experience they are following.",
      "Perspective changes unexpectedly within the content.",
    );
  }
  if (flags.unclearViewpoint) {
    push(
      "R2",
      "medium",
      "Reinforce the intended viewpoint so the audience perspective stays clear.",
      "Audience perspective becomes unclear across the content.",
    );
  }
  if (flags.perspectiveShift && flags.multiPerspective) {
    push(
      "R3",
      "medium",
      "Make the transitions between the intentionally used perspectives understandable.",
      "Multiple perspectives are used without understandable transitions between them.",
    );
  }
  if (flags.focusDrift) {
    push(
      "R4",
      "medium",
      "Restore focus to the intended protagonist of the narrative.",
      "Attention shifts away from the intended protagonist over the course of the content.",
    );
  }
  return recommendations;
}

// ── Meaning-preserving perspective preservation ──────────────────────────────
// Character Perspective is an evaluation of viewpoint: rewrites risk inventing
// characters or dialogue, so every improvement is surfaced as a recommendation
// and the creator's copy is never rewritten. preserveCharacterPerspective is
// therefore an identity pass that documents that guarantee.

export function preserveCharacterPerspective(draftContent) {
  const original = String(draftContent || "").trim();
  return { preservedContent: original, edits: [] };
}

// ── Public skill API ─────────────────────────────────────────────────────────

// Runs the full deterministic Character Perspective analysis. Accepts the skill
// inputs (creativeBrief, campaignContext, audienceProfile, draftContent,
// contentType, brandVoice) and returns preservedContent, perspectiveType, the
// five perspective scores, perspectiveScore, and recommendations.
export function evaluateCharacterPerspective(input = {}) {
  const analysis = analyzeCharacterPerspective(input);
  const { preservedContent, edits } = preserveCharacterPerspective(input.draftContent);
  const recommendations = buildRecommendations(analysis);
  return {
    ...analysis,
    preservedContent,
    edits,
    characterPerspectiveRecommendations: recommendations,
    recommendations,
  };
}

// AI Twin internal verification — no user-facing changes unless the skill
// determines the perspective can be improved without inventing characters,
// dialogue, or experiences, or changing the creator's intent.
export function verifyCharacterPerspective(input = {}) {
  const analysis = analyzeCharacterPerspective(input);
  const scores = analysis.scores;
  return {
    skillId: CHARACTER_PERSPECTIVE_SKILL_ID,
    whosePerspectiveIsClear: scores.consistency >= 70 && !analysis.flags.unclearViewpoint,
    audienceRemainsOriented: scores.audienceAlignment >= 70 && !analysis.flags.unclearViewpoint,
    viewpointTransitionsUnderstandable: scores.viewpointStability >= 70 && !analysis.flags.perspectiveShift,
    empathySupportsCommunication: scores.empathy >= 70,
    intendedProtagonistMaintained: scores.narrativeFocus >= 70 && !analysis.flags.focusDrift,
    canImproveWithoutChangingIntent: analysis.perspectiveScore < 70,
    scores,
    flags: analysis.flags,
  };
}

// ── Skill Manifest ───────────────────────────────────────────────────────────
// Registered in the Creative Skills Registry. All v1 required fields are
// present; v2 additive sections (capabilities, decisionRules, knowledge,
// workflow, validation, aiTwin, creativeIntelligence, metadata) are advisory.
// dependsOn, complements, sharedUtilities, and compatibleRecipes are
// informational metadata only: they describe relationships and do not
// introduce a dependency engine or runtime loading behavior.

export default {
  skillId: CHARACTER_PERSPECTIVE_SKILL_ID,
  name: "Character Perspective",
  shortName: "Perspective",
  description: "Evaluate whether communication consistently maintains the intended narrative perspective and audience focus — viewpoint consistency, audience alignment, empathy, and narrative focus — while preserving creator intent, never inventing characters, dialogue, or experiences, and never forcing perspective into informational content.",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  category: "storytelling",
  subcategory: "character-perspective",
  tags: ["storytelling", "perspective", "point-of-view", "viewpoint", "narrator", "audience", "communication"],
  capabilities: ["character_perspective"],
  supportedStudios: ["marketing", "publishing", "ai-twin", "video", "audio", "workflow"],
  dependsOn: ["story-structure", "narrative-flow", "emotional-pacing"],
  complements: ["story-continuity"],
  sharedUtilities: ["communication-utils"],
  compatibleRecipes: [
    "video-script",
    "podcast",
    "story-content",
    "webinar",
    "presentation",
    "blog",
    "educational-content",
    "sales-presentation",
  ],
  creativePrinciples: [
    "maintain-a-consistent-viewpoint: keep one perspective so the audience stays oriented",
    "keep-the-audience-oriented: make the intended viewpoint explicit and stable",
    "transition-intentionally: explain any intentional perspective change",
    "reinforce-empathy: use emotional language that supports understanding the experience",
    "preserve-narrative-focus: keep attention on the intended protagonist",
    "authenticity-preserving: never invent characters, dialogue, or personal experiences",
    "fit-first: do not force storytelling into informational content",
  ],
  vocabulary: [
    { concept: "perspective consistency", meaning: "how steadily one viewpoint is maintained", informs: "perspective" },
    { concept: "audience alignment", meaning: "how clearly the audience's viewpoint is reinforced", informs: "perspective" },
    { concept: "empathy", meaning: "how well the content supports understanding the experience", informs: "perspective" },
    { concept: "narrative focus", meaning: "how steadily attention stays on the intended protagonist", informs: "perspective" },
    { concept: "viewpoint stability", meaning: "how few perspective shifts the piece contains", informs: "perspective" },
  ],
  craftGuidance: {
    summary: "Keep one clear viewpoint so the audience always knows whose experience they are following: maintain consistency, transition intentionally, reinforce empathy, and preserve narrative focus.",
    subject: "the narrative perspective of the communication, grounded in the Creative Brief and Campaign Context",
    composition: "one dominant viewpoint, explained shifts, and a stable protagonist",
    tone: "authentic and grounded, never invented",
    language: "pronouns and perspective markers that keep the viewpoint unambiguous",
    structure: "a consistent point of view from opening to resolution",
    flow: "perspective that never leaves the audience guessing whose story this is",
  },
  constraints: [
    "never fabricate dialogue",
    "never invent experiences",
    "never invent characters",
    "never change factual meaning",
    "never override creator intent",
  ],
  evaluationRules: [
    { quality: "consistency", signal: "one viewpoint is maintained throughout", evidence: "unexplained perspective shift count" },
    { quality: "audienceAlignment", signal: "the audience viewpoint stays clear", evidence: "perspective coverage and shift count" },
    { quality: "empathy", signal: "emotional language supports understanding the experience", evidence: "positive and negative emotional marker hits" },
    { quality: "narrativeFocus", signal: "attention stays on the intended protagonist", evidence: "first-half versus second-half dominant person" },
    { quality: "viewpointStability", signal: "the piece changes perspective rarely", evidence: "total perspective shift count" },
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
    { id: "R1", if: "perspective changes unexpectedly", then: "recommend maintaining one consistent viewpoint", else: "keep the existing viewpoint", confidence: 1 },
    { id: "R2", if: "audience perspective becomes unclear", then: "recommend reinforcing the intended viewpoint", else: "keep the clear viewpoint", confidence: 1 },
    { id: "R3", if: "multiple perspectives are intentionally used", then: "ensure transitions are understandable", else: "keep the current transitions", confidence: 1 },
    { id: "R4", if: "communication shifts attention away from the intended protagonist", then: "recommend restoring focus", else: "keep the protagonist focus", confidence: 1 },
    { id: "R5", if: "informational documentation contains no narrative perspective", then: "do not force storytelling", else: "proceed with the perspective", confidence: 1 },
    { id: "R6", if: "characters, dialogue, or personal experiences would be invented", then: "never invent them; reject the recommendation", else: "proceed with grounded perspective only", confidence: 1 },
    { id: "R7", if: "perspective consistency and creator intent conflict", then: "preserve creator intent while improving consistency", else: "proceed", confidence: 1 },
  ],
  knowledge: {
    bestPractices: [
      "Maintain a consistent viewpoint.",
      "Keep the audience oriented.",
      "Transition intentionally between perspectives.",
      "Reinforce empathy without inventing experiences.",
      "Preserve narrative focus on the intended protagonist.",
      "Support emotional understanding with authentic language.",
      "Never invent characters, dialogue, or personal experiences.",
    ],
    writingGuidance: [
      "Choose one viewpoint and hold it.",
      "Make the audience's place in the story clear.",
      "Explain any intentional perspective change.",
      "Keep the protagonist unmistakable throughout.",
    ],
    businessGuidance: [
      "A stable perspective keeps the audience connected to the message.",
      "Shifting viewpoint without explanation breaks trust in whose story this is.",
    ],
    qualityGuidance: [
      "No characters, dialogue, or experiences are ever fabricated.",
      "Perspective is recommended, never inserted.",
      "Informational content is never forced into a narrative perspective.",
    ],
    optimizationGuidance: [
      "When Perspective Consistency is low, remove the unexpected shifts first.",
      "Re-run evaluation after restoring focus to confirm the viewpoint reads stable.",
    ],
  },
  workflow: {
    requiredInputs: ["creativeBrief", "campaignContext"],
    optionalInputs: ["draftContent", "contentType", "audienceProfile", "brandVoice"],
    inferredInputs: ["contentType"],
    phases: [
      { phase: "analyze", description: "deterministically score consistency, alignment, empathy, focus, and stability" },
      { phase: "preserve", description: "never auto-rewrite; perspective improvements are surfaced as recommendations only" },
      { phase: "recommend", description: "return ordered recommendations for the Creative Intelligence Engine to apply without inventing characters or dialogue" },
    ],
    completionCriteria: [
      "perspective scores returned for all five dimensions",
      "perspectiveType reports the intended viewpoint",
      "preservedContent is byte-identical to the input; no automatic rewrites",
      "recommendations never invent characters, dialogue, or personal experiences",
    ],
  },
  validation: {
    requiredAssets: [],
    missingContext: {
      creativeBrief: "the creative brief that states the campaign goal and subject",
      campaignContext: "the campaign context that grounds the narrative",
    },
    unsupportedRequests: [
      "requests to invent characters",
      "requests to fabricate dialogue",
      "requests to invent personal experiences",
      "requests to force storytelling into informational content",
    ],
    qualityGates: [
      "no character invented",
      "no dialogue invented",
      "no experience invented",
      "no perspective forced where it does not belong",
    ],
  },
  aiTwin: {
    internallyVerifies: [
      "whose perspective is this?",
      "does the audience remain oriented?",
      "are viewpoint transitions understandable?",
      "does empathy support communication?",
      "is the intended protagonist maintained?",
    ],
    userVisible: "no user-facing changes unless the skill determines the perspective can be improved without inventing characters, dialogue, or experiences, or changing the creator's intent",
  },
  creativeIntelligence: {
    recommendWhen: [
      "perspective changes without explanation",
      "audience viewpoint becomes unclear",
      "protagonist focus changes unexpectedly",
      "empathy conflicts with narrative intent",
      "storytelling is forced into technical content",
    ],
    avoidWhen: [
      "the format is a dry reference with no narrative intent",
      "the request requires a deliberately neutral, voiceless perspective",
      "the viewpoint is externally fixed and cannot be changed",
    ],
    reasoning: "fit-first: recommend when the request targets whose experience is being communicated, not when a narrative perspective would be forced onto content that deliberately has none",
  },
};
