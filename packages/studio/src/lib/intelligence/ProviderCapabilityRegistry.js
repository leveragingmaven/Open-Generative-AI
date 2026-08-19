class ProviderCapabilityRegistry {
  constructor() {
    this.deployments = new Map();
    this.models = new Map();
  }

  static clone(value) {
    if (Array.isArray(value)) return value.map((entry) => ProviderCapabilityRegistry.clone(entry));
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, ProviderCapabilityRegistry.clone(entry)]));
    }
    return value;
  }

  register(deployment) {
    if (!deployment?.id || !deployment.providerId) {
      throw new Error("Deployment id and providerId are required");
    }
    const normalized = {
      id: deployment.id,
      providerId: deployment.providerId,
      logicalModel: deployment.logicalModel || null,
      operation: deployment.operation || null,
      version: deployment.version || 1,
      featureState: deployment.featureState || "enabled",
      capabilities: Array.isArray(deployment.capabilities) ? [...deployment.capabilities] : [],
      inputs: Array.isArray(deployment.inputs) ? [...deployment.inputs] : [],
      outputs: Array.isArray(deployment.outputs) ? [...deployment.outputs] : [],
      availability: deployment.availability || "available",
      priority: deployment.priority ?? 0,
      confidence: deployment.confidence ?? 0.5,
      cost: deployment.cost && typeof deployment.cost === "object" ? { ...deployment.cost } : {},
      speed: deployment.speed && typeof deployment.speed === "object" ? { ...deployment.speed } : {},
      quality: deployment.quality && typeof deployment.quality === "object" ? { ...deployment.quality } : {},
      license: deployment.license && typeof deployment.license === "object" ? { ...deployment.license } : {},
      parameters: deployment.parameters && typeof deployment.parameters === "object" ? { ...deployment.parameters } : {},
      limits: deployment.limits && typeof deployment.limits === "object" ? { ...deployment.limits } : {},
      supports: deployment.supports && typeof deployment.supports === "object" ? { ...deployment.supports } : {},
      health: deployment.health || "healthy",
      metadata: deployment.metadata && typeof deployment.metadata === "object" ? { ...deployment.metadata } : {},
    };
    this.deployments.set(normalized.id, normalized);
    return normalized;
  }

  registerModel(model) {
    if (!model?.id || !model.providerId) {
      throw new Error("Model id and providerId are required");
    }
    const normalized = {
      id: model.id,
      providerId: model.providerId,
      logicalFamily: model.logicalFamily || model.family || null,
      modelId: model.modelId || null,
      endpointId: model.endpointId || null,
      operation: model.operation || null,
      modality: model.modality || null,
      capabilities: Array.isArray(model.capabilities) ? [...model.capabilities] : [],
      tier: model.tier || null,
      variant: ProviderCapabilityRegistry.clone(model.variant || {}),
      resolution: ProviderCapabilityRegistry.clone(model.resolution || null),
      duration: ProviderCapabilityRegistry.clone(model.duration || null),
      referenceLimits: ProviderCapabilityRegistry.clone(model.referenceLimits || {}),
      inputLimits: ProviderCapabilityRegistry.clone(model.inputLimits || {}),
      quality: ProviderCapabilityRegistry.clone(model.quality || null),
      pricing: ProviderCapabilityRegistry.clone(model.pricing || {}),
      source: ProviderCapabilityRegistry.clone(model.source || null),
      verification: ProviderCapabilityRegistry.clone(model.verification || null),
    };
    this.models.set(normalized.id, normalized);
    return normalized;
  }

  get(id) {
    return this.deployments.get(id) || null;
  }

  list() {
    return [...this.deployments.values()];
  }

  getModel(id) {
    return this.models.get(id) || null;
  }

  listModels() {
    return [...this.models.values()];
  }
}

export const providerCapabilityRegistry = new ProviderCapabilityRegistry();
export { ProviderCapabilityRegistry };
