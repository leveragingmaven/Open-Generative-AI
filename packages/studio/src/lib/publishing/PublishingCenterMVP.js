import { muApiPublishingProvider } from "./MuApiPublishingProvider.js";
import { readPublishingDrafts, readPublishingHistory, savePublishingDraft, savePublishingJob } from "./publishingHistory.js";
import { readAssetHistory } from "../assets/historyManager.js";
import { assetCampaignInfo } from "../campaigns/campaignAssetMetadata.js";

export class PublishingCenterMVP {
  constructor(options = {}) {
    this.storage = options.storage || localStorage;
    this.publishingProvider = options.publishingProvider || muApiPublishingProvider;
  }

  /**
   * Get all available assets from history
   */
  getAvailableAssets() {
    return readAssetHistory(this.storage);
  }

  /**
   * Create a new publishing draft from an existing asset
   */
  createDraftFromAsset(asset, options = {}) {
    const campaignInfo = assetCampaignInfo(asset);
    const draft = this.publishingProvider.createDraft({
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
  updateDraftPlatforms(draftId, platforms) {
    const drafts = readPublishingDrafts(this.storage);
    const draft = drafts.find(d => d.id === draftId);
    
    if (!draft) {
      throw new Error("Draft not found");
    }

    const updatedDraft = this.publishingProvider.updateDraft({
      ...draft,
      platforms,
    }, { storage: this.storage });

    // Save using the publishing history abstraction
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

    const scheduledDraft = this.publishingProvider.updateDraft({
      ...draft,
      scheduledAt,
      timezone,
    }, { storage: this.storage });

    // Save using the publishing history abstraction
    savePublishingDraft(scheduledDraft, this.storage);
    
    return await this.publishingProvider.schedulePost(scheduledDraft, { storage: this.storage });
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

    const result = await this.publishingProvider.publishNow(draft, { storage: this.storage });
    
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

  /**
   * Delete a draft
   */
  deleteDraft(draftId) {
    return this.publishingProvider.deleteDraft(draftId, { 
      readDrafts: () => readPublishingDrafts(this.storage),
      writeDrafts: (drafts) => {
        // This relies on the provider's internal storage handling
        // We don't need to manually save since the provider handles it
        return { ok: true, draftId };
      }
    });
  }
}