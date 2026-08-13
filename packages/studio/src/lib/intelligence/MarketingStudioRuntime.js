import { CreativeIntelligenceEngine } from "./CreativeIntelligenceEngine.js";
import { CreativeExecutionEngine } from "./CreativeExecutionEngine.js";
import { AssetMaterializer } from "./AssetMaterializer.js";
import { InMemoryAssetRepository } from "./AssetRepository.js";
import { InMemoryAssetStorage } from "./InMemoryAssetStorage.js";
import { ProviderRegistryExecutionAdapter } from "./ProviderExecution.js";
import { providerRegistry as defaultProviderRegistry } from "../providers/ProviderRegistry.js";
import { InMemoryExecutionPersistence } from "./ExecutionPersistence.js";

export function createMarketingStudioRuntime({ providerRegistry, memory, recipes, router, executionPersistence, assetRepository, assetStorage, fetchImpl } = {}) {
  const intelligence = new CreativeIntelligenceEngine({ memory, recipes, router });
  const repository = assetRepository || new InMemoryAssetRepository();
  const execution = new CreativeExecutionEngine({
    persistence: executionPersistence,
    providerExecutor: providerRegistry ? new ProviderRegistryExecutionAdapter({ registry: providerRegistry }) : null,
    assetRepository: repository,
  });
  const materializer = assetStorage ? new AssetMaterializer({ storage: assetStorage, repository, fetchImpl }) : null;
  return { intelligence, execution, materializer, assets: repository };
}

export function marketingStudioRuntimeEnabled() {
  const value = typeof process !== "undefined" ? process.env?.CREATIVE_OS_MARKETING_STUDIO : undefined;
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

export function createMarketingStudioRequest({ model, prompt, ratio, duration, resolution, images = [], videoFiles = [], apiKey } = {}) {
  return {
    recipeId: "marketing",
    studioId: "marketing",
    intent: prompt || "",
    inputs: {
      prompt: prompt || "",
      model,
      aspect_ratio: ratio,
      duration,
      resolution,
      images_list: images.filter(Boolean),
      video_files: videoFiles.filter(Boolean),
      apiKey,
    },
    references: images.filter(Boolean),
    output: { modality: "video", aspectRatio: ratio, durationSeconds: duration },
    metadata: { compatibility: "marketing-studio" },
  };
}

export async function executeMarketingStudioRequest(request, { runtimeFactory = createMarketingStudioRuntime, legacyExecute, runtimeOptions = {} } = {}) {
  if (!marketingStudioRuntimeEnabled()) return legacyExecute();
  try {
    const runtime = runtimeFactory({
      providerRegistry: defaultProviderRegistry,
      executionPersistence: new InMemoryExecutionPersistence(),
      assetRepository: new InMemoryAssetRepository(),
      assetStorage: new InMemoryAssetStorage(),
      ...runtimeOptions,
    });
    const plan = runtime.intelligence.plan({ ...request, capabilityRequirements: [{ id: "video_generation", kind: "required" }] });
    const context = runtime.execution.createExecutionContext(plan);
    const job = runtime.execution.createJob(context);
    runtime.execution.queue(job.id);
    const resultJob = await runtime.execution.execute(job.id, {
      context,
      routing: context.routing,
      operation: "marketing_generation",
      inputs: request.inputs,
      executionMetadata: { apiKey: request.inputs.apiKey },
    });
    const result = resultJob?.result;
    const asset = result?.success && runtime.materializer ? await runtime.materializer.materializeExecution({ result, context, job: resultJob, plan }) : null;
    const url = asset?.asset?.generatedFiles?.[0] || result?.outputReferences?.[0];
    if (!url) throw new Error(resultJob?.error?.message || "Creative OS returned no marketing output");
    return { url, id: resultJob.id, request_id: result?.providerResponseRef || resultJob.id, provider: context.routing?.providerId || null, asset };
  } catch (error) {
    if (typeof legacyExecute === "function") return legacyExecute(error);
    throw error;
  }
}
