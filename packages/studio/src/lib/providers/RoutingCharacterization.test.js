/**
 * M0 — BYOK / DIRECT PROVIDER ROUTING: CHARACTERIZATION (REGRESSION BASELINE)
 *
 * Purpose
 * -------
 * These tests PIN the routing behavior that is currently shipped, before any
 * M1–M5 refactor introduces a capability-driven routing layer. They are
 * deliberately written against today's implementation, warts included. If a
 * future change alters one of these behaviors, this suite must fail — that is
 * the entire point. Several pinned behaviors are known-imperfect (for example
 * the hard-coded `providerId === "fal"` branch that precedes the runtime
 * feature gate). Those are recorded as the baseline, NOT endorsed as correct.
 *
 * Scope boundaries honored by this file
 * -------------------------------------
 * - No production code was changed to make these tests pass.
 * - No assertions reach the network: every provider transport is stubbed.
 * - The FAL HTTP wire format is asserted through an injected `fetchImpl`.
 *
 * Behaviors pinned
 * ----------------
 *  B1. A FAL image model routes through the existing FAL generation path.
 *  B2. A normal MuAPI image model routes through MuAPI (legacy behavior).
 *  B3. A model whose `provider` value is an OWNER (google/kling/bytedance)
 *      is NOT interpreted as a direct transport provider.
 *  B4. `active()` / default provider remains MuAPI.
 *  B5. The runtime-disabled / legacy Image Studio path stays on MuAPI.
 *  B6. Existing FAL text-to-image behavior is unchanged.
 *  B7. Existing FAL Redux / reference behavior (hosted URL) is unchanged.
 *  B8. A missing FAL credential fails safely and never substitutes/leaks one.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  executeImageStudioRequest,
  createImageStudioRequest,
  imageStudioRuntimeEnabled,
} from "../intelligence/ImageStudioRuntime.js";

import { providerRegistry } from "./ProviderRegistry.js";
import { FalProvider, FAL_MODEL_IDS, falProvider } from "./FalProvider.js";
import { PROVIDER_IDS, PROVIDER_CAPABILITIES } from "./providerTypes.js";

/* ------------------------------------------------------------------ *
 * Harness
 * ------------------------------------------------------------------ */

const RUNTIME_FLAG = "CREATIVE_OS_IMAGE_STUDIO";

/** Runs `fn` with the runtime feature flag forced on, restoring it after. */
async function withRuntimeEnabled(fn) {
  const previous = process.env[RUNTIME_FLAG];
  process.env[RUNTIME_FLAG] = "1";
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env[RUNTIME_FLAG];
    else process.env[RUNTIME_FLAG] = previous;
  }
}

/** Runs `fn` with the runtime feature flag forced off, restoring it after. */
async function withRuntimeDisabled(fn) {
  const previous = process.env[RUNTIME_FLAG];
  delete process.env[RUNTIME_FLAG];
  try {
    return await fn();
  } finally {
    if (previous !== undefined) process.env[RUNTIME_FLAG] = previous;
  }
}

/** Runs `fn` with `globalThis.fetch` replaced, restoring it after. */
async function withFetch(replacement, fn) {
  const previous = globalThis.fetch;
  globalThis.fetch = replacement;
  try {
    return await fn();
  } finally {
    globalThis.fetch = previous;
  }
}

/** A fake `fetch` that records calls and returns a successful FAL payload. */
function recordingFetch(records, payload) {
  return async (url, init) => {
    records.push({ url: String(url), init });
    return {
      ok: true,
      status: 200,
      async json() {
        return payload ?? { outputReferences: ["https://fal.media/out.png"], requestId: "req-m0" };
      },
    };
  };
}

/** Minimal Response-alike used by the injected FAL `fetchImpl`. */
function jsonResponse(body, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? "OK" : "Error",
    headers: { get: () => "application/json" },
    async json() {
      return body;
    },
  };
}

