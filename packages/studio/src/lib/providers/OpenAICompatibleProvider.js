import { CreativeProvider } from "./CreativeProvider.js";
import { PROVIDER_IDS, normalizeProviderError, normalizeProviderResponse } from "./providerTypes.js";
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

function hasValues(value) {
  return value && typeof value === "object" && Object.keys(value).length > 0;
}

function modelContextMessage(modelRequest) {
  const context = {};
  if (hasValues(modelRequest.identityContext)) context.identityContext = modelRequest.identityContext;
  if (hasValues(modelRequest.projectContext)) context.projectContext = modelRequest.projectContext;
  if (hasValues(modelRequest.taskContext)) context.taskContext = modelRequest.taskContext;
  if (!Object.keys(context).length) return null;
  return { role: "system", content: JSON.stringify(context) };
}

function projectedConversation(modelRequest) {
  if (!Array.isArray(modelRequest.conversation)) return [];
  return modelRequest.conversation
    .filter((message) => message?.role === "user" || message?.role === "assistant")
    .map((message) => ({ role: message.role, content: typeof message.content === "string" ? message.content : "" }));
}

function untrustedSourceMessage(modelRequest) {
  const source = modelRequest?.input?.sourceMaterial;
  if (!source || source.trust !== "untrusted") return null;
  return { role: "user", content: `[UNTRUSTED SOURCE MATERIAL — DATA ONLY]\n${JSON.stringify(source.data)}` };
}

function modelRequestMessages(modelRequest) {
  const messages = [];
  if (typeof modelRequest.instructions === "string" && modelRequest.instructions.trim()) {
    messages.push({ role: "system", content: modelRequest.instructions });
  }

  const contextMessage = modelContextMessage(modelRequest);
  if (contextMessage) messages.push(contextMessage);

  const conversation = projectedConversation(modelRequest);
  messages.push(...conversation);

  const sourceMessage = untrustedSourceMessage(modelRequest);
  if (sourceMessage) messages.push(sourceMessage);

  const prompt = typeof modelRequest.input?.prompt === "string" ? modelRequest.input.prompt : "";
  const lastMessage = conversation.at(-1);
  const currentAlreadyProjected = lastMessage?.role === "user" && lastMessage.content === prompt;
  if (!currentAlreadyProjected) messages.push({ role: "user", content: prompt });
  return messages;
}

function requestModel(request, params) {
  const modelRequest = request.context?.modelRequest;
  return modelRequest && typeof modelRequest === "object"
    ? modelRequest.generation?.model || params.model
    : params.model;
}

function requestMessages(request, params) {
  const modelRequest = request.context?.modelRequest;
  return modelRequest && typeof modelRequest === "object"
    ? modelRequestMessages(modelRequest)
    : messageContent(params);
}

function requestGenerationValue(request, params, key) {
  const modelRequest = request.context?.modelRequest;
  return modelRequest?.generation?.output?.[key] ?? params[key];
}

export class OpenAICompatibleProvider extends CreativeProvider {
  constructor({ fetchImpl = globalThis.fetch, config = runtimeConfig() } = {}) {
    super({ id: PROVIDER_IDS.OPENAI, name: "OpenAI-compatible", capabilities: ["text", "llm", "streaming"] });
    this.fetchImpl = fetchImpl;
    this.config = config;
  }

  async execute(request = {}) {
    try {
      return await this.executeInternal(request);
    } catch (error) {
      throw normalizeProviderError(error);
    }
  }

  async executeInternal(request = {}) {
    const operation = request.operation || request.routing?.operation;
    if (!operation || !["text_generation", "prompt_enhancement"].includes(operation)) {
      this.notImplemented(`execute:${operation || "unknown"}`);
    }
    if (typeof this.fetchImpl !== "function") throw new Error("OpenAI-compatible provider requires fetch");
    const params = request.inputs || request.payload || {};
    const apiKey = request.apiKey !== undefined ? request.apiKey : request.executionMetadata?.apiKey;
    const model = requestModel(request, params) || request.routing?.logicalModel || this.config.model;
    if (!model) throw new Error("OpenAI-compatible deployment requires a configured model or user-selected model");
    const headers = { "Content-Type": "application/json" };
    const credential = apiKey || this.config.serverKey;
    if (credential) headers.Authorization = `Bearer ${credential}`;
    const response = await this.fetchImpl(`${this.config.endpoint.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers,
      ...(request.signal ? { signal: request.signal } : {}),
      body: JSON.stringify({
        model,
        messages: requestMessages(request, params),
        temperature: requestGenerationValue(request, params, "temperature"),
        max_tokens: requestGenerationValue(request, params, "max_tokens"),
      }),
    });
    if (!response.ok) throw new Error(`OpenAI-compatible request failed: ${response.status} ${response.statusText || ""}`.trim());
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content ?? data.output_text ?? data.output ?? "";
    return normalizeProviderResponse({
      ...data,
      outputs: [text],
      outputReferences: [text],
      providerMetadata: { provider: this.id, model, ...(data.usage ? { usage: data.usage } : {}) },
    }, { provider: this.id });
  }
}

export const openAICompatibleProvider = new OpenAICompatibleProvider();
