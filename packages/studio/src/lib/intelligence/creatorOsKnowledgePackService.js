const HUB_KNOWLEDGE_PACK_URL = "https://hub.mavensync.space/api/creator-os/knowledge-pack/current";
const DEFAULT_KNOWLEDGE_TIMEOUT_MS = 8000;

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
 * Return the verbatim body of one level-2 section (`## Title`) of the approved
 * Authority Blueprint. The section ends at the next level-2 heading. Missing or
 * empty sections return null so nothing is fabricated.
 */
export function extractBlueprintSection(content, title) {
  if (typeof content !== "string" || !content.trim()) return null;
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const target = `## ${title}`.toLowerCase();
  const start = lines.findIndex((line) => line.trim().toLowerCase() === target);
  if (start < 0) return null;
  const body = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index]) && !/^###/.test(lines[index])) break;
    body.push(lines[index]);
  }
  const text = body.join("\n").trim();
  return text || null;
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
  const frameworks = normalizeArray(input.domains?.frameworks);
  const ip = {};

  if (hasContent(blueprint?.content)) ip.authorityBlueprint = blueprint.content;
  if (ipLibrary.length) ip.ipLibrary = ipLibrary;

  const domains = {
    brand: extractBlueprintSection(blueprint?.content, "Brand DNA"),
    voice: extractBlueprintSection(blueprint?.content, "Voice Foundation"),
    audience: hasContent(input.domains?.audience) ? clone(input.domains.audience) : null,
    offer: hasContent(input.domains?.offer) ? clone(input.domains.offer) : null,
    authority: hasContent(input.domains?.authority) ? clone(input.domains.authority) : null,
    frameworks,
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
export async function getCurrentCreatorOsKnowledgePack({ fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_KNOWLEDGE_TIMEOUT_MS } = {}) {
  if (typeof fetchImpl !== "function") return null;
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_KNOWLEDGE_TIMEOUT_MS;
  let timer;
  try {
    const request = fetchImpl(HUB_KNOWLEDGE_PACK_URL, {
      credentials: "include",
      ...(controller ? { signal: controller.signal } : {}),
    });
    const timeoutMarker = {};
    const response = await Promise.race([
      request,
      new Promise((resolve) => {
        timer = setTimeout(() => {
          controller?.abort();
          resolve(timeoutMarker);
        }, timeout);
      }),
    ]);
    if (response === timeoutMarker) return null;
    if (!response?.ok) return null;
    const payload = await response.json();
    return normalizeHubKnowledgePack(payload?.pack ?? payload);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
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
