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

  async request(path, { method = "GET", body } = {}) {
    const response = await this.fetchFn(`${this.basePath}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
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
    const data = await this.request(`/sessions/${encodeURIComponent(sessionId)}/messages`);
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
    const data = await this.request(`/sessions/${encodeURIComponent(sessionId)}/assets`);
    const assets = Array.isArray(data) ? data : data.assets || [];
    return assets.map((asset) => normalizeDesignAgentAsset(asset, { ...context, designSessionId: sessionId }));
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
