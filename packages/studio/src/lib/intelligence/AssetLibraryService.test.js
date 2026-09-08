import assert from "node:assert/strict";
import test from "node:test";
import { AssetLibraryService } from "./AssetLibraryService.js";

test("AssetLibraryService searches, filters, sorts, and resolves lineage", () => {
  const parent = { id: "parent", title: "Hero", provider: "muapi", recipe: "image", createdAt: "2026-01-01", generatedFiles: ["hero"] };
  const child = { id: "child", title: "Edited Hero", provider: "muapi", recipe: "imageEdit", parentAsset: "parent", createdAt: "2026-01-02", generatedFiles: ["edited"] };
  const service = new AssetLibraryService({ repository: { list: () => [parent, child], update: (id, changes) => ({ ...(id === "parent" ? parent : child), ...changes }) }, storage: null });

  assert.equal(service.search({ query: "edited" }).length, 1);
  assert.equal(service.search({ recipe: "image" }).length, 1);
  assert.equal(service.search({ sort: "oldest" })[0].id, "parent");
  assert.equal(service.lineage("parent").children[0].id, "child");
  assert.equal(service.setFavorite("parent", true).favorite, true);
});
