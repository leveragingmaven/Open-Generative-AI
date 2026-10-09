// Campaign store for the Campaign Workspace (Phase 7.1b).
//
// The server is now the authoritative source (`/api/projects`); this store is a
// **cache**. Two rules make that safe:
//
//   1. Everything cached is namespaced per authenticated profile, so two creators
//      who share one browser can never see each other's project names, instructions
//      or briefs. Without a resolved profile scope the store deliberately reads
//      nothing rather than falling back to a shared bucket.
//   2. The synchronous API is preserved exactly — `list`, `get`, `create`, `update`,
//      `remove`, `getActive`, `setActive`, `clearActive`, `getActiveId` all still
//      return immediately from the cache, so the existing components keep working.
//      The server-backed path is the explicit async API (`createAsync`,
//      `updateAsync`, `removeAsync`), which reconciles the cache **only after** a
//      successful response and throws a typed error otherwise, so a failed write is
//      never reported as saved.
//
// The legacy local-only methods are retained for backward compatibility but mark
// their records `pendingSync: true`, because they have not been persisted anywhere.
// They also fail loudly when no profile scope has resolved, instead of silently
// discarding the write while returning a record that looks saved.
//
// Pre-7.1b browser-local projects (`mavensync_campaigns`) are never adopted
// automatically: `detectLegacyProjects()` quarantines them, and only an explicit,
// user-confirmed `importQuarantinedProjects({ confirm: true })` claims them.

const LEGACY_STORAGE_KEY = "mavensync_campaigns";
const LEGACY_ACTIVE_KEY = "mavensync_active_campaign";
const IMPORT_CLAIM_KEY = "mavensync_campaign_import_claim";
// Phase 7.1c safety fix: the pre-7.1b keys above are unscoped, so on a shared
// browser they may belong to a different creator than the one signing in now.
// They are moved here, intact, instead of being adopted by whoever arrives first.
const QUARANTINE_KEY = "mavensync_campaigns_quarantine";
const CACHE_KEY_PREFIX = "mavensync_campaigns_cache:";
const ACTIVE_KEY_PREFIX = "mavensync_active_campaign_cache:";

export const CAMPAIGN_STATUSES = [
  "draft",
  "planning",
  "generating",
  "review",
  "approved",
  "queued",
  "completed",
  "archived",
];

const now = () => new Date().toISOString();

