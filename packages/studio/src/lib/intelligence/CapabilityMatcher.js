function matchesConstraints(deployment, constraints = {}) {
  if (constraints.inputModalities?.length && !constraints.inputModalities.every((item) => deployment.inputs.includes(item))) return false;
  if (constraints.outputModalities?.length && !constraints.outputModalities.every((item) => deployment.outputs.includes(item))) return false;
  if (constraints.license?.commercial && deployment.license.commercial !== true) return false;
  if (constraints.availability && deployment.availability !== constraints.availability) return false;
  return true;
}

export function getEligibleDeployments(deployments, requirements = [], policy = {}) {
  return deployments.filter((deployment) => {
    if (deployment.availability && deployment.availability !== "available") return false;
    if (deployment.featureState && !["enabled", "beta", "internal", "experimental"].includes(deployment.featureState)) return false;
    if (deployment.health === "unhealthy") return false;
    if (policy.allowedProviders?.length && !policy.allowedProviders.includes(deployment.providerId)) return false;
    if (policy.allowedDeployments?.length && !policy.allowedDeployments.includes(deployment.id)) return false;
    return requirements.filter((requirement) => requirement.kind === "required")
      .every((requirement) => deployment.capabilities.includes(requirement.id) && matchesConstraints(deployment, requirement.constraints));
  });
}
