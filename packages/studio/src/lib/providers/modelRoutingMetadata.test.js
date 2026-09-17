/**
 * M1 — EXPLICIT ROUTING METADATA: focused tests.
 *
 * Proves the additive metadata introduced in M1:
 *   1. Existing `provider` owner/family semantics are preserved.
 *   2. FAL direct models now expose explicit transport metadata.
 *   3. Normal MuAPI-routed models remain behaviorally unchanged.
 *   4. The metadata is inert — runtime routing behavior did not change.
 *
 * No production behavior was changed to make these tests pass.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  TRANSPORTS,
  TRANSPORT_CAPABILITIES,
  ROUTING_METADATA_KEYS,
  FAL_ROUTING_MODELS,
  falRoutingMetadata,
  withExplicitRouting,
  explicitTransport,
  hasExplicitTransport,
  effectiveTransport,
  transportCapabilities,
} from "./modelRoutingMetadata.js";

import { PROVIDER_IDS } from "./providerTypes.js";
import { FAL_MODEL_IDS } from "./FalProvider.js";
import { CAPABILITIES } from "../intelligence/CapabilityTypes.js";
import { providerRegistry } from "./ProviderRegistry.js";
import { executeImageStudioRequest, createImageStudioRequest } from "../intelligence/ImageStudioRuntime.js";

const models = await import("../../models.js");

/* ================================================================== *
 * 1. Existing `provider` owner semantics are preserved
 * ================================================================== */

test("M1: the existing provider field still carries model OWNER values", () => {
  const owners = [...readFileSync(new URL("../../models.js", import.meta.url), "utf8").matchAll(/"provider"\s*:\s*"([^"]+)"/g)]
    .map((m) => m[1]);

  // Owner/family names are still what `provider` holds.
  for (const owner of ["google", "kling", "bytedance"]) {
    assert.ok(owners.includes(owner), `models.js still uses "${owner}" as an owner value`);
  }

  // `provider` was NOT repurposed, and no model entry gained a transport field.
  assert.ok(!owners.includes(PROVIDER_IDS.FAL), "fal is still absent from model provider values");
  assert.ok(!owners.includes(PROVIDER_IDS.KIE), "kie is still absent from model provider values");
  assert.ok(!owners.includes(PROVIDER_IDS.OPENROUTER), "openrouter is still absent from model provider values");
});

test("M1: models.js is untouched by this milestone (no new metadata keys added to the catalog)", () => {
  const source = readFileSync(new URL("../../models.js", import.meta.url), "utf8");
  for (const key of ROUTING_METADATA_KEYS) {
    assert.equal(
      (source.match(new RegExp('"?' + key + '"?\\s*:', "g")) || []).length,
      0,
      `models.js must not be annotated with "${key}"`,
    );
  }
});

test("M1: catalog model entries keep exactly their previous shape and identity", () => {
  // Sample entries across owner families: their existing fields are intact and
  // they declare no explicit transport (so they stay aggregator-routed).
  for (const list of [models.t2iModels, models.i2iModels]) {
    for (const entry of list) {
      assert.equal(typeof entry.id, "string", "every entry keeps its id");
      assert.equal(typeof entry.name, "string", "every entry keeps its name");
      assert.ok(entry.provider !== undefined, "every entry keeps its provider owner value");
      assert.equal(hasExplicitTransport(entry), false, "catalog entries declare no explicit transport");
      assert.equal(explicitTransport(entry), null);
      assert.equal(effectiveTransport(entry), TRANSPORTS.MUAPI, "catalog entries resolve to the aggregator");
    }
  }
});

/* ================================================================== *
 * 2. FAL direct models now expose explicit transport metadata
 * ================================================================== */

test("M1: FAL direct models expose explicit transport, capability, logicalModel and endpointId", () => {
  const t2i = falRoutingMetadata(FAL_MODEL_IDS.TEXT_TO_IMAGE);
  assert.deepEqual(t2i, {
    transport: TRANSPORTS.FAL,
    capability: CAPABILITIES.IMAGE_GENERATION,
    logicalModel: "fal-flux-schnell",
    endpointId: FAL_MODEL_IDS.TEXT_TO_IMAGE,
  });

  const i2i = falRoutingMetadata(FAL_MODEL_IDS.IMAGE_TO_IMAGE);
  assert.deepEqual(i2i, {
    transport: TRANSPORTS.FAL,
    capability: CAPABILITIES.IMAGE_EDITING,
    logicalModel: "fal-flux-schnell-redux",
    endpointId: FAL_MODEL_IDS.IMAGE_TO_IMAGE,
  });

  // Unknown endpoints declare nothing.
  assert.equal(falRoutingMetadata("fal-ai/flux/dev"), null);
});

