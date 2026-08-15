const HUB_KNOWLEDGE_PACK_URL = "https://hub.mavensync.space/api/creator-os/knowledge-pack/current";

function hasContent(value) {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clone(entry)]));
  }
  return value;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value.map(clone) : [];
}

/**
 * Convert the Hub response into the existing Creator OS Knowledge Pack
 * contract. The raw Hub response is intentionally never returned.
 */
export function normalizeHubKnowledgePack(input) {
  if (!input || typeof input !== "object") return null;

  const blueprint = input.authorityBlueprint;
  const offer = input.currentOffer;
  const supplemental = input.supplementalContext || {};
  const ipLibrary = normalizeArray(supplemental.ipLibrary);
  const knowledgeCenter = normalizeArray(supplemental.knowledgeCenter);
  const ip = {};

  if (hasContent(blueprint?.content)) ip.authorityBlueprint = blueprint.content;
  if (ipLibrary.length) ip.ipLibrary = ipLibrary;

  const domains = {
    brand: null,
    voice: null,
    audience: null,
    ip: Object.keys(ip).length ? ip : null,
    approvedClaims: null,
    resources: knowledgeCenter,
    visualDirection: null,
  };

  return {
    id: input.userId ? `mavensync:${input.userId}` : "mavensync:current",
    version: input.packVersion ?? 1,
    updatedAt: input.generatedAt || new Date().toISOString(),
    domains,
    offers: {
      active: offer && typeof offer === "object" ? [clone(offer)] : [],
      selectedOfferId: offer?.id || null,
    },
    metadata: {
      source: "mavensync-hub",
      hubPackVersion: input.packVersion ?? null,
      authorityBlueprintVersion: blueprint?.version ?? null,
      checksum: input.checksum || null,
      generatedAt: input.generatedAt || null,
    },
  };
}

/** Retrieve the current authenticated user's Hub pack without handling SSO secrets. */
export async function getCurrentCreatorOsKnowledgePack({ fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") return null;
  try {
    const response = await fetchImpl(HUB_KNOWLEDGE_PACK_URL, { credentials: "include" });
    if (!response?.ok) return null;
    const payload = await response.json();
    return normalizeHubKnowledgePack(payload?.pack ?? payload);
  } catch {
    return null;
  }
}

/** Request-boundary adapter; there is no cache or background refresh. */
export async function prepareKnowledgePackRequest(request = {}, options = {}) {
  if (request.knowledgePack) return request;
  return {
    ...request,
    knowledgePack: await getCurrentCreatorOsKnowledgePack(options),
  };
}

export { HUB_KNOWLEDGE_PACK_URL };
