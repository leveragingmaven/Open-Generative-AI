class ProviderCapabilityRegistry {
  constructor() {
    this.deployments = new Map();
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

  get(id) {
    return this.deployments.get(id) || null;
  }

  list() {
    return [...this.deployments.values()];
  }
}

export const providerCapabilityRegistry = new ProviderCapabilityRegistry();
export { ProviderCapabilityRegistry };
