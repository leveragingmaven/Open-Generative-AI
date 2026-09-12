import { publishingProviderRegistry } from "./PublishingProviderRegistry.js";
import { deletePublishingDraft, readPublishingDrafts, readPublishingHistory, replacePublishingDrafts, savePublishingDraft, savePublishingJob } from "./publishingHistory.js";
import { assetCampaignInfo } from "../campaigns/campaignAssetMetadata.js";
import { AssetLibraryService } from "../intelligence/AssetLibraryService.js";
import { InMemoryAssetIndexer } from "../intelligence/AssetIndexer.js";
import { localAssetManager } from "../intelligence/AssetManager.js";
import { PublishingValidationError } from "./publishingErrors.js";

function freshDraftId() {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `draft-${suffix}`;
}

export class PublishingCenterMVP {
  constructor(options = {}) {
    this.storage = options.storage || localStorage;
    this.publishingProviderRegistry = options.publishingProviderRegistry || publishingProviderRegistry;
    this.publishingProvider = options.publishingProvider || this.publishingProviderRegistry.getActiveProvider();
  }

  providerForDraft(draft = {}, options = {}) {
    if (options.publishingProvider) return options.publishingProvider;
    if (draft.provider === this.publishingProvider.id) return this.publishingProvider;
    if (options.providerId || draft.provider) return this.publishingProviderRegistry.resolveForDraft(draft, options);
    return this.publishingProvider;
  }

  /**
   * Get all available assets from history
   */
  getAvailableAssets() {
    const service = new AssetLibraryService({
      repository: localAssetManager.adapter,
      indexer: new InMemoryAssetIndexer(),
      storage: this.storage,
    });
    return service.list();
  }

  /** Create a new publishing draft, optionally seeded with an existing asset. */
  createDraft(input = {}, options = {}) {
    const provider = options.publishingProvider || (options.providerId ? this.publishingProviderRegistry.get(options.providerId) : this.publishingProvider);
    const draft = provider.createDraft({
      ...input,
      id: input.id || freshDraftId(),
      assets: Array.isArray(input.assets) ? input.assets : [],
      assetIds: Array.isArray(input.assetIds) ? input.assetIds : [],
      platforms: Array.isArray(input.platforms) ? input.platforms : [],
      scheduledAt: input.scheduledAt || null,
    }, { storage: this.storage });
    savePublishingDraft(draft, this.storage);
    return draft;
  }

  createDraftFromAsset(asset, options = {}) {
    const campaignInfo = assetCampaignInfo(asset);
    return this.createDraft({
      assetIds: [asset.id],
      assets: [asset],
      caption: asset.description || asset.title || "",
      title: asset.title || "",
      campaignId: options.campaignId || campaignInfo?.campaignId || null,
      campaignName: options.campaignName || campaignInfo?.campaignName || null,
      platforms: [],
      scheduledAt: null,
    }, options);
  }

  /**
   * Update draft platforms
   */
  updateDraftPlatforms(draftId, platforms, options = {}) {
    const drafts = readPublishingDrafts(this.storage);
    const draft = drafts.find(d => d.id === draftId);
    
    if (!draft) {
      throw new Error("Draft not found");
    }

    const updatedDraft = this.providerForDraft(draft, options).updateDraft({
      ...draft,
      platforms,
      accountIds: options.accountIds || draft.accountIds,
      platformOverrides: options.platformOverrides || draft.platformOverrides,
    }, { storage: this.storage });

    // Save using the publishing history abstraction
    savePublishingDraft(updatedDraft, this.storage);
    return updatedDraft;
  }

  /**
   * Update editable draft metadata without changing publishing execution.
   */
  updateDraft(draftId, updates = {}) {
    const drafts = readPublishingDrafts(this.storage);
    const draft = drafts.find(d => d.id === draftId);

    if (!draft) {
      throw new Error("Draft not found");
    }

    const updatedDraft = this.providerForDraft(draft).updateDraft({
      ...draft,
      ...updates,
      id: draft.id,
      assetIds: draft.assetIds,
      assets: draft.assets,
      createdAt: draft.createdAt,
    }, { storage: this.storage });

    savePublishingDraft(updatedDraft, this.storage);
    return updatedDraft;
  }

