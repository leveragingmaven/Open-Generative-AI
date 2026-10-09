import { publishingProviderRegistry } from "./PublishingProviderRegistry.js";
import { deletePublishingDraft, readPublishingDrafts, readPublishingHistory, replacePublishingDrafts, savePublishingDraft, savePublishingJob } from "./publishingHistory.js";
import { assetCampaignInfo } from "../campaigns/campaignAssetMetadata.js";
import { AssetLibraryService } from "../intelligence/AssetLibraryService.js";
import { InMemoryAssetIndexer } from "../intelligence/AssetIndexer.js";
import { localAssetManager } from "../intelligence/AssetManager.js";
import { PublishingError, PublishingValidationError, UnsupportedPublishingCapabilityError } from "./publishingErrors.js";
import { isScheduledPublishingStatus, PUBLISHING_PROVIDER_IDS, PUBLISHING_STATUS, effectivePublishingDraftStatus } from "./publishingTypes.js";

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

  attachAsset(draftId, asset) {
    const draft = readPublishingDrafts(this.storage).find((item) => item.id === draftId);
    if (!draft) throw new Error("Draft not found");
    if (!asset?.id || !asset?.url) throw new Error("Uploaded media is unavailable");
    const updated = this.providerForDraft(draft).updateDraft({
      ...draft,
      assets: [asset],
      assetIds: [asset.id],
    }, { storage: this.storage });
    savePublishingDraft(updated, this.storage);
    return updated;
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
      assetIds: Array.isArray(updates.assetIds) ? updates.assetIds : draft.assetIds,
      assets: Array.isArray(updates.assets) ? updates.assets : draft.assets,
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
    if (!provider.supportsCapability("schedulePost")) {
      throw new UnsupportedPublishingCapabilityError("schedulePost", provider.id);
    }

    const scheduledDraft = {
      ...draft,
      scheduledAt,
      timezone,
      updatedAt: new Date().toISOString(),
    };

    let result;
    if (scheduledDraft.providerJobId && [PUBLISHING_STATUS.SCHEDULED, PUBLISHING_STATUS.QUEUED].includes(draft.status)) {
      if (!provider.supportsCapability("reschedulePost")) {
        throw new UnsupportedPublishingCapabilityError("reschedulePost", provider.id);
      }
      result = await provider.reschedulePost(scheduledDraft.providerJobId, {
        scheduled_at: new Date(scheduledAt).toISOString(),
        scheduledAt: new Date(scheduledAt).toISOString(),
        timezone,
      });
      savePublishingJob({ ...(result || {}), draftId: draft.id, provider: provider.id, providerJobId: scheduledDraft.providerJobId, status: PUBLISHING_STATUS.SCHEDULED, updatedAt: new Date().toISOString() }, this.storage);
    } else {
      result = await provider.schedulePost(scheduledDraft, { storage: this.storage });
    }

    const scheduledStatus = effectivePublishingDraftStatus({ ...scheduledDraft, status: result?.status || PUBLISHING_STATUS.SCHEDULED });
    const providerPostIds = {
      ...(draft.providerPostIds || {}),
      ...(result?.providerPostIds || {}),
      ...Object.fromEntries(Object.entries(result?.platformResults || {})
        .filter(([, platformResult]) => platformResult?.providerPostId)
        .map(([platform, platformResult]) => [platform, platformResult.providerPostId])),
    };
    const providerRequestIds = {
      ...(draft.providerRequestIds || {}),
      ...(result?.providerRequestIds || {}),
      ...Object.fromEntries(Object.entries(result?.platformResults || {})
        .filter(([, platformResult]) => platformResult?.providerRequestId)
        .map(([platform, platformResult]) => [platform, platformResult.providerRequestId])),
    };
    // Only a provider-issued id may be persisted as providerJobId. Falling back to the local draft id
    // (result.id) would make a malformed provider response look like a successful schedule and would
    // send a draft id to the provider on the next reschedule or cancel.
    const providerJobId = result?.providerJobId || result?.providerPostId || scheduledDraft.providerJobId || null;
    if (!providerJobId && provider.id === PUBLISHING_PROVIDER_IDS.ZERNIO) {
      throw new PublishingError('Maven Social did not confirm a provider post id, so this post is not scheduled.', {
        code: 'zernio_post_id_missing',
        status: 502,
      });
    }
    savePublishingDraft({
      ...scheduledDraft,
      status: scheduledStatus,
      providerJobId,
      providerPostIds,
      providerRequestIds,
    }, this.storage);
    return result;
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
    if (!provider.supportsCapability("cancelScheduledPost")) {
      throw new UnsupportedPublishingCapabilityError("cancelScheduledPost", provider.id);
    }
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

  async getEngagementEntitlement() {
    if (!this.publishingProvider.getEngagementEntitlement) return null;
    return await this.publishingProvider.getEngagementEntitlement();
  }

  async disconnectAccount(accountId) {
    if (!this.publishingProvider.disconnectAccount) {
      throw new UnsupportedPublishingCapabilityError("disconnectAccount", this.publishingProvider.id);
    }
    return await this.publishingProvider.disconnectAccount(accountId);
  }

  async listAutomations() {
    if (!this.publishingProvider.listAutomations) return [];
    return await this.publishingProvider.listAutomations();
  }

  async createAutomation(input) {
    if (!this.publishingProvider.createAutomation) throw new PublishingValidationError("Automations are unavailable for this account source.");
    return await this.publishingProvider.createAutomation(input);
  }

  async updateAutomation(id, input) {
    if (!this.publishingProvider.updateAutomation) throw new PublishingValidationError("Automations are unavailable for this account source.");
    return await this.publishingProvider.updateAutomation(id, input);
  }

  async deleteAutomation(id) {
    if (!this.publishingProvider.deleteAutomation) throw new PublishingValidationError("Automations are unavailable for this account source.");
    return await this.publishingProvider.deleteAutomation(id);
  }

  async listInboxConversations() {
    if (!this.publishingProvider.listInboxConversations) return { conversations: [] };
    return await this.publishingProvider.listInboxConversations();
  }

  async getInboxMessages(conversationId, query = {}) {
    if (!this.publishingProvider.getInboxMessages) return { messages: [] };
    return await this.publishingProvider.getInboxMessages(conversationId, query);
  }

  async sendInboxMessage(conversationId, message, query = {}) {
    if (!this.publishingProvider.sendInboxMessage) return { success: false };
    return await this.publishingProvider.sendInboxMessage(conversationId, message, query);
  }

  async getAnalytics(query = {}) {
    if (!this.publishingProvider.getAnalytics) return null;
    return await this.publishingProvider.getAnalytics(query);
  }

  async connectAccount(platform, options = {}) {
    if (!this.publishingProvider.connectAccount) throw new Error("Connected accounts are unavailable");
    const input = typeof platform === "object" && platform !== null
      ? platform
      : { ...options, platform };
    return await this.publishingProvider.connectAccount({
      platform: input.platform,
      externalUserId: input.externalUserId,
      redirectTo: input.redirectTo,
      reconnectAccountId: input.reconnectAccountId,
    });
  }

  async getRemoteHistory() {
    if (!this.publishingProvider.supportsCapability("getScheduledPosts")) return [];
    const remoteJobs = await this.publishingProvider.getScheduledPosts();
    if (this.publishingProvider.id !== PUBLISHING_PROVIDER_IDS.MUAPI) return remoteJobs;

    const drafts = readPublishingDrafts(this.storage);
    const history = readPublishingHistory(this.storage);
    return remoteJobs.map((remoteJob) => {
      const remoteIds = new Set([
        remoteJob.providerJobId,
        remoteJob.providerPostId,
        remoteJob.providerRequestId,
        remoteJob.id,
      ].filter(Boolean).map(String));
      const remoteRaw = remoteJob.raw || {};
      const remoteDraftId = remoteJob.draftId || remoteRaw.draftId || remoteRaw.draft_id;
      const draft = drafts.find((item) => item.provider === PUBLISHING_PROVIDER_IDS.MUAPI
        && (isScheduledPublishingStatus(item.status) || Boolean(item.scheduledAt))
        && ((remoteDraftId && item.id === remoteDraftId)
          || [item.providerJobId, ...Object.values(item.providerPostIds || {}), ...Object.values(item.providerRequestIds || {})]
            .some((id) => id && remoteIds.has(String(id)))));
      if (!draft || ![PUBLISHING_STATUS.PUBLISHED, PUBLISHING_STATUS.FAILED].includes(remoteJob.status)) return remoteJob;

      const historyJob = history.find((item) => item.draftId === draft.id);
      const platforms = remoteJob.platforms?.length ? remoteJob.platforms : draft.platforms;
      const providerPostIds = {
        ...(draft.providerPostIds || {}),
        ...(remoteJob.providerPostIds || {}),
        ...(remoteJob.providerPostId && platforms.length === 1 ? { [platforms[0]]: remoteJob.providerPostId } : {}),
      };
      const providerJobId = remoteJob.providerJobId || draft.providerJobId;
      const error = remoteJob.status === PUBLISHING_STATUS.FAILED
        ? remoteJob.error || "MuAPI reported that this scheduled post failed."
        : null;
      const updatedDraft = this.providerForDraft(draft).updateDraft({
        ...draft,
        status: remoteJob.status,
        providerJobId,
        providerPostIds,
        scheduledAt: draft.scheduledAt || remoteJob.scheduledAt,
        publishedAt: remoteJob.status === PUBLISHING_STATUS.PUBLISHED
          ? remoteJob.publishedAt || draft.publishedAt || new Date().toISOString()
          : draft.publishedAt,
        error,
      }, { storage: this.storage });
      savePublishingDraft(updatedDraft, this.storage);

      const reconciledJob = {
        ...historyJob,
        ...remoteJob,
        id: historyJob?.id || remoteJob.id || providerJobId || remoteJob.providerPostId || draft.id,
        draftId: draft.id,
        provider: PUBLISHING_PROVIDER_IDS.MUAPI,
        providerJobId,
        providerPostIds,
        platforms,
        status: remoteJob.status,
        scheduledAt: draft.scheduledAt || remoteJob.scheduledAt,
        publishedAt: remoteJob.status === PUBLISHING_STATUS.PUBLISHED ? updatedDraft.publishedAt : remoteJob.publishedAt,
        error,
      };
      savePublishingJob(reconciledJob, this.storage);
      return reconciledJob;
    });
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
