// Approved Creative Skill Pack — Typography (P2 Craft).
// A unified type system: sizes, safe zones, line-length, dwell, easing,
// font pairing, and WCAG contrast, with captions and kinetic text as modules.
// Adapted from OpenMontage's typography.md and short-form caption doctrine.

export default {
  skillId: "typography",
  name: "Typography",
  shortName: "Type",
  description: "One unified type system for captions, titles, and kinetic text: safe zones, sizes, line length, dwell timing, easing (never linear), font-count and pairing rules, and WCAG contrast, so on-screen text is always readable and on-brand.",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  category: "motion graphics",
  subcategory: "typography",
  tags: ["typography", "captions", "kinetic-text", "readability", "safe-zones", "wcag"],
  capabilities: ["typography"],
  supportedStudios: ["video", "marketing", "publishing", "ai-twin"],
  creativePrinciples: [
    "read-first: captions and text obey size, safe-zone, and contrast minima before style",
    "motion-not-robotic: text eases with a real curve; never linear ease",
    "two-fonts-max: at most two families per video, title clearly oversized",
    "12s-dwell-fits: hold text long enough to read at the reading speed",
    "accessibility-floor: WCAG minimum approach for text-on-media contrast",
  ],
  vocabulary: [
    { concept: "title-safe", meaning: "the inner band that stays clear of platform UI (approx 80% of frame)", informs: "safe zones" },
    { concept: "action-safe", meaning: "the tighter band that must hold essential action (approx 90%)", informs: "safe zones" },
    { category: "dwell time", meaning: "how long a caption or text stays on-screen, driven by the 13-char/sec reading limit", informs: "timing" },
    { concept: "kinetic typography", meaning: "on-screen text driven by motion design (slide/scale/kinetic)", informs: "motion" },
    { concept: "easing curve", meaning: "the non-linear interpolation of an animation's start/end (default easeOutCubic)", informs: "motion" },
  ],
  craftGuidance: {
    summary: "Make every letter readable and purposeful: respect safe zones and size minima, time dwell to the reading speed, animate with a real easing curve, and keep contrast above the WCAG floor.",
    sizes: "subtitles at or above 42px at 1080p; titles at least 50% larger than body text",
    safeZone: "title-safe ~80% (192px margin at 1080p); action-safe ~90% (96px)",
    lineLength: "captions a max of 32-42 chars per line, max two lines",
    tuning: "dwell at roughly 13 chars/sec; hold motionless after animation ~1s per 13 chars; title cards 3-6s",
    fonts: "one or two families max; serif only for cinematic title cards",
    easing: "entrance fade 0.3-0.5s, slide/scale 0.5-1.0s, kinetic 1-2s; default easeOutCubic",
    contrast: "4.5:1 min against the scene; 70-80% black scrim or 2-4px stroke for safety",
    motion: "every animation returns to a stable resting frame",
  },
  constraints: [
    "captions a minimum of 30px at 1080p; keep to two lines and ~32-42 chars per line",
    "no linear easing; animate on a real curve",
    "a maximum of two font families per video",
    "no text beyond the platform safe zone",
    "never render text that the narration already reads aloud",
  ],
  evaluationRules: [
    { quality: "readability floor", signal: "captions respect size, line-length, and two-line limits", evidence: "frame sizing check" },
    { quality: "safe-zone respect", signal: "text stays within title/action-safe measurements", evidence: "frame grid overlay" },
    { quality: "dwell fit", signal: "text dwell matches the reading-time rule", evidence: "timeline review" },
    { quality: "contrast floor", signal: "text === the 4.5:1 minimum or uses a scrim/stroke", evidence: "contrast sampling" },
    { quality: "non-linear motion", signal: "entrance/easing uses a curve, not a linear ramp", evidence: "motion review" },
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
    expectedRuntime: "1-2h",
    outputTypes: ["video", "image"],
    license: "internal",
    reviewStatus: "approved",
    priority: "foundational",
  },
  decisionRules: [
    { id: "R1", if: "a caption line exceeds 42 characters", then: "split it so it reads in two lines max", else: "keep the brief", confidence: 1 },
    { id: "R2", if: "text would overlap the platform UI band", then: "move or resize within the safe zone", else: "keep placement", confidence: 1 },
    { id: "R3", if: "contrast in a bright scene is below the floor", then: "add a semi-transparent scrim or stroke behind the text", else: "keep the text as-is", confidence: 0.9 },
    { id: "R4", if: "a line needs more degrees of tone", then: "never stack a third family — vary weight or size instead", else: "keep family", confidence: 1 },
    { id: "R5", if: "text is narrated aloud", then: "do not also render it on-screen", else: "show it on-screen", confidence: 1 },
  ],
  workflow: {
    requiredInputs: ["script", "scenePlan"],
    optionalInputs: ["stylePlaybook"],
    inferredInputs: ["platform", "resolution"],
    phases: [
      { phase: "style", description: "pick families, sizes, and color-from-playbook across the piece" },
      { phase: "caption", description: "build captions within the safe zone and line-length limits" },
      { phase: "animate", description: "apply kinetic entrance with a real easing curve and rest frame" },
      { phase: "verify", description: "check contrast, safe zones, dwell, and no read-aloud duplication" },
    ],
    completionCriteria: [
      "every caption is within the safe zone and within the size/contrast floors",
      "each entrance uses a definite easing curve and settles on a readable frame",
      "no on-screen text duplicates the narration",
    ],
  },
  validation: {
    requiredAssets: [],
    missingContext: {
      script: "the narration whose captions and on-screen text must be generated",
    },
    unsupportedRequests: [
      "tiny unreadable text that will not hit the minimum size",
      "rendering on-screen the words the voice is already reading",
    ],
    qualityGates: [
      "contrast meets the 4.5:1 floor",
      "all text sits inside the safe zone",
      "no more than two fonts per screen",
    ],
  },
  aiTwin: {
    internallyVerifies: [
      "is caption size and line length within limits?",
      "is all text inside the safe zone?",
      "does every entrance settle on a readable resting frame?",
      "is the color derived from brand, not guessed?",
    ],
    userVisible: "stores preferred fonts and dwell preference; applies them to the piece so captions stay consistent",
  },
  creativeIntelligence: {
    recommendWhen: [
      "a video needs captions, titles, or kinetic text",
      "a style must be rendered readable and on-brand",
    ],
    avoidWhen: [
      "a piece has no on-screen text at all",
    ],
    reasoning: "fit-first: typography applies when on-screen text exists and must read clearly and consistently",
  },
};