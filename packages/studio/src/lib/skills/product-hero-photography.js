// Approved Creative Skill Pack V1 — Product Hero Photography.
// Internal backend creative knowledge only. Produced by the Knowledge Compiler
// and reviewed by the MavenSync team. No runtime registration, matching, or
// activation in Version 1; the future Creative Skills Engine owns that logic.

// Shared intake rule used by the existing planner and direct image path.
export function unresolvedProductIdentity({ intent = '', references = [], inputs = {} } = {}) {
  if (references.length || [inputs.productIdentity, inputs.productDescription, inputs.subject].some(value => typeof value === 'string' && value.trim())
    || /\bProduct:\s*\S/i.test(inputs.brandContext || '')) return null;
  const specified = /\b(?:called|named)\s+\S|\b(?:digital\s+)?product\s*[,：:]\s*(?:\*\*|[“"])?[A-Za-z0-9][A-Za-z0-9 -]{1,80}|\bof\s+(?:(?:a|an|the)\s+)?(?!(?:my|our|product|digital)\b)\S+/i.test(intent);
  return specified ? null : { name: 'productIdentity', question: 'Which product should the image show? Share its cover or reference image, or give its name and a brief description.' };
}

export default {
  skillId: "product-hero-photography",
  name: "Product Hero Photography",
  version: "1.1.0",
  schemaVersion: "1.0.0",
  description: 'Product photoshoot planning for studio, lifestyle, promotional, hero, reference-based and digital-product imagery.',
  tags: ['product photography', 'photoshoot', 'lifestyle', 'studio shot', 'product hero', 'digital product'],
  intentPatterns: ['\\bproduct\\b', '\\bphotoshoot\\b', '\\b(?:studio|hero) shot\\b', '\\bproduct photography\\b'],
  intentRequired: true,
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
    summary: 'Choose the presentation from intent: clean studio/catalog, product-in-use lifestyle, promotional hook, or reference-based restyle. Keep the real product as protagonist. For a digital product use its supplied cover/interface/mockup or description, not invented physical packaging.',
    subject: "single focal subject; the product is the reason the frame exists",
    composition: "central placement, disciplined balance, attention directed to the product",
    lighting: "sculpted key light, controlled shadow, highlights that reveal material quality",
    negativeSpace: "designed negative space around the product; no competing elements",
  },
  constraints: [
    "the product is the single focal subject",
    "no competing background elements",
    "no off-palette accents",
    'Preserve supplied product shape, labeling, cover/interface and brand identity. Do not invent packaging, features, prices, claims or outcomes.',
    'Ask only for essential unresolved product identity or preserve/change choices; reuse supplied references and known brand context instead of repeating intake.',
    'For controlled variations keep the product and brand fixed and vary only the requested lighting, angle, environment or marketing hook.',
    'For a restyle describe the requested changes and preserve everything else; a platform or format request takes precedence over a generic scene style.',
  ],
  evaluationRules: [
    { quality: "subject fidelity", signal: "intended product is present and primary on first glance", evidence: "blind reviewer identification" },
    { quality: "restraint", signal: "low visual density and designed negative space", evidence: "reviewer rating" },
    { quality: "craft finish", signal: "no artifacts, flat lighting, or accidental text", evidence: "artifact check plus reviewer pass" },
  ],
  provenance: {
    source: "knowledge-compiler",
    adaptedFrom: { repository: 'higgsfield-ai/skills', revision: 'f83af0bc1d937c8119099a11f8ebbf5e6fb99819', paths: ['higgsfield-product-photoshoot/SKILL.md'], license: 'MIT', notice: 'THIRD_PARTY_NOTICES.md' },
    reviewedBy: "MavenSync Team",
    approvedAt: "2026-08-02",
    supersedes: null,
  },
  status: "active",
};
