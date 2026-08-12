import { CreativeProvider } from "./CreativeProvider.js";
import { PROVIDER_CAPABILITIES, PROVIDER_IDS, normalizeProviderResponse } from "./providerTypes.js";
import * as muapi from "../../muapi.js";

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
    const params = request.params || request.payload || request.inputs || {};
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
    return this[methodName](apiKey, params);
  }

  generateImage(apiKey, params) {
    return muapi.generateImage(apiKey, params).then((res) => normalizeProviderResponse(res, { provider: this.id }));
  }

  generateI2I(apiKey, params) {
    return muapi.generateI2I(apiKey, params).then((res) => normalizeProviderResponse(res, { provider: this.id }));
  }

  generateVideo(apiKey, params) {
    return muapi.generateVideo(apiKey, params).then((res) => normalizeProviderResponse(res, { provider: this.id }));
  }

  generateI2V(apiKey, params) {
    return muapi.generateI2V(apiKey, params).then((res) => normalizeProviderResponse(res, { provider: this.id }));
  }

  generateMarketingStudioAd(apiKey, params) {
    return muapi.generateMarketingStudioAd(apiKey, params).then((res) => normalizeProviderResponse(res, { provider: this.id }));
  }

  processV2V(apiKey, params) {
    return muapi.processV2V(apiKey, params).then((res) => normalizeProviderResponse(res, { provider: this.id }));
  }

  processRecast(apiKey, params) {
    return muapi.processRecast(apiKey, params).then((res) => normalizeProviderResponse(res, { provider: this.id }));
  }

  processLipSync(apiKey, params) {
    return muapi.processLipSync(apiKey, params).then((res) => normalizeProviderResponse(res, { provider: this.id }));
  }

  generateAudio(apiKey, params) {
    return muapi.generateAudio(apiKey, params).then((res) => normalizeProviderResponse(res, { provider: this.id }));
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
