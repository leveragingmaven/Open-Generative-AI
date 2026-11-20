import { PublishingCenterMVP } from "./PublishingCenterMVP.js";
import { PUBLISHING_DRAFTS_KEY, PUBLISHING_STATUS, normalizePublishingDraft, normalizePublishingStatus } from "./publishingTypes.js";

const endpoint = "/api/publishing/drafts";
const batchSize = 50;
const draftRequestTimeoutMs = 15_000;

async function requestDrafts(method = "GET", body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error("Publishing draft storage did not respond in time."));
  }, draftRequestTimeoutMs);
  try {
    const response = await fetch(endpoint, {
      method,
      cache: "no-store",
      signal: controller.signal,
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
    const result = await response.json().catch(() => null);
    controller.signal.throwIfAborted();
    if (!response.ok || !result) throw new Error(result?.error || "Publishing draft storage is unavailable.");
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchPublishingDrafts({ includeUnimportedBrowserDrafts = false } = {}) {
  const { accountId, drafts } = await requestDrafts();
  const records = drafts.map(({ draft }) => normalizePublishingDraft(draft));
  if (includeUnimportedBrowserDrafts && !globalThis.localStorage.getItem(`publishing-draft-imported:${accountId}`)) {
    records.push(...existingBrowserDrafts(globalThis.localStorage));
  }
  return records;
}

export function existingBrowserDrafts(storage) {
  try {
    const records = JSON.parse(storage.getItem(PUBLISHING_DRAFTS_KEY) || "[]");
    if (!Array.isArray(records)) return [];
    return records.filter(draft => draft && typeof draft.id === "string" && draft.id.length > 0 && draft.id.length <= 191 && draft.id.trim() === draft.id
      && !draft.publishedAt
      && ![PUBLISHING_STATUS.PUBLISHED, PUBLISHING_STATUS.PARTIALLY_PUBLISHED].includes(normalizePublishingStatus(draft.status)));
  } catch {
    return [];
  }
}

function draftSnapshot(storage) {
  let drafts = "[]";
  // Existing Publishing operations can still work synchronously with a snapshot.
  // Drafts never read from or write to localStorage through this adapter.
  return {
    getItem: key => key === PUBLISHING_DRAFTS_KEY ? drafts : storage.getItem(key),
    setItem: (key, value) => {
      if (key === PUBLISHING_DRAFTS_KEY) drafts = value;
      else storage.setItem(key, value);
    },
    removeItem: key => {
      if (key === PUBLISHING_DRAFTS_KEY) drafts = "[]";
      else storage.removeItem(key);
    },
  };
}

function draftContent({ updatedAt, ...payload }) {
  return JSON.stringify(payload);
}

export class PersistentPublishingCenter extends PublishingCenterMVP {
  constructor({ storage = globalThis.localStorage, ...options } = {}) {
    super({ ...options, storage: draftSnapshot(storage) });
    this.records = new Map();
    this.accountId = null;
    this.pending = Promise.resolve();
  }

  enqueue(action) {
    const result = this.pending.then(action);
    this.pending = result.catch(() => {});
    return result;
  }

  setRecords(records) {
    this.records = new Map(records.map(record => [record.draft.id, record]));
    this.storage.setItem(PUBLISHING_DRAFTS_KEY, JSON.stringify(records.map(record => record.draft)));
  }

  async loadRecords(expectedAccount = this.accountId) {
    const { accountId, drafts } = await requestDrafts();
    if ((this.accountId && accountId !== this.accountId) || (expectedAccount && accountId !== expectedAccount)) {
      this.setRecords([]);
      throw new Error("Your signed-in account changed. Reload Publishing.");
    }
    this.accountId = accountId;
    this.setRecords(drafts.sort((a, b) => String(b.draft.updatedAt || "").localeCompare(String(a.draft.updatedAt || ""))));
  }

  refreshDrafts() {
    return this.enqueue(() => this.loadRecords());
  }

  getDrafts() {
    return super.getDrafts().map(draft => ({
      ...draft,
      draftRevision: this.records.get(draft.id)?.revision,
      draftAccountId: this.accountId,
    }));
  }

  runDraftAction(action, expectedDraft) {
    return this.enqueue(async () => {
      await this.loadRecords(expectedDraft?.draftAccountId || this.accountId);
      if (expectedDraft && (!expectedDraft.draftRevision || this.records.get(expectedDraft.id)?.revision !== expectedDraft.draftRevision)) {
        throw new Error("This draft changed elsewhere. Reload Publishing and review the latest draft.");
      }
      const before = new Map(super.getDrafts().map(draft => [draft.id, draft]));
      try {
        const result = await action();
        const after = new Map(super.getDrafts().map(draft => [draft.id, draft]));
        const changes = [];
        for (const [id, draft] of after) {
          if (!before.has(id) || draftContent(draft) !== draftContent(before.get(id))) {
            const record = this.records.get(id);
            changes.push({ id, draft: { ...record?.draft, ...draft }, revision: record?.revision ?? null });
          }
        }
        for (const id of before.keys()) {
          if (!after.has(id)) changes.push({ id, draft: null, revision: this.records.get(id).revision });
        }
        const method = changes.length && changes.every(change => change.draft === null) ? "DELETE" : "PATCH";
        for (let index = 0; index < changes.length; index += batchSize) {
          const batch = changes.slice(index, index + batchSize);
          const { results } = await requestDrafts(method, { accountId: this.accountId, changes: batch });
          for (const { id, revision } of results) {
            const change = batch.find(item => item.id === id);
            if (change.draft) this.records.set(id, { draft: change.draft, revision });
            else this.records.delete(id);
          }
        }
        this.setRecords([...this.records.values()]);
        return result?.id && this.records.has(result.id)
          ? { ...result, draftRevision: this.records.get(result.id).revision, draftAccountId: this.accountId }
          : result;
      } catch (error) {
        // Keep only server-acknowledged state, including any reconciliation batches that succeeded.
        this.setRecords([...this.records.values()]);
        throw error;
      }
    });
  }

  persistDraft(input, options) {
    return this.runDraftAction(() => this.createDraft(input, options));
  }

  persistDraftFromAsset(asset, options) {
    return this.runDraftAction(() => this.createDraftFromAsset(asset, options));
  }

  importBrowserDrafts(drafts, accountId) {
    return this.enqueue(async () => {
      await this.loadRecords(accountId);
      const counts = { imported: 0, skipped: 0, failed: 0 };
      const existing = [...this.records.values()].map(record => record.draft);
      const candidates = drafts.filter(draft => {
        // A provider schedule may already have been discovered by Calendar on another device.
        const known = existing.some(record => record.id === draft.id || (draft.providerJobId
          && record.provider === draft.provider && record.providerJobId === draft.providerJobId));
        if (known) counts.skipped += 1;
        return !known;
      });
      for (let index = 0; index < candidates.length; index += batchSize) {
        await this.insertDrafts(candidates.slice(index, index + batchSize), counts);
      }
      return counts;
    });
  }

  importMcpDrafts(proposals, accountId) {
    return this.enqueue(async () => {
      await this.loadRecords(accountId);
      const counts = { imported: 0, skipped: 0, failed: 0 };
      const original = [...this.records.values()];
      const added = [];
      try {
        for (const proposal of proposals) {
          if (!proposal || typeof proposal.proposalId !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(proposal.proposalId)
            || typeof proposal.title !== "string" || typeof proposal.content !== "string") {
            counts.failed += 1;
            continue;
          }
          if (!super.importCommittedDraft(proposal)) {
            counts.skipped += 1;
            continue;
          }
          added.push(super.getDrafts().find(draft => draft.id === `mcp-${proposal.proposalId}`));
        }
      } finally {
        this.setRecords(original);
      }
      await this.insertDrafts(added, counts);
      return counts;
    });
  }

  async insertDrafts(drafts, counts) {
    if (!drafts.length) return;
    try {
      const { results } = await requestDrafts("POST", { accountId: this.accountId, drafts });
      for (const { id, skipped, revision } of results) {
        if (skipped) counts.skipped += 1;
        else {
          counts.imported += 1;
          this.records.set(id, { draft: drafts.find(draft => draft.id === id), revision });
        }
      }
      this.setRecords([...this.records.values()]);
    } catch (error) {
      counts.failed += drafts.length;
      counts.error = error.message;
    }
  }
}
