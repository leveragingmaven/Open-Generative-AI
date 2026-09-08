// AI Twin Studio — Hub profile import (Path 1).
//
// If a MavenSync Hub profile / knowledge selection exists, AI Twin Studio
// *references* it and prefills the twin's identity. It deliberately does NOT
// duplicate Hub logic — the Hub owns the source of truth (brand DNA, brand
// voice, identity profile, positioning, visual preferences). This module only
// maps the normalized Hub knowledge (KnowledgeConnector) and any local brand
// DNA creative memory into a twin prefill.

import { MemoryStorageAdapter } from "../intelligence/MemoryStorageAdapter.js";
import { MEMORY_TYPES } from "../intelligence/MemoryTypes.js";

export const HUB_PREFILL_KEYS = Object.freeze([
  "brandVoice",
  "audience",
  "offer",
  "campaignBrief",
  "contentGoal",
  "platform",
  "sourceReferences",
  "restrictions",
]);

// Builds a { hasHubProfile, hubProfile, identity } object used to seed the
// twin wizard. `knowledge` is the normalized Hub knowledge context from
// useMavenSyncIntegration(); `brandMemory` is an optional array of creative
// memory records (type "brand") read from the local store.
export function buildTwinPrefillFromHub(knowledge = null, brandMemory = []) {
  const source = knowledge && typeof knowledge === "object" ? knowledge : {};
  const hasHubProfile = Boolean(
    source.brandVoice || source.audience || source.offer || source.campaignBrief,
  );

  const brandDna = Array.isArray(brandMemory)
    ? brandMemory.filter((m) => m && (m.type === MEMORY_TYPES.BRAND || m.type === MEMORY_TYPES.VISUAL))
    : [];

  const visualBits = [];
  for (const memory of brandDna) {
    if (memory?.value) visualBits.push(memory.value);
  }

  const description = [source.offer, source.audience && `for ${source.audience}`]
    .filter(Boolean)
    .join(", ");
  const creativeStyle = source.campaignBrief || source.contentGoal || "";

  return {
    hasHubProfile,
    hubProfile: HUB_PREFILL_KEYS.reduce((acc, key) => {
      if (source[key] != null) acc[key] = source[key];
      return acc;
    }, {}),
    identity: {
      description,
      creativeStyle,
      visualPreferences: visualBits.join("; "),
      tone: source.brandVoice || "",
    },
    sourceReferences: Array.isArray(source.sourceReferences) ? source.sourceReferences : [],
  };
}

// Reads local brand / visual creative memory records for a workspace.
// Returns an array of normalized creative memory records (never throws).
export function readBrandDnaMemory(storage) {
  try {
    return new MemoryStorageAdapter({ storage }).listMemory();
  } catch (err) {
    return [];
  }
}
