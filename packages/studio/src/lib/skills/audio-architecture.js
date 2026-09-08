// Approved Creative Skill Pack — Audio Architecture (P2 Craft).
// The four-layer mix, ducking, loudness targets, music-tempo mapping, and
// speech enhancement chain for broadcast-quality audio. Adapted from
// OpenMontage's sound-design and enhancement doctrine.

export default {
  skillId: "audio-architecture",
  name: "Audio Architecture",
  shortName: "Audio",
  description: "Build a clean, professional audio bed: a four-layer mix, dialogue ducking with clear music, platform loudness targets, tempo-to-content music mapping, and a speech enhancement chain that makes narration broadcast-usable.",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  category: "audio",
  subcategory: "audio-architecture",
  tags: ["audio", "mix", "ducking", "loudness", "music", "sound"],
  capabilities: ["audio_architecture"],
  supportedStudios: ["video", "audio", "publishing", "marketing"],
  creativePrinciples: [
    "four-layer-mix: dialogue, music, ambience, SFX each have a target level",
    "duck-for-clarity: music drops below dialogue with room for the intelligibility band",
    "platform-loudness: normalize to the delivery target with safe true peak",
    "tempo-by-content: match music energy to the piece's intent",
    "enhance-not-squash: process speech in a chain that cleans without noise",
  ],
  vocabulary: [
    { concept: "four-layer mix", meaning: "dialogue/narration, music, ambience/room tone, and SFX layered at target levels", informs: "mix" },
    { concept: "ducking", meaning: "lowering the music bed automatically while dialogue speaks", informs: "mix" },
    { concept: "LUFS", meaning: "the loudness unit the delivery platform normalizes to", informs: "mastering" },
    { concept: "true peak", meaning: "the peak level that must stay below the ceiling to avoid clipping", informs: "mastering" },
    { concept: "intelligibility band", meaning: "the mid-frequency region (roughly 2-4 kHz) that carries speech clarity", informs: "ducking" },
    { concept: "enhancement chain", meaning: "a fixed order of speech processing (filter, cut, boost, compress, limit)", informs: "speech processing" },
  ],
  craftGuidance: {
    summary: "Audio is a designed mix, not an afterthought: layer the four beds, duck the music under dialogue, hit the platform loudness target, and process speech with a clean enhancement chain.",
    layering: "dialogue/narration leads; music, ambience, and SFX sit below it",
    ducking: "music roughly 18-20 dB under dialogue; cut the intelligibility band a touch",
    loudness: "target per platform, true peak safely below the ceiling",
    music: "calm 60-80 BPM, explainer 90-110, upbeat 110-130, high-energy 120-140, action 140-200; instrumental when voiceover is present",
    speech: "clean the chain: high-pass, mid cut, presence boost, de-ess, limit",
    honesty: "never let the mix mask or change the meaning of the voice",
  },
  constraints: [
    "music never overwhelms dialogue",
    "loudness and true peak are normalized per platform",
    "music is instrumental whenever voiceover is present",
    "the mix never alters the meaning of the narration",
  ],
  evaluationRules: [
    { quality: "dialogue clarity", signal: "the voice is intelligible on phone speakers", evidence: "listening check" },
    { quality: "ducking depth", signal: "music sits under dialogue by the target range", evidence: "level metering" },
    { quality: "loudness target", signal: "the mix lands at the platform LUFS with safe true peak", evidence: "loudness report" },
    { quality: "no-clip", signal: "true peak stays below the ceiling", evidence: "peak analysis" },
    { quality: "meaning preserved", signal: "the mix does not mask or change the narration", evidence: "A/B review" },
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
    outputTypes: ["audio"],
    license: "internal",
    reviewStatus: "approved",
    priority: "foundational",
  },
  decisionRules: [
    { id: "R1", if: "music will play while a voice speaks", then: "duck the music and keep it instrumental", else: "let the music lead", confidence: 1 },
    { id: "R2", if: "the delivery platform has a loudness target", then: "normalize to it with a safe true peak", else: "use the default target", confidence: 0.9 },
    { id: "R3", if: "the mix masks a word of the narration", then: "drop the music and cut the intelligibility band", else: "keep the levels", confidence: 1 },
  ],
  workflow: {
    requiredInputs: ["voiceTrack", "musicTrack"],
    optionalInputs: ["ambience", "sfx"],
    inferredInputs: ["platform", "targetLoudness"],
    phases: [
      { phase: "layer", description: "place the four beds at target levels" },
      { phase: "duck", description: "set ducking under dialogue" },
      { phase: "master", description: "normalize loudness and true peak" },
      { phase: "verify", description: "check clarity, peak, and meaning" },
    ],
    completionCriteria: [
      "the mix is clean on phone speakers",
      "loudness hits the target with safe peak",
      "the narration meaning is intact",
    ],
  },
  validation: {
    requiredAssets: ["voiceTrack"],
    missingContext: {
      voiceTrack: "the narration that the mix must serve",
      musicTrack: "the bed to duck beneath it",
    },
    unsupportedRequests: [
      "a music bed that masks the voice",
      "clipped or over-loud masters",
    ],
    qualityGates: [
      "dialogue clear",
      "target loudness met",
      "no clipping",
    ],
  },
  aiTwin: {
    internallyVerifies: [
      "is the mix clean at the target loudness?",
      "is music ducked under dialogue?",
      "does the mix preserve the narration?",
    ],
    storesInMemory: "the creator's preferred loudness and music style across pieces",
    userVisible: "no user-facing changes unless a mix target or ducking must be re-set",
  },
  creativeIntelligence: {
    recommendWhen: [
      "a piece needs a professional audio mix",
      "narration must be clear over music",
    ],
    avoidWhen: [
      "the piece has no audio bed",
    ],
    reasoning: "capability-first: audio architecture applies whenever a mix, duck, or loudness pass is needed",
  },
};