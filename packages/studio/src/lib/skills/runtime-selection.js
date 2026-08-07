// Approved Creative Skill Pack — Runtime Selection (P1 Direction).
// The honest runtime/composition-mode chooser: present all available runtimes
// with tradeoffs, wait for explicit user choice, never silently default a
// runtime, and lock the chosen runtime in the decision log. Adapted from
// OpenMontage's animation-runtime-selector doctrine.

export default {
  skillId: "runtime-selection",
  name: "Runtime Selection",
  shortName: "Runtime",
  description: "Choose the render and animation runtime honestly: detect what is available, present every option with tradeoffs when more than one can serve the job, wait for an explicit pick, and record the runtime and animation-library decision in the decision log.",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  category: "craft-domain",
  subcategory: "runtime-selection",
  tags: ["runtime", "render", "animation-library", "decision", "honesty"],
  capabilities: ["runtime_selection"],
  supportedStudios: ["video", "workflow", "marketing"],
  creativePrinciples: [
    "present-both: when two runtimes can serve the job, present both with tradeoffs and wait",
    "never-silently-default: a chosen runtime is recorded, never assumed",
    "log-it: the runtime and composition decision is a decision-log entry",
    "keep-it-simple: prefer primitives over plugins when a primitive solves it simply",
    "deterministic-timeline: iterate animations via seek/progress, never time-random",
  ],
  vocabulary: [
    { concept: "render_runtime", meaning: "the engine that renders the composed piece (e.g. remotion or a hypermedia runtime)", informs: "render execution" },
    { concept: "composition_mode", meaning: "templated vs bespoke-composition authoring, decided at proposal and locked", informs: "authoring" },
    { concept: "render_runtime_selection", meaning: "the decision-log category that records the runtime choice", informs: "governance" },
    { concept: "present-both", meaning: "show every capable runtime side-by-side with tradeoffs and wait for choice", informs: "honesty" },
    { concept: "keep-it-simple bias", meaning: "if a primitive solves a motion in about 20 lines, use it before escalating to a plugin", informs: "animation library" },
  ],
  craftGuidance: {
    summary: "A runtime is a reasoned, logged choice: know what is available, present every viable option with its tradeoffs, wait for the user to pick, and record the decision so it can survive a silent no.",
    subject: "every piece that is rendered and specifies a runtime",
    when: "once availability is known and before the first render",
    composition: "a templated runtime is the default; bespoke composition is an explicit escape hatch",
    mistakes: "defaulting silently, offering one option when two were available, and swapping the runtime without a decision-log entry",
    determinism: "animations run on a paused timeline, advanced by seek or progress, never by real time",
  },
  constraints: [
    "never default a runtime silently",
    "when both runtimes are available, present both with tradeoffs and wait for an explicit choice",
    "log the runtime and composition-mode decision",
    "a bespoke-composition request bans stock imports",
  ],
  evaluationRules: [
    { quality: "honest components", signal: "the chosen runtime is one the environment can actually run", evidence: "availability detection" },
    { quality: "explicit decision", signal: "the user picked a runtime from the tradeoff comparison, or a one-option job was flagged", evidence: "decision-log audit" },
    { quality: "locked config", signal: "the runtime in edit_decisions matches the proposal", evidence: "proposal-vs-edit diff" },
    { quality: "determinism", signal: "animation advances by seek/progress, not real time", evidence: "timeline code review" },
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
    estimatedCost: "free",
    expectedRuntime: "instant",
    outputTypes: ["text"],
    license: "internal",
    reviewStatus: "approved",
    priority: "foundational",
  },
  decisionRules: [
    { id: "R1", if: "more than one runtime can serve the job", then: "present both with tradeoffs and wait for the user to choose", else: "use the single available runtime and note it", confidence: 1 },
    { id: "R2", if: "a primitive can solve the animation in roughly 20 lines", then: "use the primitive over a plugin", else: "escalate to a plugin deliberately", confidence: 0.9 },
    { id: "R3", if: "a runtime would differ from the proposal's", then: "log a decision and pause for approval before swapping", else: "proceed with the locked runtime", confidence: 1 },
  ],
  workflow: {
    requiredInputs: ["scenePlan"],
    optionalInputs: ["proposalPacket"],
    inferredInputs: ["availableRuntimes"],
    phases: [
      { phase: "detect", description: "detect which runtimes are actually available" },
      { phase: "present", description: "present viable runtimes with tradeoffs when more than one fits" },
      { phase: "decide", description: "wait for the user choice and log the runtime decision" },
      { phase: "lock", description: "lock the runtime and carry it through the render" },
    ],
    completionCriteria: [
      "the chosen runtime is available",
      "the runtime was chosen rather than silently defaulted",
      "the runtime decision is logged",
    ],
  },
  validation: {
    requiredAssets: [],
    missingContext: {
      scenePlan: "the plan whose render runtime must be selected",
      availableRuntimes: "the truthful set of runtimes the environment can run",
    },
    unsupportedRequests: [
      "requests to use a runtime that is not available",
    ],
    qualityGates: [
      "no silent runtime default",
      "no runtime swap without approval",
      "no plugin where a primitive suffices",
    ],
  },
  aiTwin: {
    internallyVerifies: [
      "is the chosen runtime actually available?",
      "was the runtime chosen rather than defaulted?",
      "does the render config match the logged decision?",
    ],
    userVisible: "no switched runtime without an explicit, approved decision-log entry",
  },
  creativeIntelligence: {
    recommendWhen: [
      "a render needs a runtime or composition-mode decision",
      "a user must choose between two viable runtimes",
    ],
    avoidWhen: [
      "the runtime is fixed and unavoidable by constraints",
    ],
    reasoning: "honesty-first: present the real options and require an explicit choice before committing",
  },
};