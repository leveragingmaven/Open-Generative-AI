import { DesignAgentProvider } from "./DesignAgentProvider.js";
import { DesignAgentCapabilityError, DesignAgentRequestError } from "./designAgentErrors.js";
import {
  DESIGN_AGENT_CAPABILITIES,
  normalizeDesignAgentAsset,
  normalizeDesignAgentJob,
  normalizeDesignAgentSession,
  publicDesignAgentContext,
} from "./designAgentTypes.js";

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

export class MuApiDesignAgentProvider extends DesignAgentProvider {
  constructor({ fetchFn = globalThis.fetch, basePath = "/api/v1/creative-agent" } = {}) {
    super({
      id: "muapi-design-agent",
      name: "MuAPI Design Agent",
      capabilities: [
        DESIGN_AGENT_CAPABILITIES.SESSIONS,
        DESIGN_AGENT_CAPABILITIES.MESSAGES,
        DESIGN_AGENT_CAPABILITIES.ASSETS,
        DESIGN_AGENT_CAPABILITIES.JOBS,
      ],
    });
    this.fetchFn = fetchFn;
    this.basePath = basePath.replace(/\/+$/, "");
  }

  async request(path, { method = "GET", body, signal } = {}) {
    const response = await this.fetchFn(`${this.basePath}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      ...(signal ? { signal } : {}),
    });
    const data = await readJsonResponse(response);
    if (!response.ok) {
      throw new DesignAgentRequestError(data.error || data.detail || "Design Agent request failed", {
        status: response.status,
      });
    }
    return data;
  }

  async createSession(input = {}, context = {}) {
    const data = await this.request("/sessions", {
      method: "POST",
      body: {
        ...input,
        context: publicDesignAgentContext(context),
      },
    });
    return normalizeDesignAgentSession(data, context);
  }

  async getSession(sessionId, context = {}) {
    if (!sessionId) throw new DesignAgentRequestError("Design session ID is required", { status: 400 });
    const data = await this.request(`/sessions/${encodeURIComponent(sessionId)}/messages`, { signal: context.signal });
    return normalizeDesignAgentSession({ id: sessionId, messages: data }, context);
  }

  async sendMessage(sessionId, payload = {}, context = {}) {
    if (!sessionId) throw new DesignAgentRequestError("Design session ID is required", { status: 400 });
    return this.request(`/sessions/${encodeURIComponent(sessionId)}/chat`, {
      method: "POST",
      body: {
        ...payload,
        context: publicDesignAgentContext(context),
      },
    });
  }

  async getSessionAssets(sessionId, context = {}) {
    if (!sessionId) throw new DesignAgentRequestError("Design session ID is required", { status: 400 });
    const data = await this.request(`/sessions/${encodeURIComponent(sessionId)}/assets`, { signal: context.signal });
    const assets = Array.isArray(data) ? data : data.assets || [];
    return assets.map((asset) => normalizeDesignAgentAsset(asset, { ...context, designSessionId: sessionId }));
  }

  async registerSessionAsset(sessionId, { url, kind = "image", sourceTool = "maven" } = {}, context = {}) {
    if (!sessionId) throw new DesignAgentRequestError("Design session ID is required", { status: 400 });
    const supportedKinds = new Set(["image", "audio", "video"]);
    if (typeof url !== "string" || !/^https:\/\//i.test(url) || !supportedKinds.has(kind)) {
      throw new DesignAgentRequestError("A valid generated media URL and supported kind are required", { status: 422 });
    }
    const data = await this.request(`/sessions/${encodeURIComponent(sessionId)}/assets`, {
      method: "POST",
      body: { url, kind, source_tool: sourceTool },
      signal: context.signal,
    });
    const label = String(data?.asset_label || data?.assetId || data?.id || "").trim();
    if (!/^asset_[A-Za-z0-9_-]{1,190}$/.test(label)) {
      throw new DesignAgentRequestError("The generated media could not be registered with this session", { status: 502 });
    }
    return { attachmentId: label, kind };
  }

  async getDesignJob(sessionId, context = {}) {
    if (!sessionId) throw new DesignAgentRequestError("Design session ID is required", { status: 400 });
    const data = await this.request(`/sessions/${encodeURIComponent(sessionId)}/jobs`);
    const jobs = Array.isArray(data) ? data : data.jobs || [];
    return jobs.map((job) => normalizeDesignAgentJob(job, { ...context, designSessionId: sessionId }));
  }

  uploadReferenceAsset() {
    throw new DesignAgentCapabilityError("uploadReferenceAsset");
  }

  getAsset() {
    throw new DesignAgentCapabilityError("getAsset");
  }

  submitDesignJob() {
    throw new DesignAgentCapabilityError("submitDesignJob");
  }

  cancelDesignJob() {
    throw new DesignAgentCapabilityError("cancelDesignJob");
  }
}

export const muApiDesignAgentProvider = new MuApiDesignAgentProvider();