/**
 * Builds a `FalProvider` whose queue lifecycle is fully stubbed:
 *   1st call  -> submit request
 *   2nd call  -> status COMPLETED
 *   3rd call  -> result payload
 * Both the outbound URLs and request bodies are recorded.
 */
function stubFalProvider(records, resultPayload) {
  return new FalProvider({
    pollIntervalMs: 0,
    maxPolls: 60,
    fetchImpl: async (url, options) => {
      records.push({ url: String(url), options });
      if (records.length === 1) return jsonResponse({ request_id: "req-m0" });
      if (records.length === 2) return jsonResponse({ status: "COMPLETED" });
      return jsonResponse(resultPayload ?? { images: [{ url: "https://fal.media/out.png", width: 1024, height: 1024 }] });
    },
  });
}

/* ================================================================== *
 * B1 — FAL image model routes through the existing FAL generation path
 * ================================================================== */

test("B1: a fal image model routes through the existing FAL generation endpoint", async () => {
  const records = [];

  await withFetch(recordingFetch(records), async () => {
    // The FAL branch is intentionally exercised with the runtime flag BOTH on
    // and off: today it is selected before the runtime-enabled gate.
    for (const runtimeOn of [true, false]) {
      const run = async () => {
        records.length = 0;
        let legacyCalls = 0;
        const request = createImageStudioRequest({
          prompt: "a lighthouse at dusk",
          model: FAL_MODEL_IDS.TEXT_TO_IMAGE,
          providerId: PROVIDER_IDS.FAL,
        });

        const result = await executeImageStudioRequest(request, {
          legacyExecute: () => {
            legacyCalls += 1;
            return { url: "legacy://muapi", provider: "muapi" };
          },
        });

        // Exactly one browser call, straight to the dedicated FAL route.
        assert.equal(records.length, 1, "the fal branch issues a single fetch");
        assert.equal(records[0].url, "/api/generation/fal");
        assert.equal(records[0].init.method, "POST");
        assert.equal(records[0].init.credentials, "same-origin");
        assert.deepEqual(records[0].init.headers, { "Content-Type": "application/json" });

        const body = JSON.parse(records[0].init.body);
        assert.equal(body.operation, "image_generation");
        assert.equal(body.inputs.model, FAL_MODEL_IDS.TEXT_TO_IMAGE);
        assert.equal(body.inputs.prompt, "a lighthouse at dusk");

        // The MuAPI legacy path is not consulted at all.
        assert.equal(legacyCalls, 0, "the legacy MuAPI path must not run for fal");

        // Normalized result shape returned to Image Studio.
        assert.deepEqual(result, {
          url: "https://fal.media/out.png",
          id: "req-m0",
          request_id: "req-m0",
          provider: PROVIDER_IDS.FAL,
        });

        return true;
      };

      if (runtimeOn) await withRuntimeEnabled(run);
      else await withRuntimeDisabled(run);
    }
  });
});

test("B1b: the fal branch normalizes imageMode into an image_editing operation", async () => {
  const records = [];

  await withFetch(recordingFetch(records), async () => {
    await withRuntimeEnabled(async () => {
      const request = createImageStudioRequest({
        prompt: "recolor the jacket",
        model: FAL_MODEL_IDS.IMAGE_TO_IMAGE,
        providerId: PROVIDER_IDS.FAL,
        imageMode: true,
        references: ["https://assets.test/reference.png"],
      });

      await executeImageStudioRequest(request, {
        legacyExecute: () => assert.fail("legacy path must not run for fal"),
      });

      const body = JSON.parse(records[0].init.body);
      assert.equal(body.operation, "image_editing");
      assert.deepEqual(body.inputs.images_list, ["https://assets.test/reference.png"]);
      assert.equal(body.inputs.image_url, "https://assets.test/reference.png");
    });
  });
});

/* ================================================================== *
 * B2 — A normal MuAPI image model routes through MuAPI
 * ================================================================== */

