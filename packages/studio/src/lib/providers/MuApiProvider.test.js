import assert from "node:assert/strict";
import test from "node:test";
import { MuApiProvider } from "./MuApiProvider.js";

test("forwards the execution signal and early remote-job callback to MuAPI operations", async () => {
  const provider = new MuApiProvider();
  const signal = new AbortController().signal;
  let received;
  provider.generateImage = async (_apiKey, params) => {
    received = params;
    return { status: "submitted", request_id: "remote-image-1" };
  };

  const onProviderJobAccepted = () => {};
  const result = await provider.execute({
    operation: "image_generation",
    apiKey: "server-only-key",
    signal,
    onProviderJobAccepted,
    inputs: { model: "image-model", prompt: "test" },
  });

  assert.equal(result.status, "submitted");
  assert.equal(received.signal, signal);
  assert.equal(received.onRequestId, onProviderJobAccepted);
  assert.equal(received.prompt, "test");
  assert.equal(received.apiKey, undefined);
});