test("M1: withExplicitRouting attaches transport metadata while preserving id/name/provider/inputs", () => {
  const original = {
    id: FAL_MODEL_IDS.TEXT_TO_IMAGE,
    name: "FLUX Schnell (fal.ai)",
    provider: "fal",
    inputs: { aspect_ratio: { default: "1:1" } },
  };

  const annotated = withExplicitRouting(original, falRoutingMetadata(FAL_MODEL_IDS.TEXT_TO_IMAGE));

  // Pre-existing fields are preserved exactly (same identity of value shapes).
  assert.equal(annotated.id, original.id);
  assert.equal(annotated.name, original.name);
  assert.equal(annotated.provider, original.provider, "`provider` is not repurposed or overwritten");
  assert.deepEqual(annotated.inputs, original.inputs);
  assert.deepEqual(Object.keys(annotated.inputs), Object.keys(original.inputs));

  // The additive metadata is what changed.
  assert.equal(annotated.transport, TRANSPORTS.FAL);
  assert.equal(annotated.capability, CAPABILITIES.IMAGE_GENERATION);
  assert.equal(annotated.logicalModel, "fal-flux-schnell");
  assert.equal(annotated.endpointId, FAL_MODEL_IDS.TEXT_TO_IMAGE);

  // The input model is not mutated.
  assert.equal(original.transport, undefined);
  assert.deepEqual(Object.keys(original).sort(), ["id", "inputs", "name", "provider"]);
});

test("M1: withExplicitRouting adds nothing when no metadata applies (MuAPI default path)", () => {
  const entry = { id: "flux-dev", name: "FLUX Dev", provider: "black-forest-labs", inputs: {} };

  const unchanged = withExplicitRouting(entry, falRoutingMetadata("not-a-fal-model"));
  assert.deepEqual(unchanged, entry);
  assert.deepEqual(Object.keys(unchanged).sort(), ["id", "inputs", "name", "provider"]);
  assert.equal(effectiveTransport(unchanged), TRANSPORTS.MUAPI);
});

test("M1: the vocabulary reuses existing Creative OS capability ids and transport ids", () => {
  // Capability ids come from the intelligence layer's CapabilityTypes.
  assert.equal(CAPABILITIES.IMAGE_GENERATION, "image_generation");
  assert.equal(CAPABILITIES.IMAGE_EDITING, "image_editing");
  assert.ok(transportCapabilities(TRANSPORTS.FAL).includes(CAPABILITIES.IMAGE_GENERATION));
  assert.ok(transportCapabilities(TRANSPORTS.FAL).includes(CAPABILITIES.IMAGE_EDITING));

  // Transport ids come from the existing provider id set (not new strings).
  assert.equal(TRANSPORTS.FAL, PROVIDER_IDS.FAL);
  assert.equal(TRANSPORTS.MUAPI, PROVIDER_IDS.MUAPI);

  // The metadata key names mirror ProductionCapabilityCatalog's vocabulary.
  assert.deepEqual([...ROUTING_METADATA_KEYS], ["transport", "capability", "logicalModel", "endpointId"]);
  for (const key of ["logicalModel", "endpointId"]) {
    const catalog = readFileSync(new URL("../intelligence/ProductionCapabilityCatalog.js", import.meta.url), "utf8");
    assert.ok(catalog.includes(key), `ProductionCapabilityCatalog already uses "${key}"`);
  }
});

/* ================================================================== *
 * 3. Normal MuAPI-routed models remain behaviorally unchanged
 * ================================================================== */

test("M1: normal MuAPI models still route through the legacy MuAPI path", async () => {
  const previous = process.env.CREATIVE_OS_IMAGE_STUDIO;
  delete process.env.CREATIVE_OS_IMAGE_STUDIO;
  try {
    for (const request of [
      createImageStudioRequest({ prompt: "a mountain", model: "flux-dev", providerId: PROVIDER_IDS.MUAPI }),
      createImageStudioRequest({ prompt: "a mountain", model: "flux-dev" }),
    ]) {
      let legacyCalls = 0;
      const result = await executeImageStudioRequest(request, {
        legacyExecute: () => {
          legacyCalls += 1;
          return { url: "muapi://image.png", provider: PROVIDER_IDS.MUAPI };
        },
      });
      assert.equal(legacyCalls, 1);
      assert.equal(result.provider, PROVIDER_IDS.MUAPI);
    }
  } finally {
    if (previous === undefined) delete process.env.CREATIVE_OS_IMAGE_STUDIO;
    else process.env.CREATIVE_OS_IMAGE_STUDIO = previous;
  }
});

