import { CreativeProvider } from "./CreativeProvider.js";
import { PROVIDER_CAPABILITIES, PROVIDER_IDS, normalizeProviderResponse } from "./providerTypes.js";
import { createFalClient } from "@fal-ai/client";

export const FAL_MODEL_IDS = Object.freeze({
  TEXT_TO_IMAGE: "fal-ai/flux/schnell",
  IMAGE_TO_IMAGE: "fal-ai/flux/schnell/redux",
});

const IMAGE_SIZE_BY_ASPECT_RATIO = Object.freeze({
  "1:1": "square_hd",
  "3:4": "portrait_4_3",
  "4:3": "landscape_4_3",
  "9:16": "portrait_16_9",
  "16:9": "landscape_16_9",
});

function error(code, message) {
  const result = new Error(message);
  result.code = code;
  return result;
}

function toInput(inputs = {}, imageEdit = false) {
  const input = {};
  if (imageEdit) {
    const imageUrl = inputs.image_url || inputs.images_list?.[0];
    if (!imageUrl) throw error("provider_input_invalid", "A reference image is required.");
    input.image_url = imageUrl;
  } else {
    const prompt = String(inputs.prompt || "").trim();
    if (!prompt) throw error("provider_input_invalid", "A prompt is required.");
    input.prompt = prompt;
  }
  const imageSize = IMAGE_SIZE_BY_ASPECT_RATIO[inputs.aspect_ratio];
  if (imageSize) input.image_size = imageSize;
  if (Number.isInteger(inputs.num_images) && inputs.num_images > 0) input.num_images = Math.min(inputs.num_images, 4);
  if (Number.isInteger(inputs.seed)) input.seed = inputs.seed;
  if (inputs.output_format === "jpeg" || inputs.output_format === "png") input.output_format = inputs.output_format;
  return input;
}

function safeDiagnosticBody(value, depth = 0) {
  if (depth > 3) return "[truncated]";
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.slice(0, 2000);
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => safeDiagnosticBody(item, depth + 1));
  if (typeof value === "object") {
    const output = {};
    Object.entries(value).slice(0, 40).forEach(([key, item]) => {
      if (/(authorization|api[_-]?key|token|secret|credential|password)/i.test(key)) output[key] = "[redacted]";
      else output[key] = safeDiagnosticBody(item, depth + 1);
    });
    return output;
  }
  return "[unsupported]";
}

function reportUpstreamFailure({ phase, response, body, url, operation, modelId } = {}) {
  const diagnostic = {
    provider: "fal",
    phase,
    operation,
    model: modelId,
    endpoint: url,
    httpStatus: response?.status ?? null,
    falErrorCode: body?.error_type || body?.code || body?.error_code || null,
    falErrorMessage: typeof body?.error === "string" ? body.error.slice(0, 500) : typeof body?.message === "string" ? body.message.slice(0, 500) : null,
    body: safeDiagnosticBody(body),
  };
  console.error("[fal] upstream request failed", JSON.stringify(diagnostic));
}

function reportClientFailure({ phase, cause, operation, modelId } = {}) {
  reportUpstreamFailure({
    phase,
    operation,
    modelId,
    url: `fal.queue.${phase}`,
    response: { status: cause?.status ?? cause?.statusCode ?? null },
    body: {
      code: cause?.code || cause?.error_type || cause?.error_code || null,
      message: typeof cause?.message === "string" ? cause.message.slice(0, 500) : null,
      body: cause?.body || cause?.data || null,
    },
  });
}

function createQueueRequestMiddleware(modelId) {
  const endpointUrl = `https://queue.fal.run/${modelId}`;
  return async (request) => {
    // @fal-ai/client 1.10.x parses nested model IDs as owner/alias for queue
    // status/result URLs. Keep the SDK in charge of the operation, auth,
    // retries, and response handling, while restoring the documented nested
    // endpoint path in its generated request URL.
    if (request.url.startsWith("https://queue.fal.run/") && request.url.includes("/requests/")) {
      return { ...request, url: `${endpointUrl}${request.url.slice(request.url.indexOf("/requests/"))}` };
    }
    return request;
  };
}

