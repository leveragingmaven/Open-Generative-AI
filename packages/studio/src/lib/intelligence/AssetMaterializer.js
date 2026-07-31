import { createAssetFromExecution } from "./AssetFactory.js";
import { contentTypeForModality, validateOutputReference } from "./OutputValidation.js";
import { sha256 } from "./BrowserHash.js";

export class AssetMaterializer {
  constructor({ storage, repository, fetchImpl = globalThis.fetch, limits = {} } = {}) {
    this.storage = storage;
    this.repository = repository;
    this.fetchImpl = fetchImpl;
    this.limits = limits;
  }

  async materializeExecution({ result, context, job, plan } = {}) {
    const outputs = Array.isArray(result?.outputReferences) ? result.outputReferences : [];
    const asset = createAssetFromExecution({ result, context, job, plan });
    const materialized = [];
    const failures = [];
    for (let index = 0; index < outputs.length; index += 1) {
      const reference = outputs[index];
      if (typeof reference !== "string") { failures.push({ index, error: "invalid_reference" }); continue; }
      const validation = validateOutputReference(reference, { expectedModality: context?.recipe?.outputModality });
      if (!validation.valid) { failures.push({ index, error: validation.error }); continue; }
      try {
        const response = await this.fetchImpl(validation.url);
        if (!response.ok) throw new Error(`output_unavailable:${response.status}`);
        const body = new Uint8Array(await response.arrayBuffer());
        const maxBytes = this.limits[context?.recipe?.outputModality] || null;
        if (maxBytes != null && body.length > maxBytes) throw new Error("file_too_large");
        const checksum = await sha256(body);
        const key = `assets/${asset.id}/v${asset.version}/output-${index}`;
        const stored = await this.storage.putObject({ key, body, contentType: response.headers.get("content-type") || contentTypeForModality(context?.recipe?.outputModality), metadata: { sourceReference: reference, checksum } });
        const deliveryReference = await this.storage.createDeliveryReference(key);
        materialized.push({ index, sourceReference: reference, ...stored, deliveryReference });
      } catch (error) {
        failures.push({ index, error: error.message || "materialization_failed" });
      }
    }
    const resultAsset = this.repository.save({
      ...asset,
      generatedFiles: materialized.map((item) => item.deliveryReference),
      storageOutputs: materialized,
      materialization: { status: failures.length ? (materialized.length ? "partial" : "failed") : "completed", failures },
    });
    return { asset: resultAsset, outputs: materialized, failures, status: failures.length ? (materialized.length ? "partial" : "failed") : "completed" };
  }
}
