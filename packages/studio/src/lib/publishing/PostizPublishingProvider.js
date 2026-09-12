import { PublishingProvider } from "./PublishingProvider.js";
import { PublishingError, PublishingValidationError } from "./publishingErrors.js";
import { platformCapabilityRegistry } from "./platformCapabilities.js";
import { PUBLISHING_PROVIDER_IDS, PUBLISHING_STATUS, normalizePublishingDraft, normalizePublishingJob, normalizePublishingStatus, validatePublishingDraft } from "./publishingTypes.js";

export const POSTIZ_PROVIDER_HEADER = "x-publishing-provider";

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function listFromResponse(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.integrations)) return input.integrations;
  if (Array.isArray(input?.data)) return input.data;
  if (Array.isArray(input?.results)) return input.results;
  return [];
}

const CREDENTIAL_FIELD = /token|secret|api[-_]?key/i;

function removeCredentialFields(input) {
  if (Array.isArray(input)) return input.map(removeCredentialFields);
  if (!input || typeof input !== "object") return input;
  return Object.fromEntries(Object.entries(input)
    .filter(([key]) => !CREDENTIAL_FIELD.test(key))
    .map(([key, value]) => [key, removeCredentialFields(value)]));
}

function assetUrl(asset = {}) {
  return firstValue(asset.url, asset.assetUrl, asset.previewUrl, asset.generatedFiles?.[0], asset.output?.url);
}

function accountIdForPlatform(draft, platform, options = {}) {
  const override = draft.platformOverrides?.[platform] || {};
  const configured = firstValue(override.accountId, override.account_id, draft.accountIds?.[platform], draft.platformAccountIds?.[platform]);
  if (configured) return configured;
  return (options.accounts || []).find((account) => account.platform === platform && account.connected !== false)?.id || null;
}

function postizDate(value) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) throw new PublishingValidationError("Choose a valid publishing date and time.", { field: "scheduledAt" });
  return new Date(timestamp).toISOString();
}

export function createPostizPayload(draftInput, type, media, options = {}) {
  const draft = normalizePublishingDraft(draftInput);
  const posts = draft.platforms.map((platformInput) => {
    const platform = String(platformInput || "").toLowerCase();
    const integrationId = accountIdForPlatform(draft, platform, options);
    if (!integrationId) throw new PublishingError(`Connect a ${platform} account before publishing.`, { code: "missing_account", platform, draftId: draft.id });
    const override = draft.platformOverrides?.[platform] || {};
    return {
      integration: { id: String(integrationId) },
      group: options.group || draft.id,
      settings: override.settings || {},
      value: [{
        content: String(firstValue(override.caption, draft.caption, draft.description, draft.title, "")),
        delay: 0,
        image: media,
      }],
    };
  });
  return {
    type,
    shortLink: false,
    date: type === "now" ? new Date().toISOString() : postizDate(draft.scheduledAt),
    tags: draft.hashtags.map((tag) => ({ label: String(tag), value: String(tag) })),
    posts,
  };
}

function normalizeUploadedMedia(input = {}) {
  const media = input?.media || input?.data || input;
  const id = firstValue(media?.id, media?.mediaId);
  const path = firstValue(media?.path, media?.url);
  if (!id || !path) throw new PublishingError("Postiz returned invalid uploaded media data.", { code: "postiz_malformed_media_response" });
  return {
    id,
    path,
    ...(media.alt ? { alt: media.alt } : {}),
    ...(media.thumbnail ? { thumbnail: media.thumbnail } : {}),
    ...(media.thumbnailTimestamp !== undefined ? { thumbnailTimestamp: media.thumbnailTimestamp } : {}),
  };
}

function normalizePostizPostResult(input = {}, fallbackIntegrationId, status = PUBLISHING_STATUS.PUBLISHED) {
  const providerPostId = firstValue(input.postId, input.post_id, input.id);
  const providerIntegrationId = firstValue(input.integration, input.integrationId, input.integration_id, fallbackIntegrationId);
  return {
    providerPostId: providerPostId || null,
    providerIntegrationId: providerIntegrationId || null,
    ...(firstValue(input.group, input.providerGroupId) ? { providerGroupId: firstValue(input.group, input.providerGroupId) } : {}),
    ...(firstValue(input.contentId, input.content_id, input.providerContentId) ? { providerContentId: firstValue(input.contentId, input.content_id, input.providerContentId) } : {}),
    status,
    raw: removeCredentialFields(input),
  };
}