export class FalProvider extends CreativeProvider {
  constructor({ fetchImpl = globalThis.fetch, pollIntervalMs = 1000, maxPolls = 1800 } = {}) {
    super({
      id: PROVIDER_IDS.FAL,
      name: "fal.ai",
      capabilities: [PROVIDER_CAPABILITIES.IMAGE, PROVIDER_CAPABILITIES.IMAGE_EDIT],
    });
    this.fetchImpl = fetchImpl;
    this.pollIntervalMs = pollIntervalMs;
    this.maxPolls = maxPolls;
  }

  async execute(request = {}) {
    const apiKey = request.apiKey || request.executionMetadata?.apiKey;
    if (!apiKey) throw error("provider_credential_required:fal", "Provider credential is required.");
    const operation = request.operation || "image_generation";
    const imageEdit = operation === "image_editing";
    if (!imageEdit && operation !== "image_generation") throw error("provider_operation_unsupported", "fal.ai image generation is not available for this operation.");
    const modelId = request.inputs?.model || request.routing?.model || (imageEdit ? FAL_MODEL_IDS.IMAGE_TO_IMAGE : FAL_MODEL_IDS.TEXT_TO_IMAGE);
    const expectedModel = imageEdit ? FAL_MODEL_IDS.IMAGE_TO_IMAGE : FAL_MODEL_IDS.TEXT_TO_IMAGE;
    if (modelId !== expectedModel) throw error("provider_model_unsupported", "The selected fal.ai model is not supported by this studio.");
    if (typeof this.fetchImpl !== "function") throw error("provider_transport_unavailable", "Provider transport is unavailable.");

    // A new client is created for every execution so a customer's BYOK key is
    // held only by this request's client instance. Do not use the shared fal
    // singleton/configuration, which would race between concurrent users.
    const client = createFalClient({
      credentials: apiKey,
      fetch: this.fetchImpl,
      requestMiddleware: createQueueRequestMiddleware(modelId),
    });
    let submit;
    try {
      submit = await client.queue.submit(modelId, {
        input: toInput(request.inputs, imageEdit),
        abortSignal: request.signal,
      });
      if (!submit?.request_id) throw error("provider_request_failed", "fal.ai request submission failed.");
    } catch (cause) {
      if (cause?.code) throw cause;
      reportClientFailure({ phase: "submit", cause, operation, modelId });
      throw error("provider_request_failed", "fal.ai request submission failed.");
    }
    request.onProviderJobAccepted?.(submit.request_id, "accepted");

    for (let attempt = 0; attempt < this.maxPolls; attempt += 1) {
      if (request.signal?.aborted) throw error("provider_execution_cancelled", "Provider execution was cancelled.");
      let status;
      try {
        status = await client.queue.status(modelId, { requestId: submit.request_id, abortSignal: request.signal });
      } catch (cause) {
        if (cause?.code) throw cause;
        reportClientFailure({ phase: "status", cause, operation, modelId });
        throw error("provider_status_failed", "fal.ai status lookup failed.");
      }
      if (status?.status === "COMPLETED") break;
      if (status?.error || ["FAILED", "ERROR", "CANCELLED"].includes(status?.status)) throw error("provider_generation_failed", "fal.ai generation failed.");
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
      if (attempt === this.maxPolls - 1) throw error("provider_execution_timeout", "fal.ai generation timed out.");
    }

    try {
      const resultEnvelope = await client.queue.result(modelId, { requestId: submit.request_id, abortSignal: request.signal });
      const result = resultEnvelope?.data;
      if (!Array.isArray(result?.images) || !result.images.some((image) => image?.url)) throw error("provider_response_invalid", "fal.ai returned no usable image.");
      return normalizeProviderResponse({
        ...result,
        url: result.images.find((image) => image?.url)?.url,
        provider: this.id,
        providerResponseRef: submit.request_id,
        outputReferences: result.images.filter((image) => image?.url).map((image) => image.url),
        providerMetadata: { model: modelId, requestId: submit.request_id },
      }, { provider: this.id });
    } catch (cause) {
      if (cause?.code) throw cause;
      reportClientFailure({ phase: "result", cause, operation, modelId });
      throw error("provider_response_invalid", "fal.ai returned an invalid response.");
    }
  }
}

export const falProvider = new FalProvider();