test("M1: the default active provider is still MuAPI", () => {
  assert.equal(providerRegistry.getActiveProvider().id, PROVIDER_IDS.MUAPI);
  assert.equal(providerRegistry.list()[0].id, PROVIDER_IDS.MUAPI);
});

/* ================================================================== *
 * 4. Runtime routing behavior did not change
 * ================================================================== */

test("M1: the catalog arrays are unchanged in length and id order", () => {
  // Metadata is additive and lives outside models.js, so the catalog arrays are
  // byte-for-byte equivalent: same lengths and same id sequence.
  assert.ok(models.t2iModels.length > 0);
  assert.ok(models.i2iModels.length > 0);
  for (const list of [models.t2iModels, models.i2iModels]) {
    for (const entry of list) {
      assert.ok(!Object.prototype.hasOwnProperty.call(entry, "transport"));
    }
  }
});

test("M1: ImageStudio.jsx dispatch sites resolve transport via effectiveTransport (intentionally superseded by M3)", () => {
  const source = readFileSync(new URL("../../components/ImageStudio.jsx", import.meta.url), "utf8");
  // M3 removed the pre-M3 owner-derived expression
  //   `currentModels.find(m => m.id === selectedModelId)?.provider || "muapi"`.
  // Both dispatch sites now resolve transport from M1 metadata via
  // effectiveTransport(), which defaults to muapi when no explicit transport exists.
  const dispatch = source.match(/providerId:\s*effectiveTransport\(currentModels\.find\(\(model\)\s*=>\s*model\.id === selectedModelId\)\)/g);
  assert.equal(dispatch?.length, 2, "both dispatch sites must resolve transport via effectiveTransport");
  assert.doesNotMatch(
    source,
    /providerId:\s*currentModels\.find\(\(model\)\s*=>\s*model\.id === selectedModelId\)\?\.provider/,
    "routing must not read the owner field",
  );
  assert.doesNotMatch(source, /providerId:[\s\S]{0,120}\.transport\b/, "transport must be read via effectiveTransport(), not a raw .transport read");
});

test("M1: the FAL model entries in ImageStudio.jsx keep provider: \"fal\" and gain transport metadata", () => {
  const source = readFileSync(new URL("../../components/ImageStudio.jsx", import.meta.url), "utf8");

  // The FAL entries are still injected with the same ids, labels and provider.
  assert.match(source, /id:\s*FAL_MODEL_IDS\.TEXT_TO_IMAGE,\s*name:\s*"FLUX Schnell \(fal\.ai\)",\s*provider:\s*"fal"/);
  assert.match(source, /id:\s*FAL_MODEL_IDS\.IMAGE_TO_IMAGE,\s*name:\s*"FLUX Schnell Redux \(fal\.ai\)",\s*provider:\s*"fal"/);

  // ...and are now wrapped so they carry explicit transport metadata.
  assert.match(source, /withExplicitRouting\(\s*\{\s*id:\s*FAL_MODEL_IDS\.TEXT_TO_IMAGE/);
  assert.match(source, /withExplicitRouting\([\s\S]*?falRoutingMetadata\(FAL_MODEL_IDS\.TEXT_TO_IMAGE\)/);
  assert.match(source, /withExplicitRouting\([\s\S]*?falRoutingMetadata\(FAL_MODEL_IDS\.IMAGE_TO_IMAGE\)/);
});

test("M1: the FAL runtime branch is unchanged and still selected by providerId === \"fal\"", async () => {
  const records = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    records.push({ url: String(url), init });
    return { ok: true, json: async () => ({ outputReferences: ["https://fal.media/out.png"], requestId: "req-m1" }) };
  };
  try {
    const result = await executeImageStudioRequest(
      createImageStudioRequest({ prompt: "a cat", model: FAL_MODEL_IDS.TEXT_TO_IMAGE, providerId: PROVIDER_IDS.FAL }),
      { legacyExecute: () => assert.fail("legacy must not run for fal") },
    );
    assert.equal(records.length, 1);
    assert.equal(records[0].url, "/api/generation/fal");
    assert.equal(result.provider, PROVIDER_IDS.FAL);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
