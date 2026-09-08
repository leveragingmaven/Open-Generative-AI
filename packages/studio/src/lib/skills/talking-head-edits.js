// Approved Creative Skill Pack — Talking-Head Edits (P2 Craft).
// The footage-led talking-head pipeline and the cut/keep doctrine for
// interview narration: filler and false-starts out, breathes and bridges kept,
// J/L cuts for flow, hard cuts at topic breaks. Renamed from editing-cuts per
// the editorial reshaping so "what not to cut" is explicit.

export default {
  skillId: "talking-head-edits",
  name: "Talking-Head Edits",
  shortName: "TalkingHead",
  description: "Edit talking-head footage into a clean, natural performance: cut filler and false-starts at word boundaries, keep breaths and bridges, trim dead air, use J/L cuts and hard cuts at topic breaks, and caption and enhance without covering the face.",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  category: "video",
  subcategory: "talking-head-edits",
  tags: ["talking-head", "editing", "J-cut", "L-cut", "footage", "transcription"],
  capabilities: ["talking_head_edits"],
  supportedStudios: ["video", "publishing", "marketing"],
  creativePrinciples: [
    "cut-at-words: remove filler and false-starts at word boundaries, never mid-word",
    "keep-the-breaths: do not cut breath and emphasis pauses or spoken bridges",
    "flow-by-form: hard-cut at major topic breaks; J/L-cut within scenes",
    "do-not-cover-face: overlays, captions, and graphics never cover the eyes-mouth band",
    "reframe-not-reshoot: convert aspect via face tracking instead of recutting",
  ],
  vocabulary: [
    { concept: "filler removal", meaning: "removing um/uh and false-starts at word boundaries using word timestamps", informs: "edit decisions" },
    { concept: "J-cut", meaning: "the next clip's audio starts ~0.5s before its visual arrives", informs: "transition" },
    { concept: "L-cut", meaning: "the current clip's audio continues ~0.5s after the visual changes", informs: "transition" },
    { concept: "hard cut", meaning: "the direct switch used at a major topic break", informs: "transition" },
    { concept: "face tracking", meaning: "a mechanism that reframes the subject for aspect-ratio conversion", informs: "reframing" },
  ],
  craftGuidance: {
    summary: "Make the speaker sound fluent without sacrificing what makes them human: only remove genuine filler, keep the breaths and bridges, and steer the flow with J/L and hard cuts.",
    cut: "dead air over 1.5s down to ~0.5s; filler and false-starts at word boundaries",
    keep: "breath pauses 0.3-0.8s, emphasis pauses, and bridges like 'So...' or 'Now...' that give flow",
    flow: "a tiny 0.5s J/L overlap keeps continuity; a hard cut lands a topic break",
    pacing: "under 1 minute cut aggressively; 1-10 min balanced; over 10 min let scenes breathe",
    reframe: "use face tracking to convert aspect rather than re-editing",
    overlay: "subtitles in the bottom safe area; never cover the eyes or mouth",
  },
  constraints: [
    "every cut lands at a word boundary",
    "breath and emphasis pauses are never removed",
    "the speaker's face is never covered by an overlay",
    "dead air is trimmed but natural beats are kept",
  ],
  evaluationRules: [
    { quality: "word-boundary cuts", signal: "no visible cut lands mid-word", evidence: "timeline/audio review" },
    { quality: "naturalness kept", signal: "breaths and natural pauses remain in the final edit", evidence: "listening review" },
    { quality: "no face cover", signal: "overlays and captions never cover the eyes-nose-mouth", evidence: "frame review" },
    { quality: "flow", signal: "J/L cuts bridge and hard cuts mark topic breaks", evidence: "edit decisions audit" },
    { quality: "audio clean", signal: "no audio pop and no clipped speech at the cuts", evidence: "waveform review" },
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
    expectedRuntime: "async-1-3h",
    outputTypes: ["video"],
    license: "internal",
    reviewStatus: "approved",
    priority: "foundational",
  },
  decisionRules: [
    { id: "R1", if: "a repeated filler word or false start appears", then: "check the take cut at a word boundary", else: "keep the take", confidence: 1 },
    { id: "R2", if: "a breath or natural emphasis pause is present", then: "keep it", else: "proceed", confidence: 1 },
    { id: "R3", if: "dead air lasts longer than 1.5s", then: "trim it to about 0.5s", else: "keep the timing", confidence: 1 },
    { id: "R4", if: "a major topic break occurs", then: "use a hard cut", else: "use a J/L cut for continuity", confidence: 0.9 },
    { id: "R5", if: "the aspect ratio must change", then: "reframe with face-tracking, not re-edit", else: "keep the framing", confidence: 0.9 },
  ],
  workflow: {
    requiredInputs: ["footage", "transcription"],
    optionalInputs: ["script", "aspectTarget"],
    inferredInputs: ["topicBounds"],
    phases: [
      { phase: "transcribe", description: "produce word-timestamps for the edit" },
      { phase: "decide", description: "mark cuts/keeps, J/L/hard, and dead-air trims" },
      { phase: "subtitle", description: "burn captions within the safe zone and without covering the face" },
      { phase: "mix", description: "duck music, keep audio clean, and confirm no pop at cuts" },
    ],
    completionCriteria: [
      "no mid-word cut and no jump cut",
      "breaths and natural pauses are preserved",
      "subtitles do not cover the face and sit inside the safe zone",
    ],
  },
  validation: {
    requiredAssets: ["footage", "transcription"],
    missingContext: {
      footage: "the recorded talking-head clips",
      transcription: "the word-timed transcript to drive decisions",
    },
    unsupportedRequests: [
      "requests that cut every pause out of the human performance",
    ],
    qualityGates: [
      "no mid-word cut",
      "no audible pop at a cut",
      "no overlay covering the face",
    ],
  },
  aiTwin: {
    internallyVerifies: [
      "were only filler and false-starts removed?",
      "are the breaths and bridges intact?",
      "do no overlays cover the speaker?",
    ],
    storesInMemory: "the speaker's edit style for natural pacing across episodes",
    userVisible: "no user-facing changes unless a cut risks mid-word or the face is covered",
  },
  creativeIntelligence: {
    recommendWhen: [
      "the request is footage-led 'edit this recording'",
      "a talking-head clip needs pacing and cleanup",
    ],
    avoidWhen: [
      "the request is generate something new, not edit supplied footage",
    ],
    reasoning: "fit-first: talking-head edits serves supplied talking-head footage, not generated pieces",
  },
};