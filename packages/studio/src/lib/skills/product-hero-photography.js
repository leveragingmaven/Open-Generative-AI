// Approved Creative Skill Pack V1 — Product Hero Photography.
// Internal backend creative knowledge only. Produced by the Knowledge Compiler
// and reviewed by the MavenSync team. No runtime registration, matching, or
// activation in Version 1; the future Creative Skills Engine owns that logic.

export default {
  skillId: "product-hero-photography",
  name: "Product Hero Photography",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  category: "craft-domain",
  supportedStudios: ["image", "marketing", "video"],
  creativePrinciples: ["P2", "P5", "P7"],
  vocabulary: [
    { concept: "hero product", meaning: "the product is the single protagonist of the frame, not one element among many", informs: "subject" },
    { concept: "hero shot", meaning: "a primary product image with clean, controlled staging and strong focal presence", informs: "subject" },
    { concept: "product staging", meaning: "deliberate placement of the product in a considered environment that supports, never competes", informs: "style" },
    { concept: "clean background", meaning: "negative space that isolates the product and signals confidence", informs: "style" },
  ],
  craftGuidance: {
    subject: "single focal subject; the product is the reason the frame exists",
    composition: "central placement, disciplined balance, attention directed to the product",
    lighting: "sculpted key light, controlled shadow, highlights that reveal material quality",
    negativeSpace: "designed negative space around the product; no competing elements",
  },
  constraints: [
    "the product is the single focal subject",
    "no competing background elements",
    "no off-palette accents",
  ],
  evaluationRules: [
    { quality: "subject fidelity", signal: "intended product is present and primary on first glance", evidence: "blind reviewer identification" },
    { quality: "restraint", signal: "low visual density and designed negative space", evidence: "reviewer rating" },
    { quality: "craft finish", signal: "no artifacts, flat lighting, or accidental text", evidence: "artifact check plus reviewer pass" },
  ],
  provenance: {
    source: "knowledge-compiler",
    reviewedBy: "MavenSync Team",
    approvedAt: "2026-08-02",
    supersedes: null,
  },
  status: "active",
};
