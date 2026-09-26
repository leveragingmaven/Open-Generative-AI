function valueScore(value, preferred) {
  if (value == null || preferred == null) return 0;
  if (typeof value === "number" && typeof preferred === "number") {
    return preferred <= value ? 1 : Math.max(0, value / preferred);
  }
  return value === preferred ? 1 : 0;
}

export function scoreDeployment(deployment, requirements = {}, preferences = {}) {
  const preferred = requirements.preferred || [];
  const matchedPreferred = preferred.reduce((total, requirement) => {
    const capabilityScore = deployment.capabilities.includes(requirement.id) ? 1 : 0;
    const metadataScore = Object.entries(requirement.constraints || {}).reduce(
      (score, [key, value]) => score + valueScore(deployment.metadata[key], value),
      0,
    );
    return total + (requirement.weight ?? 1) * (capabilityScore + metadataScore);
  }, 0);
  const quality = preferences.qualityTier ? (deployment.quality[preferences.qualityTier] || 0) : 0;
  const speed = preferences.maxLatencyMs ? valueScore(preferences.maxLatencyMs, deployment.speed.latencyMs) : 0;
  const cost = preferences.maxCost ? valueScore(preferences.maxCost, deployment.cost.unitCost) : 0;
  return deployment.priority + deployment.confidence + matchedPreferred + quality + speed + cost;
}

export function rankDeployments(deployments, requirements, preferences) {
  return deployments
    .map((deployment) => ({
      deployment,
      score: scoreDeployment(deployment, requirements, preferences),
      reasons: [
        `provider:${deployment.providerId}`,
        `priority:${deployment.priority}`,
        `confidence:${deployment.confidence}`,
      ],
    }))
    .sort((a, b) => {
      const suitability = d => scoreDeployment({ ...d, priority: 0, confidence: 0 }, requirements, preferences);
      const difference = suitability(b.deployment) - suitability(a.deployment);
      if (difference) return difference;
      const ac = a.deployment.cost, bc = b.deployment.cost;
      if (ac?.unit === bc?.unit && ac?.currency === bc?.currency && Number.isFinite(ac?.unitCost) && Number.isFinite(bc?.unitCost) && ac.unitCost !== bc.unitCost) return ac.unitCost - bc.unitCost;
      return b.score - a.score || a.deployment.id.localeCompare(b.deployment.id);
    });
}
