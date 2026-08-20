import { CreativeProvider } from "./CreativeProvider.js";
import { PROVIDER_CAPABILITIES, PROVIDER_IDS, normalizeProviderError, normalizeProviderResponse } from "./providerTypes.js";
import { getI2IModelById } from "../../models.js";
import * as muapi from "../../muapi.js";

function referenceValue(reference) {
  if (typeof reference === "string") return reference.trim();
  if (!reference || typeof reference !== "object") return "";
  return [reference.url, reference.image_url, reference.assetUrl, reference.uri, reference.id, reference.assetId, reference.referenceId]
    .find((value) => typeof value === "string" && value.trim())?.trim() || "";
}

function canonicalImageReferences(request) {
  return [...(request.references || []), ...(request.attachments || [])]
    .map(referenceValue)
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);
}

function hasExplicitImageReference(params, operation) {
  if (params.image_url || (Array.isArray(params.images_list) && params.images_list.length > 0)) return true;
  if (operation !== "image_editing") return false;
  const model = getI2IModelById(params.model);
  return Boolean(model?.imageField && params[model.imageField]);
}

function adaptImageReferences(request, operation, params) {
  if (!["image_generation", "image_editing"].includes(operation)) return params;
  if (hasExplicitImageReference(params, operation)) return params;
  const modelId = params.model || request.routing?.model || request.routing?.modelId || request.routing?.endpoint;
  if (operation === "image_generation" && modelId === "ideogram-v3-t2i") return params;
  const references = canonicalImageReferences(request);
  if (!references.length) return params;
  if (operation === "image_editing") return { ...params, images_list: references };
  return references.length === 1
    ? { ...params, image_url: references[0] }
    : { ...params, images_list: references };
}

function adaptImageEditingInputs(operation, params) {
  if (operation !== "image_editing" || !("aspectRatio" in params)) return params;
  const { aspectRatio, ...providerParams } = params;
  if (providerParams.aspect_ratio !== undefined || aspectRatio === undefined || aspectRatio === null || aspectRatio === "") {
    return providerParams;
  }
  return { ...providerParams, aspect_ratio: aspectRatio };
}

export class MuApiProvider extends CreativeProvider {
  constructor() {
    super({
      id: PROVIDER_IDS.MUAPI,
      name: "MuAPI",
      capabilities: Object.values(PROVIDER_CAPABILITIES),
    });
  }

  execute(request = {}) {
    const operation = request.operation || request.routing?.operation || request.capability?.operation || request.recipe?.operation;
    const apiKey = request.apiKey !== undefined ? request.apiKey : request.executionMetadata?.apiKey;
    const canonicalParams = request.params || request.payload || request.inputs || {};
    const params = adaptImageReferences(request, operation, adaptImageEditingInputs(operation, canonicalParams));
    const methods = {
      image_generation: "generateImage",
      image_editing: "generateI2I",
      video_generation: "generateVideo",
      image_to_video: "generateI2V",
      video_transform: "processV2V",
      video_editing: "runMotionGraphicsEdit",
      audio_generation: "generateAudio",
      marketing_generation: "generateMarketingStudioAd",
      recast: "processRecast",
      lip_sync: "processLipSync",
      ai_clipping: "runClipping",
      motion_graphics: "runMotionGraphics",
      motion_graphics_edit: "runMotionGraphicsEdit",
      performance_transfer: "processRecast",
    };
    const methodName = methods[operation] || operation;
    if (!methodName || typeof this[methodName] !== "function") this.notImplemented(`execute:${operation || "unknown"}`);
    return Promise.resolve()
      .then(() => this[methodName](apiKey, {
        ...params,
        ...(request.signal ? { signal: request.signal } : {}),
        ...(request.onProviderJobAccepted ? { onRequestId: request.onProviderJobAccepted } : {}),
      }))
      .then((result) => normalizeProviderResponse(result, { provider: this.id }))
      .catch((error) => { throw normalizeProviderError(error); });
  }

  generateImage(apiKey, params) {
    return muapi.generateImage(apiKey, params).then((res) => normalizeProviderResponse(res, { provider: this.id })).catch((error) => { throw normalizeProviderError(error); });
  }

  generateI2I(apiKey, params) {
    return muapi.generateI2I(apiKey, params).then((res) => normalizeProviderResponse(res, { provider: this.id })).catch((error) => { throw normalizeProviderError(error); });
  }

  generateVideo(apiKey, params) {
    return muapi.generateVideo(apiKey, params).then((res) => normalizeProviderResponse(res, { provider: this.id })).catch((error) => { throw normalizeProviderError(error); });
  }

  generateI2V(apiKey, params) {
    return muapi.generateI2V(apiKey, params).then((res) => normalizeProviderResponse(res, { provider: this.id })).catch((error) => { throw normalizeProviderError(error); });
  }

