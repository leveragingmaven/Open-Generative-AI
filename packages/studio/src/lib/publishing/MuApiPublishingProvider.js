import { PublishingProvider } from "./PublishingProvider.js";
import { jobManager } from "../jobs/jobManager.js";
import { MavenSyncClient } from "../mavensync/MavenSyncClient.js";
import { reportPublishingStatusSafe } from "./publishingStatusReporter.js";
import { UnsupportedPublishingCapabilityError, PublishingError } from "./publishingErrors.js";
import { platformCapabilityRegistry } from "./platformCapabilities.js";
import {
  PUBLISHING_PROVIDER_IDS,
  PUBLISHING_STATUS,
  normalizePublishingDraft,
  normalizePublishingJob,
  normalizePublishingStatus,
  validatePublishingDraft,
} from "./publishingTypes.js";
import { deletePublishingDraft, savePublishingDraft, savePublishingJob } from "./publishingHistory.js";

const PLATFORM_PUBLISH_PATHS = {
  youtube: "/publish-now",
  tiktok: "/publish-now",
  instagram: "/publish-now",
  facebook: "/publish-now",
  linkedin: "/publish-now",
  pinterest: "/publish-now",
  threads: "/publish-now",
  x: "/publish-now",
};

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function assetUrl(asset = {}) {
  return firstValue(asset.url, asset.assetUrl, asset.previewUrl, asset.generatedFiles?.[0], asset.output?.url);
}

function normalizePlatform(platform) {
  return String(platform || "").toLowerCase();
}

function accountPlatform(account = {}) {
  return normalizePlatform(account.platform || account.provider || account.network || account.type);
}

export function normalizeConnectedAccount(input = {}) {
  const platform = accountPlatform(input);
  const id = firstValue(input.id, input.account_id, input.accountId);
  const { access_token, refresh_token, token, oauth_token, oauthToken, ...safeRaw } = input;
  return {
    id,
    accountId: id,
    platform,
    name: firstValue(input.name, input.account_name, input.accountName, input.username, input.handle, platform),
    username: firstValue(input.username, input.handle, input.account_name, input.name),
    status: normalizePublishingStatus(input.status || (input.is_connected === false ? "cancelled" : "published")),
    connected: input.connected !== false && input.is_connected !== false,
    raw: safeRaw,
  };
}

function normalizeAccountList(input) {
  const list = Array.isArray(input)
    ? input
    : Array.isArray(input?.accounts)
      ? input.accounts
      : Array.isArray(input?.data)
        ? input.data
        : Array.isArray(input?.results)
          ? input.results
          : [];
  return list.map(normalizeConnectedAccount).filter((account) => account.id !== undefined && account.id !== null);
}

function resolveAccountId(draft, platform, options = {}) {
  const overrides = draft.platformOverrides?.[platform] || {};
  const configured = firstValue(
    overrides.accountId,
    overrides.account_id,
    draft.accountIds?.[platform],
    draft.platformAccountIds?.[platform],
  );
  if (configured) return configured;
  const accounts = Array.isArray(options.accounts) ? options.accounts.map(normalizeConnectedAccount) : [];
  return accounts.find((account) => account.platform === platform && account.connected)?.id || null;
}

function platformOverride(draft, platform) {
  return draft.platformOverrides?.[platform] || {};
}

