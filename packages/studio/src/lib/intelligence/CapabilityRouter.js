import { capabilityRegistry } from "./CapabilityRegistry.js";
import { getEligibleDeployments } from "./CapabilityMatcher.js";
import { providerCapabilityRegistry } from "./ProviderCapabilityRegistry.js";
import { rankDeployments } from "./CapabilityScorer.js";
import "./ProductionCapabilityCatalog.js";

export class CapabilityRouter {
  constructor({ capabilities = capabilityRegistry, deployments = providerCapabilityRegistry } = {}) {
    this.capabilities = capabilities;
    this.deployments = deployments;
  }

  resolve(requirementInput = {}, options = {}) {
    const required = (requirementInput.required || []).map((id) => typeof id === "string" ? { id, kind: "required" } : id);
    const preferred = (requirementInput.preferred || []).map((id) => typeof id === "string" ? { id, kind: "preferred", weight: 1 } : id);
    [...required, ...preferred].forEach((requirement) => {
      if (!this.capabilities.get(requirement.id)) throw new Error(`Unknown capability: ${requirement.id}`);
    });
    const eligible = getEligibleDeployments(this.deployments.list(), required, options.policy);
    const ranked = rankDeployments(eligible, { required, preferred }, options.preferences);
    if (!ranked.length) throw new Error("No eligible deployment matches the capability requirements");
    const selected = ranked[0];
    return {
      deploymentId: selected.deployment.id,
      providerId: selected.deployment.providerId,
      logicalModel: selected.deployment.logicalModel,
      operation: selected.deployment.operation,
      cost: selected.deployment.cost ? { ...selected.deployment.cost } : null,
      score: selected.score,
      reasons: selected.reasons,
      fallbackDeployments: ranked.slice(1).map((item) => item.deployment.id),
      candidates: ranked,
    };
  }

  explain(requirementInput = {}, options = {}) {
    return this.resolve(requirementInput, options);
  }
}

export const capabilityRouter = new CapabilityRouter();