function generateId() {
  return `campaign-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function storage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch (e) {
    return null;
  }
}

function readKey(key) {
  const store = storage();
  if (!store) return null;
  try {
    return store.getItem(key);
  } catch (e) {
    return null;
  }
}

function writeKey(key, value) {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(key, value);
  } catch (e) {
    // ignore quota / privacy-mode write failures
  }
}

function removeKey(key) {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(key);
  } catch (e) {
    // ignore
  }
}

function readJson(key, fallback) {
  const raw = readKey(key);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch (e) {
    return fallback;
  }
}

function cacheKey(scope) {
  return `${CACHE_KEY_PREFIX}${scope}`;
}

function activeKey(scope) {
  return `${ACTIVE_KEY_PREFIX}${scope}`;
}

function normalizeStatus(status) {
  return CAMPAIGN_STATUSES.includes(status) ? status : "draft";
}

// A cached record keeps the shape every consumer already expects
// ({id, name, description, status, createdAt, updatedAt}) plus the server-only
// fields the workspace may want later.
function toCachedRecord(project, { pendingSync = false } = {}) {
  return {
    id: project.id,
    name: project.name || "Untitled Campaign",
    description: project.description || "",
    status: normalizeStatus(project.status),
    createdAt: project.createdAt || now(),
    updatedAt: project.updatedAt || now(),
    ...(project.instructions ? { instructions: project.instructions } : {}),
    ...(Array.isArray(project.briefs) ? { briefs: project.briefs } : {}),
    ...(pendingSync ? { pendingSync: true } : {}),
  };
}

let activeScope = null;
const listeners = new Set();

function emit() {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch (e) {
      // a subscriber must never break a store write
    }
  }
}

function requireScope() {
  if (!activeScope) {
    const error = new Error("No signed-in profile is available for project storage.");
    error.code = "campaign_scope_unavailable";
    throw error;
  }
  return activeScope;
}

function readCache(scope = activeScope) {
  if (!scope) return [];
  const parsed = readJson(cacheKey(scope), []);
  return Array.isArray(parsed) ? parsed : [];
}

function writeCache(campaigns, scope = activeScope) {
  if (!scope) return;
  writeKey(cacheKey(scope), JSON.stringify(campaigns));
  emit();
}

function upsert(record, scope = activeScope) {
  const campaigns = readCache(scope);
  const index = campaigns.findIndex((campaign) => campaign.id === record.id);
  if (index === -1) campaigns.unshift(record);
  else {
    const merged = { ...campaigns[index], ...record };
    // A server-confirmed record is not a draft: a project that has now been written
    // to the account must stop advertising itself as locally-unsaved just because a
    // local draft once carried the same id.
    if (!record.pendingSync) delete merged.pendingSync;
    campaigns[index] = merged;
  }
  writeCache(campaigns, scope);
  return record;
}

export const CampaignStore = {
  // ---------------------------------------------------------------- scope

  getScope() {
    return activeScope;
  },

  // The scope is a non-reversible profile key (see creatorProjectClient), never an
  // account or creator identifier in the clear.
  setScope(scope) {
    const next = scope || null;
    if (next === activeScope) return activeScope;
    activeScope = next;
    // The active campaign pointer is per profile too, so it cannot leak across.
    emit();
    return activeScope;
  },

  // NOTE: the scope is intentionally NEVER persisted or restored from storage.
  // A remembered scope would let a second creator's first paint read the previous
  // creator's cache before the session resolved, so the scope only ever comes from
  // a live session (`hydrate`) or an explicit caller.

  subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  // ------------------------------------------------------- synchronous API

  list() {
    return readCache();
  },

  get(id) {
    return readCache().find((campaign) => campaign.id === id) || null;
  },

  // Local-only. Kept for backward compatibility; the record is marked `pendingSync`
  // because nothing has been persisted. Prefer `createAsync`.
  //
  // Throws `campaign_scope_unavailable` when no profile scope has resolved, because
  // with no scope there is nowhere to keep the record and returning it would tell the
  // caller a campaign was created when nothing was stored.
  create(input = {}) {
    const scope = requireScope();
    const timestamp = now();
    const campaign = {
      ...toCachedRecord(
        {
          id: input.id || generateId(),
          name: (input.name || "").trim() || "Untitled Campaign",
          description: (input.description || "").trim(),
          status: input.status,
          createdAt: input.createdAt || timestamp,
          updatedAt: timestamp,
        },
        { pendingSync: true },
      ),
    };
    return upsert(campaign, scope);
  },

  // Local-only, same caveat as `create`, including the loud failure without a scope.
  update(id, patch = {}) {
    const scope = requireScope();
    const campaigns = readCache(scope);
    const index = campaigns.findIndex((campaign) => campaign.id === id);
    if (index === -1) return null;
    const updated = {
      ...campaigns[index],
      ...patch,
      id,
      createdAt: campaigns[index].createdAt,
      updatedAt: now(),
      pendingSync: true,
    };
    campaigns[index] = updated;
    writeCache(campaigns, scope);
    return updated;
  },

  // Local-only, same caveat as `create`. Prefer `removeAsync`.
  remove(id) {
    const scope = requireScope();
    const campaigns = readCache(scope).filter((campaign) => campaign.id !== id);
    writeCache(campaigns, scope);
    if (CampaignStore.getActiveId() === id) CampaignStore.clearActive();
    return campaigns;
  },

  getActiveId() {
    if (!activeScope) return null;
    return readKey(activeKey(activeScope));
  },

  getActive() {
    const id = CampaignStore.getActiveId();
    if (!id) return null;
    return readCache().find((campaign) => campaign.id === id) || null;
  },

  setActive(id) {
    if (!activeScope || !id) return;
    writeKey(activeKey(activeScope), id);
    emit();
  },

  clearActive() {
    if (!activeScope) return;
    removeKey(activeKey(activeScope));
    emit();
  },

  // ------------------------------------------------------------ server API

  // Server-authoritative read. Replaces the cache with the server's rows, keeping
  // any local-only drafts that were never persisted so a failed create is not lost.
  async hydrate({ client, scope = null } = {}) {
      // Never fall back to a remembered scope: it must come from this session.
    const resolved = scope || activeScope || (client ? await client.resolveProfileScope?.() : null) || null;
    if (!resolved) return { hydrated: false, reason: "no_profile_scope" };
    CampaignStore.setScope(resolved);
    if (!client) return { hydrated: false, reason: "no_client" };

    const projects = await client.listProjects();
    const pending = readCache(resolved).filter((campaign) => campaign.pendingSync);
    const merged = [
      ...projects.map((project) => toCachedRecord(project)),
      ...pending.filter((draft) => !projects.some((project) => project.id === draft.id)),
    ];
    writeCache(merged, resolved);
    // Drop an active pointer that no longer resolves, instead of leaving the shell
    // pinned to a project the server no longer has.
    const activeId = CampaignStore.getActiveId();
    if (activeId && !merged.some((campaign) => campaign.id === activeId)) CampaignStore.clearActive();
    return { hydrated: true, count: merged.length };
  },

  async createAsync(input = {}, { client } = {}) {
    if (!client) throw Object.assign(new Error("Project storage is unavailable."), { code: "campaign_client_unavailable" });
    const scope = requireScope();
    const project = await client.createProject({
      name: (input.name || "").trim() || "Untitled Campaign",
      description: (input.description || "").trim(),
      status: input.status,
    });
    const record = toCachedRecord(project);
    upsert(record, scope);
    return record;
  },

  async updateAsync(id, patch = {}, { client } = {}) {
    if (!client) throw Object.assign(new Error("Project storage is unavailable."), { code: "campaign_client_unavailable" });
    const scope = requireScope();
    const project = await client.updateProject(id, patch);
    const record = toCachedRecord(project);
    upsert(record, scope);
    return record;
  },

  async removeAsync(id, { client } = {}) {
    if (!client) throw Object.assign(new Error("Project storage is unavailable."), { code: "campaign_client_unavailable" });
    const scope = requireScope();
    await client.deleteProject(id);
    // Cache is reconciled only after the server confirmed the delete.
    writeCache(readCache(scope).filter((campaign) => campaign.id !== id), scope);
    if (CampaignStore.getActiveId() === id) CampaignStore.clearActive();
    return true;
  },

  // ----------------------------------------------------- legacy quarantine

  /**
   * Detection only — never adoption.
   *
   * SAFETY (Phase 7.1c): `mavensync_campaigns` / `mavensync_active_campaign` are
   * unscoped, so on a shared browser they may belong to a different creator. This
   * store therefore never claims them for whoever signs in first. Detection moves
   * the rows into a quarantine record, unchanged, and does nothing else:
   *
   *   - no write into any profile-scoped cache,
   *   - no import claim marker,
   *   - no server call.
   *
   * The data stays recoverable until a human explicitly imports or discards it.
   */
  detectLegacyProjects() {
    const quarantined = readJson(QUARANTINE_KEY, null);
    if (quarantined && Array.isArray(quarantined.items)) {
      return {
        found: quarantined.items.length > 0,
        count: quarantined.items.length,
        quarantinedAt: quarantined.detectedAt || null,
      };
    }

    const legacy = readJson(LEGACY_STORAGE_KEY, null);
    const items = Array.isArray(legacy)
      ? legacy.filter((campaign) => campaign && typeof campaign.id === "string" && campaign.id)
      : [];
    if (items.length === 0) return { found: false, count: 0, quarantinedAt: null };

    const record = {
      detectedAt: now(),
      items,
      activeId: readKey(LEGACY_ACTIVE_KEY) || null,
      // Audit only: a quarantined pile is browser-wide, so knowing who saw it first
      // helps a human decide, and it is never treated as authorization.
      detectedByScope: activeScope || null,
    };
    writeKey(QUARANTINE_KEY, JSON.stringify(record));
    removeKey(LEGACY_STORAGE_KEY);
    removeKey(LEGACY_ACTIVE_KEY);
    return { found: true, count: items.length, quarantinedAt: record.detectedAt };
  },

  // The quarantined rows, for an explicit confirmation UI. Nothing is adopted by
  // reading them.
  getQuarantinedProjects() {
    const record = readJson(QUARANTINE_KEY, null);
    if (!record || !Array.isArray(record.items)) return null;
    return {
      detectedAt: record.detectedAt || null,
      items: record.items,
      activeId: record.activeId || null,
    };
  },

  /**
   * Explicit, user-confirmed adoption of quarantined browser-local projects.
   *
   * Without `confirm: true` this is inert: no network call, no storage change.
   * With confirmation it goes through the same idempotent import endpoint as
   * before, keeps the "never overwrite a newer server row" guarantee, and only
   * clears the quarantine after the server accepted the payload — a failed or
   * offline attempt keeps every row recoverable and rethrows the typed error.
   */
  async importQuarantinedProjects({ client, confirm = false } = {}) {
    const record = CampaignStore.getQuarantinedProjects();
    if (!record || record.items.length === 0) return { imported: 0, reason: "nothing_quarantined" };
    if (confirm !== true) return { imported: 0, reason: "confirmation_required" };
    if (!client) return { imported: 0, reason: "no_client" };

    const scope = activeScope || (await client.resolveProfileScope?.()) || null;
    if (!scope) return { imported: 0, reason: "no_profile_scope" };
    CampaignStore.setScope(scope);

    // The same browser-local pile already adopted by a different profile must not
    // change hands, even with a confirmation.
    const claim = readKey(IMPORT_CLAIM_KEY);
    if (claim && claim !== scope) return { imported: 0, reason: "claimed_by_another_profile" };

    const payload = record.items
      .filter((campaign) => campaign && typeof campaign.id === "string" && campaign.id)
      .map((campaign) => ({
        id: campaign.id,
        name: campaign.name,
        description: campaign.description,
        status: campaign.status,
        updatedAt: campaign.updatedAt,
        ...(campaign.instructions ? { instructions: campaign.instructions } : {}),
        ...(Array.isArray(campaign.briefs) ? { briefs: campaign.briefs } : {}),
      }));
    if (payload.length === 0) return { imported: 0, reason: "nothing_quarantined" };

    // Throws on failure, and nothing below runs: the quarantine stays intact and
    // the next attempt retries safely.
    const report = await client.importProjects(payload);
    writeKey(IMPORT_CLAIM_KEY, scope);
    removeKey(QUARANTINE_KEY);
    if (record.activeId) writeKey(activeKey(scope), record.activeId);
    await CampaignStore.hydrate({ client, scope });
    return { imported: payload.length, report };
  },

  // Explicit user rejection: the quarantined rows are deleted on purpose, and only
  // when the user asked for it.
  discardQuarantinedProjects() {
    removeKey(QUARANTINE_KEY);
    return true;
  },

  /**
   * Backward-compatible entry point. It no longer reads the shared legacy keys
   * directly and it never claims unattended: detection quarantines, and only an
   * explicit `confirm: true` imports. Kept so an existing caller cannot silently
   * adopt unscoped data.
   */
  async importLegacyProjects({ client, confirm = false } = {}) {
    CampaignStore.detectLegacyProjects();
    return CampaignStore.importQuarantinedProjects({ client, confirm });
  },
};

export const campaignStorageInternals = {
  ACTIVE_KEY_PREFIX,
  CACHE_KEY_PREFIX,
  IMPORT_CLAIM_KEY,
  QUARANTINE_KEY,
  LEGACY_ACTIVE_KEY,
  LEGACY_STORAGE_KEY,
  activeKey,
  cacheKey,
  toCachedRecord,
};
