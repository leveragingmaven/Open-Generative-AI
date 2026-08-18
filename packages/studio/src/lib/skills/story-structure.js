// Approved Creative Skill Pack V1 — Story Structure.
// Foundational Storytelling skill for Creative OS.
// Produced by the Knowledge Compiler and reviewed by the MavenSync team.
//
// This skill evaluates whether communication follows a recognizable narrative
// structure that helps an audience understand, follow, and emotionally engage
// with the message: an opening that establishes context, a central conflict,
// logical progression, and an earned resolution — while preserving creator
// intent, never inventing story events or lived experiences, and never forcing
// a story into informational content. It evaluates structure, not writing
// style. It is shared platform intelligence, available to every studio. It is
// not a recipe, a provider, a studio, or an agent.
//
// The default export is the registered Skill Manifest (the Creative Skills
// Registry reads only the manifest). The named exports are the deterministic
// analysis implementation: evaluateStoryStructure() runs the seven decision
// rules and the five structure scores, and verifyStoryStructure() exposes the
// AI Twin's five internal checks. No provider, recipe, or studio logic is
// touched. This skill begins the Storytelling Skill Pack: Story Structure
// establishes the foundation (a coherent narrative before pacing, emotion,
// perspective, and continuity are refined), and it builds on the Communication
// Skill Pack — Message Clarity ensures the story is understood and Curiosity
// Building keeps the audience engaged through it.

import { splitIntoSentences, tokenizeWords, countMatches, clamp } from "./communication-utils.js";

export const STORY_STRUCTURE_SKILL_ID = "story-structure";

// ── Deterministic lexicons and thresholds ────────────────────────────────────
// Conflict markers: language that names the challenge being overcome (Rule 2).
// Exported so dependent Storytelling skills (Emotional Pacing, Narrative Flow)
// reuse the same conflict vocabulary.
export const CONFLICT_MARKERS = [
  "problem", "challenge", "challenges", "the issue", "struggle", "struggled",
  "struggling", "hardest", "difficult", "everything went wrong", "things got",
  "it was tough", "i failed", "we failed", "failed", "fails", "setback",
  "roadblock", "obstacle", "frustrated", "frustrating", "seemed impossible",
  "it seemed impossible", "almost gave up", "hit rock bottom", "worst",
  "mistake", "mistakes", "didn't work", "did not work", "crashed", "crashing",
  "went wrong", "broke", "broken", "rejection", "rejected", "doubt",
  "painful", "no way out", "stuck",
];

// Resolution markers: language that names the outcome or lesson once the
// conflict is overcome (Rule 3). Exported so dependent Storytelling skills
// reuse the same resolution vocabulary.
export const RESOLUTION_MARKERS = [
  "finally", "in the end", "eventually", "i realized", "we realized",
  "i discovered", "we discovered", "figured it out", "figured out",
  "the answer", "the solution", "that's when", "that is when", "turned out",
  "learned", "lesson", "and that's how", "and that is how", "now i", "now we",
  "today i", "today we", "which is why", "that's why", "that is why",
  "the takeaway", "what i learned", "what we learned", "solved it",
  "solved everything", "fixed it", "fixed the", "overcame", "made it through",
  "found a way", "succeeded", "made it", "turned around", "worked out",
  "it works now", "it worked",
];

// Opening markers: language that establishes the beginning and context of the
// story (the "once upon a time" of the piece).
const OPENING_MARKERS = [
  "once upon a time", "there was", "it all started", "let me tell you",
  "picture this", "the beginning", "started out", "started when",
  "it began", "back then", "when i was", "i remember", "i used to",
  "we used to", "at first", "to begin", "for years", "from day one",
  "early on", "i'll never forget", "i will never forget", "the day",
];

// Progression markers: language that moves the audience forward through the
// story, from one event to the next (Rule 4).
const PROGRESSION_MARKERS = [
  "after that", "after this", "as a result", "step by step", "gradually",
  "over time", "little by little", "eventually", "which led to", "leading to",
  "this led", "and so", "from there", "after trying", "then we", "then i",
  "then it", "next step", "each day", "bit by bit", "by the end",
  "first we", "first i", "next came", "then came", "and then",
];

