// CampaignMemory — stores approved Creative Briefs after generation approval.
// Future requests within the same campaign reuse the last approved brief as a
// continuity anchor. Brand DNA is never overwritten here; the stored brief only
// influences future generations by supplying a base. Strictly a write path on
// approval — the read path lives in CreativeContext.readApprovedBriefs.

import { readJson, writeJson, removeItem } from "../assets/storageManager.js";

const APPROVED_BRIEFS_KEY = "mavensync_creative_briefs";

export const CampaignBriefMemory = {
  key: APPROVED_BRIEFS_KEY,

  // Stores an approved brief + its produced asset, tied to its campaign.
  saveApprovedBrief(brief, asset, storage = globalThis?.localStorage) {
    const campaignId = brief?.meta?.campaignId || asset?.campaignId;
    if (!campaignId || !brief?.goal) return null;

    const all = readJson(APPROVED_BRIEFS_KEY, [], storage);
    const list = Array.isArray(all) ? all : [];
    const record = {
      id: `brief-${Date.now()}`,
      campaignId,
      campaignName: brief.meta?.campaignName || null,
      version: brief.version || 1,
      goal: brief.goal,
      subject: brief.subject,
      tone: brief.tone,
      style: brief.style,
      brand: brief.brand || null,
      format: brief.format || null,
      assetUrl: asset?.url || null,
      assetId: asset?.id || null,
      createdAt: new Date().toISOString(),
    };

    // Keep latest-200 per campaign; do not duplicate identical goals repeatedly.
    const deduped = list.filter(
      (entry) => !(entry.campaignId === campaignId && entry.goal === brief.goal),
    );
    const updated = [...deduped, record];
    if (updated.length > 200) updated.shift();

    writeJson(APPROVED_BRIEFS_KEY, updated, storage);
    return record;
  },

  // Clear approved briefs for a campaign (used when a campaign is reset).
  clearForCampaign(campaignId, storage = globalThis?.localStorage) {
    if (!campaignId) return;
    const all = readJson(APPROVED_BRIEFS_KEY, [], storage);
    if (!Array.isArray(all)) return;
    const remaining = all.filter((entry) => String(entry.campaignId) !== String(campaignId));
    if (remaining.length) writeJson(APPROVED_BRIEFS_KEY, remaining, storage);
    else removeItem(APPROVED_BRIEFS_KEY, storage);
  },
};

export default CampaignBriefMemory;