test("B2: a normal muapi image model keeps routing through MuAPI", async () => {
  await withRuntimeDisabled(async () => {
    let legacyCalls = 0;
    const legacyResult = { url: "muapi://image.png", provider: PROVIDER_IDS.MUAPI };

    const request = createImageStudioRequest({
      prompt: "a mountain range",
      model: "flux-dev",
      providerId: PROVIDER_IDS.MUAPI,
    });

    const result = await executeImageStudioRequest(request, {
      legacyExecute: () => {
        legacyCalls += 1;
        return legacyResult;
      },
    });

    assert.equal(legacyCalls, 1, "muapi models keep using the legacy MuAPI path");
    assert.deepEqual(result, legacyResult);
  });
});

test("B2b: a muapi model with no explicit providerId still routes through MuAPI", async () => {
  await withRuntimeDisabled(async () => {
    let legacyCalls = 0;

    const request = createImageStudioRequest({ prompt: "a mountain range", model: "flux-dev" });
    assert.equal(request.providerId, null, "createImageStudioRequest defaults providerId to null");

    const result = await executeImageStudioRequest(request, {
      legacyExecute: () => {
        legacyCalls += 1;
        return { url: "muapi://image.png", provider: PROVIDER_IDS.MUAPI };
      },
    });

    assert.equal(legacyCalls, 1);
    assert.equal(result.provider, PROVIDER_IDS.MUAPI);
  });
});

/* ================================================================== *
 * B3 — An OWNER provider value is NOT a direct transport provider
 * ================================================================== */

test("B3: owner provider values (google/kling/bytedance) are not treated as transports", async () => {
  // None of these owner ids is a registered creative provider.
  for (const owner of ["google", "kling", "bytedance"]) {
    assert.throws(
      () => providerRegistry.get(owner),
      /Unknown creative provider/,
      `"${owner}" must not resolve to a provider adapter`,
    );
  }

  // With the runtime disabled they fall straight through to legacy MuAPI.
  await withRuntimeDisabled(async () => {
    for (const owner of ["google", "kling", "bytedance"]) {
      let legacyCalls = 0;
      const request = createImageStudioRequest({
        prompt: "owner-routed model",
        model: "owner-model-id",
        providerId: owner,
      });

      const result = await executeImageStudioRequest(request, {
        legacyExecute: () => {
          legacyCalls += 1;
          return { url: "legacy://muapi", provider: PROVIDER_IDS.MUAPI };
        },
      });

      assert.equal(legacyCalls, 1, `"${owner}" must fall back to the legacy MuAPI path`);
      assert.equal(result.provider, PROVIDER_IDS.MUAPI);
    }
  });
});

test("B3b: owner provider values route to the MuAPI transport when the runtime is enabled", async () => {
  // Real owner-owned model ids taken from models.js: these are MuAPI-catalogued
  // models whose `provider` field names the model OWNER, not the transport.
  const ownerModels = {
    google: "nano-banana",
    kling: "kling-o1-text-to-image",
    bytedance: "bytedance-seedream-v3",
  };

  // The Creative OS path needs an image URL back from the (stubbed) transport.
  const records = [];
  await withFetch(recordingFetch(records, { outputReferences: ["https://muapi.test/out.png"] }), async () => {
    await withRuntimeEnabled(async () => {
      for (const [owner, modelId] of Object.entries(ownerModels)) {
        let legacyCalls = 0;
        const request = createImageStudioRequest({ prompt: "owner-routed model", model: modelId, providerId: owner });

        const result = await executeImageStudioRequest(request, {
          legacyExecute: () => {
            legacyCalls += 1;
            return { url: "legacy://muapi", provider: PROVIDER_IDS.MUAPI };
          },
        });

        // The Creative OS path handled the request; legacy was not consulted.
        assert.equal(legacyCalls, 0, "the Creative OS path handled the request");

        // The owner value must NOT be mapped onto a direct provider. It lands
        // on the MuAPI aggregator transport and deployment.
        assert.equal(result.provider, PROVIDER_IDS.MUAPI, `"${owner}" must not become a direct provider`);
        assert.equal(result.asset.asset.provider, PROVIDER_IDS.MUAPI);
        assert.equal(result.asset.asset.model, "muapi-image-generation");
        assert.equal(result.asset.asset.metadata.provider, PROVIDER_IDS.MUAPI);
        assert.equal(result.asset.asset.metadata.deployment, "muapi-image-generation");
      }
    });
  });
});

