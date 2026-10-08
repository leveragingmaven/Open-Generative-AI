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

test("downloadAsset refuses an HTML error body instead of saving it as an image", async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    await withBrowserMocks(
      async () => ({ ok: true, headers: { get: () => "text/html" }, async blob() { return new Blob(["<html>login</html>"], { type: "text/html" }); } }),
      async (clicked) => {
        const result = await downloadAsset("https://fal.media/expired-image", { filename: "generated.jpg", kind: "image" });
        assert.deepEqual(result, { ok: false, reason: "asset_unavailable" });
        assert.equal(clicked.length, 0);
      },
    );
  } finally {
    console.warn = originalWarn;
  }
});

test("downloadAsset uses a direct download fallback when remote fetch is unavailable", async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    await withBrowserMocks(
      async () => { throw new Error("cors"); },
      async (clicked) => {
        const result = await downloadAsset("https://fal.media/image", { filename: "generated.jpg", kind: "image" });
        assert.deepEqual(result, { ok: false, reason: "fetch_failed" });
        assert.equal(clicked.length, 0, "a failed fetch must not trigger an unverified direct download");
      },
    );
  } finally {
    console.warn = originalWarn;
  }
});
