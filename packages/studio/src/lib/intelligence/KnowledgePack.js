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
  return newerVersion(next, current) ? next : (current || next);
}

export class InMemoryKnowledgePackStore {
  // Development/test fallback only. Production packs must use a server-backed
  // repository through PersistentKnowledgePackStore.
  constructor(initialPack = null) {
    this.packs = new Map();
    if (initialPack) this.replace("default", initialPack);
  }
  get(accountId = "default") { return this.packs.get(accountId) || null; }
  replace(accountId, pack) {
    if (typeof accountId === "object") { pack = accountId; accountId = "default"; }
    const current = this.get(accountId);
    const next = updateKnowledgePack(current, pack);
    this.packs.set(accountId, next);
    return next;
  }
}

export class KnowledgePackStorePort {
  async getCurrentPack() { throw new Error("Knowledge Pack persistence adapter is required"); }
  async replacePack() { throw new Error("Knowledge Pack persistence adapter is required"); }
}

export class PersistentKnowledgePackStore extends KnowledgePackStorePort {
  constructor({ repository, requireAccountId = true } = {}) {
    super();
    if (!repository) throw new Error("Persistent Knowledge Pack store requires a repository");
    this.repository = repository;
    this.requireAccountId = requireAccountId;
  }

  accountId(accountId) {
    if (accountId) return accountId;
    if (this.requireAccountId) {
      const error = new Error("Account/user identity is required for persistent Knowledge Packs");
      error.code = "account_id_required";
      throw error;
    }
    return "default";
  }

  async getCurrentPack(accountId) {
    return this.repository.getCurrentPack(this.accountId(accountId));
  }

  async replacePack(accountId, pack) {
    const scopedAccountId = this.accountId(accountId);
    const current = await this.repository.getCurrentPack(scopedAccountId);
    const next = updateKnowledgePack(current, pack);
    if (next === current) return current;
    return this.repository.replacePack(scopedAccountId, next);
  }
}