test("B3c: models.js provider values are model OWNERS, and exclude transport-only ids", () => {
  const source = readFileSync(new URL("../../models.js", import.meta.url), "utf8");
  const owners = [...source.matchAll(/"provider"\s*:\s*"([^"]+)"/g)].map((m) => m[1]);

  assert.ok(owners.length > 0, "models.js declares provider values");

  // Owner/family names appear...
  for (const owner of ["google", "kling", "bytedance"]) {
    assert.ok(owners.includes(owner), `models.js uses "${owner}" as a model owner value`);
  }

  // ...while dedicated transport providers do NOT appear as model providers.
  assert.ok(!owners.includes(PROVIDER_IDS.FAL), "fal is a transport, not a model provider value");
  assert.ok(!owners.includes(PROVIDER_IDS.KIE), "kie is a transport, not a model provider value");
  assert.ok(!owners.includes(PROVIDER_IDS.OPENROUTER), "openrouter is a transport, not a model provider value");
});

/* ================================================================== *
 * B4 — active() / default provider remains MuAPI
 * ================================================================== */

test("B4: the registry default active provider is MuAPI", () => {
  assert.equal(providerRegistry.getActiveProvider().id, PROVIDER_IDS.MUAPI);

  // The registry knows about MuAPI and FAL only; nothing sets the active
  // provider away from the MuAPI default at module scope.
  const ids = providerRegistry.list().map((provider) => provider.id);
  assert.ok(ids.includes(PROVIDER_IDS.MUAPI));
  assert.ok(ids.includes(PROVIDER_IDS.FAL));
  assert.equal(ids[0], PROVIDER_IDS.MUAPI, "muapi remains the first/default registry entry");

  // MuAPI is the only transport that also owns model entries.
  assert.equal(PROVIDER_IDS.MUAPI, "muapi");
  assert.equal(PROVIDER_IDS.FAL, "fal");

  // `capabilities` is a Set exposed through hasCapability().
  assert.ok(falProvider.hasCapability(PROVIDER_CAPABILITIES.IMAGE));
  assert.ok(falProvider.hasCapability(PROVIDER_CAPABILITIES.IMAGE_EDIT));
});

/* ================================================================== *
 * B5 — Runtime-disabled / legacy path stays on MuAPI
 * ================================================================== */

test("B5: the runtime-disabled Image Studio path always uses the legacy MuAPI behavior", async () => {
  await withRuntimeDisabled(async () => {
    assert.equal(imageStudioRuntimeEnabled(), false);

    for (const providerId of [null, PROVIDER_IDS.MUAPI, "google", "kling", "bytedance"]) {
      let legacyCalls = 0;
      const request = createImageStudioRequest({ prompt: "legacy", model: "flux-dev", providerId });

      const result = await executeImageStudioRequest(request, {
        legacyExecute: () => {
          legacyCalls += 1;
          return { url: "legacy://muapi", provider: PROVIDER_IDS.MUAPI };
        },
      });

      assert.equal(legacyCalls, 1, `providerId=${providerId} must use legacyExecute when runtime is off`);
      assert.equal(result.provider, PROVIDER_IDS.MUAPI);
    }
  });
});

