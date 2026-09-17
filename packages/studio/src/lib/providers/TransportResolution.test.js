/**
 * M3 — REMOVE model.provider AS TRANSPORT TRUTH: focused tests.
 *
 * Proves that Image Studio derives request transport from the explicit routing
 * metadata introduced in M1 (`effectiveTransport()`), NOT from the model
 * `provider` field — which keeps its model-owner/family meaning.
 *
 * Resolution contract under test:
 *   explicit transport present  -> that transport
 *   explicit transport absent   -> MuAPI default
 *
 * These tests read ImageStudio.jsx as source text (the component is not rendered
 * in unit tests) and exercise the real `effectiveTransport()` helper.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  effectiveTransport,
  explicitTransport,
  falRoutingMetadata,
  hasExplicitTransport,
  withExplicitRouting,
} from "./modelRoutingMetadata.js";
import { FAL_MODEL_IDS } from "./FalProvider.js";
import { PROVIDER_IDS } from "./providerTypes.js";

const imageStudio = readFileSync(new URL("../../components/ImageStudio.jsx", import.meta.url), "utf8");
const runtime = readFileSync(new URL("../intelligence/ImageStudioRuntime.js", import.meta.url), "utf8");

const falTextToImage = withExplicitRouting(
  { id: FAL_MODEL_IDS.TEXT_TO_IMAGE, name: "FLUX Schnell (fal.ai)", provider: "fal" },
  falRoutingMetadata(FAL_MODEL_IDS.TEXT_TO_IMAGE),
);
const falRedux = withExplicitRouting(
  { id: FAL_MODEL_IDS.IMAGE_TO_IMAGE, name: "FLUX Schnell Redux (fal.ai)", provider: "fal" },
  falRoutingMetadata(FAL_MODEL_IDS.IMAGE_TO_IMAGE),
);

// Owner-tagged models as MuAPI serves them: `provider` names the family, not a transport.
const ownerModel = (owner) => ({ id: `${owner}-some-model`, name: `${owner} model`, provider: owner });

/* ------------------------------------------------------------------
 * Request-construction resolution (the defect M3 fixes)
 * ------------------------------------------------------------------ */

test("M3 resolves the FAL Schnell model's request transport to fal", () => {
  assert.equal(effectiveTransport(falTextToImage), PROVIDER_IDS.FAL);
  assert.equal(effectiveTransport(falTextToImage), "fal");
});

test("M3 resolves the FAL Redux model's request transport to fal", () => {
  assert.equal(effectiveTransport(falRedux), PROVIDER_IDS.FAL);
  assert.equal(effectiveTransport(falRedux), "fal");
});

test("M3 resolves owner-tagged models with no explicit transport to the muapi default", () => {
  for (const owner of ["google", "kling", "bytedance"]) {
    const model = ownerModel(owner);
    assert.equal(hasExplicitTransport(model), false, `${owner} must not declare a transport`);
    assert.equal(effectiveTransport(model), PROVIDER_IDS.MUAPI);
    assert.equal(effectiveTransport(model), "muapi");
  }
});

test("M3 resolves a missing/unknown model to the muapi default", () => {
  assert.equal(effectiveTransport(undefined), "muapi");
  assert.equal(effectiveTransport(null), "muapi");
  assert.equal(effectiveTransport({}), "muapi");
  assert.equal(effectiveTransport({ provider: "google" }), "muapi");
});

test("M3 keeps the model provider owner/family values unchanged", () => {
  // `provider` still means OWNER. The helper must not read it as transport, and
  // must not mutate it — even an owner literally named "fal" is not a transport.
  for (const owner of ["google", "kling", "bytedance", "fal", "muapi"]) {
    const model = { id: "x", provider: owner };
    assert.equal(effectiveTransport(model), PROVIDER_IDS.MUAPI);
    assert.equal(model.provider, owner, "owner field must not be mutated");
  }

  const falModel = withExplicitRouting(
    { id: FAL_MODEL_IDS.TEXT_TO_IMAGE, provider: "fal" },
    falRoutingMetadata(FAL_MODEL_IDS.TEXT_TO_IMAGE),
  );
  // FAL declares transport explicitly AND keeps provider as owner metadata.
  assert.equal(explicitTransport(falModel), "fal");
  assert.equal(falModel.provider, "fal");
});

/* ------------------------------------------------------------------
 * Image Studio source wiring
 * ------------------------------------------------------------------ */

