import { publishingProviderRegistry } from "./PublishingProviderRegistry.js";
import { deletePublishingDraft, readPublishingDrafts, readPublishingHistory, replacePublishingDrafts, savePublishingDraft, savePublishingJob } from "./publishingHistory.js";
import { assetCampaignInfo } from "../campaigns/campaignAssetMetadata.js";
import { AssetLibraryService } from "../intelligence/AssetLibraryService.js";
import { InMemoryAssetIndexer } from "../intelligence/AssetIndexer.js";
import { localAssetManager } from "../intelligence/AssetManager.js";

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

  /**
   * Create a new publishing draft from an existing asset
   */
  createDraftFromAsset(asset, options = {}) {
    const campaignInfo = assetCampaignInfo(asset);
    const provider = options.publishingProvider || (options.providerId ? this.publishingProviderRegistry.get(options.providerId) : this.publishingProvider);
    const draft = provider.createDraft({
      assetIds: [asset.id],
      assets: [asset],
      caption: asset.description || asset.title || "",
      title: asset.title || "",
      campaignId: options.campaignId || campaignInfo?.campaignId || null,
      campaignName: options.campaignName || campaignInfo?.campaignName || null,
      platforms: [],
      scheduledAt: null,
    }, { storage: this.storage });

    // Save using the publishing history abstraction
    savePublishingDraft(draft, this.storage);
    return draft;
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

    const provider = this.providerForDraft(draft);
    const scheduledDraft = provider.updateDraft({
      ...draft,
      scheduledAt,
      timezone,
    }, { storage: this.storage });

    // Save using the publishing history abstraction
    savePublishingDraft(scheduledDraft, this.storage);
    
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
