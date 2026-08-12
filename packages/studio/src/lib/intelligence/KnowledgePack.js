const now = () => new Date().toISOString();

function newerVersion(next, current) {
  if (!current) return true;
  if (next.version != null && current.version != null && next.version !== current.version) return next.version > current.version;
  return String(next.updatedAt || "") > String(current.updatedAt || "");
}

export function createKnowledgePack(input = {}) {
  const activeOffers = Array.isArray(input.offers?.active)
    ? input.offers.active.slice(0, 3)
    : Array.isArray(input.activeOffers) ? input.activeOffers.slice(0, 3) : [];
  const selectedOfferId = input.offers?.selectedOfferId || input.selectedOfferId || null;
  return {
    id: input.id || input.packId || null,
    version: input.version ?? 1,
    updatedAt: input.updatedAt || now(),
    domains: {
      brand: input.domains?.brand ?? input.brand ?? null,
      voice: input.domains?.voice ?? input.voice ?? null,
      audience: input.domains?.audience ?? input.audience ?? null,
      ip: input.domains?.ip ?? input.ip ?? input.methodology ?? null,
      approvedClaims: input.domains?.approvedClaims ?? input.approvedClaims ?? null,
      resources: Array.isArray(input.domains?.resources) ? [...input.domains.resources] : Array.isArray(input.resources) ? [...input.resources] : [],
      visualDirection: input.domains?.visualDirection ?? input.visualDirection ?? null,
    },
    offers: { active: activeOffers, selectedOfferId },
    metadata: input.metadata && typeof input.metadata === "object" ? { ...input.metadata } : {},
  };
}

export function updateKnowledgePack(current, incoming) {
  const next = createKnowledgePack(incoming);
  return newerVersion(next, current) ? next : (current ? createKnowledgePack(current) : next);
}

export class InMemoryKnowledgePackStore {
  constructor(initialPack = null) { this.pack = initialPack ? createKnowledgePack(initialPack) : null; }
  get() { return this.pack; }
  replace(pack) { this.pack = updateKnowledgePack(this.pack, pack); return this.pack; }
}

