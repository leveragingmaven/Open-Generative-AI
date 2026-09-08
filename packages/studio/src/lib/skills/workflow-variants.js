// Approved Creative Skill Pack — Workflow Variants (P4 Workflow).
// The reusable, gated workflow templates: talking-head, character animation,
// avatar spokesperson, podcast repurpose, screen demo (modes), localization/dub,
// and hybrid. Each is a documentation-backed template collection, not a sprawling
// runtime. Adapted from OpenMontage pipeline variants.

export default {
  skillId: "workflow-variants",
  name: "Workflow Variants",
  shortName: "Workflow",
  description: "Reusable gated workflows for distinct production shapes — talking-head, character animation, avatar spokesperson, podcast repurpose, localization/dub, and hybrid — each a documentation-backed template with per-stage focus, human gates, and quality checks.",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  category: "workflow",
  subcategory: "workflow-variants",
  tags: ["workflow", "template", "pipeline", "variants", "repurpose", "hybrid", "dub"],
  capabilities: ["workflow_variants"],
  supportedStudios: ["workflow", "video", "publishing", "marketing"],
creativePrinciples: [
    "reuse-instantly: the variant is a template of stages and gates, not a new runtime",
    "gate-per-stage: human gates on brief, assets, script, scene plan, and edit",
    "honesty-in-dub: localization/dub reports what it reuses and adapts",
    "one-anchor: hybrid names one anchor medium and its support layers",
    "keep-docs-light: prefer a shared stage discipline over a bespoke engine",
  ],
  vocabulary: [
    { concept: "talking-head", meaning: "footage-led narration edited from supplied clips", informs: "variant" },
    { concept: "character-animation", meaning: "a designed, rigged, posed character that acts", informs: "variant" },
    { concept: "avatar-spokesperson", meaning: "a lip-synced avatar presenter with a sync gate", informs: "variant" },
    { concept: "podcast repurpose", meaning: "turning an episode into clips and quote cards", informs: "variant" },
    { concept: "localization/dub", meaning: "translate, re-voice, and re-mix an existing piece", informs: "variant" },
    { concept: "hybrid", meaning: "footage plus generated support within one anchor medium", informs: "variant" },
  ],
  craftGuidance: {
    summary: "A workflow variant is a reusable, gated template: each names its stages, its human gates, and the checks that protect quality and honesty — reuse a shared set rather than invent a bespoke engine.",
    subject: "production routing when a piece lands in a specific mode",
    talking: "transcribe, edit decisions, subtitles, mix — 'let me edit this footage'",
    character: "character_design, rig_plan, pose_library — deterministic local motion",
    avatar: "lip-sync quality gate; a pivot if no-avatar",
    repurpose: "transcribe + rank, platform framing, quote cards, per-clip metadata",
    dub: "transcript-first, glossary preserved, timing drift mapped, honest dub mode",
    hybrid: "an anchor medium, shared template assets, support that clarifies",
  },
  constraints: [
    "every variant is a documentation-backed template, not a new runtime",
    "each carries a defined human-gate set",
    "reuse the shared stage discipline rather than duplicating a stage engine",
    "a delivery promise (motion / runtime) is kept in every variant",
  ],
  evaluationRules: [
    { quality: "variant-fit", signal: "the chosen variant matches the piece's mode and input", evidence: "routing review" },
    { quality: "gate coverage", signal: "each variant names its human gates", evidence: "template audit" },
    { quality: "promise-kept", signal: "the delivery promise and runtime hold in the variant output", evidence: "delivery diff" },
    { quality: "no-bloat", signal: "no new runtime introduced for a template", evidence: "architecture review" },
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
    expectedRuntime: "template",
    outputTypes: ["video", "audio"],
    license: "internal",
    reviewStatus: "approved",
    priority: "foundational",
  },
  decisionRules: [
    { id: "R1", if: "input is supplied talking-head footage", then: "use the talking-head variant", else: "next", confidence: 1 },
    { id: "R2", if: "a lip-synced avatar is required", then: "use the avatar variant and gate on lip-sync", else: "next", confidence: 1 },
    { id: "R3", if: "the piece translates and dubs an existing video", then: "use the localization/dub variant", else: "next", confidence: 1 },
    { id: "R4", if: "the piece is a repurpose of a long episode", then: "use the repurpose variant", else: "next", confidence: 1 },
    { id: "R5", if: "the piece mixes footage and generated motion", then: "use the hybrid variant with one anchor medium", else: "next", confidence: 1 },
  ],
  workflow: {
    requiredInputs: ["brief", "pieceMode"],
    optionalInputs: ["referenceMaterial"],
    inferredInputs: ["mode"],
    phases: [
      { phase: "route", description: "pick the variant from the piece's mode and input" },
      { phase: "prepare", description: "set the variant's stages and human gates" },
      { phase: "execute", description: "run the stages with the variant's quality checks" },
      { phase: "verify", description: "confirm promise and runtime held in that variant" },
    ],
    completionCriteria: [
      "the chosen variant matches the piece's mode",
      "each stage gate is named and met",
      "the delivery promise holds",
    ],
  },
  validation: {
    requiredAssets: ["source"],
    missingContext: {
      source: "the footage, episode, or piece that routes the variant",
    },
    unsupportedRequests: [
      "a workflow that adds a new runtime or a sprawling bespoke engine",
    ],
    qualityGates: [
      "variant matches the mode",
      "gates are defined and met",
      "no new runtime introduced",
    ],
  },
  aiTwin: {
    internallyVerifies: [
      "is the variant chosen for the mode?",
      "are all the variant's human gates satisfied?",
      "does the output keep the delivery promise?",
    ],
    userVisible: "no user-facing changes unless a gate or the variant choice must be revisited",
  },
  creativeIntelligence: {
    recommendWhen: [
      "a production lands in a specific workflow mode",
      "a piece must route to a documented variant",
    ],
    avoidWhen: [
      "the work is a simple advisory enrichment, not a multi-stage workflow",
    ],
    reasoning: "fit-first: pick the variant that matches the piece's mode and promised output",
  },
};