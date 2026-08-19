import assert from "node:assert/strict";
import test from "node:test";
import { CapabilityRegistry } from "./CapabilityRegistry.js";
import { CapabilityRouter } from "./CapabilityRouter.js";
import { ProviderCapabilityRegistry } from "./ProviderCapabilityRegistry.js";
import { registerProductionCapabilities, PRODUCTION_DEPLOYMENTS, MUAPI_MODEL_FIXTURES } from "./ProductionCapabilityCatalog.js";
import { RecipeResolver } from "./RecipeResolver.js";

test("production catalog registers MuAPI image deployments and recipes declare capabilities", () => {
  const capabilities = new CapabilityRegistry([]);
  const deployments = new ProviderCapabilityRegistry();
  registerProductionCapabilities({ capabilities, deployments });
  const router = new CapabilityRouter({ capabilities, deployments });
  const result = router.resolve({ required: ["image_generation"] });
  const imageRecipe = new RecipeResolver().compile("image");

  assert.equal(result.providerId, "muapi");
  assert.ok(PRODUCTION_DEPLOYMENTS.some((deployment) => deployment.id === result.deploymentId));
  assert.deepEqual(imageRecipe.capabilityRequirements, ["image_generation"]);
});

test("feature flags and health remove deployments from eligibility", () => {
  const capabilities = new CapabilityRegistry();
  const deployments = new ProviderCapabilityRegistry();
  deployments.register({ id: "disabled-image", providerId: "test", capabilities: ["image_generation"], featureState: "disabled" });
  deployments.register({ id: "unhealthy-image", providerId: "test", capabilities: ["image_generation"], health: "unhealthy" });
  const router = new CapabilityRouter({ capabilities, deployments });
  assert.throws(() => router.resolve({ required: ["image_generation"] }), /No eligible deployment/);
});

test("normalized MuAPI model records represent specialist tools, families, variants, and pricing", () => {
  const capabilities = new CapabilityRegistry([]);
  const deployments = new ProviderCapabilityRegistry();
  registerProductionCapabilities({ capabilities, deployments });

  const models = deployments.listModels();
  const specialist = deployments.getModel("muapi-tool-ai-background-remover");
  const fluxFamily = models.filter((model) => model.logicalFamily === "flux-kontext-t2i");
  const seedance = deployments.getModel("muapi-seedance-25-image-to-video-family");

  assert.equal(models.length, MUAPI_MODEL_FIXTURES.length);
  assert.equal(specialist.modelId, "ai-background-remover");
  assert.equal(specialist.tier, "specialist");
  assert.equal(specialist.pricing.unitPrice, 0.01);
  assert.equal(fluxFamily.length, 3);
  assert.deepEqual(fluxFamily.map((model) => model.tier), ["dev", "pro", "max"]);
  assert.equal(seedance.pricing.rule.parameter, "resolution");
  assert.equal(seedance.pricing.rule.values["1080p"], 4.25);
  assert.equal(seedance.source.document, "MUAPI_MODEL_INTELLIGENCE_CATALOG.md");
  assert.equal(seedance.verification.status, "verified");
});

test("model catalog records remain separate from router deployments", () => {
  const capabilities = new CapabilityRegistry([]);
  const deployments = new ProviderCapabilityRegistry();
  registerProductionCapabilities({ capabilities, deployments });
  const router = new CapabilityRouter({ capabilities, deployments });
  const result = router.resolve({ required: ["image_generation"] });

  assert.equal(deployments.list().length, PRODUCTION_DEPLOYMENTS.length);
  assert.ok(deployments.listModels().length > 0);
  assert.ok(PRODUCTION_DEPLOYMENTS.some((deployment) => deployment.id === result.deploymentId));
});