  generateMarketingStudioAd(apiKey, params) {
    return muapi.generateMarketingStudioAd(apiKey, params).then((res) => normalizeProviderResponse(res, { provider: this.id })).catch((error) => { throw normalizeProviderError(error); });
  }

  processV2V(apiKey, params) {
    return muapi.processV2V(apiKey, params).then((res) => normalizeProviderResponse(res, { provider: this.id })).catch((error) => { throw normalizeProviderError(error); });
  }

  processRecast(apiKey, params) {
    return muapi.processRecast(apiKey, params).then((res) => normalizeProviderResponse(res, { provider: this.id })).catch((error) => { throw normalizeProviderError(error); });
  }

  processLipSync(apiKey, params) {
    return muapi.processLipSync(apiKey, params).then((res) => normalizeProviderResponse(res, { provider: this.id })).catch((error) => { throw normalizeProviderError(error); });
  }

  generateAudio(apiKey, params) {
    return muapi.generateAudio(apiKey, params).then((res) => normalizeProviderResponse(res, { provider: this.id })).catch((error) => { throw normalizeProviderError(error); });
  }

  uploadFile(apiKey, file, onProgress) {
    return muapi.uploadFile(apiKey, file, onProgress);
  }

  getUserBalance(apiKey) {
    return muapi.getUserBalance(apiKey);
  }

  getTemplateWorkflows(apiKey) {
    return muapi.getTemplateWorkflows(apiKey);
  }

  getUserWorkflows(apiKey) {
    return muapi.getUserWorkflows(apiKey);
  }

  getPublishedWorkflows(apiKey) {
    return muapi.getPublishedWorkflows(apiKey);
  }

  getTemplateAgents(apiKey) {
    return muapi.getTemplateAgents(apiKey);
  }

  getUserAgents(apiKey) {
    return muapi.getUserAgents(apiKey);
  }

  getPublishedAgents(apiKey) {
    return muapi.getPublishedAgents(apiKey);
  }

  getUserConversations(apiKey) {
    return muapi.getUserConversations(apiKey);
  }

  createWorkflow(apiKey, payload) {
    return muapi.createWorkflow(apiKey, payload);
  }

  updateWorkflowName(apiKey, workflowId, name) {
    return muapi.updateWorkflowName(apiKey, workflowId, name);
  }

  deleteWorkflow(apiKey, workflowId) {
    return muapi.deleteWorkflow(apiKey, workflowId);
  }

  getWorkflowInputs(apiKey, workflowId) {
    return muapi.getWorkflowInputs(apiKey, workflowId);
  }

  executeWorkflow(apiKey, workflowId, inputs) {
    return muapi.executeWorkflow(apiKey, workflowId, inputs);
  }

  getAllNodeSchemas(apiKey, workflowId) {
    return muapi.getAllNodeSchemas(apiKey, workflowId);
  }

  getWorkflowData(apiKey, workflowId) {
    return muapi.getWorkflowData(apiKey, workflowId);
  }

  getNodeSchemas(apiKey, workflowId) {
    return muapi.getNodeSchemas(apiKey, workflowId);
  }

  runSingleNode(apiKey, workflowId, nodeId, payload) {
    return muapi.runSingleNode(apiKey, workflowId, nodeId, payload);
  }

  deleteNodeRun(apiKey, nodeRunId) {
    return muapi.deleteNodeRun(apiKey, nodeRunId);
  }

  getNodeStatus(apiKey, runId) {
    return muapi.getNodeStatus(apiKey, runId);
  }

  handleProxyRequest(prefix, path, method, headers, body, apiKey) {
    return muapi.handleProxyRequest(prefix, path, method, headers, body, apiKey);
  }

  handleServerSideProxy(prefix, request, params, apiKey) {
    return muapi.handleServerSideProxy(prefix, request, params, apiKey);
  }

  calculateDynamicCost(apiKey, taskName, payload) {
    return muapi.calculateDynamicCost(apiKey, taskName, payload);
  }

  registerAppInterest(apiKey, appName) {
    return muapi.registerAppInterest(apiKey, appName);
  }

  getAppInterests(apiKey) {
    return muapi.getAppInterests(apiKey);
  }

  runClipping(apiKey, params) {
    return muapi.runClipping(apiKey, params).then((res) => normalizeProviderResponse(res, { provider: this.id }));
  }

  runMotionGraphics(apiKey, params) {
    return muapi.runMotionGraphics(apiKey, params).then((res) => normalizeProviderResponse(res, { provider: this.id }));
  }

  runMotionGraphicsEdit(apiKey, params) {
    return muapi.runMotionGraphicsEdit(apiKey, params).then((res) => normalizeProviderResponse(res, { provider: this.id }));
  }
}

export const muApiProvider = new MuApiProvider();