export function createMuApiPublishPayload(draftInput, platformInput, options = {}) {
  const draft = normalizePublishingDraft(draftInput);
  const platform = normalizePlatform(platformInput);
  const override = platformOverride(draft, platform);
  const asset = draft.assets[0] || {};
  const mediaUrl = firstValue(override.mediaUrl, override.media_url, assetUrl(asset));
  const accountId = resolveAccountId(draft, platform, options);
  if (!accountId) {
    throw new PublishingError(`Connect a ${platform} account before publishing.`, {
      code: "missing_account",
      platform,
      draftId: draft.id,
    });
  }
  if (!mediaUrl) {
    throw new PublishingError("Publishing requires a public asset URL.", {
      code: "missing_media_url",
      platform,
      draftId: draft.id,
    });
  }

  const caption = firstValue(override.caption, draft.caption, draft.description, draft.title, "");
  const base = {
    account_id: Number.isFinite(Number(accountId)) ? Number(accountId) : accountId,
    media_url: mediaUrl,
    webhook_url: firstValue(override.webhookUrl, override.webhook_url, options.webhookUrl, null),
  };

  if (platform === "youtube") {
    return {
      ...base,
      title: String(firstValue(override.title, draft.title, caption, "Untitled video")).slice(0, 100),
      description: firstValue(override.description, draft.description, draft.caption, ""),
      tags: Array.isArray(override.tags) ? override.tags : draft.hashtags,
      privacy: firstValue(override.privacy, "public"),
      category_id: firstValue(override.categoryId, override.category_id, null),
      made_for_kids: Boolean(override.madeForKids || override.made_for_kids || false),
    };
  }

  if (platform === "tiktok") {
    return {
      ...base,
      title: String(firstValue(override.title, caption, "")).slice(0, 150),
      privacy_level: firstValue(override.privacyLevel, override.privacy_level, "PUBLIC_TO_EVERYONE"),
      allow_comment: override.allowComment ?? override.allow_comment ?? true,
      allow_duet: override.allowDuet ?? override.allow_duet ?? true,
      allow_stitch: override.allowStitch ?? override.allow_stitch ?? true,
      is_ai_generated: override.isAiGenerated ?? override.is_ai_generated ?? true,
    };
  }

  if (platform === "instagram" || platform === "facebook") {
    return {
      ...base,
      caption,
      placement: firstValue(override.placement, platform === "instagram" ? "reels" : "timeline"),
      ...(platform === "instagram"
        ? {
            share_to_feed: override.shareToFeed ?? override.share_to_feed ?? true,
            cover_url: firstValue(override.coverUrl, override.cover_url, null),
            thumb_offset: firstValue(override.thumbOffset, override.thumb_offset, null),
          }
        : {}),
    };
  }

  if (platform === "pinterest") {
    return {
      ...base,
      caption,
      title: firstValue(override.title, draft.title, ""),
      board_id: firstValue(override.boardId, override.board_id, null),
      link: firstValue(override.link, draft.link, null),
    };
  }

  if (platform === "x") {
    return {
      ...base,
      caption: String(caption).slice(0, 280),
      reply_settings: firstValue(override.replySettings, override.reply_settings, "everyone"),
    };
  }

  if (platform === "threads") {
    return {
      ...base,
      caption,
      placement: firstValue(override.placement, "timeline"),
    };
  }

  return {
    ...base,
    caption,
  };
}

export function createMuApiSchedulePayload(draftInput, platformInput, options = {}) {
  const draft = normalizePublishingDraft(draftInput);
  const platform = normalizePlatform(platformInput);
  const immediatePayload = createMuApiPublishPayload(draft, platform, options);
  return {
    account_id: immediatePayload.account_id,
    media_url: immediatePayload.media_url,
    title: immediatePayload.title || draft.title || "",
    caption: immediatePayload.caption || draft.caption || draft.description || "",
    tags: draft.hashtags || [],
    privacy: immediatePayload.privacy || "public",
    scheduled_at: draft.scheduledAt,
  };
}

function normalizeProviderPost(platform, response = {}, fallbackStatus) {
  const status = normalizePublishingStatus(response.status || fallbackStatus || PUBLISHING_STATUS.QUEUED);
  return {
    platform,
    status,
    providerPostId: firstValue(response.post_id, response.postId, response.id),
    providerJobId: firstValue(response.job_id, response.jobId, response.request_id, response.requestId, response.id),
    providerRequestId: firstValue(response.request_id, response.requestId),
    publishedUrl: firstValue(response.url, response.published_url, response.permalink, response.post_url),
    raw: response,
  };
}

