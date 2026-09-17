/**
 * M2 — REGISTER FAL.AI IN THE PRODUCTION CAPABILITY CATALOG: focused tests.
 *
 * Proves the additive catalog registration introduced in M2:
 *   1. The catalog now declares the two fal.ai deployments that back the
 *      already-supported FAL production operations (text-to-image, Redux edit).
 *   2. Those deployments use the M1 vocabulary exactly (`provider` owner id,
 *      `logicalModel`, `endpointId`) — no second metadata format was invented.
 *   3. Capabilities are the pre-existing `IMAGE_GENERATION` / `IMAGE_EDITING`.
 *   4. Existing MuAPI catalog entries are byte-for-byte unchanged.
 *   5. CapabilityRouter can DISCOVER fal.ai, but no runtime automatically
 *      switches to it: MuAPI still wins every default resolution.
 *
 * Metadata only — no production behavior was changed to make these tests pass.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { CapabilityRegistry } from "./CapabilityRegistry.js";
import { ProviderCapabilityRegistry } from "./ProviderCapabilityRegistry.js";
import { CapabilityRouter } from "./CapabilityRouter.js";
import {
  PRODUCTION_CAPABILITIES,
  PRODUCTION_DEPLOYMENTS,
  MUAPI_MODEL_FIXTURES,
  registerProductionCapabilities,
} from "./ProductionCapabilityCatalog.js";
import { CAPABILITIES } from "./CapabilityTypes.js";
import { PROVIDER_IDS } from "../providers/providerTypes.js";
import { FAL_MODEL_IDS } from "../providers/FalProvider.js";
import { FAL_ROUTING_MODELS } from "../providers/modelRoutingMetadata.js";

const FAL_TEXT_TO_IMAGE_ID = "fal-flux-schnell-text-to-image";
const FAL_IMAGE_EDITING_ID = "fal-flux-schnell-redux-image-editing";

const M1_TEXT_TO_IMAGE = FAL_ROUTING_MODELS[FAL_MODEL_IDS.TEXT_TO_IMAGE];
const M1_IMAGE_TO_IMAGE = FAL_ROUTING_MODELS[FAL_MODEL_IDS.IMAGE_TO_IMAGE];

const M1 = {
  [FAL_TEXT_TO_IMAGE_ID]: M1_TEXT_TO_IMAGE,
  [FAL_IMAGE_EDITING_ID]: M1_IMAGE_TO_IMAGE,
};

// MuAPI deployments as they existed before M2 (regression pin — unchanged).
const MUAPI_DEPLOYMENT_IDS = [
  "muapi-image-generation",
  "muapi-image-editing",
  "muapi-ai-clipping",
  "muapi-motion-graphics",
  "muapi-performance-transfer",
  "muapi-video-generation",
  "muapi-lip-sync",
];

const buildRegistries = () => {
  const capabilities = new CapabilityRegistry([]);
  const deployments = new ProviderCapabilityRegistry();
  registerProductionCapabilities({ capabilities, deployments });
  return { capabilities, deployments, router: new CapabilityRouter({ capabilities, deployments }) };
};

test("M2 catalog declares exactly the two fal.ai deployments backing supported production operations", () => {
  const falDeployments = PRODUCTION_DEPLOYMENTS.filter((deployment) => deployment.providerId === PROVIDER_IDS.FAL);

  assert.deepEqual(
    falDeployments.map((deployment) => deployment.id).sort(),
    [FAL_IMAGE_EDITING_ID, FAL_TEXT_TO_IMAGE_ID].sort(),
  );
  assert.equal(PROVIDER_IDS.FAL, "fal");
});

test("M2 fal.ai deployments carry provider id 'fal', the M1 logical models, and the M1 endpoint ids", () => {
  for (const deployment of PRODUCTION_DEPLOYMENTS.filter((entry) => entry.providerId === PROVIDER_IDS.FAL)) {
    const expected = M1[deployment.id];
    assert.ok(expected, `unexpected fal deployment ${deployment.id}`);
    assert.equal(deployment.providerId, "fal");
    assert.equal(deployment.logicalModel, expected.logicalModel);
    assert.equal(deployment.metadata.endpointId, expected.endpointId);
  }

  const textToImage = PRODUCTION_DEPLOYMENTS.find((entry) => entry.id === FAL_TEXT_TO_IMAGE_ID);
  const imageEditing = PRODUCTION_DEPLOYMENTS.find((entry) => entry.id === FAL_IMAGE_EDITING_ID);

  assert.equal(textToImage.logicalModel, "fal-flux-schnell");
  assert.equal(textToImage.metadata.endpointId, "fal-ai/flux/schnell");
  assert.equal(imageEditing.logicalModel, "fal-flux-schnell-redux");
  assert.equal(imageEditing.metadata.endpointId, "fal-ai/flux/schnell/redux");
});

test("M2 fal.ai deployments use the pre-existing image capabilities and no invented capability ids", () => {
  const textToImage = PRODUCTION_DEPLOYMENTS.find((entry) => entry.id === FAL_TEXT_TO_IMAGE_ID);
  const imageEditing = PRODUCTION_DEPLOYMENTS.find((entry) => entry.id === FAL_IMAGE_EDITING_ID);
  const knownCapabilityIds = new Set(PRODUCTION_CAPABILITIES.map((capability) => capability.id));

  assert.equal(CAPABILITIES.IMAGE_GENERATION, "image_generation");
  assert.equal(CAPABILITIES.IMAGE_EDITING, "image_editing");

  assert.deepEqual(textToImage.capabilities, [CAPABILITIES.IMAGE_GENERATION]);
  assert.deepEqual(imageEditing.capabilities, [CAPABILITIES.IMAGE_EDITING]);
  assert.equal(textToImage.operation, CAPABILITIES.IMAGE_GENERATION);
  assert.equal(imageEditing.operation, CAPABILITIES.IMAGE_EDITING);

  for (const capability of [...textToImage.capabilities, ...imageEditing.capabilities]) {
    assert.ok(knownCapabilityIds.has(capability), `capability ${capability} is not in the production vocabulary`);
  }
});

test("M2 registered fal.ai records preserve provider/logicalModel/endpointId through normalization", () => {
  const { deployments } = buildRegistries();

  for (const [id, expected] of Object.entries(M1)) {
    const stored = deployments.get(id);
    assert.equal(stored.providerId, "fal");
    assert.equal(stored.logicalModel, expected.logicalModel);
    assert.equal(stored.metadata.endpointId, expected.endpointId);
    assert.equal(stored.availability, "available");
    assert.equal(stored.featureState, "enabled");
  }
});

test("M2 leaves every existing MuAPI catalog entry unchanged", () => {
  const { deployments } = buildRegistries();
  const muapiDeployments = PRODUCTION_DEPLOYMENTS.filter((entry) => entry.providerId === PROVIDER_IDS.MUAPI);

  assert.deepEqual(muapiDeployments.map((entry) => entry.id), MUAPI_DEPLOYMENT_IDS);
  for (const entry of muapiDeployments) {
    assert.equal(entry.priority, 10);
    assert.equal(entry.confidence, 0.8);
    assert.equal(entry.featureState, "enabled");
    assert.equal(entry.availability, "available");
    assert.equal(entry.health, "healthy");
    assert.equal(entry.metadata, undefined);
  }

  assert.equal(deployments.list().length, PRODUCTION_DEPLOYMENTS.length);
  assert.equal(deployments.listModels().length, MUAPI_MODEL_FIXTURES.length);
  assert.equal(deployments.get("muapi-image-generation").logicalModel, "muapi-image-catalog");
  assert.equal(deployments.get("muapi-image-editing").logicalModel, "muapi-image-edit-catalog");
});

test("M2 makes fal.ai discoverable to the CapabilityRouter when a policy asks for it", () => {
  const { router } = buildRegistries();

  const generation = router.resolve(
    { required: [CAPABILITIES.IMAGE_GENERATION] },
    { policy: { allowedProviders: [PROVIDER_IDS.FAL] } },
  );
  const editing = router.resolve(
    { required: [CAPABILITIES.IMAGE_EDITING] },
    { policy: { allowedProviders: [PROVIDER_IDS.FAL] } },
  );

  assert.equal(generation.providerId, "fal");
  assert.equal(generation.deploymentId, FAL_TEXT_TO_IMAGE_ID);
  assert.equal(editing.providerId, "fal");
  assert.equal(editing.deploymentId, FAL_IMAGE_EDITING_ID);
});

test("M2 does not let any default resolution switch away from MuAPI", () => {
  const { router } = buildRegistries();

  const generation = router.resolve({ required: [CAPABILITIES.IMAGE_GENERATION] });
  const editing = router.resolve({ required: [CAPABILITIES.IMAGE_EDITING] });

  assert.equal(generation.providerId, PROVIDER_IDS.MUAPI);
  assert.equal(generation.deploymentId, "muapi-image-generation");
  assert.equal(editing.providerId, PROVIDER_IDS.MUAPI);
  assert.equal(editing.deploymentId, "muapi-image-editing");

  // fal.ai is discoverable as an eligible alternative, but is never the winner:
  // the chosen MuAPI deployment is excluded from the fallback list, fal.ai is not.
  assert.deepEqual(generation.fallbackDeployments, [FAL_TEXT_TO_IMAGE_ID]);
  assert.deepEqual(editing.fallbackDeployments, [FAL_IMAGE_EDITING_ID]);
  assert.ok(!generation.fallbackDeployments.includes("muapi-image-generation"));
  assert.ok(!editing.fallbackDeployments.includes("muapi-image-editing"));
});

test("M2 image studio FAL dispatch branch is untouched by the catalog registration", () => {
  const runtime = readFileSync(new URL("./ImageStudioRuntime.js", import.meta.url), "utf8");

  assert.ok(runtime.includes('if (request?.providerId === "fal")'));
  assert.ok(runtime.includes('"/api/generation/fal"'));
  // The runtime must not consult the capability catalog or router.
  assert.ok(!runtime.includes("ProductionCapabilityCatalog"));
  assert.ok(!runtime.includes("CapabilityRouter"));
  assert.ok(!runtime.includes("providerCapabilityRegistry"));
});