export function normalizePostizPublishResponse(input, integrationIds = [], status = PUBLISHING_STATUS.PUBLISHED) {
  if (!Array.isArray(input) || input.length === 0) throw new PublishingError("Postiz returned no published posts.", { code: "postiz_malformed_response" });
  return input.map((item, index) => normalizePostizPostResult(item, integrationIds[index], status));
}

export function normalizePostizIntegration(input = {}) {
  const id = firstValue(input.id, input.integrationId, input.integration_id);
  if (id === undefined || id === null) return null;
  const platform = String(firstValue(input.identifier, input.providerIdentifier, input.platform, input.network, input.type) || "").toLowerCase();
  const connected = input.disabled !== true && input.connected !== false && input.is_connected !== false;
  return {
    id,
    accountId: id,
    platform,
    name: firstValue(input.name, input.profile, platform),
    username: firstValue(input.profile, input.username, input.handle, input.name),
    avatarUrl: firstValue(input.picture, input.avatar_url, input.avatarUrl) || null,
    status: normalizePublishingStatus(input.status || (connected ? PUBLISHING_STATUS.PUBLISHED : PUBLISHING_STATUS.CANCELLED)),
    connected,
    provider: PUBLISHING_PROVIDER_IDS.POSTIZ,
    raw: removeCredentialFields(input),
  };
}

export function normalizePostizIntegrations(input) {
  return listFromResponse(input).map(normalizePostizIntegration).filter(Boolean);
}

export class PostizPublishingProvider extends PublishingProvider {
  constructor(options = {}) {
    super({ id: PUBLISHING_PROVIDER_IDS.POSTIZ, name: "Postiz" });
    this.fetchFn = options.fetchFn || globalThis.fetch?.bind(globalThis);
    this.apiBase = options.apiBase || "/api/publishing";
  }

  async request(path, options = {}) {
    if (!this.fetchFn) throw new PublishingError("Publishing API is unavailable", { code: "fetch_unavailable" });
    const response = await this.fetchFn(`${this.apiBase}${path}`, {
      method: options.method || "GET",
      credentials: "include",
      headers: { "content-type": "application/json", [POSTIZ_PROVIDER_HEADER]: this.id, ...(options.headers || {}) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new PublishingError(data.error || "Postiz publishing request failed", { code: data.code || "postiz_api_error", status: response.status, data });
    return data;
  }

  async getConnectedAccounts() {
    return normalizePostizIntegrations(await this.request("/accounts", { capability: "getConnectedAccounts" }));
  }

  async uploadMedia(asset) {
    const url = assetUrl(asset);
    if (!url) throw new PublishingError("Publishing requires a public asset URL.", { code: "missing_media_url" });
    return normalizeUploadedMedia(await this.request("/media", { method: "POST", body: { url }, capability: "uploadMedia" }));
  }

  async submit(draftInput, type, options = {}) {
    const draft = validatePublishingDraft({ ...draftInput, provider: this.id }, platformCapabilityRegistry);
    const media = [];
    for (const asset of draft.assets) media.push(await this.uploadMedia(asset));
    const integrationIds = draft.platforms.map((platform) => accountIdForPlatform(draft, String(platform).toLowerCase(), options));
    const payload = createPostizPayload(draft, type, media, options);
    const response = await this.request("/posts", { method: "POST", body: payload, capability: type === "now" ? "publishNow" : "schedulePost" });
    const results = normalizePostizPublishResponse(response, integrationIds, type === "schedule" ? PUBLISHING_STATUS.SCHEDULED : PUBLISHING_STATUS.PUBLISHED);
    const platformResults = {};
    draft.platforms.forEach((platformInput, index) => {
      platformResults[String(platformInput).toLowerCase()] = results[index] || { status: PUBLISHING_STATUS.FAILED, error: "Postiz did not return a result for this integration." };
    });
    const providerPostIds = Object.fromEntries(Object.entries(platformResults).filter(([, result]) => result.providerPostId).map(([platform, result]) => [platform, result.providerPostId]));
    return normalizePublishingJob({
      id: null,
      draftId: draft.id,
      provider: this.id,
      platforms: draft.platforms,
      status: type === "schedule" ? PUBLISHING_STATUS.SCHEDULED : PUBLISHING_STATUS.PUBLISHED,
      platformResults,
      providerPostIds,
      raw: removeCredentialFields(response),
    });
  }

  schedulePost(draft, options = {}) { return this.submit(draft, "schedule", options); }

  publishNow(draft, options = {}) { return this.submit(draft, "now", options); }
}

export const postizPublishingProvider = new PostizPublishingProvider();