function aggregateStatus(results, action) {
  const values = Object.values(results);
  const successes = values.filter((result) => result.status !== PUBLISHING_STATUS.FAILED);
  const failures = values.filter((result) => result.status === PUBLISHING_STATUS.FAILED);
  if (failures.length && successes.length) return PUBLISHING_STATUS.PARTIALLY_PUBLISHED;
  if (failures.length) return PUBLISHING_STATUS.FAILED;
  if (action === "schedule") return PUBLISHING_STATUS.SCHEDULED;
  if (values.some((result) => result.status === PUBLISHING_STATUS.PUBLISHED)) return PUBLISHING_STATUS.PUBLISHED;
  return PUBLISHING_STATUS.PUBLISHING;
}

export class MuApiPublishingProvider extends PublishingProvider {
  constructor(options = {}) {
    super({ id: PUBLISHING_PROVIDER_IDS.MUAPI, name: "MuAPI" });
    this.fetchFn = options.fetchFn || globalThis.fetch?.bind(globalThis);
    this.apiBase = options.apiBase || "/api/publishing";
    this.inFlightSubmissions = new Set();
    this.mavenSyncClient = options.mavenSyncClient || new MavenSyncClient();
  }

  async request(path, options = {}) {
    if (!this.fetchFn) throw new PublishingError("Publishing API is unavailable", { code: "fetch_unavailable" });
    const response = await this.fetchFn(`${this.apiBase}${path}`, {
      method: options.method || "GET",
      headers: { "content-type": "application/json", ...(options.headers || {}) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 501) throw new UnsupportedPublishingCapabilityError(options.capability || path, this.id);
      throw new PublishingError(data.error || "Publishing request failed", {
        code: data.code || "api_error",
        status: response.status,
        data,
      });
    }
    return data;
  }

  connectAccount(payload = {}) {
    return this.request("/accounts/connect", { method: "POST", body: payload, capability: "connectAccount" });
  }

  async getConnectedAccounts() {
    const response = await this.request("/accounts", { capability: "getConnectedAccounts" });
    return normalizeAccountList(response);
  }

  disconnectAccount(accountId) {
    return this.request(`/accounts/${encodeURIComponent(accountId)}`, { method: "DELETE", capability: "disconnectAccount" });
  }

  renameAccount(accountId, accountName) {
    return this.request(`/accounts/${encodeURIComponent(accountId)}`, {
      method: "PATCH",
      body: { account_name: accountName },
      capability: "renameAccount",
    });
  }

  createDraft(input, options = {}) {
    const draft = normalizePublishingDraft({ ...input, provider: this.id });
    savePublishingDraft(draft, options.storage);
    return draft;
  }

  updateDraft(input, options = {}) {
    const draft = normalizePublishingDraft({ ...input, provider: this.id, updatedAt: new Date().toISOString() });
    savePublishingDraft(draft, options.storage);
    return draft;
  }

  deleteDraft(draftId, options = {}) {
    const drafts = options.readDrafts?.() || [];
    const remaining = drafts.filter((draft) => draft.id !== draftId);
    if (options.writeDrafts) options.writeDrafts(remaining);
    else deletePublishingDraft(draftId, options.storage);
    return { ok: true, draftId };
  }

  async submitDraft(draftInput, action, options = {}) {
    const draft = validatePublishingDraft(draftInput, platformCapabilityRegistry);
    const submissionKey = options.idempotencyKey || `${action}:${draft.id}`;
    if (this.inFlightSubmissions.has(submissionKey)) {
      throw new PublishingError("Publishing submission is already in progress", {
        code: "duplicate_submission",
        draftId: draft.id,
      });
    }

    this.inFlightSubmissions.add(submissionKey);
    const jobId = `${action}-${draft.id}`;
    jobManager.createJob(jobId, { draftId: draft.id, action, provider: this.id });

    try {
      const platformResults = {};
      const responses = [];
      for (const platform of draft.platforms.map(normalizePlatform)) {
        try {
          const payload = action === "publish"
            ? createMuApiPublishPayload(draft, platform, options)
            : createMuApiSchedulePayload(draft, platform, options);
          const response = await this.request(PLATFORM_PUBLISH_PATHS[platform] || "/publish-now", {
            method: "POST",
            body: {
              platform,
              draftId: draft.id,
              campaignId: draft.campaignId,
              campaignName: draft.campaignName,
              action,
              idempotencyKey: `${submissionKey}:${platform}`,
              payload,
            },
            capability: action === "publish" ? "publishNow" : "schedulePost",
          });
          const normalized = normalizeProviderPost(platform, response, action === "schedule" ? PUBLISHING_STATUS.SCHEDULED : PUBLISHING_STATUS.PUBLISHING);
          platformResults[platform] = normalized;
          responses.push(response);
        } catch (error) {
          platformResults[platform] = {
            platform,
            status: PUBLISHING_STATUS.FAILED,
            error: error.message,
            code: error.code,
          };
        }
      }
      const status = aggregateStatus(platformResults, action);
      const firstResponse = responses[0] || {};
      const job = normalizePublishingJob({
        ...firstResponse,
        id: firstValue(firstResponse.id, firstResponse.jobId, firstResponse.post_id, firstResponse.request_id, jobId),
        draftId: draft.id,
        provider: this.id,
        platforms: draft.platforms,
        status,
        platformResults,
        providerPostId: firstValue(firstResponse.post_id, firstResponse.postId),
        providerRequestId: firstValue(firstResponse.request_id, firstResponse.requestId),
      });
      savePublishingDraft({ ...draft, status: job.status, providerJobId: job.providerJobId || job.id }, options.storage);
      savePublishingJob(job, options.storage);
      await reportPublishingStatusSafe(this.mavenSyncClient, draft, job);
      if (status === PUBLISHING_STATUS.FAILED) {
        const failure = Object.values(platformResults).find((result) => result.error);
        throw new PublishingError(failure?.error || "Publishing failed for every selected platform.", {
          code: failure?.code || "provider_failure",
          draftId: draft.id,
          platformResults,
        });
      }
      return job;
    } catch (error) {
      const failed = normalizePublishingJob({
        id: jobId,
        draftId: draft.id,
        provider: this.id,
        platforms: draft.platforms,
        status: PUBLISHING_STATUS.FAILED,
        error: error.message,
      });
      savePublishingDraft({ ...draft, status: "failed", error: error.message }, options.storage);
      savePublishingJob(failed, options.storage);
      throw error;
    } finally {
      this.inFlightSubmissions.delete(submissionKey);
    }
  }

  schedulePost(draft, options) {
    return this.submitDraft(draft, "schedule", options);
  }

  publishNow(draft, options) {
    return this.submitDraft(draft, "publish", options);
  }

  getScheduledPosts() {
    return this.request("/scheduled", { capability: "getScheduledPosts" }).then((response) => {
      const posts = Array.isArray(response) ? response : Array.isArray(response?.posts) ? response.posts : Array.isArray(response?.data) ? response.data : [];
      return posts.map((post) => normalizePublishingJob({
        ...post,
        id: firstValue(post.id, post.post_id, post.request_id),
        provider: this.id,
        providerPostId: firstValue(post.post_id, post.id),
        providerRequestId: firstValue(post.request_id, post.requestId),
      }));
    });
  }

  getPublishingJob(jobId) {
    return this.request(`/jobs/${encodeURIComponent(jobId)}`, { capability: "getPublishingJob" }).then(normalizePublishingJob);
  }

  cancelScheduledPost(jobId) {
    return this.request(`/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST", capability: "cancelScheduledPost" });
  }

  reschedulePost(jobId, payload) {
    return this.request(`/jobs/${encodeURIComponent(jobId)}/reschedule`, { method: "POST", body: payload, capability: "reschedulePost" });
  }

  getPlatformCapabilities(platform) {
    return platformCapabilityRegistry.getPlatformCapabilities(platform);
  }

  normalizePublishingStatus(status) {
    return normalizePublishingStatus(status);
  }
}

export const muApiPublishingProvider = new MuApiPublishingProvider();
