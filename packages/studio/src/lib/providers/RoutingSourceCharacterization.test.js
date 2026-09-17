/**
 * M0 — BYOK / DIRECT PROVIDER ROUTING: SOURCE-TEXT + ENDPOINT CHARACTERIZATION
 *
 * Companion to `RoutingCharacterization.test.js`. Where that file pins runtime
 * behavior through stubbed transports, this file pins two things that are
 * structural rather than callable in a unit test:
 *
 *   1. The Image Studio JSX dispatch wiring (which model list supplies the
 *      `providerId`, and that the FAL entry is injected with `provider: "fal"`).
 *   2. The server-side FAL endpoint's credential boundary — the reference BYOK
 *      contract that later milestones must not weaken.
 *
 * Source-text assertions follow the existing convention established by
 * `packages/studio/src/components/ImageStudioAttachment.test.js`
 * (readFileSync + regex), because Image Studio is not rendered in unit tests.
 *
 * No production code was changed to make these tests pass.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { handleFalGenerationPost } from "../../../../../src/lib/falGenerationEndpoint.js";

const imageStudio = readFileSync(new URL("../../components/ImageStudio.jsx", import.meta.url), "utf8");
const runtime = readFileSync(new URL("../intelligence/ImageStudioRuntime.js", import.meta.url), "utf8");
const endpoint = readFileSync(new URL("../../../../../src/lib/falGenerationEndpoint.js", import.meta.url), "utf8");

/* ------------------------------------------------------------------ *
 * Image Studio dispatch wiring
 * ------------------------------------------------------------------ */

test("ImageStudio injects the FAL model entries with provider: \"fal\"", () => {
  // The FAL models are added to the visible model list alongside the
  // MuAPI/owner models, tagged with the `fal` transport provider.
  assert.match(imageStudio, /FAL_MODEL_IDS\.IMAGE_TO_IMAGE/);
  assert.match(imageStudio, /FAL_MODEL_IDS\.TEXT_TO_IMAGE/);
  assert.match(imageStudio, /provider:\s*"fal"/);
});

test("ImageStudio resolves the dispatch providerId from explicit routing metadata, not the owner field", () => {
  // M3 superseded the pre-M3 expression
  //   `currentModels.find(m => m.id === selectedModelId)?.provider || "muapi"`
  // because it derived transport from the model OWNER/family field. Transport now
  // comes from M1's effectiveTransport(), defaulting to muapi when undeclared.
  assert.match(
    imageStudio,
    /providerId:\s*effectiveTransport\(currentModels\.find\(\(model\)\s*=>\s*model\.id === selectedModelId\)\)/,
  );
  // The owner field must no longer be consulted for request transport. (The
  // owner-badge lookup elsewhere in the component legitimately still reads it.)
  assert.doesNotMatch(imageStudio, /providerId:\s*[^,\n]*\?\.provider/);
  assert.doesNotMatch(imageStudio, /providerId:\s*currentModels\.find/);
});