  /**
   * Schedule a draft for publishing
   */
  async scheduleDraft(draftId, scheduledAt, timezone = "UTC") {
    const drafts = readPublishingDrafts(this.storage);
    const draft = drafts.find(d => d.id === draftId);
    
    if (!draft) {
      throw new Error("Draft not found");
    }
    const scheduledTime = new Date(scheduledAt).getTime();
    if (!Number.isFinite(scheduledTime) || scheduledTime <= Date.now()) {
      throw new PublishingValidationError("Choose a future date and time before scheduling.", { field: "scheduledAt" });
    }

    const provider = this.providerForDraft(draft);
    const scheduledDraft = provider.updateDraft({
      ...draft,
      scheduledAt,
      timezone,
    }, { storage: this.storage });

    // Save using the publishing history abstraction
    savePublishingDraft(scheduledDraft, this.storage);
    
    if (scheduledDraft.providerJobId && ["scheduled", "queued"].includes(draft.status)) {
      const result = await provider.reschedulePost(scheduledDraft.providerJobId, {
        scheduled_at: new Date(scheduledAt).toISOString(),
        scheduledAt: new Date(scheduledAt).toISOString(),
        timezone,
      });
      savePublishingJob({ ...(result || {}), draftId: draft.id, provider: provider.id, providerJobId: scheduledDraft.providerJobId, status: "scheduled", updatedAt: new Date().toISOString() }, this.storage);
      return result;
    }
    return await provider.schedulePost(scheduledDraft, { storage: this.storage });
  }

  /**
   * Publish a draft immediately
   */
  async publishDraft(draftId) {
    const drafts = readPublishingDrafts(this.storage);
    const draft = drafts.find(d => d.id === draftId);
    
    if (!draft) {
      throw new Error("Draft not found");
    }

    const result = await this.providerForDraft(draft).publishNow(draft, { storage: this.storage });
    
    // Save the job using the publishing history abstraction
    savePublishingJob(result, this.storage);
    return result;
  }

  async cancelScheduledDraft(draftId) {
    const draft = readPublishingDrafts(this.storage).find((item) => item.id === draftId);
    if (!draft) throw new Error("Draft not found");
    if (!["scheduled", "queued"].includes(draft.status) && !draft.scheduledAt) {
      throw new PublishingValidationError("Only scheduled publishing jobs can be cancelled.", { field: "status" });
    }
    const historyJob = readPublishingHistory(this.storage).find((job) => job.draftId === draft.id);
    const providerJobId = draft.providerJobId || historyJob?.providerJobId || historyJob?.id;
    if (!providerJobId) {
      throw new PublishingValidationError("This scheduled draft has no provider job to cancel.", { field: "providerJobId" });
    }
    const provider = this.providerForDraft(draft);
    const result = await provider.cancelScheduledPost(providerJobId, { storage: this.storage });
    const cancelledDraft = provider.updateDraft({
      ...draft,
      status: "cancelled",
      scheduledAt: null,
      error: null,
      providerJobId,
    }, { storage: this.storage });
    savePublishingDraft(cancelledDraft, this.storage);
    savePublishingJob({
      ...(historyJob || {}),
      id: historyJob?.id || providerJobId,
      draftId: draft.id,
      provider: draft.provider,
      providerJobId,
      status: "cancelled",
      raw: result,
    }, this.storage);
    return result;
  }

  duplicateDraft(source, options = {}) {
    const drafts = readPublishingDrafts(this.storage);
    const sourceDraft = typeof source === "string" ? drafts.find((draft) => draft.id === source) : source;
    if (!sourceDraft) throw new Error("Draft not found");
    const { providerPostIds, providerJobId, providerRequestIds, publishedAt, error, status, scheduledAt, createdAt, updatedAt, id, ...copy } = sourceDraft;
    return this.createDraft({
      ...copy,
      id: freshDraftId(),
      status: "draft",
      scheduledAt: null,
      providerPostIds: {},
      providerJobId: null,
      providerRequestIds: {},
      publishedAt: null,
      error: null,
    }, { providerId: sourceDraft.provider, ...options });
  }

  /**
   * Get all publishing drafts
   */
  getDrafts() {
    return readPublishingDrafts(this.storage);
  }

  /**
   * Get publishing history
   */
  getHistory() {
    return readPublishingHistory(this.storage);
  }

  async getConnectedAccounts() {
    if (!this.publishingProvider.getConnectedAccounts) return [];
    return await this.publishingProvider.getConnectedAccounts();
  }

  async connectAccount(platform, options = {}) {
    if (!this.publishingProvider.connectAccount) throw new Error("Connected accounts are unavailable");
    return await this.publishingProvider.connectAccount({
      platform,
      externalUserId: options.externalUserId,
      redirectTo: options.redirectTo,
    });
  }

  async getRemoteHistory() {
    if (!this.publishingProvider.getScheduledPosts) return [];
    return await this.publishingProvider.getScheduledPosts();
  }

  /**
   * Delete a draft
   */
  deleteDraft(draftId) {
    const draft = readPublishingDrafts(this.storage).find((item) => item.id === draftId);
    if (!draft) throw new Error("Draft not found");
    const result = this.providerForDraft(draft).deleteDraft(draftId, {
      storage: this.storage,
      readDrafts: () => readPublishingDrafts(this.storage),
      writeDrafts: (drafts) => {
        replacePublishingDrafts(drafts, this.storage);
        return { ok: true, draftId };
      }
    });
    deletePublishingDraft(draftId, this.storage);
    return result;
  }
}
