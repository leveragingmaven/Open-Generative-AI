// Approved Creative Skill Pack — Motion Direction (P1 Direction).
// The motion-language discipline: classify motion-type before choosing a
// production approach, never guess a motion, keep the delivery promise, and
// prefer longer clips for economy. Adapted from OpenMontage's
// video-reference-analyst motion doctrine and clip-count economy.

export default {
  skillId: "motion-direction",
  name: "Motion Direction",
  shortName: "Motion",
  description: "Direct motion deterministically: classify each scene's motion_type, choose the production approach from that read, never guess a motion, keep the promised motion and runtime through the render, and prefer longer clips to reduce cut and API cost.",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  category: "craft-domain",
  subcategory: "motion-direction",
  tags: ["motion", "motion-type", "video", "production", "honesty"],
  capabilities: ["motion_direction"],
  supportedStudios: ["video", "marketing"],
  creativePrinciples: [
    "never-guess-motion: if the classifier cannot give a firm verdict, declare it rather than guess",
    "classify-first: pick the production approach from the observed motion_type",
    "keep-the-promise: the promised motion and runtime survive to the render",
    "economy-of-length: prefer 10s clips over 5s to cut API cost and smooth motion",
    "honest-static: an animated still is not silently upgraded to a motion clip",
  ],
  vocabulary: [
    { concept: "motion_type", meaning: "a per-scene classification of motion_clip, animated_still, or static_image", informs: "scene classification" },
    { concept: "flow_variance", meaning: "how much the framing or content varies over the clip, used to pick the production approach", informs: "production approach" },
    { concept: "production approach", meaning: "video generation vs still-motion vs stock, chosen from the motion read", informs: "asset direction" },
    { concept: "never-guess verdict", meaning: "an explicit honest statement that a motion cannot be confidently classified", informs: "analysis honesty" },
    { concept: "motion-led promise", meaning: "a delivery promise to make motion the primary visual driver", informs: "delivery honesty" },
  ],
  craftGuidance: {
    summary: "Treat motion as a decision, not a vibe: name the motion type, pick the production approach, and never guess a motion you cannot verify.",
    subject: "when a piece needs motion direction or must classify an observed motion",
    composition: "name the motion type and the flow variance; then choose the production approach from it",
    pacing: "clips that carry motion are more costly; prefer longer clips (10s over 5s), which reduce API calls and smooth the motion",
    mistakes: "guessing a motion, silently downgrading a promised motion, and treating an animated still as a motion clip",
  },
  constraints: [
    "never guess a motion without a firm basis",
    "keep the promised motion and runtime in the render",
    "derive motion from the motion type, not a preset",
  ],
  evaluationRules: [
    { quality: "motion-type honesty", signal: "each scene carries a motion_type or an explicit never-guess verdict", evidence: "video-analysis brief" },
    { quality: "approach fit", signal: "the chosen production approach matches the observed motion_type", evidence: "production plan" },
    { quality: "delivery promise", signal: "the promised motion and runtime appear in the final render", evidence: "edit-decisions audit" },
    { quality: "economy", signal: "motion clips favor longer clips with fewer cuts", evidence: "clip-count review" },
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
    expectedRuntime: "instant",
    outputTypes: ["text", "video"],
    license: "internal",
    reviewStatus: "approved",
    priority: "foundational",
  },
  decisionRules: [
    { id: "R1", if: "the motion classifier cannot give a firm verdict", then: "never guess; declare the motion type and use the risk-averse approach", else: "proceed with the firm classification", confidence: 1 },
    { id: "R2", if: "the delivery promise is motion-led", then: "keep the motion in the final render and log any runtime swap", else: "state the static weighting", confidence: 1 },
    { id: "R3", if: "a motion clip can be served by a longer clip", then: "prefer a 10s clip over two 5s clips to reduce cost", else: "keep the shorter cuts", confidence: 0.8 },
  ],
  workflow: {
    requiredInputs: ["scenePlan", "referenceAnalysis"],
    optionalInputs: ["editDecisions"],
    inferredInputs: ["motionType"],
    phases: [
      { phase: "classify", description: "classify each scene's motion_type and flow_variance" },
      { phase: "choose-approach", description: "choose the production approach from the motion read" },
      { phase: "uphold", description: "keep the promised motion and runtime through the render" },
    ],
    completionCriteria: [
      "every scene has a motion classification or a never-guess verdict",
      "the chosen approach matches the motion read",
      "the final render honors the delivery promise",
    ],
  },
  validation: {
    requiredAssets: [],
    missingContext: {
      scenePlan: "the scene plan whose motion must be classified",
      referenceAnalysis: "the 5-aspect read that grounds the motion classification",
    },
    unsupportedRequests: [
      "requests to guess a motion with no verifiable basis",
      "requests to silently change the runtime or motion after approval",
    ],
    qualityGates: [
      "no motion is guessed without a verdict",
      "the delivery promise survives to the render",
      "no runtime swap without an approved decision-log entry",
    ],
  },
  aiTwin: {
    internallyVerifies: [
      "is a genuine motion_type classification recorded for each scene?",
      "does the production approach match the motion read?",
      "does the render keep the promised logical runtime and motion?",
    ],
    userVisible: "no user-facing changes unless a motion cannot be verified and must be reflowed honestly",
  },
  creativeIntelligence: {
    recommendWhen: [
      "a scene's motion must be classified to choose the production approach",
      "a reference analysis requires a grounded motion verdict",
    ],
    avoidWhen: [
      "the piece has no motion to classify and no delivery promise to uphold",
    ],
    reasoning: "capability-first: apply motion discipline whenever a production chooses an approach from an observed or specified motion",
  },
};