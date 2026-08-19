import assert from "node:assert/strict";
import test from "node:test";
import { createCapabilityRequirement } from "./CapabilityTypes.js";
import { getEligibleModelCandidates } from "./ModelCandidateEligibility.js";
import { ProviderCapabilityRegistry } from "./ProviderCapabilityRegistry.js";
import { MUAPI_MODEL_FIXTURES, registerProductionCapabilities } from "./ProductionCapabilityCatalog.js";

function catalogModels() {
  const registry = new ProviderCapabilityRegistry();
  registerProductionCapabilities({ deployments: registry });
  return registry.listModels();
}

function candidate(overrides = {}) {
  return {
    id: "verified-candidate",
    providerId: "muapi",
    logicalFamily: "test-family",
    operation: "image_to_video",
    modality: "video",
    capabilities: ["video_generation"],
    ...overrides,
  };
}

test("legacy requirements remain compatible", () => {
  const models = catalogModels();
  const eligible = getEligibleModelCandidates(models, ["image_generation"]);
  assert.equal(eligible.length, 3);
  assert.ok(eligible.every((model) => model.logicalFamily === "flux-kontext-t2i"));
});

test("specialist capability identifies the background-removal candidate", () => {
  const models = catalogModels();
  const eligible = getEligibleModelCandidates(models, [createCapabilityRequirement({
    id: "background_removal",
    specialist: true,
    operation: "background_removal",
    modality: "image",
  })]);
  assert.deepEqual(eligible.map((model) => model.id), ["muapi-tool-ai-background-remover"]);
});

test("wrong modality and operation are rejected", () => {
  const models = catalogModels();
  assert.deepEqual(getEligibleModelCandidates(models, [{ id: "video_generation", modality: "image" }]), []);
  assert.deepEqual(getEligibleModelCandidates(models, [{ id: "video_generation", operation: "video_generation" }]), []);
});

test("resolution variants remain identifiable and insufficient resolution is rejected", () => {
  const models = catalogModels();
  const seedance = models.filter((model) => model.logicalFamily === "seedance-2.5-image-to-video");
  const eligible = getEligibleModelCandidates(seedance, [{
    id: "video_generation",
    targetResolution: "1080p",
  }]);
  assert.equal(eligible.length, 1);
  assert.deepEqual(getEligibleModelCandidates(seedance, [{
    id: "video_generation",
    targetResolution: "8K",
  }]), []);
  assert.equal(eligible[0].logicalFamily, "seedance-2.5-image-to-video");
  assert.deepEqual(eligible[0].resolution.values, ["480p", "720p", "1080p", "4K"]);
});

test("verified duration and reference limits are enforced", () => {
  const limited = candidate({ duration: { maxSeconds: 10 }, referenceLimits: { max: 2 } });
  assert.equal(getEligibleModelCandidates([limited], [{ id: "video_generation", duration: 12 }]).length, 0);
  assert.equal(getEligibleModelCandidates([limited], [{ id: "video_generation", referenceCount: 3 }]).length, 0);
  assert.equal(getEligibleModelCandidates([limited], [{ id: "video_generation", duration: 8, referenceCount: 2 }]).length, 1);
});

test("missing optional metadata does not reject unconstrained legacy candidates", () => {
  const legacy = candidate();
  assert.equal(getEligibleModelCandidates([legacy], [{ id: "video_generation" }]).length, 1);
  assert.equal(getEligibleModelCandidates([legacy], [{ id: "video_generation", duration: 4 }]).length, 0);
});

test("pricing does not affect eligibility", () => {
  const models = [
    candidate({ id: "cheap", pricing: { unitPrice: 0.01 } }),
    candidate({ id: "expensive", pricing: { unitPrice: 10 } }),
  ];
  assert.deepEqual(getEligibleModelCandidates(models, [{ id: "video_generation" }]).map((model) => model.id), ["cheap", "expensive"]);
});

test("unverified quality metadata does not create a quality decision", () => {
  const models = [
    candidate({ id: "unverified-low", quality: { final: 0.1 }, verification: { quality: { status: "unverified" } } }),
    candidate({ id: "verified-low", quality: { final: 0.1 }, verification: { quality: { status: "verified" } } }),
  ];
  const eligible = getEligibleModelCandidates(models, [{ id: "video_generation", qualityIntent: "final", qualityFloor: 0.8 }]);
  assert.deepEqual(eligible.map((model) => model.id), ["unverified-low"]);
});

test("provider and model IDs are not required, and candidate records are not mutated", () => {
  const input = candidate({ providerId: undefined, modelId: undefined, pricing: { unitPrice: 5 } });
  const before = JSON.stringify(input);
  const eligible = getEligibleModelCandidates([input], [{ id: "video_generation" }]);
  assert.equal(eligible[0], input);
  assert.equal(JSON.stringify(input), before);
});
