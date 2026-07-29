import { PublishingProvider } from "./PublishingProvider.js";
import { jobManager } from "../jobs/jobManager.js";
import { MavenSyncClient } from "../mavensync/MavenSyncClient.js";
import { reportPublishingStatusSafe } from "./publishingStatusReporter.js";
import { UnsupportedPublishingCapabilityError, PublishingError } from "./publishingErrors.js";
import { platformCapabilityRegistry } from "./platformCapabilities.js";
import {
  PUBLISHING_PROVIDER_IDS,
  normalizePublishingDraft,
  normalizePublishingJob,
  normalizePublishingStatus,
  validatePublishingDraft,
} from "./publishingTypes.js";
import { savePublishingDraft, savePublishingJob } from "./publishingHistory.js";

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

  getConnectedAccounts() {
    return this.request("/accounts", { capability: "getConnectedAccounts" });
  }

  disconnectAccount(accountId) {
    return this.request(`/accounts/${encodeURIComponent(accountId)}`, { method: "DELETE", capability: "disconnectAccount" });
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
    options.writeDrafts?.(remaining);
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
      const endpoint = action === "publish" ? "/publish-now" : "/schedule";
      const response = await this.request(endpoint, {
        method: "POST",
        body: { draft, idempotencyKey: submissionKey },
        capability: action === "publish" ? "publishNow" : "schedulePost",
      });
      const job = normalizePublishingJob({
        ...response,
        id: response.id || response.jobId || jobId,
        draftId: draft.id,
        provider: this.id,
        platforms: draft.platforms,
      });
      savePublishingDraft({ ...draft, status: job.status, providerJobId: job.providerJobId || job.id }, options.storage);
      savePublishingJob(job, options.storage);
      await reportPublishingStatusSafe(this.mavenSyncClient, draft, job);
      return job;
    } catch (error) {
      const failed = normalizePublishingJob({
        id: jobId,
        draftId: draft.id,
        provider: this.id,
        platforms: draft.platforms,
        status: "failed",
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
    return this.request("/scheduled", { capability: "getScheduledPosts" });
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
