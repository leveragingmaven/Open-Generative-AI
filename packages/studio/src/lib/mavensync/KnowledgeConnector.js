export function normalizeKnowledgeContext(input = {}) {
  if (!input) return null;
  return {
    brandVoice: input.brandVoice || input.brand_voice || null,
    audience: input.audience || input.targetAudience || null,
    offer: input.offer || null,
    campaignBrief: input.campaignBrief || input.brief || null,
    contentGoal: input.contentGoal || input.goal || null,
    platform: input.platform || null,
    sourceReferences: Array.isArray(input.sourceReferences)
      ? input.sourceReferences
      : Array.isArray(input.references)
        ? input.references
        : [],
    restrictions: Array.isArray(input.restrictions) ? input.restrictions : [],
  };
}
