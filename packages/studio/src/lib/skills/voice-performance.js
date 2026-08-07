// Approved Creative Skill Pack — Voice Performance (P2 Craft).
// Directed, expressive narration for AI and human voice: a structured delivery
// contract (purpose, pacing, energy, pauses, emphasis), sample-first verification
// before batch generation, and honest provider mapping. Adapted from OpenMontage's
// voice-performance-director doctrine, aligned to MavenSync's Voice Performance
// Intelligence contract — a performance layer, never a meaning-changing writer.

export default {
  skillId: "voice-performance",
  name: "Voice Performance",
  shortName: "Voice",
  description: "Direct narration that sounds performed, not merely read: a delivery contract with explicit pacing, energy, emphasis, and pause cues per section, a sample gate that verifies the most expressive section before batch generation, and an honesty guard that never alters meaning.",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  category: "presenter",
  subcategory: "voice-performance",
  tags: ["voice", "narration", "tts", "delivery", "performance", "pacing"],
  capabilities: ["voice_performance"],
  supportedStudios: ["video", "audio", "marketing", "ai-twin", "publishing"],
  creativePrinciples: [
    "direct-delivery: give explicit pace, energy, emphasis, and pause — never vague 'natural' or 'engaging'",
    "one-idea-per-section: one delivery idea per section; split a section that needs three turns",
    "sample-first: verify the most performance-sensitive section before generating the batch",
    "annotate-not-rewrite: a delivery layer never changes the message, claims, or approved copy",
    "explicit-cues: script cue marks, not the provider's default read",
  ],
  vocabulary: [
    { concept: "performance", meaning: "the spoken/read delivery with explicit emphasis, pacing, energy, and pauses that makes narration sound directed", informs: "delivery" },
    { concept: "sample gate", meaning: "verify the most performance-sensitive section before generating the rest, so the batch matches the approved read", informs: "verification" },
    { concept: "delivery cues", meaning: "explicit annotations for pace, energy, emphasis, and pause-before/after on each section", informs: "script" },
    { concept: "provider text", meaning: "the provider-specific markup that carries the delivery cues, hidden from the visible script", informs: "generation" },
    { concept: "natural read risk", meaning: "a provider/voice change or a 'read naturally' direction that breaks the performance contract", informs: "quality" },
  ],
  craftGuidance: {
    summary: "Make narration sound deliberately delivered: one idea per section, explicit delivery cues, a sample gate before batch, and honest evaluation of the read.",
    subject: "narration, voiceover, and twin replies that should sound performed",
    when: "any piece whose script will be spoken aloud by a TTS read or a model voice",
    pacing: "name the pace; tie cues to punctuation and sentence length, never a vague 'natural' read",
    emphasis: "choose the words to stress for each idea; do not read every word equally",
    pauses: "mark where silence lands and why, before or after the key phrase",
    honesty: "a provider/voice change or a 'read naturally' instruction is a quality failure without a re-sample",
  },
  constraints: [
    "one delivery idea per section",
    "delivery cues are explicit, never 'read naturally' or 'engaging'",
    "every material provider or voice change requires a re-sample",
    "performance never alters the message or claims",
  ],
  evaluationRules: [
    { quality: "directed read", signal: "each section has explicit pace/energy/emphasis/pause cues", evidence: "script annotation check" },
    { quality: "sample gate", signal: "the most expressive section was verified before batch", evidence: "generation log" },
    { quality: "message intact", signal: "performed audio does not change the script meaning", evidence: "contract diff" },
    { quality: "natural honesty", signal: "no silent voice/provider downgrade after sample approval", evidence: "re-sample audit" },
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
    expectedRuntime: "45-90m",
    outputTypes: ["audio"],
    license: "internal",
    reviewStatus: "approved",
    priority: "foundational",
  },
  decisionRules: [
    { id: "R1", if: "a section needs more than one emotional or delivery turn", then: "split the section so each keeps a single idea", else: "keep the section", confidence: 1 },
    { id: "R2", if: "the script only says 'read naturally' or 'engaging'", then: "replace it with explicit cues before generation", else: "proceed with the cues", confidence: 1 },
    { id: "R3", if: "the provider or voice changes after the sample", then: "re-sample the most expressive section before the batch", else: "proceed with the batch", confidence: 1 },
    { id: "R4", if: "the delivery emphasis would change a claim", then: "reject the direction to preserve the message", else: "keep the emphasis", confidence: 1 },
  ],
  workflow: {
    requiredInputs: ["script"],
    optionalInputs: ["voiceProfile", "providerOptions"],
    inferredInputs: ["language", "platform"],
    phases: [
      { phase: "direct", description: "choose one delivery idea per section and write explicit cues" },
      { phase: "sample", description: "generate the most performance-sensitive section and verify it" },
      { phase: "batch", description: "generate the remaining sections only after the sample passes" },
      { phase: "verify", description: "check the batch never drifted from the approved read" },
    ],
    completionCriteria: [
      "each section has one delivery idea and explicit cues",
      "the sample gate passed before generation",
      "the generated audio matches the approved read",
    ],
  },
  validation: {
    requiredAssets: ["script"],
    missingContext: {
      script: "the spoken content that must be performed",
    },
    unsupportedRequests: [
      "requests to generate on a vague 'read naturally' direction",
      "requests to change voice/provider without a re-sample",
    ],
    qualityGates: [
      "message intact",
      "delivery clearly directed",
    ],
  },
  aiTwin: {
    internallyVerifies: [
      "does every section carry explicit delivery cues?",
      "was the most expressive section sampled before the batch?",
      "does the performed read preserve the script's meaning?",
    ],
    userVisible: "no user-facing changes unless the delivery contract or a re-sample is needed",
  },
  creativeIntelligence: {
    recommendWhen: [
      "a narration must sound directed, not flatly read",
      "a voiced script is ready to be generated or re-voiced",
    ],
    avoidWhen: [
      "the piece has no spoken narration",
    ],
    reasoning: "capability-first: voice performance applies whenever audio narration needs deliberate delivery",
  },
};