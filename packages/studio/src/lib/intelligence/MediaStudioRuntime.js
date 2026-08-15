import { CreativeIntelligenceEngine } from "./CreativeIntelligenceEngine.js";
import { CreativeExecutionEngine } from "./CreativeExecutionEngine.js";
import { AssetMaterializer } from "./AssetMaterializer.js";
import { InMemoryAssetRepository } from "./AssetRepository.js";
import { InMemoryAssetStorage } from "./InMemoryAssetStorage.js";
import { ProviderRegistryExecutionAdapter } from "./ProviderExecution.js";
import { providerRegistry as defaultProviderRegistry } from "../providers/ProviderRegistry.js";
import { InMemoryExecutionPersistence } from "./ExecutionPersistence.js";
import { prepareKnowledgePackRequest } from "./creatorOsKnowledgePackService.js";

const enabled = (name) => ["1", "true", "yes", "on"].includes(String(process?.env?.[name] || "").toLowerCase());

export function mediaStudioRuntimeEnabled(studioId) {
  return enabled(`CREATIVE_OS_${String(studioId).toUpperCase()}_STUDIO`);
}

export function createMediaStudioRequest({ studioId, recipeId, operation, capability, prompt = "", inputs = {}, references = [], output = {}, apiKey } = {}) {
  return { recipeId, studioId, intent: prompt, inputs: { ...inputs, apiKey }, references, output, metadata: { compatibility: `${studioId}-studio`, operation, capability } };
}

export async function executeMediaStudioRequest(request, { legacyExecute, runtimeFactory = createMediaStudioRuntime, runtimeOptions = {} } = {}) {
  if (!mediaStudioRuntimeEnabled(request.studioId)) return legacyExecute();
  try {
    const runtime = runtimeFactory({
      providerRegistry: defaultProviderRegistry,
      executionPersistence: new InMemoryExecutionPersistence(),
      assetRepository: new InMemoryAssetRepository(),
      assetStorage: new InMemoryAssetStorage(),
      ...runtimeOptions,
    });
    const plannedRequest = await prepareKnowledgePackRequest(request);
    const plan = runtime.intelligence.plan({ ...plannedRequest, capabilityRequirements: [{ id: request.capability, kind: "required" }] });
    const context = runtime.execution.createExecutionContext(plan);
    const job = runtime.execution.createJob(context);
    runtime.execution.queue(job.id);
    const resultJob = await runtime.execution.execute(job.id, { context, routing: context.routing, operation: request.operation, inputs: request.inputs, executionMetadata: { apiKey: request.inputs.apiKey } });
    const result = resultJob?.result;
    const asset = result?.success && runtime.materializer ? await runtime.materializer.materializeExecution({ result, context, job: resultJob, plan }) : null;
    const url = asset?.asset?.generatedFiles?.[0] || result?.outputReferences?.[0];
    if (!url) throw new Error(resultJob?.error?.message || "Creative OS returned no media output");
    return { url, id: resultJob.id, request_id: result?.providerResponseRef || resultJob.id, provider: context.routing?.providerId || null, asset };
  } catch (error) {
    if (typeof legacyExecute === "function") return legacyExecute(error);
    throw error;
  }
}

export function createMediaStudioRuntime({ providerRegistry, memory, recipes, router, executionPersistence, assetRepository, assetStorage, fetchImpl } = {}) {
  const intelligence = new CreativeIntelligenceEngine({ memory, recipes, router });
  const repository = assetRepository || new InMemoryAssetRepository();
  const execution = new CreativeExecutionEngine({ persistence: executionPersistence, providerExecutor: providerRegistry ? new ProviderRegistryExecutionAdapter({ registry: providerRegistry }) : null, assetRepository: repository });
  const materializer = assetStorage ? new AssetMaterializer({ storage: assetStorage, repository, fetchImpl }) : null;
  return { intelligence, execution, materializer, assets: repository };
}
