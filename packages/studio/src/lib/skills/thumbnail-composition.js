// Provider-independent adaptation; see THIRD_PARTY_NOTICES.md. This is a
// truthful static visual-hook method, distinct from bespoke scene authorship.
export default {
  skillId: 'thumbnail-composition',
  name: 'Thumbnail and Social Graphic Composition',
  description: 'Truthful thumbnail, video cover, Pinterest pin and social marketing graphic composition with a readable focal hierarchy and controlled variations.',
  version: '1.0.0', schemaVersion: '1.0.0', category: 'craft-domain',
  supportedStudios: ['image', 'marketing', 'publishing'],
  tags: ['thumbnail', 'youtube', 'social graphic', 'pinterest', 'cover', 'visual hook'],
  intentPatterns: ['\\bthumbnail\\b', '\\b(?:youtube|video|shorts) cover\\b', '\\bsocial (?:media )?(?:graphic|image|post)\\b', '\\bmarketing graphic\\b', '\\bpinterest pin\\b'],
  intentRequired: true,
  creativePrinciples: ['truthful promise', 'one dominant focal subject', 'brand preservation', 'small-size readability'],
  vocabulary: [{ concept: 'visual hook', meaning: 'one truthful information gap with a clear focal subject', informs: 'composition' }],
  craftGuidance: {
    summary: 'Compose one truthful visual hook with a dominant focal subject, clear foreground/background separation and low clutter. Check readability around 120px wide; use the approved brand rather than a generic high-impact style.',
    composition: 'one focal subject with clear scale hierarchy; reserve space for exact approved copy and keep text off faces',
    negativeSpace: 'keep supporting props sparse and leave headline-safe space',
  },
  constraints: [
    'Never invent claims, outcomes, screenshots, statistics, product features or a person not supplied or authorized.',
    'Preserve official logo geometry, declared colors, fonts and exact customer copy; style-reference images are art direction, not identities to copy.',
    'When variations are requested, vary one chosen hook, expression or framing dimension while preserving references and approved branding; do not generate unrequested variants.',
    'For precise edits preserve the composition and unchanged regions; do not regenerate the entire visual unnecessarily.',
    'Use existing deterministic text/logo composition when exact typography or geometry is required; do not claim a generated approximation is exact.',
  ],
  evaluationRules: [
    { quality: 'truthful hook', signal: 'visual promise matches the supplied facts', evidence: 'brief-to-preview comparison' },
    { quality: 'small-size readability', signal: 'subject and approved copy remain clear around 120px wide', evidence: 'preview review' },
  ],
  qaRequirements: ['Check truthful promise, focal hierarchy, small-size readability, exact copy and approved brand assets.'],
  provenance: { source: 'higgsfield-ai/skills', revision: 'f83af0bc1d937c8119099a11f8ebbf5e6fb99819', paths: ['higgsfield-youtube-thumbnail/SKILL.md', 'higgsfield-youtube-thumbnail/references/thumbnail-frameworks.md'], license: 'MIT', notice: 'THIRD_PARTY_NOTICES.md' },
  status: 'active', discoverable: true,
};
