// Approved Creative Skill Pack — Editing Intelligence (P2 Craft).
// Cross-media editing decisions beyond talking-head cleanup: Murch edit
// priorities, transition taxonomy, cut cadence by phase, J/L/hard cuts, and
// A/V sync. Complements talking-head-edits for footage and assembled pieces.

export default {
  skillId: "editing-intelligence",
  name: "Editing Intelligence",
  shortName: "Editing",
  description: "Guide editing decisions deterministically: respect the Murch priorities (emotion over story over rhythm), pick cuts and transitions by purpose, tune cut length to the piece, and keep A/V sync and delivery promise intact.",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  category: "video",
  subcategory: "editing-intelligence",
  tags: ["editing", "cuts", "transitions", "murch", "pacing", "montage"],
  capabilities: ["editing_intelligence"],
  supportedStudios: ["video", "publishing", "marketing"],
  creativePrinciples: [
    "emotion-first: edit for emotion before story, story before rhythm",
    "purposeful-cut: choose a cut or transition by what it must do",
    "breathing-rhythm: vary shot length; never repeat the same shot length three times",
    "sync-and-sync-honesty: keep A/V sync and the promised motion ratio",
    "murch-ladder: emotional continuity > story > rhythm > eye-trace > screen-space > 3D space",
  ],
  vocabulary: [
    { concept: "Murch priorities", meaning: "the ranked edit needs: emotion, story, rhythm, eye-trace, 2D geography, 3D space", informs: "edit decisions" },
    { concept: "shot-length rhythm", meaning: "vary shot length by style and never repeat it three times consecutively", informs: "pacing" },
    { concept: "hard cut", meaning: "a direct switch used at a major break", informs: "transition" },
    { concept: "J/L cut", meaning: "audio ahead of or behind the visual for continuity", informs: "transition" },
    { concept: "overlay-except-depth", meaning: "the story/edit keeps overlays as layers, never as scene depth", informs: "compositing" },
  ],
  craftGuidance: {
    summary: "Editing is a ranked decision process, not a guess: let emotion and story drive cuts, then pacing and rhythm, and keep the promised motion ratio and sync intact.",
    subject: "assembled footage, montages, and retained pieces",
    when: "at the edit stage, after assets are ready and before compose",
    cuts: "cut at meaningful boundaries; use hard cuts at breaks and J/L cuts for continuity",
    length: "by style — action 2-4s, cinematic 4-8s, documentary 6-12s, contemplative 10-20s, montage 1-3s",
    rhythm: "never present the same shot length three times in a row",
    promise: "a motion-led delivery promise keeps a motion ratio in the edit",
  },
  constraints: [
    "never the same shot length three times in a row",
    "cuts are purposeful, not decorative",
    "A/V sync and the delivery promise survive the edit",
  ],
  evaluationRules: [
    { quality: "emotional-coherence", signal: "the edit's emotional beats drive the cuts", evidence: "edit review" },
    { quality: "shot-length rhythm", signal: "no three-shot repetition", evidence: "shot-length scan" },
    { quality: "transition fit", signal: "hard vs J/L cuts match the boundary", evidence: "cut audit" },
    { quality: "promise kept", signal: "the final edit preserves the promised motion", evidence: "delivery diff" },
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
    expectedRuntime: "45-2h",
    outputTypes: ["video"],
    license: "internal",
    reviewStatus: "approved",
    priority: "foundational",
  },
  decisionRules: [
    { id: "R1", if: "emotion conflicts with story in an edit", then: "favor the emotional need first", else: "favor the story need", confidence: 0.9 },
    { id: "R2", if: "a shot length has repeated three times", then: "change the next shot's length", else: "keep the rhythm", confidence: 1 },
    { id: "R3", if: "the delivery promise is motion-led", then: "keep a fitting motion ratio", else: "note the static weighting", confidence: 1 },
  ],
  workflow: {
    requiredInputs: ["assetList", "editGoals"],
    optionalInputs: ["deliveryPromise"],
    inferredInputs: ["shotRhythm"],
    phases: [
      { phase: "plan", description: "decide cut purposes against the Murch priorities" },
      { phase: "cut", description: "place hard/J/L cuts with the right shot-length rhythm" },
      { phase: "sync", description: "keep A/V sync and the delivery promise" },
      { phase: "verify", description: "review the timeline for rhythm and promise" },
    ],
    completionCriteria: [
      "cuts serve a defined editing goal",
      "no three-shot repetition",
      "A/V sync and delivery promise intact",
    ],
  },
  validation: {
    requiredAssets: ["assetList"],
    missingContext: {
      assetList: "the footage and clips to assemble",
      editGoals: "the emotional/story goals the edit must serve",
    },
    unsupportedRequests: [
      "decorative random cuts with no edit purpose",
    ],
    qualityGates: [
      "no unpurposed cuts",
      "no triple shot-length repetition",
    ],
  },
  aiTwin: {
    internallyVerifies: [
      "do the cuts serve the Murch priorities?",
      "is the shot-length rhythm varied?",
      "is the delivery promise intact?",
    ],
    userVisible: "no user-facing changes unless the edit cadence is off-rhythm",
  },
  creativeIntelligence: {
    recommendWhen: [
      "an assembled piece needs editing choices",
      "a delivery promise or rhythm review is needed at the edit stage",
    ],
    avoidWhen: [
      "there is no footage to cut (see talking-head-edits for supplied speaking footage)",
    ],
    reasoning: "capability-first: editing intelligence applies at the assemble/edit stage of any footage-holding piece",
  },
};