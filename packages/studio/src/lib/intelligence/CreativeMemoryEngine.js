import { createCreativeMemory, updateCreativeMemory } from "./CreativeMemory.js";
import { MemoryCache } from "./MemoryCache.js";
import { MemoryStorageAdapter } from "./MemoryStorageAdapter.js";
import { MEMORY_STATUSES } from "./MemoryTypes.js";

function projectionKey(request = {}) {
  return [
    request.organizationId,
    request.workspaceId,
    request.projectId,
    request.campaignId,
    request.recipeId,
    request.version || "latest",
  ].map((value) => value || "-").join(":");
}

export class CreativeMemoryEngine {
  constructor({ adapter = new MemoryStorageAdapter(), cache = new MemoryCache() } = {}) {
    this.adapter = adapter;
    this.cache = cache;
  }

  createMemory(input = {}) {
    return this.adapter.saveMemory(createCreativeMemory(input));
  }

  getMemory(memoryId) {
    return this.adapter.getMemory(memoryId);
  }

  listMemory(filters = {}) {
    return this.adapter.listMemory().filter((memory) => (
      (!filters.type || memory.type === filters.type)
      && (!filters.scope || memory.scope === filters.scope)
      && (!filters.scopeId || memory.scopeId === filters.scopeId)
      && (!filters.status || memory.status === filters.status)
    ));
  }

  updateMemory(memoryId, changes = {}) {
    this.cache.invalidate();
    return this.adapter.updateMemory(memoryId, changes);
  }

  archiveMemory(memoryId) {
    return this.updateMemory(memoryId, { status: MEMORY_STATUSES.ARCHIVED });
  }

  projectMemory(request = {}) {
    const key = projectionKey(request);
    const cached = this.cache.get(key);
    if (cached) return cached;

    const requestedTypes = Array.isArray(request.types) ? request.types : null;
    const memories = this.listMemory({ status: MEMORY_STATUSES.ACTIVE }).filter((memory) => {
      if (requestedTypes && !requestedTypes.includes(memory.type)) return false;
      if (request.scopeId && memory.scopeId && memory.scopeId !== request.scopeId) return false;
      if (request.minConfidence != null && memory.confidence < request.minConfidence) return false;
      return true;
    });

    const projection = {
      memories,
      values: memories.reduce((result, memory) => {
        result[memory.type] = memory.value;
        return result;
      }, {}),
      provenance: memories.map((memory) => ({ id: memory.id, type: memory.type, version: memory.version })),
      generatedAt: new Date().toISOString(),
      cacheKey: key,
    };
    return this.cache.set(key, projection, request.ttlMs || 0);
  }

  invalidateMemory(request = {}) {
    this.cache.invalidate(projectionKey(request));
  }
}

export const creativeMemoryEngine = new CreativeMemoryEngine();
