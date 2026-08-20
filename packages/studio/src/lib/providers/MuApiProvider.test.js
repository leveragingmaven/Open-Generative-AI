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

test("maps one canonical image reference to MuAPI image_url", async () => {
  const provider = new MuApiProvider();
  let received;
  provider.generateImage = async (_apiKey, params) => { received = params; return { status: "completed" }; };

  await provider.execute({
    operation: "image_generation",
    inputs: { model: "nano-banana-pro", prompt: "Use the avatar" },
    references: [{ url: "https://cdn.example.test/avatar.png" }],
  });

  assert.equal(received.image_url, "https://cdn.example.test/avatar.png");
  assert.equal(received.images_list, undefined);
});

test("maps multiple canonical image references to MuAPI images_list", async () => {
  const provider = new MuApiProvider();
  let received;
  provider.generateImage = async (_apiKey, params) => { received = params; return { status: "completed" }; };

  await provider.execute({
    operation: "image_generation",
    inputs: { model: "nano-banana-pro", prompt: "Use the references" },
    references: ["https://cdn.example.test/avatar.png"],
    attachments: ["https://cdn.example.test/site.png"],
  });

  assert.deepEqual(received.images_list, [
    "https://cdn.example.test/avatar.png",
    "https://cdn.example.test/site.png",
  ]);
  assert.equal(received.image_url, undefined);
});

test("preserves explicit image inputs and leaves Ideogram v3 T2I reference-free", async () => {
  const provider = new MuApiProvider();
  const received = [];
  provider.generateImage = async (_apiKey, params) => { received.push(params); return { status: "completed" }; };

  await provider.execute({
    operation: "image_generation",
    inputs: { model: "nano-banana-pro", prompt: "Explicit image", image_url: "https://cdn.example.test/explicit.png" },
    references: ["https://cdn.example.test/canonical.png"],
  });
  await provider.execute({
    operation: "image_generation",
    inputs: { model: "ideogram-v3-t2i", prompt: "Ideogram prompt" },
    references: ["https://cdn.example.test/canonical.png"],
  });

  assert.equal(received[0].image_url, "https://cdn.example.test/explicit.png");
  assert.equal(received[0].images_list, undefined);
  assert.equal(received[1].image_url, undefined);
  assert.equal(received[1].images_list, undefined);
});

test("maps canonical image-edit inputs while preserving prompt and reference adaptation", async () => {
  const provider = new MuApiProvider();
  let received;
  provider.generateI2I = async (_apiKey, params) => { received = params; return { status: "completed" }; };

  await provider.execute({
    operation: "image_editing",
    inputs: { model: "nano-banana-pro-edit", prompt: "Edit the avatar", aspectRatio: "1:1" },
    references: ["https://cdn.example.test/avatar.png"],
  });

  assert.equal(received.prompt, "Edit the avatar");
  assert.equal(received.aspect_ratio, "1:1");
  assert.equal(received.aspectRatio, undefined);
  assert.deepEqual(received.images_list, ["https://cdn.example.test/avatar.png"]);
});

test("explicit provider-compatible image-edit aspect ratio takes precedence over canonical input", async () => {
  const provider = new MuApiProvider();
  let received;
  provider.generateI2I = async (_apiKey, params) => { received = params; return { status: "completed" }; };

  await provider.execute({
    operation: "image_editing",
    inputs: {
      model: "nano-banana-pro-edit",
      prompt: "Edit the avatar",
      aspectRatio: "1:1",
      aspect_ratio: "4:3",
    },
    references: ["https://cdn.example.test/avatar.png"],
  });

  assert.equal(received.aspect_ratio, "4:3");
  assert.equal(received.aspectRatio, undefined);
  assert.deepEqual(received.images_list, ["https://cdn.example.test/avatar.png"]);
});

test("generic image generation inputs retain their existing adaptation behavior", async () => {
  const provider = new MuApiProvider();
  let received;
  provider.generateImage = async (_apiKey, params) => { received = params; return { status: "completed" }; };

  await provider.execute({
    operation: "image_generation",
    inputs: { model: "nano-banana-pro", prompt: "Create an avatar", aspectRatio: "1:1" },
    references: ["https://cdn.example.test/avatar.png"],
  });

  assert.equal(received.prompt, "Create an avatar");
  assert.equal(received.aspectRatio, "1:1");
  assert.equal(received.aspect_ratio, undefined);
  assert.equal(received.image_url, "https://cdn.example.test/avatar.png");
});
