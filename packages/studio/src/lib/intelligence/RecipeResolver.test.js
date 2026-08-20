import assert from "node:assert/strict";
import test from "node:test";
import {
  CANONICAL_OPERATION_DEFAULT_RECIPES,
  RecipeResolver,
} from "./RecipeResolver.js";

test("canonical image operations expose only the established default recipes", () => {
  const resolver = new RecipeResolver();
  assert.deepEqual(CANONICAL_OPERATION_DEFAULT_RECIPES, {
    image_generation: "image",
    image_editing: "image-edit",
  });
  assert.equal(resolver.defaultRecipeIdForOperation("image_generation"), "image");
  assert.equal(resolver.defaultRecipeIdForOperation("image_editing"), "image-edit");
  assert.equal(resolver.defaultRecipeIdForOperation("video_generation"), null);
  assert.equal(resolver.defaultRecipeIdForOperation("unknown_operation"), null);
});

test("canonical recipe IDs resolve without breaking existing registry keys", () => {
  const resolver = new RecipeResolver();
  assert.equal(resolver.resolve("image-edit").id, "image-edit");
  assert.equal(resolver.resolve("imageEdit").id, "image-edit");
  assert.equal(resolver.compile("image-edit").id, "image-edit");
  assert.deepEqual(resolver.compile("image-edit").capabilityRequirements, ["image_editing", "reference_images"]);
});

test("a configured default missing from the registry fails through existing recipe validation", () => {
  const resolver = new RecipeResolver({
    recipes: { image: { id: "image" } },
    operationDefaults: { image_editing: "missing-image-edit" },
  });
  assert.equal(resolver.defaultRecipeIdForOperation("image_editing"), "missing-image-edit");
  assert.throws(() => resolver.resolve("missing-image-edit"), /Unknown creative recipe/);
});
