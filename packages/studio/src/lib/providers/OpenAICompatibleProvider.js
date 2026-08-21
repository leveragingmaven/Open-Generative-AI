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

function structuredResponseFormat(request, params) {
  const structuredOutput = requestGenerationValue(request, params, "structuredOutput");
  if (!structuredOutput || typeof structuredOutput !== "object" || Array.isArray(structuredOutput)) return undefined;
  const name = typeof structuredOutput.name === "string" ? structuredOutput.name.trim() : "";
  const schema = structuredOutput.schema;
  if (!name || !schema || typeof schema !== "object" || Array.isArray(schema)) {
    throw new Error("Structured output requires a schema name and JSON schema");
  }
  return {
    type: "json_schema",
    json_schema: {
      name,
      strict: structuredOutput.strict !== false,
      schema,
    },
  };
}

function extractStreamDeltaText(payload) {
  if (!payload || typeof payload !== "object") return "";
  const choice = Array.isArray(payload.choices) ? payload.choices[0] : null;
  if (!choice || typeof choice !== "object") return "";
  const delta = choice.delta;
  if (delta && typeof delta.content === "string") return delta.content;
  // Some OpenAI-compatible providers deliver the full message in the final chunk.
  const message = choice.message;
  if (message && typeof message.content === "string") return message.content;
  return "";
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
        response_format: structuredResponseFormat(request, params),
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

  async *streamText(request = {}) {
    try {
      yield* this.streamTextInternal(request);
    } catch (error) {
      throw normalizeProviderError(error);
    }
  }

  async *streamTextInternal(request = {}) {
    const operation = request.operation || request.routing?.operation;
    if (!operation || !["text_generation", "prompt_enhancement"].includes(operation)) {
      this.notImplemented(`streamText:${operation || "unknown"}`);
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
        response_format: structuredResponseFormat(request, params),
        stream: true,
      }),
    });
    if (!response.ok) throw new Error(`OpenAI-compatible request failed: ${response.status} ${response.statusText || ""}`.trim());
    if (!response.body) throw new Error("OpenAI-compatible streaming response requires a body");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let separatorIndex;
      while ((separatorIndex = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, separatorIndex).replace(/\r$/, "");
        buffer = buffer.slice(separatorIndex + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data) continue;
        if (data === "[DONE]") return;
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch {
          continue;
        }
        const text = extractStreamDeltaText(parsed);
        if (text) yield text;
      }
    }
  }
}

export const openAICompatibleProvider = new OpenAICompatibleProvider();
