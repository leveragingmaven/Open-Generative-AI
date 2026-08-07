// Approved Creative Skill Pack — B-Roll Planning (P2 Craft).
// Extract B-roll needs from a script, keep the stock-vs-generated choice honest,
// write POV-aware queries, and score results before committing. Adapted from
// OpenMontage's broll-planning doctrine (B-roll 35-50% of total, clips 5-8s).

export default {
  skillId: "b-roll-planning",
  name: "B-Roll Planning",
  shortName: "BRoll",
  description: "Plan supporting footage honestly: extract B-roll needs from the script, choose stock or concept-specific generated visuals, build POV-driven keyword queries, and score results before committing to the edit.",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  category: "video",
  subcategory: "b-roll-planning",
  tags: ["b-roll", "stock", "pov", "footage", "query", "retrieval"],
  capabilities: ["b_roll_planning"],
  supportedStudios: ["video", "marketing", "publishing"],
  creativePrinciples: [
    "extract-first: walk each script section for its footage need",
    "honest-source: real need -> stock; concept-specific need -> generate",
    "POV-queries: add a viewpoint keyword to unlock better matches",
    "score-and-pick: rate candidates and use more than one",
    "economy-shape: keep B-roll a healthy share and clips short",
  ],
  vocabulary: [
    { concept: "B-roll", meaning: "supporting footage that reinforces the narration without carrying the argument", informs: "footage" },
    { concept: "POV keyword", meaning: "a photo/film viewpoint term (aerial, OTS, macro, top-down, handheld) that unlocks better stock matches", informs: "query construction" },
    { concept: "stock-vs-generated", meaning: "the honest source choice: real look -> stock, concept-specific -> generate", informs: "footage source" },
    { concept: "concrete vs abstract", meaning: "whether a script reference is a literal subject or an idea that needs an icon or metaphor", informs: "extraction" },
  ],
  craftGuidance: {
    summary: "Plan supporting footage as a retrieval discipline: derive each beat from the script, pick the honest source, and write a POV-aware query before scoring and committing.",
    when: "any script production that needs supporting or illustrative footage",
    extraction: "note the subject, any embedded B-roll cue, whether it is concrete or abstract, and the duration",
    source: "a footage-led real look uses stock; a concept-specific visual is generated",
    query: "2-4 keywords led by the subject, then a quality, then a POV viewpoint",
    shape: "clips a few seconds each; B-roll a substantial share of the total",
    score: "rate results and use the top; a wrong POV costs more to fix than a wrong color grade",
  },
  constraints: [
    "B-roll needs come from the script, not random padding",
    "choose the source honestly (stock vs generated)",
    "queries carry a POV keyword",
    "score results before committing to an edit",
  ],
  evaluationRules: [
    { quality: "script-grounded", signal: "every B-roll beat traces to a script section", evidence: "extraction trace" },
    { quality: "source-honesty", signal: "stock vs generated matches the concreteness need", evidence: "source audit" },
    { quality: "POV query", signal: "each query carries a viewpoint keyword", evidence: "query review" },
    { quality: "scored-choice", signal: "the chosen clip was the highest-scored candidate", evidence: "selection log" },
    { quality: "economy", signal: "clip length and B-roll share are within standard range", evidence: "timeline analysis" },
  ],
  provenance: {
    source: "open-montage-harvest-v1",
    reviewedBy: "MavenSync Team",
    approvedAt: "2026-08-07",
    supersedes: null,
  },
  status: "active",
  shared: true,
  discoverable: true,
  metadata: {
    difficulty: "medium",
    estimatedCost: "$",
    expectedRuntime: "1-3h",
    outputTypes: ["video", "image"],
    license: "internal",
    reviewStatus: "approved",
    priority: "foundational",
  },
  decisionRules: [
    { id: "R1", if: "the footage must look real", then: "use stock", else: "generate a concept-specific visual", confidence: 0.9 },
    { id: "R2", if: "the script reference is abstract", then: "produce an icon or a metaphor visual with a matching POV", else: "use a concrete subject", confidence: 0.8 },
    { id: "R3", if: "two candidates differ mainly in POV", then: "prefer the one whose POV best fits the narration", else: "keep the best-scored", confidence: 0.9 },
  ],
  workflow: {
    requiredInputs: ["script"],
    optionalInputs: ["stockLibrary"],
    inferredInputs: ["sectionDurations"],
    phases: [
      { phase: "extract", description: "walk the script for subjects, cues, concreteness, and durations" },
      { phase: "source", description: "choose stock or generated per beat" },
      { phase: "query", description: "build 2-4 keyword queries with a POV keyword" },
      { phase: "score", description: "rate candidates and pick the best" },
    ],
    completionCriteria: [
      "every B-roll beat maps to a script section",
      "the source decision is honest",
      "queries carry a POV viewpoint",
      "candidates were scored before selection",
    ],
  },
  validation: {
    requiredAssets: ["script"],
    missingContext: {
      script: "the narration whose content defines the B-roll beats",
    },
    unsupportedRequests: [
      "random unsourced B-roll padding",
    ],
    qualityGates: [
      "no B-roll without a script source",
      "queries carry a POV",
    ],
  },
  aiTwin: {
    internallyVerifies: [
      "is every B-roll beat grounded in the script?",
      "is the stock-vs-generated choice honest?",
      "does each query carry a POV keyword?",
    ],
    userVisible: "no user-facing changes unless footage sourcing or a query must be revisited",
  },
  creativeIntelligence: {
    recommendWhen: [
      "a script needs supporting or illustrative footage",
      "B-roll retrieval must stay grounded in the narration",
    ],
    avoidWhen: [
      "the piece has no footage needs",
    ],
    reasoning: "capability-first: B-roll planning applies whenever a production sources and scores supporting visuals",
  },
};