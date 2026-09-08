export function createExecutionResult(input = {}) {
  return {
    success: Boolean(input.success),
    status: input.status || (input.success ? "completed" : "failed"),
    warnings: Array.isArray(input.warnings) ? [...input.warnings] : [],
    executionTimeMs: input.executionTimeMs ?? null,
    providerMetadata: input.providerMetadata && typeof input.providerMetadata === "object" ? { ...input.providerMetadata } : {},
    deploymentMetadata: input.deploymentMetadata && typeof input.deploymentMetadata === "object" ? { ...input.deploymentMetadata } : {},
    providerResponseRef: input.providerResponseRef || null,
    outputReferences: Array.isArray(input.outputReferences) ? [...input.outputReferences] : [],
    error: input.error || null,
  };
}
