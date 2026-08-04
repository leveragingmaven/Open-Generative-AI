// Approved Creative Skill Pack V2 — AI Clipping (Short-Form Video Repurposing).
// Internal backend creative knowledge for Creative OS. Produced by the Knowledge
// Compiler and reviewed by the MavenSync team. Loaded through the existing
// backend Skill Registry — no runtime installer, no database, no marketplace,
// no compiler integration.
//
// The ai-clipping skill is a capability-level skill: it describes the reusable
// short-form repurposing capability and the data contract the repurposeVideo
// recipe relies on. Execution is driven by the Repurpose Runtime
// (lib/repurpose) which routes through the Creative Execution Engine and the
// Provider Registry; this manifest is lookup + capability metadata only.

export default {
  skillId: "ai-clipping",
  name: "Short-Form Video Repurposing",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  category: "video",
  supportedStudios: ["video", "marketing", "agents", "ai-twin"],
  capabilities: [
    "long-form video analysis",
    "highlight extraction",
    "short-form clipping",
    "aspect-ratio reframing",
    "ranked clip outputs",
    "coordinate-only review",
    "campaign attachment",
    "multi-asset output",
  ],
  creativePrinciples: ["P1", "P4", "P6"],
  vocabulary: [
    { concept: "short-form clip", meaning: "a self-contained highlight cut to a short-form platform ratio (9:16, 1:1, 4:5)", informs: "output" },
    { concept: "highlight", meaning: "a moment in the source video with a strong hook and standalone value", informs: "subject" },
    { concept: "hook", meaning: "the opening beat of a clip designed to stop the scroll", informs: "copy" },
    { concept: "virality reason", meaning: "the explanation for why a candidate clip is likely to perform", informs: "strategy" },
  ],
  craftGuidance: {
    subject: "self-contained moments; a clip must stand alone without the surrounding source",
    composition: "reframed to the target aspect ratio with the speaker/action framed correctly",
    copy: "a hook and title that work without context; never fabricate scores or timing",
    ethics: "coordinates and scores are presented as provider data only; never invent highlights",
  },
  constraints: [
    "never fabricate clips, coordinates, or scores",
    "empty provider results surface an honest empty state",
    "malformed provider responses are surfaced as errors, not mocked",
    "output clips are canonical Creative Assets referencing the source asset and job",
  ],
  evaluationRules: [
    { quality: "source fidelity", signal: "every clip maps to a real span of the source video", evidence: "provider coordinates vs. source timeline" },
    { quality: "honesty", signal: "no invented highlights, coordinates, or scores", evidence: "empty/malformed response handling" },
    { quality: "lineage", signal: "every clip asset records source asset, job, skill, recipe, and provider", evidence: "asset metadata audit" },
  ],
  provenance: {
    source: "knowledge-compiler",
    reviewedBy: "MavenSync Team",
    approvedAt: "2026-08-03",
    supersedes: null,
  },
  status: "active",
};
