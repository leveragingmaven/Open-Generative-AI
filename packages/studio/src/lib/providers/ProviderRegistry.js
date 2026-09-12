import { muApiProvider } from "./MuApiProvider.js";
import { PROVIDER_IDS } from "./providerTypes.js";
import { muApiDesignAgentProvider } from "./design/index.js";
import { MuApiWorkflowProvider } from "./workflow/index.js";
import { openAICompatibleProvider } from "./OpenAICompatibleProvider.js";
import { falProvider } from "./FalProvider.js";

class ProviderRegistry {
  constructor() {
    this.providers = new Map();
    this.activeProviderId = PROVIDER_IDS.MUAPI;
    this.register(muApiProvider);
    this.register(openAICompatibleProvider);
    this.register(falProvider);
  }

  register(provider) {
    if (!provider?.id) throw new Error("Provider must have an id");
    this.providers.set(provider.id, provider);
    return provider;
  }

  get(providerId = this.activeProviderId) {
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`Unknown creative provider: ${providerId}`);
    return provider;
  }

  setActiveProvider(providerId) {
    this.get(providerId);
    this.activeProviderId = providerId;
  }

  getActiveProvider() {
    return this.get(this.activeProviderId);
  }

  list() {
    return Array.from(this.providers.values());
  }
}

export const providerRegistry = new ProviderRegistry();
export const workflowProvider = new MuApiWorkflowProvider({
  registryProvider: () => providerRegistry.getActiveProvider(),
});
export const designAgentProvider = muApiDesignAgentProvider;

export const executeProvider = (request) => {
  const provider = providerRegistry.get(request?.routing?.providerId || request?.providerId);
  if (!provider?.execute) throw new Error(`Provider ${provider?.id || "unknown"} does not support generic execution`);
  return provider.execute(request);
};

const active = () => providerRegistry.getActiveProvider();

export const generateImage = (apiKey, params) => active().generateImage(apiKey, params);
export const generateI2I = (apiKey, params) => active().generateI2I(apiKey, params);
export const generateVideo = (apiKey, params) => active().generateVideo(apiKey, params);
export const generateI2V = (apiKey, params) => active().generateI2V(apiKey, params);
export const generateMarketingStudioAd = (apiKey, params) => active().generateMarketingStudioAd(apiKey, params);
export const processV2V = (apiKey, params) => active().processV2V(apiKey, params);
export const processRecast = (apiKey, params) => active().processRecast(apiKey, params);
export const processLipSync = (apiKey, params) => active().processLipSync(apiKey, params);
export const generateAudio = (apiKey, params) => active().generateAudio(apiKey, params);
export const uploadFile = (apiKey, file, onProgress) => active().uploadFile(apiKey, file, onProgress);
export const getUserBalance = (apiKey) => active().getUserBalance(apiKey);
export const getTemplateWorkflows = (apiKey) => active().getTemplateWorkflows(apiKey);
export const getUserWorkflows = (apiKey) => active().getUserWorkflows(apiKey);
export const getPublishedWorkflows = (apiKey) => active().getPublishedWorkflows(apiKey);
export const getTemplateAgents = (apiKey) => active().getTemplateAgents(apiKey);
export const getUserAgents = (apiKey) => active().getUserAgents(apiKey);
export const getPublishedAgents = (apiKey) => active().getPublishedAgents(apiKey);
export const getUserConversations = (apiKey) => active().getUserConversations(apiKey);
export const createWorkflow = (apiKey, payload) => active().createWorkflow(apiKey, payload);
export const updateWorkflowName = (apiKey, workflowId, name) => active().updateWorkflowName(apiKey, workflowId, name);
export const deleteWorkflow = (apiKey, workflowId) => active().deleteWorkflow(apiKey, workflowId);
export const getWorkflowInputs = (apiKey, workflowId) => active().getWorkflowInputs(apiKey, workflowId);
export const executeWorkflow = (apiKey, workflowId, inputs) => active().executeWorkflow(apiKey, workflowId, inputs);
export const getAllNodeSchemas = (apiKey, workflowId) => active().getAllNodeSchemas(apiKey, workflowId);
export const getWorkflowData = (apiKey, workflowId) => active().getWorkflowData(apiKey, workflowId);
export const getNodeSchemas = (apiKey, workflowId) => active().getNodeSchemas(apiKey, workflowId);
export const runSingleNode = (apiKey, workflowId, nodeId, payload) => active().runSingleNode(apiKey, workflowId, nodeId, payload);
export const deleteNodeRun = (apiKey, nodeRunId) => active().deleteNodeRun(apiKey, nodeRunId);
export const getNodeStatus = (apiKey, runId) => active().getNodeStatus(apiKey, runId);
export const handleProxyRequest = (prefix, path, method, headers, body, apiKey) => active().handleProxyRequest(prefix, path, method, headers, body, apiKey);
export const handleServerSideProxy = (prefix, request, params, apiKey) => active().handleServerSideProxy(prefix, request, params, apiKey);
export const calculateDynamicCost = (apiKey, taskName, payload) => active().calculateDynamicCost(apiKey, taskName, payload);
export const registerAppInterest = (apiKey, appName) => active().registerAppInterest(apiKey, appName);
export const getAppInterests = (apiKey) => active().getAppInterests(apiKey);
export const runClipping = (apiKey, params) => active().runClipping(apiKey, params);
export const runMotionGraphics = (apiKey, params) => active().runMotionGraphics(apiKey, params);
export const runMotionGraphicsEdit = (apiKey, params) => active().runMotionGraphicsEdit(apiKey, params);

export const getNormalizedWorkflowTemplates = (apiKey) => workflowProvider.getWorkflowTemplates(apiKey);
// Keep the provider module's direct API for WorkflowStudio; the package barrel exports
// the authoritative intelligence validator explicitly to avoid a star-export collision.
export const validateWorkflowDefinition = (definition) => workflowProvider.validateWorkflow(definition);
export const executeNormalizedWorkflow = (apiKey, workflowId, inputs, context) =>
  workflowProvider.executeWorkflow(apiKey, workflowId, inputs, context);
export const createDesignAgentSession = (input, context) => designAgentProvider.createSession(input, context);
export const getDesignAgentSessionAssets = (sessionId, context) => designAgentProvider.getSessionAssets(sessionId, context);
export const getDesignAgentJobs = (sessionId, context) => designAgentProvider.getDesignJob(sessionId, context);
