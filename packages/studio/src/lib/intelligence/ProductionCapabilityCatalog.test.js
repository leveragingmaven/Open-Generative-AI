import assert from "node:assert/strict";
import test from "node:test";
import { CapabilityRegistry } from "./CapabilityRegistry.js";
import { CapabilityRouter } from "./CapabilityRouter.js";
import { ProviderCapabilityRegistry } from "./ProviderCapabilityRegistry.js";
import { registerProductionCapabilities, PRODUCTION_DEPLOYMENTS } from "./ProductionCapabilityCatalog.js";
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
