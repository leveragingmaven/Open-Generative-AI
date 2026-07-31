import { CreativeIntelligenceEngine } from "./CreativeIntelligenceEngine.js";
import { CreativeExecutionEngine } from "./CreativeExecutionEngine.js";
import { AssetMaterializer } from "./AssetMaterializer.js";
import { InMemoryAssetRepository } from "./AssetRepository.js";
import { InMemoryAssetStorage } from "./InMemoryAssetStorage.js";
import { ProviderRegistryExecutionAdapter } from "./ProviderExecution.js";
import { providerRegistry as defaultProviderRegistry } from "../providers/ProviderRegistry.js";
import { InMemoryExecutionPersistence } from "./ExecutionPersistence.js";

export function createImageStudioRuntime({ providerRegistry, memory, recipes, router, executionPersistence, assetRepository, assetStorage, fetchImpl } = {}) {
  const intelligence = new CreativeIntelligenceEngine({ memory, recipes, router });
  const repository = assetRepository || new InMemoryAssetRepository();
  const execution = new CreativeExecutionEngine({
    persistence: executionPersistence,
    providerExecutor: providerRegistry ? new ProviderRegistryExecutionAdapter({ registry: providerRegistry }) : null,
    assetRepository: repository,
  });
  const materializer = assetStorage
    ? new AssetMaterializer({ storage: assetStorage, repository, fetchImpl })
    : null;
  return { intelligence, execution, materializer, assets: repository };
}

export function imageStudioRuntimeEnabled() {
  const value = typeof process !== "undefined" ? process.env?.CREATIVE_OS_IMAGE_STUDIO : undefined;
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

export async function executeImageStudioRequest(request, { runtimeFactory = createImageStudioRuntime, legacyExecute, runtimeOptions = {} } = {}) {
  if (!imageStudioRuntimeEnabled()) return legacyExecute();
  try {
    const runtime = runtimeFactory({
      providerRegistry: defaultProviderRegistry,
      executionPersistence: new InMemoryExecutionPersistence(),
      assetRepository: new InMemoryAssetRepository(),
      assetStorage: new InMemoryAssetStorage(),
      ...runtimeOptions,
    });
    const plan = runtime.intelligence.plan({
      ...request,
      capabilityRequirements: [request.imageMode ? "image_editing" : "image_generation"],
    });
    if (!runtime.intelligence.validate(plan).valid) throw new Error("Image Studio Creative OS plan validation failed");
    const context = runtime.execution.createExecutionContext(plan);
    const job = runtime.execution.createJob(context);
    runtime.execution.queue(job.id);
    const resultJob = await runtime.execution.execute(job.id, {
      context,
      routing: context.routing,
      providerId: context.routing?.providerId,
      operation: request.imageMode ? "image_editing" : "image_generation",
      inputs: request.inputs,
      executionMetadata: { apiKey: request.apiKey },
    });
    const result = resultJob?.result;
    const asset = result?.success && runtime.materializer ? await runtime.materializer.materializeExecution({ result, context, job: resultJob, plan }) : null;
    const url = asset?.asset?.generatedFiles?.[0] || result?.outputReferences?.[0] || resultJob?.result?.outputReferences?.[0];
    if (!url) throw new Error(resultJob?.error?.message || "Creative OS returned no image output");
    return { url, id: resultJob.id, request_id: result?.providerResponseRef || resultJob.id, provider: context.routing?.providerId || null, asset };
  } catch (error) {
    if (typeof legacyExecute === "function") return legacyExecute(error);
    throw error;
  }
}

export function createImageStudioRequest({ prompt, model, aspectRatio, qualityField, quality, references = [], swapUrl = null } = {}) {
  return {
    recipeId: references.length ? "imageEdit" : "image",
    studioId: "image",
    intent: prompt || "",
    inputs: {
      prompt: prompt || "",
      model,
      aspect_ratio: aspectRatio,
      ...(qualityField && quality ? { [qualityField]: quality } : {}),
      ...(references.length ? { images_list: references, image_url: references[0] } : {}),
      ...(swapUrl ? { swap_url: swapUrl } : {}),
    },
    references,
    output: { modality: "image", aspectRatio },
    metadata: { compatibility: "image-studio" },
  };
}