test("ImageStudio keeps the MuAPI legacy executors wired as the fallback", () => {
  assert.match(imageStudio, /legacyExecute:\s*\(\)\s*=>\s*generateI2I\(/);
  assert.match(imageStudio, /legacyExecute:\s*\(\)\s*=>\s*generateImage\(/);
});

test("ImageStudioRuntime keeps the fal branch ahead of the runtime-enabled gate", () => {
  // PINNED AS-IS: the hard-coded fal branch precedes the feature gate. This is
  // a known-imperfect baseline that M1-M5 will revisit; M0 records it.
  const falBranch = runtime.indexOf('request?.providerId === "fal"');
  const runtimeGate = runtime.indexOf("if (!imageStudioRuntimeEnabled()) return legacyExecute();");

  assert.ok(falBranch !== -1, "the fal branch exists");
  assert.ok(runtimeGate !== -1, "the runtime-enabled gate exists");
  assert.ok(falBranch < runtimeGate, "the fal branch is evaluated before the runtime gate");
});

test("ImageStudioRuntime's fal branch posts to the dedicated FAL endpoint", () => {
  assert.match(runtime, /fetch\("\/api\/generation\/fal"/);
  assert.match(runtime, /credentials:\s*"same-origin"/);
  assert.match(runtime, /operation:\s*request\.imageMode \? "image_editing" : "image_generation"/);
  assert.match(runtime, /provider:\s*"fal"/);
});

test("ImageStudioRuntime never sends an apiKey from the browser to the FAL endpoint", () => {
  const falBranchStart = runtime.indexOf('request?.providerId === "fal"');
  const falBranchEnd = runtime.indexOf("if (!imageStudioRuntimeEnabled())");
  const branch = runtime.slice(falBranchStart, falBranchEnd);

  assert.ok(branch.length > 0, "fal branch located");
  assert.doesNotMatch(branch, /apiKey/);
  assert.doesNotMatch(branch, /muapi_key/);
  assert.doesNotMatch(branch, /Authorization/i);
});

/* ------------------------------------------------------------------ *
 * Server-side FAL endpoint credential boundary (BYOK reference contract)
 * ------------------------------------------------------------------ */

/** Builds a minimal Request-alike for handleFalGenerationPost. */
function request(body) {
  return { json: async () => body, signal: undefined };
}

test("The FAL endpoint refuses a missing server-side credential", async () => {
  const response = await handleFalGenerationPost(
    request({ operation: "image_generation", inputs: { prompt: "x" } }),
    {
      identity: { accountId: "acct-1", identityKey: "creator-1" },
      credentialResolver: async () => null,
    },
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Provider credential is unavailable.",
    code: "provider_credential_required:fal",
  });
});

test("The FAL endpoint rejects a client-supplied apiKey and never forwards it", async () => {
  let providerCalled = false;
  const response = await handleFalGenerationPost(
    request({ operation: "image_generation", inputs: { prompt: "x" }, apiKey: "CLIENT-SUPPLIED-KEY" }),
    {
      identity: { accountId: "acct-1", identityKey: "creator-1" },
      credentialResolver: async () => "SERVER-SIDE-KEY",
      provider: {
        execute: async () => {
          providerCalled = true;
          return { outputReferences: ["https://fal.media/out.png"] };
        },
      },
    },
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Invalid request.", code: "invalid_request_payload" });
  assert.equal(providerCalled, false, "a client-supplied key short-circuits before execution");
});

test("The FAL endpoint requires an authenticated creator identity", async () => {
  const response = await handleFalGenerationPost(
    request({ operation: "image_generation", inputs: { prompt: "x" } }),
    { credentialResolver: async () => "KEY" },
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: "Creator OS authentication required.",
    code: "creator_os_auth_required",
  });
});

test("The FAL endpoint resolves the credential server-side, scoped to the creator and provider", async () => {
  const resolverArgs = [];
  const executed = [];

  const response = await handleFalGenerationPost(
    request({ operation: "image_generation", inputs: { prompt: "x" } }),
    {
      identity: { accountId: "acct-1", identityKey: "creator-1" },
      credentialResolver: async (args) => {
        resolverArgs.push(args);
        return "SERVER-SIDE-KEY";
      },
      provider: {
        execute: async (executionRequest) => {
          executed.push(executionRequest);
          return {
            providerResponseRef: "req-1",
            outputReferences: ["https://fal.media/out.png"],
            providerMetadata: { model: "fal-ai/flux/schnell" },
          };
        },
      },
    },
  );

  // The resolver is tenant-scoped and provider-pinned.
  assert.equal(resolverArgs.length, 1);
  assert.equal(resolverArgs[0].accountId, "acct-1");
  assert.equal(resolverArgs[0].creatorIdentityKey, "creator-1");
  assert.equal(resolverArgs[0].providerId, "fal");

  // The resolved server-side credential is what reaches the provider adapter.
  assert.equal(executed.length, 1);
  assert.equal(executed[0].apiKey, "SERVER-SIDE-KEY");

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    provider: "fal",
    requestId: "req-1",
    outputReferences: ["https://fal.media/out.png"],
    providerMetadata: { model: "fal-ai/flux/schnell" },
  });
});

test("The FAL endpoint source never reads a credential from the request body", () => {
  // The endpoint must only accept a credential from the server-side resolver.
  assert.match(endpoint, /resolveProviderCredential/);
  assert.doesNotMatch(endpoint, /body\.apiKey/);
  assert.doesNotMatch(endpoint, /body\?\.apiKey/);
});