test("B5b: the runtime feature flag only recognizes 1/true/yes/on", () => {
  const previous = process.env[RUNTIME_FLAG];
  try {
    delete process.env[RUNTIME_FLAG];
    assert.equal(imageStudioRuntimeEnabled(), false);

    for (const value of ["1", "true", "yes", "on", "TRUE", "On"]) {
      process.env[RUNTIME_FLAG] = value;
      assert.equal(imageStudioRuntimeEnabled(), true, `"${value}" enables the runtime`);
    }

    for (const value of ["0", "", "false", "no", "off", "2"]) {
      process.env[RUNTIME_FLAG] = value;
      assert.equal(imageStudioRuntimeEnabled(), false, `"${value}" does not enable the runtime`);
    }
  } finally {
    if (previous === undefined) delete process.env[RUNTIME_FLAG];
    else process.env[RUNTIME_FLAG] = previous;
  }
});

/* ================================================================== *
 * B6 — Existing FAL text-to-image behavior is unchanged
 * ================================================================== */

test("B6: FAL text-to-image still posts to fal-ai/flux/schnell with the existing mapping", async () => {
  const records = [];
  const provider = stubFalProvider(records);

  const result = await provider.execute({
    apiKey: "fal-test-key",
    operation: "image_generation",
    inputs: { model: FAL_MODEL_IDS.TEXT_TO_IMAGE, prompt: "A red fox", aspect_ratio: "1:1" },
  });

  assert.equal(FAL_MODEL_IDS.TEXT_TO_IMAGE, "fal-ai/flux/schnell");

  // Queue submit URL and shape.
  assert.equal(records[0].url, "https://queue.fal.run/fal-ai/flux/schnell");
  assert.equal(records[0].options.method, "POST");
  assert.equal(records[0].options.headers.Authorization, "Key fal-test-key");
  assert.equal(records[0].options.headers["Content-Type"], "application/json");

  // The existing aspect-ratio mapping is preserved.
  assert.deepEqual(JSON.parse(records[0].options.body), { prompt: "A red fox", image_size: "square_hd" });

  // Poll + result URLs are unchanged.
  assert.deepEqual(
    records.map((record) => record.url),
    [
      "https://queue.fal.run/fal-ai/flux/schnell",
      "https://queue.fal.run/fal-ai/flux/requests/req-m0/status?logs=1",
      "https://queue.fal.run/fal-ai/flux/requests/req-m0",
    ],
  );

  // Normalized provider result is unchanged.
  assert.equal(result.provider, PROVIDER_IDS.FAL);
  assert.equal(result.url, "https://fal.media/out.png");
  assert.deepEqual(result.outputReferences, ["https://fal.media/out.png"]);
  assert.equal(result.providerMetadata.model, FAL_MODEL_IDS.TEXT_TO_IMAGE);
  assert.equal(result.providerMetadata.requestId, "req-m0");
});

test("B6b: FAL text-to-image preserves the aspect-ratio mapping table", async () => {
  const cases = [
    ["1:1", "square_hd"],
    ["16:9", "landscape_16_9"],
    [undefined, undefined],
  ];

  for (const [aspectRatio, expectedSize] of cases) {
    const records = [];
    const provider = stubFalProvider(records);
    const inputs = { model: FAL_MODEL_IDS.TEXT_TO_IMAGE, prompt: "A red fox" };
    if (aspectRatio !== undefined) inputs.aspect_ratio = aspectRatio;

    await provider.execute({ apiKey: "k", operation: "image_generation", inputs });

    const body = JSON.parse(records[0].options.body);
    assert.equal(body.prompt, "A red fox");
    if (expectedSize === undefined) assert.equal(body.image_size, undefined);
    else assert.equal(body.image_size, expectedSize);
  }
});

/* ================================================================== *
 * B7 — Existing FAL Redux / reference behavior is unchanged
 * ================================================================== */

