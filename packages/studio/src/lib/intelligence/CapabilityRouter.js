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
    // An explicitly requested model is honored, never substituted. Filtering to
    // the requested deployment before ranking means a user who picked a model
    // gets that model; when it is not an eligible deployment the request fails
    // loudly (`requested_model_unavailable`) instead of silently running - and
    // billing - a different one. Callers that hold a legacy path can fall back
    // to it explicitly with the user's own selection.
    const requestedModel = options.requestedModel == null ? null : String(options.requestedModel).trim();
    const all = this.deployments.list();
    const matchesRequestedModel = (deployment) => Boolean(requestedModel)
      && [deployment?.id, deployment?.metadata?.modelId, deployment?.metadata?.endpointId]
        .some((value) => String(value || '') === requestedModel);
    if (requestedModel && !all.some(matchesRequestedModel)) {
      throw Object.assign(new Error(`Requested model is not an available deployment: ${requestedModel}`), { code: "requested_model_unavailable" });
    }
    const eligible = getEligibleDeployments(all, required, options.policy);
    const candidates = requestedModel ? eligible.filter(matchesRequestedModel) : eligible;
    if (requestedModel && !candidates.length) {
      throw Object.assign(new Error(`Requested model is not eligible for this capability: ${requestedModel}`), { code: "requested_model_unavailable" });
    }
    const ranked = rankDeployments(candidates, { required, preferred }, options.preferences);
    if (options.inputs) {
      const missing = deployment => (deployment.metadata?.requiredInputs || []).filter(name => name !== 'prompt' && options.inputs[name] == null && deployment.metadata?.inputSchema?.[name]?.default === undefined).length;
      ranked.sort((a, b) => missing(a.deployment) - missing(b.deployment));
    }
    if (!ranked.length) throw new Error("No eligible deployment matches the capability requirements");
    const selected = ranked[0];
    return {
      deploymentId: selected.deployment.id,
      providerId: selected.deployment.providerId,
      logicalModel: selected.deployment.logicalModel,
      operation: selected.deployment.operation,
      model: selected.deployment.metadata?.modelId || selected.deployment.metadata?.endpointId || null,
      requiredInputs: selected.deployment.metadata?.requiredInputs || [],
      inputSchema: selected.deployment.metadata?.inputSchema || {},
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
