import { createMavenSyncError } from "./integrationTypes.js";

const DEFAULT_TIMEOUT_MS = 8000;

function trimTrailingSlash(value = "") {
  return String(value).replace(/\/+$/, "");
}

export function getMavenSyncBrowserConfig(env = typeof process !== "undefined" ? process.env : {}) {
  return {
    mode: env.NEXT_PUBLIC_MAVENSYNC_MODE || env.VITE_MAVENSYNC_MODE || "standalone",
    apiBase: env.NEXT_PUBLIC_MAVENSYNC_API_BASE || env.VITE_MAVENSYNC_API_BASE || "",
    allowedReturnOrigins:
      env.NEXT_PUBLIC_MAVENSYNC_ALLOWED_RETURN_ORIGINS ||
      env.VITE_MAVENSYNC_ALLOWED_RETURN_ORIGINS ||
      "",
  };
}

export class MavenSyncClient {
  constructor(options = {}) {
    this.apiBase = trimTrailingSlash(options.apiBase || getMavenSyncBrowserConfig().apiBase);
    this.fetchFn = options.fetchFn || globalThis.fetch?.bind(globalThis);
    this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    this.credentials = options.credentials || "include";
  }

  isEnabled() {
    return Boolean(this.apiBase && this.fetchFn);
  }

  async request(path, options = {}) {
    if (!this.isEnabled()) {
      return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || this.timeoutMs);

    try {
      const response = await this.fetchFn(`${this.apiBase}${path}`, {
        method: options.method || "GET",
        credentials: this.credentials,
        headers: {
          "content-type": "application/json",
          ...(options.headers || {}),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });

      const contentType = response.headers?.get?.("content-type") || "";
      const data = contentType.includes("application/json") ? await response.json() : await response.text();
      if (!response.ok) {
        throw createMavenSyncError("MavenSync API request failed", {
          code: "api_error",
          status: response.status,
          path,
          data,
        });
      }
      return data;
    } catch (error) {
      if (error.name === "AbortError") {
        throw createMavenSyncError("MavenSync API request timed out", {
          code: "timeout",
          path,
        });
      }
      if (error.name === "MavenSyncError") throw error;
      throw createMavenSyncError(error.message || "MavenSync API request failed", {
        code: "network_error",
        path,
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  getCurrentUser() {
    return this.request("/api/creative-user");
  }

  getLaunchContext(launchId) {
    if (!launchId) return Promise.resolve(null);
    return this.request(`/api/creative-launch/${encodeURIComponent(launchId)}`);
  }

  getProject(projectId) {
    if (!projectId) return Promise.resolve(null);
    return this.request(`/api/creative-context/projects/${encodeURIComponent(projectId)}`);
  }

  getCampaign(campaignId) {
    if (!campaignId) return Promise.resolve(null);
    return this.request(`/api/creative-context/campaigns/${encodeURIComponent(campaignId)}`);
  }

  getKnowledgeContext(selectionId) {
    if (!selectionId) return Promise.resolve(null);
    return this.request(`/api/creative-context/knowledge/${encodeURIComponent(selectionId)}`);
  }

  registerAsset(assetReference) {
    return this.request("/api/creative-assets", {
      method: "POST",
      body: assetReference,
    });
  }

  returnAsset(assetId, payload = {}) {
    if (!assetId) return Promise.resolve(null);
    return this.request(`/api/creative-assets/${encodeURIComponent(assetId)}/return`, {
      method: "POST",
      body: payload,
    });
  }

  reportPublishingStatus(payload) {
    return this.request("/api/creative-publishing/status", {
      method: "POST",
      body: payload,
    });
  }
}
