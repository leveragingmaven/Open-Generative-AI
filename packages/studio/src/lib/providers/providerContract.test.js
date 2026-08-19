import assert from "node:assert/strict";
import test from "node:test";
import { MuApiProvider } from "./MuApiProvider.js";
import { OpenAICompatibleProvider } from "./OpenAICompatibleProvider.js";

const SECRET = "server-only-provider-secret";

function muApiFixture({ failure = false } = {}) {
  const provider = new MuApiProvider();
  const signal = new AbortController().signal;
  const observed = {};
  provider.generateImage = async (apiKey, params) => {
    Object.assign(observed, { apiKey, params });
    if (failure) throw Object.assign(new Error(`upstream payload ${SECRET}`), { code: "provider_upstream_failed" });
    return { id: "muapi-response-1", status: "completed", outputs: ["https://provider.test/image.png"], usage: { credits: 2 } };
  };
  return {
    provider,
    signal,
    request: { operation: "image_generation", apiKey: SECRET, signal, inputs: { model: "image-model", prompt: "A product image" } },
    observed,
  };
}

function openAiFixture({ failure = false } = {}) {
  const signal = new AbortController().signal;
  const observed = {};
  const provider = new OpenAICompatibleProvider({
    config: { endpoint: "https://provider.test", model: "configured-model", serverKey: null },
    fetchImpl: async (url, options) => {
      Object.assign(observed, { url, options, body: JSON.parse(options.body) });
      if (failure) throw Object.assign(new Error(`upstream payload ${SECRET}`), { code: "provider_upstream_failed" });
      return {
        ok: true,
        json: async () => ({ id: "openai-response-1", choices: [{ message: { content: "A generated caption" } }], usage: { total_tokens: 7 } }),
      };
    },
  });
  return {
    provider,
    signal,
    request: { operation: "text_generation", apiKey: SECRET, signal, inputs: { prompt: "Write a caption" } },
    observed,
  };
}

function runProviderContractSuite({ name, createFixture }) {
  test(`${name} satisfies the normalized provider contract`, async () => {
    const fixture = createFixture();
    const result = await fixture.provider.execute(fixture.request);

    assert.equal(result.provider, fixture.provider.id);
    assert.equal(typeof result.providerResponseRef, "string");
    assert.ok(result.usage && typeof result.usage === "object");
    assert.ok(Array.isArray(result.outputs));
    assert.ok(Array.isArray(result.outputReferences));
    assert.equal(fixture.observed.params?.prompt || fixture.observed.body?.messages?.at(-1)?.content, fixture.request.inputs.prompt);
    assert.equal(fixture.observed.params?.signal || fixture.observed.options?.signal, fixture.signal);
    assert.equal(JSON.stringify(result).includes(SECRET), false);
  });

  test(`${name} normalizes provider failures without exposing secrets`, async () => {
    const fixture = createFixture({ failure: true });
    await assert.rejects(
      fixture.provider.execute(fixture.request),
      (error) => {
        assert.equal(error.code, "provider_upstream_failed");
        assert.equal(error.message, "Provider execution failed.");
        assert.equal(error.message.includes(SECRET), false);
        return true;
      },
    );
  });
}

runProviderContractSuite({ name: "MuAPI", createFixture: muApiFixture });
runProviderContractSuite({ name: "OpenAI-compatible", createFixture: openAiFixture });
