// Approved Creative Skill Pack — Character Composition (P2 Craft).
// The deterministic character pipeline: distinct character design, rig-as-data,
// a pose library, and publication checks. Adapted from OpenMontage's
// character-animation pipeline (design + rig + pose track).

export default {
  skillId: "character-composition",
  name: "Character Composition",
  shortName: "Character",
  description: "Build characters that act, not just appear: distinct design (silhouette, emotion range), a rig plan where differences are data not code, a pose library that covers every required action, and publication checks on silhouette and emotional hook.",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  category: "Character",
  subcategory: "character-composition",
  tags: ["character", "rig", "pose", "animation", "design"],
  capabilities: ["character_composition"],
  supportedStudios: ["video", "marketing", "ai-twin", "image"],
  creativePrinciples: [
    "rigs-are-data: character differences are data, never per-character code paths",
    "act-beats-not-narration: every required action has a pose or action strategy",
    "distinct-silhouette: characters are readable by silhouette alone",
    "deterministic-motion: local, repeatable motion; no silent still-image downgrade",
    "emotion-via-pose: the emotional turn is expressible through poses and actions",
  ],
  vocabulary: [
    { concept: "rig plan", meaning: "the parts, pivots, layers, and constraints that make a character poseable", informs: "production" },
    { concept: "pose library", meaning: "a reusable set of poses covering the character's required actions and emotions", informs: "production" },
    { concept: "rigs-are-data", meaning: "character-specific differences are stored as data so rigs are reusable across scenes", informs: "architecture" },
    { concept: "emotional hook", meaning: "the hero-frame character or silhouette that signals the story's emotion", informs: "publication" },
    { concept: "character QA", meaning: "the compose-stage report that verifies lip/mouth timing and pose transitions", informs: "review" },
  ],
  craftGuidance: {
    summary: "Design characters who can act: distinct silhouettes, emotion ranges, a data-driven rig, a pose library that covers every required action, and deterministic local motion that never silently downgrades to a still.",
    design: "distinct roles, clear silhouettes, and an emotion range that the piece needs",
    rig: "document parts, pivots, layers, constraints; keep differences as data",
    pose: "every required action in the script has at least one pose/action strategy",
    emotion: "the character's emotional turn must be expressible through poses and actions, not only narration",
    publish: "hero frame shows the character/silhouette and carries the emotional hook",
    motion: "deterministic, repeatable local motion; never a silent downgrade to still-image motion",
  },
  constraints: [
    "every required action has a pose or action strategy",
    "rig differences are data, not per-character code",
    "character motion is deterministic and local",
    "no silent downgrade to still-image motion",
  ],
  evaluationRules: [
    { quality: "silhouette readability", signal: "each character is identifiable by silhouette in the hero frame", evidence: "hero-frame review" },
    { quality: "action coverage", signal: "every required action has a pose/action strategy", evidence: "pose-library audit" },
    { quality: "rig-as-data", signal: "no per-character code path; differences are data", evidence: "rig-plan review" },
    { quality: "emotional hook", signal: "the hero frame carries the character and the emotion", evidence: "publication check" },
    { quality: "no-downgrade", signal: "no silent still-image substitution for a motion scene", evidence: "character QA report" },
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
    expectedRuntime: "3h+",
    outputTypes: ["video", "image"],
    license: "internal",
    reviewStatus: "approved",
    priority: "foundational",
  },
  decisionRules: [
    { id: "R1", if: "a character cannot be read by silhouette", then: "rework the design before rigging", else: "proceed to rig", confidence: 1 },
    { id: "R2", if: "an action in the script has no pose strategy", then: "add a pose or action strategy for it", else: "keep the pose library", confidence: 1 },
    { id: "R3", if: "rig behavior would differ per character in code", then: "encode the difference as data instead", else: "keep the rig shared", confidence: 0.9 },
    { id: "R4", if: "the emotion is carried only by narration", then: "add a pose/action that expresses it", else: "keep the scene", confidence: 1 },
    { id: "R5", if: "a scene needs motion but only a still is available", then: "do not silently downgrade; flag it for a decision", else: "proceed", confidence: 1 },
  ],
  workflow: {
    requiredInputs: ["script", "characterBrief"],
    optionalInputs: ["referenceAssets"],
    inferredInputs: ["actionList"],
    phases: [
      { phase: "character_design", description: "distinct roles, silhouettes, and emotion range" },
      { phase: "rig_plan", description: "parts/pivots/layers/constraints; differences as data" },
      { phase: "pose_library", description: "cover every required action with a pose strategy" },
      { phase: "compose", description: "assemble scenes and run the character QA report" },
    ],
    completionCriteria: [
      "every character is readable by silhouette",
      "every required action has a pose/action strategy",
      "the character QA report passes for the composed piece",
    ],
  },
  validation: {
    requiredAssets: ["script"],
    missingContext: {
      script: "the narration and action beats the character must serve",
    },
    unsupportedRequests: [
      "silent still-image substitution for a motion scene",
    ],
    qualityGates: [
      "silhouette readable in the hero frame",
      "pose coverage complete",
      "no silent motion downgrade",
    ],
  },
  aiTwin: {
    internallyVerifies: [
      "is each character readable by silhouette?",
      "is every action covered by a pose?",
      "is the emotion carried through poses and actions?",
    ],
    storesInMemory: "character identity and rig data so a character can be reused across scenes and pieces",
  },
  creativeIntelligence: {
    recommendWhen: [
      "the piece needs characters who act rather than appear",
      "a deterministic character pipeline is requested",
    ],
    avoidWhen: [
      "the piece is footage-led with no designed characters",
    ],
    reasoning: "fit-first: character composition serves designed characters with rigs and poses, not footage edits",
  },
};