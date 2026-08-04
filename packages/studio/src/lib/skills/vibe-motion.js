// Approved Creative Skill Pack V3 — Vibe Motion (Motion Graphics).
// Internal backend creative knowledge for Creative OS. Produced by the Knowledge
// Compiler and reviewed by the MavenSync team. Loaded through the existing
// backend Skill Registry — no runtime installer, no database, no marketplace,
// no compiler integration.
//
// The vibe-motion skill is a capability-level skill: it describes the reusable
// motion-graphics capability and the data contract the motionGraphics recipe
// relies on. Execution is driven by the Motion Graphics Runtime (lib/motion)
// which routes through the Creative Execution Engine and the Provider Registry;
// this manifest is lookup + capability metadata only.

export default {
  skillId: "vibe-motion",
  name: "Vibe Motion — Motion Graphics",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  category: "motion graphics",
  supportedStudios: ["marketing", "video", "agents", "ai-twin"],
  capabilities: [
    "motion graphics",
    "animated typography",
    "logo animation",
    "data visualization",
    "animated marketing assets",
    "countdowns",
    "social animations",
    "template rendering",
  ],
  creativePrinciples: ["P1", "P4", "P6"],
  vocabulary: [
    { concept: "motion graphic", meaning: "an animated graphic asset rendered from a template and a text prompt", informs: "output" },
    { concept: "workflow template", meaning: "a predefined motion scenario (logo reveal, countdown, dashboard) with inputs and defaults", informs: "planning" },
    { concept: "brand colors", meaning: "the palette applied to the rendered motion graphic", informs: "style" },
    { concept: "template rendering", meaning: "executing a workflow template with provided inputs to produce a video asset", informs: "output" },
  ],
  craftGuidance: {
    subject: "a single focused motion scenario; the template defines the composition and the prompt refines the content",
    composition: "framed to the template aspect ratio with text, logo, or data legible throughout the animation",
    copy: "template inputs (text, colors, logo, images) are passed through, never invented",
    ethics: "animation duration, aspect ratio, and template metadata are presented as job data only; never fabricate rendered frames",
  },
  constraints: [
    "never fabricate rendered videos, frames, or provider output",
    "empty provider results surface an honest empty state",
    "malformed provider responses are surfaced as errors, not mocked",
    "output assets are canonical Creative Assets referencing the template, skill, recipe, provider, and job",
  ],
  evaluationRules: [
    { quality: "template fidelity", signal: "the rendered asset follows the selected workflow template inputs", evidence: "job metadata vs. template library" },
    { quality: "honesty", signal: "no invented videos, frames, or provider metadata", evidence: "empty/malformed response handling" },
    { quality: "lineage", signal: "every asset records template, skill, recipe, provider, campaign, twin, and agent", evidence: "asset metadata audit" },
  ],
  provenance: {
    source: "knowledge-compiler",
    reviewedBy: "MavenSync Team",
    approvedAt: "2026-08-03",
    supersedes: null,
  },
  status: "active",
};