// Story stages: the canonical narrative building blocks, ordered opening,
// conflict, progression, resolution. Exported as the reusable stage catalog so
// dependent skills can introspect the recognized narrative structure.
export const STORY_STAGES = {
  opening: OPENING_MARKERS,
  conflict: CONFLICT_MARKERS,
  progression: PROGRESSION_MARKERS,
  resolution: RESOLUTION_MARKERS,
};

// Informational content language: dry, factual, reference material that does
// not need a story (Rule 5). Content types in this list are treated the same
// way.
const INFORMATIONAL_TYPES = [
  "informational", "documentation", "document", "reference",
  "reference-guide", "user-guide", "manual", "faq", "knowledge-base",
  "specification", "spec", "technical", "api-reference",
];

const INFORMATIONAL_LEXICON = [
  "documentation", "reference", "see section", "table below", "figure",
  "parameter", "parameters", "argument", "arguments", "returns",
  "return value", "default value", "config", "configuration", "configure",
  "installation", "install", "run the command", "command line", "syntax",
  "specification", "manual", "usage", "api", "endpoint", "schema",
  "prerequisites", "how to install", "function", "class", "method",
  "module", "database", "data type", "example usage",
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

// Builds the dominant-stage sequence of a text: for each sentence, the stage
// with the most marker hits (opening=0, conflict=1, progression=2,
// resolution=3). Sentences with no stage are skipped.
function extractStageSequence(sentences) {
  const ranks = [];
  for (const sentence of sentences) {
    const counts = [
      countMatches(sentence, STORY_STAGES.opening),
      countMatches(sentence, CONFLICT_MARKERS),
      countMatches(sentence, STORY_STAGES.progression),
      countMatches(sentence, RESOLUTION_MARKERS),
    ];
    const max = Math.max(...counts);
    if (max > 0) ranks.push(counts.indexOf(max));
  }
  return ranks;
}

// Counts backward moves in a stage sequence: a later stage appearing before an
// earlier stage, which reads as jumping between unrelated parts of the story.
function countRegressions(ranks) {
  let count = 0;
  for (let i = 0; i < ranks.length - 1; i += 1) {
    if (ranks[i] > ranks[i + 1]) count += 1;
  }
  return count;
}

export function analyzeStoryStructure({
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

  // Stage presence across the document.
  const openingHits = countMatches(text, STORY_STAGES.opening);
  const conflictHits = countMatches(text, CONFLICT_MARKERS);
  const progressionHits = countMatches(text, STORY_STAGES.progression);
  const resolutionHits = countMatches(text, RESOLUTION_MARKERS);
  const storyMarkerHits = openingHits + conflictHits + progressionHits + resolutionHits;
  const storySignalsPresent = storyMarkerHits > 0;
  const openingPresent = openingHits > 0;
  const conflictPresent = conflictHits > 0;
  const progressionPresent = progressionHits > 0;
  const resolutionPresent = resolutionHits > 0;

  // Recognizable arc: a beginning, a middle, and an end.
  const recognizableArc = openingPresent && conflictPresent && resolutionPresent;

  // Stage ordering: a story that opens with its resolution has placed the
  // solution before the audience understands the problem (Rule 3).
  const ranks = extractStageSequence(sentences);
  const resolutionBeforeConflict = ranks.length > 0 && ranks[0] === 3;

  // Progression consistency: frequent backward moves mean the narrative jumps
  // between unrelated parts (Rule 4).
  const regressionCount = countRegressions(ranks);
  const narrativeJumps = storySignalsPresent && !resolutionBeforeConflict
    && conflictPresent && regressionCount >= 2;

  // Whether storytelling is appropriate. Informational content does not need a
  // narrative structure and must not have one forced onto it (Rule 5).
  const informationalHits = countMatches(text, INFORMATIONAL_LEXICON);
  const informationalContent = INFORMATIONAL_TYPES.includes(String(contentType || "").toLowerCase())
    || (informationalHits > 0 && storyMarkerHits === 0);

  // Rule 6 — never invent experiences, examples, or fictional events. A story
  // the Creative Brief and Campaign Context do not ground is treated as an
  // invention and rejected.
  const fabricatedStory = storySignalsPresent && !hasGrounding;

  const signals = {
    sentenceCount: sentences.length,
    wordCount,
    openingHits,
    conflictHits,
    progressionHits,
    resolutionHits,
    storyMarkerHits,
    informationalHits,
    hasGrounding,
    recognizableArc,
    stageSequence: [...ranks],
    regressionCount,
  };

  // ── Scoring (each dimension independent, 0-100) ─────────────────────────
  let opening = 100;
  let conflict = 100;
  let progression = 100;
  let resolution = 100;
  let structuralCompleteness = 100;

  if (emptyContent) {
    opening = 50;
    conflict = 50;
    progression = 50;
    resolution = 50;
    structuralCompleteness = 50;
  } else if (informationalContent) {
    opening = 80;
    conflict = 80;
    progression = 80;
    resolution = 80;
    structuralCompleteness = 90;
  } else if (fabricatedStory) {
    opening = 70;
    conflict = 40;
    progression = 60;
    resolution = 40;
    structuralCompleteness = 30;
  } else {
    if (!storySignalsPresent) {
      opening -= 70;
      conflict -= 70;
      progression -= 70;
      resolution -= 70;
      structuralCompleteness -= 80;
    } else {
      if (!openingPresent) opening -= 50;
      if (resolutionBeforeConflict) conflict -= 40;
      if (!conflictPresent) conflict -= 60;
      if (narrativeJumps) progression -= 55;
      if (!progressionPresent) progression -= 30;
      if (!resolutionPresent) resolution -= 55;
      structuralCompleteness -= (openingPresent ? 0 : 25)
        + (conflictPresent ? 0 : 25)
        + (progressionPresent ? 0 : 25)
        + (resolutionPresent ? 0 : 25);
      if (resolutionBeforeConflict) structuralCompleteness -= 30;
    }
  }

  opening = clamp(opening, 0, 100);
  conflict = clamp(conflict, 0, 100);
  progression = clamp(progression, 0, 100);
  resolution = clamp(resolution, 0, 100);
  structuralCompleteness = clamp(structuralCompleteness, 0, 100);

  const storyStructureScore = Math.round(
    0.2 * opening
    + 0.2 * conflict
    + 0.25 * progression
    + 0.2 * resolution
    + 0.15 * structuralCompleteness,
  );

  // ── Outputs: story pattern ───────────────────────────────────────────────
  let storyPattern = "complete-arc";
  if (informationalContent) storyPattern = "informational";
  else if (!storySignalsPresent) storyPattern = "none";
  else if (resolutionBeforeConflict) storyPattern = "solution-first";
  else if (!conflictPresent) storyPattern = "incomplete";
  else if (!recognizableArc) storyPattern = "incomplete";
  else if (narrativeJumps) storyPattern = "disjointed";

  return {
    skillId: STORY_STRUCTURE_SKILL_ID,
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
      opening,
      conflict,
      progression,
      resolution,
      structuralCompleteness,
    },
    openingScore: opening,
    conflictScore: conflict,
    progressionScore: progression,
    resolutionScore: resolution,
    structuralCompletenessScore: structuralCompleteness,
    storyStructureScore,
    storyPattern,
    flags: {
      informationalContent,
      missingStructure: !informationalContent && !storySignalsPresent,
      resolutionBeforeConflict,
      missingConflict: storySignalsPresent && !resolutionBeforeConflict && !conflictPresent,
      narrativeJumps,
      fabricatedStory,
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

  // Rule 6 overrides everything: a story the brief and context do not ground
  // is never invented.
  if (flags.fabricatedStory) {
    push(
      "R6",
      "high",
      "Reject the recommendation: never invent experiences, examples, or fictional events unsupported by the Creative Brief or Campaign Context.",
      "A story appears in the content, but no brief or context grounds it.",
    );
    push(
      "R7",
      "high",
      "Preserve creator intent: do not fabricate a lived experience the audience may not relate to.",
      "A real story comes from the creator or the brief, never from assumption.",
    );
    return recommendations;
  }

  if (flags.informationalContent) {
    push(
      "R5",
      "info",
      "Do not force a narrative structure into informational content; keep it factual and clearly organized.",
      "The content is informational and does not require storytelling.",
    );
    return recommendations;
  }

  if (flags.missingStructure) {
    push(
      "R1",
      "high",
      "Establish a recognizable beginning, middle, and end.",
      "No recognizable narrative progression exists in the content.",
    );
  }
  if (flags.resolutionBeforeConflict) {
    push(
      "R3",
      "medium",
      "Restructure the sequence: introduce the problem before the resolution so the audience understands the stakes.",
      "The story opens with the solution before the problem is understood.",
    );
  }
  if (flags.missingConflict) {
    push(
      "R2",
      "medium",
      "Identify the central challenge the story overcomes.",
      "Storytelling is appropriate here, but no conflict is stated.",
    );
  }
  if (flags.narrativeJumps) {
    push(
      "R4",
      "medium",
      "Strengthen progression: connect the events so the narrative flows logically.",
      "The narrative jumps between unrelated parts of the story.",
    );
  }
  return recommendations;
}

// ── Meaning-preserving story preservation ────────────────────────────────────
// Story Structure is an organizational evaluation: restructuring the narrative
// is a rewrite risk, so every improvement is surfaced as a recommendation and
// the creator's copy is never rewritten. preserveStoryStructure is therefore an
// identity pass that documents that guarantee.

export function preserveStoryStructure(draftContent) {
  const original = String(draftContent || "").trim();
  return { preservedContent: original, edits: [] };
}

// ── Public skill API ─────────────────────────────────────────────────────────

// Runs the full deterministic Story Structure analysis. Accepts the skill
// inputs (creativeBrief, campaignContext, audienceProfile, draftContent,
// contentType, brandVoice) and returns preservedContent, the five structure
// scores, storyStructureScore, storyPattern, and recommendations.
export function evaluateStoryStructure(input = {}) {
  const analysis = analyzeStoryStructure(input);
  const { preservedContent, edits } = preserveStoryStructure(input.draftContent);
  const recommendations = buildRecommendations(analysis);
  return {
    ...analysis,
    preservedContent,
    edits,
    storyStructureRecommendations: recommendations,
    recommendations,
  };
}

// AI Twin internal verification — no user-facing changes unless the skill
// determines the structure can be sharpened without inventing stories, forcing
// a narrative, or changing the creator's intent.
export function verifyStoryStructure(input = {}) {
  const analysis = analyzeStoryStructure(input);
  const scores = analysis.scores;
  return {
    skillId: STORY_STRUCTURE_SKILL_ID,
    beginningClear: scores.opening >= 70,
    challengeUnderstandable: scores.conflict >= 70 && !analysis.flags.missingConflict,
    progressesLogically: scores.progression >= 70 && !analysis.flags.narrativeJumps,
    resolutionEarned: scores.resolution >= 70 && !analysis.flags.resolutionBeforeConflict,
    structureImprovesUnderstanding: scores.structuralCompleteness >= 70 && !analysis.flags.missingStructure,
    canImproveWithoutChangingIntent: analysis.storyStructureScore < 70,
    scores,
    flags: analysis.flags,
  };
}

// ── Skill Manifest ───────────────────────────────────────────────────────────
// Registered in the Creative Skills Registry. All v1 required fields are
// present; v2 additive sections (capabilities, decisionRules, knowledge,
// workflow, validation, aiTwin, creativeIntelligence, metadata) are advisory.
// dependsOn, complements, sharedUtilities, and compatibleContentTypes are
// informational metadata only: they describe relationships and do not
// introduce a dependency engine or runtime loading behavior.

export default {
  skillId: STORY_STRUCTURE_SKILL_ID,
  name: "Story Structure",
  shortName: "Story",
  description: "Evaluate whether communication follows a recognizable narrative structure that helps an audience understand, follow, and emotionally engage: an opening that establishes context, a central conflict, logical progression, and an earned resolution — while preserving creator intent, never inventing story events or lived experiences, and never forcing a story into informational content.",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  category: "storytelling",
  subcategory: "story-structure",
  tags: ["story", "storytelling", "narrative", "structure", "arc", "communication"],
  capabilities: ["story_structure"],
  supportedStudios: ["marketing", "publishing", "ai-twin", "video", "audio", "workflow"],
  dependsOn: ["message-clarity", "curiosity-building"],
  complements: ["emotional-pacing", "narrative-flow"],
  sharedUtilities: ["communication-utils"],
  compatibleContentTypes: [
    "video-script",
    "podcast",
    "presentation",
    "webinar",
    "blog",
    "social-story",
    "educational-content",
    "sales-presentation",
  ],
  creativePrinciples: [
    "structure-first: organize ideas into a recognizable beginning, middle, and end",
    "conflict-before-solution: introduce the challenge before the resolution",
    "logical-progression: move the audience through the story in order",
    "authenticity-preserving: never invent experiences, examples, or fictional events",
    "fit-first: do not force storytelling into informational content",
  ],
  vocabulary: [
    { concept: "narrative arc", meaning: "the progression from opening, through conflict, to resolution", informs: "structure" },
    { concept: "opening", meaning: "the beginning that establishes context", informs: "structure" },
    { concept: "conflict", meaning: "the central challenge the story overcomes", informs: "structure" },
    { concept: "progression", meaning: "the logical sequence that carries the audience forward", informs: "structure" },
    { concept: "resolution", meaning: "the earned outcome or lesson at the end", informs: "structure" },
  ],
  craftGuidance: {
    summary: "Organize ideas into a recognizable narrative arc — opening, conflict, progression, resolution — so the audience can follow and remember.",
    subject: "the narrative organization of the communication, grounded in the Creative Brief and Campaign Context",
    composition: "context early, conflict before solutions, logical progression, natural resolution",
    tone: "authentic and grounded, never invented or exaggerated",
    language: "story markers that signal stages and transitions without fabricating events",
    structure: "beginning, middle, and end arranged so the audience always knows where they are",
    flow: "from context to challenge to resolution so the story earns its ending",
  },
  constraints: [
    "never fabricate stories",
    "never invent lived experiences",
    "never change factual meaning",
    "never exaggerate events",
    "never override creator intent",
  ],
  evaluationRules: [
    { quality: "opening", signal: "the story establishes context early", evidence: "opening marker hits and first-stage position" },
    { quality: "conflict", signal: "the central challenge is understandable", evidence: "conflict marker presence and position" },
    { quality: "progression", signal: "the story moves logically between events", evidence: "progression marker hits and stage-sequence regressions" },
    { quality: "resolution", signal: "the resolution is earned and supported", evidence: "resolution marker presence and position" },
    { quality: "structuralCompleteness", signal: "the story forms a complete beginning, middle, and end", evidence: "stage coverage and sequence consistency" },
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
    { id: "R1", if: "content follows no recognizable progression", then: "recommend establishing a beginning, middle, and end", else: "keep the coherent structure", confidence: 1 },
    { id: "R2", if: "conflict is missing where storytelling is appropriate", then: "recommend identifying the challenge being overcome", else: "keep the stated challenge", confidence: 1 },
    { id: "R3", if: "resolution occurs before the audience understands the problem", then: "recommend restructuring the sequence", else: "keep the current order", confidence: 1 },
    { id: "R4", if: "the narrative jumps between unrelated ideas", then: "recommend strengthening progression", else: "keep the logical flow", confidence: 1 },
    { id: "R5", if: "informational content does not require storytelling", then: "do not force a narrative structure", else: "proceed with the narrative", confidence: 1 },
    { id: "R6", if: "experiences, examples, or fictional events would be invented", then: "never invent them; reject the recommendation", else: "proceed with grounded stories only", confidence: 1 },
    { id: "R7", if: "narrative organization and creator intent conflict", then: "preserve creator intent while improving structure", else: "proceed", confidence: 1 },
  ],
  knowledge: {
    bestPractices: [
      "Establish context early in the opening.",
      "Introduce the conflict before the solution.",
      "Progress logically from one event to the next.",
      "Resolve naturally so the ending is earned.",
      "Keep stories relevant to the audience.",
      "Preserve authenticity; never invent experiences or events.",
      "Use structure to improve understanding rather than entertainment alone.",
    ],
    writingGuidance: [
      "Open with context the audience recognizes.",
      "Name the challenge before offering the outcome.",
      "Tie each event to the one before it.",
      "End with the outcome or lesson the story earns.",
    ],
    businessGuidance: [
      "A recognizable arc makes ideas easier to understand and remember.",
      "A story that leads with its solution loses the stakes.",
    ],
    qualityGuidance: [
      "No stories, experiences, or events are ever fabricated.",
      "Factual meaning and creator intent are never altered.",
      "Informational content is never forced into a narrative.",
    ],
    optimizationGuidance: [
      "When Opening or Conflict scores are low, establish context and stakes first.",
      "Re-run evaluation after restructuring to confirm a coherent arc remains.",
    ],
  },
  workflow: {
    requiredInputs: ["creativeBrief", "campaignContext"],
    optionalInputs: ["draftContent", "contentType", "audienceProfile", "brandVoice"],
    inferredInputs: ["contentType"],
    phases: [
      { phase: "analyze", description: "deterministically score the structure across opening, conflict, progression, resolution, and completeness" },
      { phase: "preserve", description: "never auto-rewrite; structural improvements are surfaced as recommendations only" },
      { phase: "recommend", description: "return ordered recommendations for the Creative Intelligence Engine to apply without inventing stories or forcing narratives" },
    ],
    completionCriteria: [
      "structure scores returned for all five dimensions",
      "preservedContent is byte-identical to the input; no automatic rewrites",
      "recommendations never invent experiences, examples, or fictional events",
    ],
  },
  validation: {
    requiredAssets: [],
    missingContext: {
      creativeBrief: "the creative brief that states the campaign goal and subject",
      campaignContext: "the campaign context that grounds the narrative",
    },
    unsupportedRequests: [
      "requests to fabricate a story",
      "requests to invent lived experiences",
      "requests to invent fictional events",
      "requests to force a narrative into informational content",
    ],
    qualityGates: [
      "no story fabricated",
      "no experience invented",
      "no narrative forced where it does not belong",
    ],
  },
  aiTwin: {
    internallyVerifies: [
      "is there a clear beginning?",
      "is the challenge understandable?",
      "does the story progress logically?",
      "is the resolution earned?",
      "does the structure improve understanding?",
    ],
    userVisible: "no user-facing changes unless the skill determines the structure can be sharpened without inventing stories, forcing a narrative, or changing the creator's intent",
  },
  creativeIntelligence: {
    recommendWhen: [
      "the content follows no recognizable progression",
      "conflict is missing where storytelling is appropriate",
      "the story opens with its resolution before the problem",
      "the narrative jumps between unrelated ideas",
      "storytelling would be forced into informational content",
    ],
    avoidWhen: [
      "the format is a dry reference with no narrative intent",
      "the request requires the message to remain deliberately unstructured",
      "the narrative structure is externally fixed and cannot be changed",
    ],
    reasoning: "fit-first: recommend when the request targets the narrative organization of ideas, not when storytelling would be forced into unsuitable content",
  },
};
