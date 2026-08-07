// Approved Creative Skill Pack — Screen Demo (P2 Craft).
// The screen-demo production modes: choose real capture vs a synthetic
// terminal/UI scene at brief time, and produce deterministic, frame-accurate
// walkthroughs. Adapted from OpenMontage's screen-demo pipeline modes.

export default {
  skillId: "screen-demo",
  name: "Screen Demo",
  shortName: "ScreenDemo",
  description: "Produce screen walkthroughs two honest ways — real capture of a live interface, or a deterministic synthetic terminal/UI scene — choosing the mode at brief time and keeping 'same input = identical pixels' when content is predictable.",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  category: "video",
  subcategory: "screen-demo",
  tags: ["screen-demo", "terminal", "walkthrough", "screen-capture", "determinism"],
  capabilities: ["screen_demo"],
  supportedStudios: ["video", "marketing", "publishing"],
  creativePrinciples: [
    "choose-mode-early: pick real vs synthetic at brief time, not during production",
    "deterministic-when-predictable: a predictable walkthrough gets identical pixels for identical input",
    "frame-accurate: synthetic scenes land on the narration cue exactly",
    "no-silent-swap: never silently switch capture modes after approval",
    "callout-and-focus: zoom-crop, callouts, and denoise serve the walkthrough",
  ],
  vocabulary: [
    { concept: "real capture", meaning: "recording the actual app or widget on screen", informs: "mode" },
    { concept: "synthetic scene", meaning: "a deterministic rendered terminal/UI scene (typed commands, blinking cursor, command pills)", informs: "mode" },
    { concept: "callout", meaning: "a highlight or label that draws the eye to the relevant part of the screen", informs: "production" },
    { concept: "zoom-crop", meaning: "a temporal crop that brings focus to a region during the demo", informs: "production" },
  ],
  craftGuidance: {
    summary: "A screen demo chooses its mode honestly up front: real capture for live behavior, synthetic rendering for predictable content where identical input must give identical pixels.",
    when: "for install walkthroughs, API-key config, git flows, and other predictable content, prefer the synthetic terminal scene",
    capture: "for live app behavior, capture the real UI and add callouts and zoom-crops",
    determinism: "the synthetic scene is deterministic and pixel-identical per input",
    focus: "callouts and zoom-crops direct the eye; do not obscure the action",
    honesty: "a mode swap after approval is a silent change and is not allowed",
  },
  constraints: [
    "choose the mode at brief time",
    "a synthetic scene renders deterministically from the same input",
    "callouts and zoom-crops focus the viewer, never hide the action",
    "no silent mode swap after approval",
  ],
  evaluationRules: [
    { quality: "mode fit", signal: "the chosen mode matches the content (predictable -> synthetic; live behavior -> capture)", evidence: "brief-vs-output comparison" },
    { quality: "determinism", signal: "same input produces identical pixels", evidence: "hash comparison" },
    { quality: "cue sync", signal: "synthetic scenes land on the narration cues frame-accurately", evidence: "timeline review" },
    { quality: "focus", signal: "callouts and zoom-crops point at the action", evidence: "frame review" },
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
    outputTypes: ["video"],
    license: "internal",
    reviewStatus: "approved",
    priority: "foundational",
  },
  decisionRules: [
    { id: "R1", if: "the content is predictable (install, config, git, API-key)", then: "prefer the synthetic terminal scene", else: "use real capture", confidence: 0.9 },
    { id: "R2", if: "the demo must show live behavior of a real app", then: "capture the real screen", else: "use the synthetic scene", confidence: 1 },
    { id: "R3", if: "a mode would change after approval", then: "do not silently swap; ask and re-approve", else: "proceed with the locked mode", confidence: 1 },
  ],
  workflow: {
    requiredInputs: ["script", "targetContent"],
    optionalInputs: ["appUnderTest"],
    inferredInputs: ["contentPredictability"],
    phases: [
      { phase: "choose", description: "select real capture or synthetic scene at brief time" },
      { phase: "produce", description: "capture or render the walkthrough" },
      { phase: "focus", description: "add callouts and zoom-crops on the key steps" },
      { phase: "verify", description: "confirm frame accuracy and that the mode was not silently swapped" },
    ],
    completionCriteria: [
      "the mode was chosen at brief time",
      "a synthetic scene is deterministic",
      "callouts and zooms direct attention correctly",
    ],
  },
  validation: {
    requiredAssets: ["script"],
    missingContext: {
      script: "the narration the demo must sync to",
      targetContent: "the walkthrough content (steps, commands, screen)",
    },
    unsupportedRequests: [
      "silent switching between capture and synthetic mode",
    ],
    qualityGates: [
      "mode locked at brief time",
      "no silent mode swap",
    ],
  },
  aiTwin: {
    internallyVerifies: [
      "was the mode chosen at brief time?",
      "is a synthetic scene deterministic?",
      "was no silent mode swap made?",
    ],
    userVisible: "no user-facing changes unless a mode decision or re-approval is needed",
  },
  creativeIntelligence: {
    recommendWhen: [
      "a product walkthrough or install/config demo is requested",
      "a screen needs to be shown honestly (real or rendered)",
    ],
    avoidWhen: [
      "the piece is not screen-based",
    ],
    reasoning: "fit-first: screen demo serves walkthroughs where the screen is the subject",
  },
};