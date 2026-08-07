// Approved Creative Skill Pack — Atelier Composition (P1 Direction).
// The bespoke/atelier authorship doctrine: guaranteed distinctness through a
// divergence engine, scene-distinctness as a required artifact, scarce
// signature devices, and no stock-fallback for bespoke pieces. Adapted from
// OpenMontage's bespoke-composition doctrine.

export default {
  skillId: "atelier-composition",
  name: "Bespoke Composition",
  shortName: "Bespoke",
  description: "Author hero pieces with guaranteed distinctness: a fresh art direction per subject, a signature device used sparingly, per-scene distinctness written before authoring, and no reuse of a past look or stock fallback for bespoke work.",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  category: "craft-domain",
  subcategory: "atelier-composition",
  tags: ["bespoke", "distinctness", "scene-planning", "composition", "authoring"],
  capabilities: ["atelier_composition"],
  supportedStudios: ["video", "marketing", "ai-twin", "image"],
  creativePrinciples: [
    "distinct-by-design: guarantee difference at proposal, never by withholding components",
    "fresh-art-direction: write a taste profile and a new art direction per subject",
    "signature-device: one visual metaphor unique to this piece, used in 1-2 beats",
    "scene-distinctness: each scene's primary visual differs from the scene before",
    "no-stock-bespoke: bespoke pieces do not fall back to stock or a past look",
    "cost-honesty: tell the user bespoke composition costs more tokens and iterates",
  ],
  vocabulary: [
    { concept: "bespoke composition mode", meaning: "a composition authoring mode for one bespoke, high-quality piece rather than templated assembly", informs: "composition mode" },
    { concept: "divergence engine", meaning: "the process of writing taste + fresh art direction + a signature device so difference is guaranteed up front", informs: "composition mode" },
    { concept: "scene distinctness", meaning: "the required per-scene plan that proves each scene's primary visual differs before/after", informs: "scene planning" },
    { concept: "signature device", meaning: "the one visual metaphor unique to this subject, used in at most 1-2 beats so it stays scarce", informs: "composition" },
    { concept: "hero-component trap", meaning: "reusing one striking visual across every scene with new text, which is branded slides, not a film", informs: "anti-pattern" },
  ],
  craftGuidance: {
    summary: "Guarantee that a bespoke piece cannot be confused with any other product's video by committing to a fresh art direction and a scarce signature device, and by proving per-scene distinctness before authoring.",
    subject: "hero, single-deliverable pieces where quality is the point (launches, marketing, brand work)",
    composition: "per-scene primary visual must differ from the previous scene; the signature device appears in 1-2 beats only",
    authoring: "write the per-scene distinctness plan before authoring; never fall back to stock or a reused look",
    rhythm: "motion follows principles, not presets; easing carries emotion",
    honesty: "bespoke composition costs more and varies more without a baseline; state this at proposal and let the user opt in",
  },
  constraints: [
    "each scene's primary visual must differ from the previous scene",
    "the signature device is used in 1-2 beats max and must be scarce to stay strong",
    "bespoke pieces do not fall back to stock or a look used in a past piece",
    "per-scene distinctness is written as an artifact before authoring",
    "if a shared subject repeats across scenes, re-plan before authoring",
  ],
  evaluationRules: [
    { quality: "scene distinctness", signal: "an inventory of each scene's primary subject and first frame shows no shared visual across consecutive scenes", evidence: "scene-plan review" },
    { quality: "signature scarcity", signal: "the unique visual metaphor appears in at most 1-2 beats", evidence: "beat-by-beat review" },
    { quality: "distinctness", signal: "'could this be any other product's video?' is answered no", evidence: "taste-profile comparison" },
    { quality: "no-stock bespoke", signal: "bespoke pieces use no stock fallback and no reused look", evidence: "asset manifest audit" },
    { quality: "cost honesty", signal: "bespoke cost and iteration were disclosed at proposal", evidence: "proposal transcript" },
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
    difficulty: "expert",
    estimatedCost: "$$",
    expectedRuntime: "longer",
    outputTypes: ["video", "image"],
    license: "internal",
    reviewStatus: "approved",
    priority: "foundational",
  },
  decisionRules: [
    { id: "R1", if: "the piece is a hero, launch, or single-deliverable where quality is the point", then: "author in bespoke composition mode", else: "use templated composition", confidence: 0.9 },
    { id: "R2", if: "any two scenes would share their primary visual subject", then: "re-plan the scene order or visuals before authoring", else: "proceed with the scene plan", confidence: 1 },
    { id: "R3", if: "the signature device would appear in more than 1-2 beats", then: "cut it from the weaker beats so it stays scarce", else: "keep the device", confidence: 1 },
    { id: "R4", if: "removing the device would still leave the scene working", then: "cut the device from that beat", else: "keep it", confidence: 0.9 },
  ],
  workflow: {
    requiredInputs: ["creativeBrief", "campaignContext"],
    optionalInputs: ["tasteProfile", "subjectAssets"],
    inferredInputs: ["compositionMode"],
    phases: [
      { phase: "divergence", description: "commit to a fresh art direction and a signature device unique to this subject" },
      { phase: "plan-distinctness", description: "write the per-scene distinctness plan before authoring" },
      { phase: "author", description: "produce the bespoke piece with scarce signature use and no stock fallback" },
      { phase: "verify", description: "confirm scene distinctness and that the piece is not any other product's video" },
    ],
    completionCriteria: [
      "the divergence engine produced a fresh art direction and a signature device",
      "the per-scene distinctness plan shows no shared consecutive subjects",
      "the final piece uses the signature device in at most 1-2 beats",
    ],
  },
  validation: {
    requiredAssets: [],
    missingContext: {
      creativeBrief: "the goal and subject that art direction must be unique to",
      campaignContext: "the campaign context that the fresh look must serve",
    },
    unsupportedRequests: [
      "requests to reuse a past piece's look for a new hero piece",
      "requests to fill bespoke scenes with stock fallback",
    ],
    qualityGates: [
      "no two consecutive scenes share a primary visual",
      "no stock fallback in a bespoke piece",
      "the signature device appears in at most 1-2 beats",
    ],
  },
  aiTwin: {
    internallyVerifies: [
      "does the scene plan show per-scene distinctness?",
      "is the signature device scarce?",
      "is the art direction fresh rather than a reused look?",
    ],
    userVisible: "no user-facing change unless a scene-plan revision is needed to guarantee distinctness",
  },
  creativeIntelligence: {
    recommendWhen: [
      "a hero, launch, or single-deliverable piece is requested",
      "the user wants a look that is distinct from any other product's video",
    ],
    avoidWhen: [
      "a quick draft or low-stakes batch where templated composition is appropriate",
    ],
    reasoning: "fit-first: bespoke composition serves quality-is-the-point pieces; templated serves speed and volume",
  },
};