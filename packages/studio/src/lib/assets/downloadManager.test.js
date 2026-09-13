import test from "node:test";
import assert from "node:assert/strict";
import { downloadAsset } from "./downloadManager.js";

function withBrowserMocks(fetchImpl, testBody) {
  const originalFetch = globalThis.fetch;
  const originalDocument = globalThis.document;
  const originalUrl = globalThis.URL;
  const clicked = [];
  globalThis.fetch = fetchImpl;
  globalThis.document = {
    body: {
      appendChild(node) { node.parent = this; },
      removeChild(node) { node.parent = null; },
    },
    createElement() {
      return { click() { clicked.push(this); } };
    },
  };
  globalThis.URL = {
    createObjectURL() { return "blob:generated"; },
    revokeObjectURL() {},
  };
  return Promise.resolve(testBody(clicked)).finally(() => {
    globalThis.fetch = originalFetch;
    globalThis.document = originalDocument;
    globalThis.URL = originalUrl;
  });
}

test("downloadAsset downloads generated image blobs with the requested filename", async () => {
  const result = await withBrowserMocks(
    async () => ({ ok: true, async blob() { return new Blob(["image"]); } }),
    async (clicked) => {
      const result = await downloadAsset("https://fal.media/image.png", { filename: "generated.jpg", kind: "image" });
      assert.equal(result.method, "blob");
      assert.equal(clicked[0].download, "generated.jpg");
      assert.equal(clicked[0].href, "blob:generated");
    },
  );
  assert.equal(result, undefined);
});

test("downloadAsset uses a direct download fallback when remote fetch is unavailable", async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    await withBrowserMocks(
      async () => { throw new Error("cors"); },
      async (clicked) => {
        const result = await downloadAsset("https://fal.media/image", { filename: "generated.jpg", kind: "image" });
        assert.equal(result.method, "direct");
        assert.equal(clicked[0].download, "generated.jpg");
        assert.equal(clicked[0].href, "https://fal.media/image");
      },
    );
  } finally {
    console.warn = originalWarn;
  }
});
