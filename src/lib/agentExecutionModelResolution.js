import { CapabilityRouter } from '../../packages/studio/src/lib/intelligence/CapabilityRouter.js';
import { getEligibleModelCandidates } from '../../packages/studio/src/lib/intelligence/ModelCandidateEligibility.js';
import { providerCapabilityRegistry } from '../../packages/studio/src/lib/intelligence/ProviderCapabilityRegistry.js';

function knownPrice(candidate) {
  const value = candidate?.pricing?.unitPrice;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function selectConcreteProviderModel(candidates = [], requirements = []) {
  const eligible = getEligibleModelCandidates(candidates.filter((candidate) => candidate?.modelId), requirements);
  return [...eligible].sort((a, b) => {
    const suitability = candidate => requirements.filter(r => r?.kind === 'preferred' && candidate.capabilities?.includes(r.id)).reduce((sum, r) => sum + (r.weight ?? 1), 0);
    const match = suitability(b) - suitability(a);
    if (match) return match;
    const aPrice = knownPrice(a);
    const bPrice = knownPrice(b);
    if (aPrice == null && bPrice != null) return 1;
    if (aPrice != null && bPrice == null) return -1;
    if (aPrice != null && bPrice != null && a.pricing.unit === b.pricing.unit && a.pricing.currency === b.pricing.currency && aPrice !== bPrice) return aPrice - bPrice;
    return String(a.modelId).localeCompare(String(b.modelId));
  })[0] || null;
}

export function resolveConcreteProviderRouting({ routing = null, requiredCapabilities = [], capabilityRouter = new CapabilityRouter(), modelRegistry = providerCapabilityRegistry } = {}) {
  const selectedRouting = routing?.providerId
    ? routing
    : capabilityRouter.resolve({ required: requiredCapabilities });
  if (selectedRouting.model) return selectedRouting;
  const candidates = modelRegistry.listModels().filter((candidate) => candidate.providerId === selectedRouting.providerId && candidate.operation === (selectedRouting.operation || null));
  const model = selectConcreteProviderModel(candidates, requiredCapabilities);
  return model ? { ...selectedRouting, model: model.modelId, modelId: model.modelId, modelMetadata: { id: model.id, tier: model.tier || null, pricing: model.pricing || {}, verification: model.verification || null } } : selectedRouting;
}
