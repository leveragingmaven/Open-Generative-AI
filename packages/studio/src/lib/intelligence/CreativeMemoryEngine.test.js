import assert from "node:assert/strict";
import test from "node:test";
import { CreativeMemoryEngine } from "./CreativeMemoryEngine.js";
import { MemoryCache } from "./MemoryCache.js";
import { MemoryRegistry } from "./MemoryRegistry.js";
import { MemoryStorageAdapter } from "./MemoryStorageAdapter.js";
import { MEMORY_SCOPES, MEMORY_TYPES } from "./MemoryTypes.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("CreativeMemoryEngine stores, versions, filters, and projects scoped memory", () => {
  const engine = new CreativeMemoryEngine({
    adapter: new MemoryStorageAdapter({ storage: memoryStorage() }),
    cache: new MemoryCache(),
  });
  const brand = engine.createMemory({
    id: "memory-brand",
    type: MEMORY_TYPES.BRAND,
    scope: MEMORY_SCOPES.WORKSPACE,
    scopeId: "workspace-1",
    value: { tone: "clear" },
    confidence: 0.95,
    approved: true,
  });
  engine.createMemory({
    id: "memory-voice",
    type: MEMORY_TYPES.VOICE,
    scope: MEMORY_SCOPES.WORKSPACE,
    scopeId: "workspace-1",
    value: { style: "direct" },
    confidence: 0.8,
  });

  const projection = engine.projectMemory({
    workspaceId: "workspace-1",
    recipeId: "image",
    types: [MEMORY_TYPES.BRAND],
    minConfidence: 0.9,
  });
  const updated = engine.updateMemory(brand.id, { value: { tone: "warm" } });

  assert.equal(projection.memories.length, 1);
  assert.deepEqual(projection.values.brand, { tone: "clear" });
  assert.equal(updated.version, 2);
  assert.equal(engine.listMemory({ type: MEMORY_TYPES.VOICE }).length, 1);
});

test("MemoryRegistry supports extensible memory types", () => {
  const registry = new MemoryRegistry();
  const definition = registry.registerType("legal", { name: "Legal Context" });
  assert.equal(definition.name, "Legal Context");
  assert.equal(registry.getType("legal").id, "legal");
  assert.ok(registry.listTypes().some((type) => type.id === "legal"));
});
