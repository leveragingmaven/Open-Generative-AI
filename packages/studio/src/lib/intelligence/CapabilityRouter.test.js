import assert from "node:assert/strict";
import test from "node:test";
import { CapabilityRegistry } from "./CapabilityRegistry.js";
import { CapabilityRouter } from "./CapabilityRouter.js";
import { ProviderCapabilityRegistry } from "./ProviderCapabilityRegistry.js";

test("CapabilityRouter filters required capabilities and ranks preferred deployments", () => {
  const capabilities = new CapabilityRegistry();
  const deployments = new ProviderCapabilityRegistry();
  deployments.register({
    id: "fast-image",
    providerId: "provider-a",
    capabilities: ["image_generation", "fast_generation"],
    priority: 1,
    confidence: 0.8,
    speed: { latencyMs: 1000 },
    license: { commercial: true },
    metadata: { tier: "standard" },
  });
  deployments.register({
    id: "premium-image",
    providerId: "provider-b",
    capabilities: ["image_generation", "photorealism"],
    priority: 5,
    confidence: 0.95,
    quality: { premium: 1 },
    license: { commercial: true },
    metadata: { tier: "premium" },
  });

  const router = new CapabilityRouter({ capabilities, deployments });
  const result = router.resolve({
    required: [{ id: "image_generation" }],
    preferred: [{ id: "photorealism", weight: 5 }],
  }, { preferences: { qualityTier: "premium" }, policy: { allowedProviders: ["provider-b"] } });

  assert.equal(result.deploymentId, "premium-image");
  assert.equal(result.providerId, "provider-b");
  assert.deepEqual(result.fallbackDeployments, []);
});

test("CapabilityRouter rejects unknown capabilities and unavailable deployments", () => {
  const capabilities = new CapabilityRegistry();
  const deployments = new ProviderCapabilityRegistry();
  deployments.register({ id: "offline", providerId: "provider-a", capabilities: ["image_generation"], availability: "disabled" });
  const router = new CapabilityRouter({ capabilities, deployments });

  assert.throws(() => router.resolve({ required: ["unknown"] }), /Unknown capability/);
  assert.throws(() => router.resolve({ required: ["image_generation"] }), /No eligible deployment/);
});

test("CapabilityRouter remains compatible with richer descriptive requirements", () => {
  const capabilities = new CapabilityRegistry();
  const deployments = new ProviderCapabilityRegistry();
  deployments.register({
    id: "background-remover",
    providerId: "muapi",
    capabilities: ["background_removal"],
    availability: "available",
  });
  const router = new CapabilityRouter({ capabilities, deployments });
  const result = router.resolve({
    required: [{
      id: "background_removal",
      specialist: true,
      qualityIntent: "final",
      qualityFloor: 0.8,
      targetResolution: "1080p",
      duration: 6,
      referenceCount: 1,
      modality: "image",
      operation: "background_removal",
    }],
  });

  assert.equal(result.deploymentId, "background-remover");
  assert.equal(result.providerId, "muapi");
});
