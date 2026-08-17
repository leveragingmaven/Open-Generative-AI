import { PublishingProvider } from "./PublishingProvider.js";
import { PublishingError } from "./publishingErrors.js";
import { PUBLISHING_PROVIDER_IDS, PUBLISHING_STATUS } from "./publishingTypes.js";

export const GHL_HUB_ACCOUNTS_URL = "https://hub.mavensync.space/api/ghl/social/accounts";
const SUPPORTED_PLATFORMS = new Set(["facebook", "instagram", "threads", "pinterest"]);
function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function listFromResponse(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.accounts)) return input.accounts;
  if (Array.isArray(input?.data)) return input.data;
  if (Array.isArray(input?.results)) return input.results;
  return null;
}

function platformOf(input = {}) {
  return String(firstValue(input.platform, input.platform_name, input.platformName, input.network, input.type) || "").toLowerCase();
}

export function normalizeGhlHubAccount(input = {}) {
  const platform = platformOf(input);
  const id = firstValue(input.id, input.account_id, input.accountId);
  if (!SUPPORTED_PLATFORMS.has(platform) || id === undefined || id === null) return null;
  return {
    id,
    accountId: id,
    platform,
    name: firstValue(input.name, input.account_name, input.accountName, input.username, input.handle, platform),
    username: firstValue(input.username, input.handle, input.account_name, input.accountName, input.name),
    avatarUrl: firstValue(input.avatar_url, input.avatarUrl, input.profile_picture_url, input.profilePictureUrl, input.image_url, input.imageUrl) || null,
    status: input.connected === false || input.is_connected === false ? PUBLISHING_STATUS.CANCELLED : PUBLISHING_STATUS.PUBLISHED,
    connected: input.connected !== false && input.is_connected !== false,
    provider: PUBLISHING_PROVIDER_IDS.GHL_HUB,
  };
}

export function normalizeGhlHubAccounts(input) {
  const list = listFromResponse(input);
  if (!list) throw new PublishingError("MavenSync Hub returned an invalid accounts response.", { code: "hub_malformed_response" });
  return list.map(normalizeGhlHubAccount).filter(Boolean);
}

function hubError(message, code, status, details = {}) {
  return new PublishingError(message, { code, status, provider: PUBLISHING_PROVIDER_IDS.GHL_HUB, ...details });
}

export class GhlHubPublishingProvider extends PublishingProvider {
  constructor(options = {}) {
    super({ id: PUBLISHING_PROVIDER_IDS.GHL_HUB, name: "MavenSync Hub / GoHighLevel" });
    this.fetchFn = options.fetchFn || globalThis.fetch?.bind(globalThis);
    this.accountsUrl = options.accountsUrl || GHL_HUB_ACCOUNTS_URL;
    this.timeoutMs = options.timeoutMs || 10000;
  }

  async getConnectedAccounts() {
    if (!this.fetchFn) throw hubError("MavenSync Hub account discovery is unavailable.", "hub_network_error");
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), this.timeoutMs) : null;
    let response;
    try {
      response = await this.fetchFn(this.accountsUrl, { method: "GET", credentials: "include", signal: controller?.signal });
    } catch (error) {
      if (error?.name === "AbortError") throw hubError("MavenSync Hub account discovery timed out. Try reconnecting through Hub.", "hub_timeout");
      throw hubError("MavenSync Hub account discovery failed. Check your connection and try again.", "hub_network_error", undefined, { cause: error });
    } finally {
      if (timeout) clearTimeout(timeout);
    }

    if (response.status === 401) {
      throw hubError("Your MavenSync Hub session is unavailable or expired. Reconnect through MavenSync Hub.", "hub_session_expired", 401, { reconnectRequired: true });
    }
    if (response.status === 403) {
      throw hubError("MavenSync Hub denied account discovery for this session.", "hub_forbidden", 403);
    }
    if (!response.ok) {
      throw hubError("MavenSync Hub account discovery is unavailable right now.", "hub_request_failed", response.status);
    }

    let data;
    try {
      data = await response.json();
    } catch (error) {
      throw hubError("MavenSync Hub returned malformed account data.", "hub_malformed_response", response.status, { cause: error });
    }
    return normalizeGhlHubAccounts(data);
  }
}

export const ghlHubPublishingProvider = new GhlHubPublishingProvider();
