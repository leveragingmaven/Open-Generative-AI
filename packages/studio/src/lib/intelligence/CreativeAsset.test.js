import assert from "node:assert/strict";
import test from "node:test";
import {
  cloneCreativeAsset,
  createCreativeAsset,
  deserializeCreativeAsset,
  serializeCreativeAsset,
} from "./CreativeAsset.js";

test("creative assets provide canonical defaults and generation metadata", () => {
  const asset = createCreativeAsset({
    id: "asset-1",
    recipe: "image",
    prompt: "A product image",
    generatedFiles: ["https://example.test/image.jpg"],
    tags: ["Product"],
  });

  assert.equal(asset.id, "asset-1");
  assert.equal(asset.recipe, "image");
  assert.deepEqual(asset.generatedFiles, ["https://example.test/image.jpg"]);
  assert.equal(asset.version, 1);
  assert.equal(asset.favorite, false);
});

test("creative assets serialize, deserialize, and clone with version lineage", () => {
  const asset = createCreativeAsset({ id: "asset-1", prompt: "Original" });
  const restored = deserializeCreativeAsset(serializeCreativeAsset(asset));
  const clone = cloneCreativeAsset(asset, { prompt: "Variant" });

  assert.deepEqual(restored, asset);
  assert.notEqual(clone.id, asset.id);
  assert.equal(clone.parentAsset, asset.id);
  assert.equal(clone.version, 2);
  assert.equal(clone.prompt, "Variant");
});
