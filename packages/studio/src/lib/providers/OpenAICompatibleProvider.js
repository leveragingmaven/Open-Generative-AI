import { CreativeProvider } from "./CreativeProvider.js";
import { PROVIDER_IDS } from "./providerTypes.js";
import { PROVIDER_CONFIG } from "../intelligence/config.js";

const DEFAULT_ENDPOINT = "/api/openai/v1";

function runtimeConfig() {
  const env = typeof process !== "undefined" ? process.env || {} : {};
  return {
    endpoint: env.OPENAI_COMPATIBLE_BASE_URL || env.OPENAI_BASE_URL || DEFAULT_ENDPOINT,
    model: env.MAVENSYNC_OPENAI_MODEL || env.OPENAI_MODEL || PROVIDER_CONFIG.openai.model,
    serverKey: typeof window === "undefined" ? (env.OPENAI_API_KEY || env.MAVENSYNC_OPENAI_API_KEY || null) : null,
  };
}

function messageContent(params = {}) {
  if (Array.isArray(params.messages)) return params.messages;
  return [{ role: "user", content: params.prompt || params.input || params.text || "" }];
}

export class OpenAICompatibleProvider extends CreativeProvider {
  constructor({ fetchImpl = globalThis.fetch, config = runtimeConfig() } = {}) {
    super({ id: PROVIDER_IDS.OPENAI, name: "OpenAI-compatible", capabilities: ["text", "llm", "streaming"] });
    this.fetchImpl = fetchImpl;
    this.config = config;
  }

  async execute(request = {}) {
    const operation = request.operation || request.routing?.operation;
    if (!operation || !["text_generation", "prompt_enhancement"].includes(operation)) {
      this.notImplemented(`execute:${operation || "unknown"}`);
    }
    if (typeof this.fetchImpl !== "function") throw new Error("OpenAI-compatible provider requires fetch");
    const params = request.inputs || request.payload || {};
    const apiKey = request.apiKey !== undefined ? request.apiKey : request.executionMetadata?.apiKey;
    const model = params.model || request.routing?.logicalModel || this.config.model;
    if (!model) throw new Error("OpenAI-compatible deployment requires a configured model or user-selected model");
    const headers = { "Content-Type": "application/json" };
    const credential = apiKey || this.config.serverKey;
    if (credential) headers.Authorization = `Bearer ${credential}`;
    const response = await this.fetchImpl(`${this.config.endpoint.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model, messages: messageContent(params), temperature: params.temperature, max_tokens: params.max_tokens }),
    });
    if (!response.ok) throw new Error(`OpenAI-compatible request failed: ${response.status} ${response.statusText || ""}`.trim());
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content ?? data.output_text ?? data.output ?? "";
    return { ...data, outputs: [text], outputReferences: [text], providerMetadata: { provider: this.id, model } };
  }
}

export const openAICompatibleProvider = new OpenAICompatibleProvider();
