import { PublishingProvider } from "./PublishingProvider.js";
import { PublishingError } from "./publishingErrors.js";
import { PUBLISHING_PROVIDER_IDS, PUBLISHING_STATUS, normalizePublishingStatus } from "./publishingTypes.js";

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
}

export const postizPublishingProvider = new PostizPublishingProvider();
