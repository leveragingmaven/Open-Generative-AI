// Approved Creative Skill Pack V4 — Recast (Performance Transfer).
// Internal backend creative knowledge for Creative OS. Produced by the Knowledge
// Compiler and reviewed by the MavenSync team. Loaded through the existing
// backend Skill Registry — no runtime installer, no database, no marketplace,
// no compiler integration.
//
// The recast skill is a capability-level Character skill: it describes the
// reusable performance-transfer capability (drive a character identity with the
// motion of a driving video) and the data contract the performanceTransfer
// recipe relies on. Execution is driven by the Character Runtime (lib/recast)
// which routes through the Creative Execution Engine and the Provider Registry;
// this manifest is lookup + capability metadata only.

export default {
  skillId: "recast",
  name: "Recast — Performance Transfer",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  category: "Character",
  supportedStudios: ["character", "video", "agents", "ai-twin"],
  capabilities: [
    "performance transfer",
    "identity preservation",
    "motion transfer",
    "character consistency",
  ],
  creativePrinciples: ["P1", "P4", "P6"],
  vocabulary: [
    { concept: "character identity", meaning: "the visual likeness that drives the output — a preset influencer, an AI Twin likeness, or a temporary uploaded image", informs: "subject" },
    { concept: "driving video", meaning: "the source performance whose motion, gestures, and expression are transferred onto the character", informs: "reference" },
    { concept: "performance transfer", meaning: "rendering the character performing the driving video's motion with identity preserved", informs: "output" },
    { concept: "character consistency", meaning: "the rendered character keeps the identity's face and likeness across the output", informs: "quality" },
  ],
  craftGuidance: {
    subject: "one clear character identity and one driving video; the identity defines the face, the video defines the performance",
    composition: "framed to the selected model aspect ratio with the character's face and motion legible throughout",
    copy: "identity and source are passed through as provided, never invented; prompts only refine the transfer",
    ethics: "identity, source, and model parameters are presented as job data only; never fabricate rendered performances",
  },
  constraints: [
    "never fabricate rendered performances, videos, or provider output",
    "empty provider results surface an honest empty state",
    "malformed provider responses are surfaced as errors, not mocked",
    "the character identity is a Creative OS identity source (influencer, AI Twin likeness, or temporary upload), never a made-up likeness",
    "output assets are canonical Creative Assets referencing the character identity, source video, skill, recipe, provider, and job",
  ],
  evaluationRules: [
    { quality: "identity fidelity", signal: "the rendered character matches the chosen identity source image", evidence: "job identity metadata vs. output" },
    { quality: "performance fidelity", signal: "the output follows the driving video's motion", evidence: "job source metadata vs. output" },
    { quality: "honesty", signal: "no invented renders or provider metadata", evidence: "empty/malformed response handling" },
    { quality: "lineage", signal: "every asset records identity, source video, skill, recipe, provider, campaign, twin, and agent", evidence: "asset metadata audit" },
  ],
  provenance: {
    source: "knowledge-compiler",
    reviewedBy: "MavenSync Team",
    approvedAt: "2026-08-03",
    supersedes: null,
  },
  status: "active",
};