test("M3 Image Studio derives request transport via effectiveTransport, not the owner field", () => {
  assert.match(imageStudio, /import \{[^}]*\beffectiveTransport\b[^}]*\} from "\.\.\/lib\/providers\/modelRoutingMetadata\.js"/);
  assert.match(
    imageStudio,
    /providerId:\s*effectiveTransport\(currentModels\.find\(\(model\)\s*=>\s*model\.id === selectedModelId\)\)/,
  );
  // The pre-M3 owner-derived expression must be gone from request construction.
  assert.doesNotMatch(imageStudio, /providerId:\s*currentModels\.find/);
  assert.doesNotMatch(imageStudio, /providerId:\s*[^,\n]*\?\.provider/);
});

test("M3 both Image Studio request-construction sites were converted", () => {
  const sites = imageStudio.match(/providerId:\s*effectiveTransport\(currentModels\.find\(\(model\)\s*=>\s*model\.id === selectedModelId\)\)/g) || [];
  assert.equal(sites.length, 2, "expected both M0-identified construction sites to use effectiveTransport");

  // The resolved transport is handed to the i2i (imageMode: true) and t2i
  // (imageMode: false) request builders.
  assert.match(imageStudio, /imageMode:\s*true,\r?\n\s*providerId:\s*effectiveTransport\(/);
  assert.match(imageStudio, /imageMode:\s*false,\r?\n\s*providerId:\s*effectiveTransport\(/);
});

test("M3 leaves the owner-logo lookup on the provider field intact", () => {
  // Image Studio legitimately reads `provider` when displaying the owner badge;
  // M3 only removed it as a source of TRANSPORT.
  assert.match(imageStudio, /currentModels\.find\(\(m\)\s*=>\s*m\.id === selectedModelId\)/);
  assert.match(imageStudio, /selectedModelProvider/);
});

/* ------------------------------------------------------------------
 * Downstream dispatch is unchanged
 * ------------------------------------------------------------------ */

test("M3 still reaches the existing hard-coded FAL runtime branch for fal transport", () => {
  // ImageStudioRuntime resolves the fal transport from the request it is handed.
  assert.match(runtime, /request\?\.providerId === "fal"/);
  assert.match(runtime, /"\/api\/generation\/fal"/);
  assert.match(runtime, /credentials: "same-origin"/);

  // A fal-transport request reaches that branch with the resolved providerId.
  const request = { providerId: effectiveTransport(falTextToImage), prompt: "p", model: FAL_MODEL_IDS.TEXT_TO_IMAGE, imageMode: false };
  assert.equal(request.providerId, "fal");
});

test("M3 still leaves owner-tagged requests on the existing MuAPI path", () => {
  for (const owner of ["google", "kling", "bytedance"]) {
    const request = { providerId: effectiveTransport(ownerModel(owner)), prompt: "p", model: `${owner}-some-model`, imageMode: false };
    assert.equal(request.providerId, "muapi");
    assert.notEqual(request.providerId, "fal");
  }

  // The fal branch is the only transport special-case in the runtime.
  const compared = runtime.match(/providerId === "([^"]+)"/g) || [];
  assert.deepEqual(compared, ['providerId === "fal"']);
});

test("M3 keeps the MuAPI legacy executors wired as the fallback", () => {
  assert.match(imageStudio, /legacyExecute:\s*\(\)\s*=>\s*generateI2I\(/);
  assert.match(imageStudio, /legacyExecute:\s*\(\)\s*=>\s*generateImage\(/);
});

/* ------------------------------------------------------------------
 * M3 scope guards: no capability routing / credential / provider changes
 * ------------------------------------------------------------------ */

test("M3 does not wire the CapabilityRouter or catalog into Image Studio", () => {
  assert.doesNotMatch(imageStudio, /CapabilityRouter/);
  assert.doesNotMatch(imageStudio, /ProductionCapabilityCatalog/);
  assert.doesNotMatch(imageStudio, /providerCapabilityRegistry/);
  assert.doesNotMatch(imageStudio, /resolveConcreteProviderRouting/);
});

test("M3 does not change FAL credential handling or client-side provider registration", () => {
  // The fal route stays same-origin and key-free from the browser.
  assert.doesNotMatch(imageStudio, /apiKey.*providerId === "fal"/);
  assert.doesNotMatch(runtime, /ProductionCapabilityCatalog|CapabilityRouter|providerCapabilityRegistry/);
});
