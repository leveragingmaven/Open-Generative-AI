// Creative Context — lightweight context gathering layer for Creative Brief v1.
// It gathers ambient information ONLY. It makes no creative decisions and never
// writes to any store. The result of building context is a plain object that
// feeds the Creative Brief builder.

import { MemoryStorageAdapter } from "../intelligence/MemoryStorageAdapter.js";
import { MEMORY_TYPES } from "../intelligence/MemoryTypes.js";
import { CampaignStore } from "../campaigns/CampaignStore.js";
import { readJson } from "../assets/storageManager.js";

const APPROVED_BRIEFS_KEY = "mavensync_creative_briefs";

function textOfType(memories, type) {
  if (!memories || !Array.isArray(memories)) return null;
  for (const memory of memories) {
    if (memory.type === type && memory.value !== null && memory.value !== undefined) return memory.value;
  }
  return null;
}

// Reads approved Creative Briefs previously stored for a campaign. Read-only;
// returns an array of approved brief objects (oldest first for continuity).
export function readApprovedBriefs(activeCampaign, storage = globalThis?.localStorage) {
  const campaignId = activeCampaign?.id;
  if (!campaignId) return [];
  const allBriefs = readJson(APPROVED_BRIEFS_KEY, [], storage);
  if (!Array.isArray(allBriefs)) return [];
  return allBriefs.filter((brief) => brief && String(brief.campaignId) === String(campaignId));
}

// The Context Builder. Gathers only what already exists and is relevant to a
// request. Every source is optional and non-blocking:
//   - unknown/empty sources are simply omitted.
//   - no source overwrites a more authoritative one (handled at the Brief).
// Inputs mirror what a studio already holds so we do not re-ask the user.
export function buildCreativeContext({
  studio = null,
  userRequest = "",
  activeCampaign = null,
  references = [],
  storage = globalThis?.localStorage,
  memoryOverrides = null,
} = {}) {
  const memoryAdapter = new MemoryStorageAdapter({ storage });
  const allMemories = memoryOverrides || memoryAdapter.listMemory();

  // Fall back to the persisted active campaign if none was passed explicitly.
  const campaign = activeCampaign || CampaignStore.getActive();

  const brand = textOfType(allMemories, MEMORY_TYPES.BRAND);
  const audience = textOfType(allMemories, MEMORY_TYPES.AUDIENCE);
  const offer = textOfType(allMemories, MEMORY_TYPES.OFFER);
  const product = textOfType(allMemories, MEMORY_TYPES.PRODUCT);
  const visual = textOfType(allMemories, MEMORY_TYPES.VISUAL);
  const voice = textOfType(allMemories, MEMORY_TYPES.VOICE);
  const campaignKnowledge = textOfType(allMemories, MEMORY_TYPES.CAMPAIGN);

  const approvedBriefs = readApprovedBriefs(campaign, storage);
  const lastApproved = approvedBriefs.length ? approvedBriefs[approvedBriefs.length - 1] : null;

  return {
    studio,
    userRequest,
    campaign:
      campaign && {
        id: campaign.id,
        name: campaign.name,
        description: campaign.description,
      },
    brand,
    audience,
    offer,
    product,
    visual,
    voice,
    campaignKnowledge,
    references: references || {},
    approvedBriefs,
    lastApproved,
  };
}