test("B7: FAL Redux still posts a hosted reference URL to the redux model", async () => {
  const referenceUrl = "https://assets.test/reference.png";
  const cases = [
    { images_list: [referenceUrl] },
    { image_url: referenceUrl },
  ];

  for (const inputs of cases) {
    const records = [];
    const provider = stubFalProvider(records);

    const result = await provider.execute({
      apiKey: "fal-test-key",
      operation: "image_editing",
      inputs: { model: FAL_MODEL_IDS.IMAGE_TO_IMAGE, prompt: "keep the subject", ...inputs },
    });

    assert.equal(FAL_MODEL_IDS.IMAGE_TO_IMAGE, "fal-ai/flux/schnell/redux");
    assert.equal(records[0].url, "https://queue.fal.run/fal-ai/flux/schnell/redux");

    // A hosted URL passes straight through as `image_url`; the prompt is not
    // forwarded on the redux path today.
    assert.deepEqual(JSON.parse(records[0].options.body), { image_url: referenceUrl });

    assert.equal(result.provider, PROVIDER_IDS.FAL);
    assert.equal(result.providerMetadata.model, FAL_MODEL_IDS.IMAGE_TO_IMAGE);
    assert.deepEqual(result.outputReferences, ["https://fal.media/out.png"]);
  }
});

/* ================================================================== *
 * B8 — Missing FAL credential fails safely
 * ================================================================== */

test("B8: a missing FAL credential fails safely without any network call", async () => {
  let fetchCalls = 0;
  const provider = new FalProvider({
    fetchImpl: async () => {
      fetchCalls += 1;
      return jsonResponse({});
    },
  });

  const error = await provider
    .execute({ operation: "image_generation", inputs: { prompt: "no key supplied" } })
    .then(() => null, (caught) => caught);

  assert.ok(error, "a missing credential rejects");
  assert.equal(error.code, "provider_credential_required:fal");
  assert.equal(error.message, "Provider credential is required.");

  // No request is attempted, so nothing can leak.
  assert.equal(fetchCalls, 0, "no outbound request may be made without a credential");

  // Only a stable machine code is enumerable on the error — no credential material.
  assert.deepEqual(Object.keys(error), ["code"]);
  assert.equal(error.code, "provider_credential_required:fal");
});

test("B8b: a missing credential never falls back to an injected or ambient credential", async () => {
  let fetchCalls = 0;
  const provider = new FalProvider({
    fetchImpl: async (url, options) => {
      fetchCalls += 1;
      // If this ever runs, it proves a credential was silently sourced.
      throw new Error(`unexpected request to ${url} with ${JSON.stringify(options.headers)}`);
    },
  });

  // `executionMetadata` present but without an apiKey, plus a global fetch key.
  const originalKey = process.env.FAL_KEY;
  process.env.FAL_KEY = "ambient-key-must-not-be-used";
  try {
    const error = await provider
      .execute({
        operation: "image_generation",
        inputs: { prompt: "no key supplied" },
        executionMetadata: {},
      })
      .then(() => null, (caught) => caught);

    assert.ok(error);
    assert.equal(error.code, "provider_credential_required:fal");
    assert.equal(fetchCalls, 0, "no request may be attempted with a substituted credential");

    // No error text echoes the ambient secret.
    assert.doesNotMatch(`${error.message} ${JSON.stringify(error)}`, /ambient-key-must-not-be-used/);
  } finally {
    if (originalKey === undefined) delete process.env.FAL_KEY;
    else process.env.FAL_KEY = originalKey;
  }
});

test("B8c: an unsupported FAL model is rejected before any request is issued", async () => {
  let fetchCalls = 0;
  const provider = new FalProvider({
    fetchImpl: async () => {
      fetchCalls += 1;
      return jsonResponse({});
    },
  });

  const error = await provider
    .execute({ apiKey: "present-but-wrong-model", operation: "image_generation", inputs: { model: "fal-ai/flux/dev", prompt: "x" } })
    .then(() => null, (caught) => caught);

  assert.ok(error);
  assert.equal(error.code, "provider_model_unsupported");
  assert.equal(fetchCalls, 0);
});
