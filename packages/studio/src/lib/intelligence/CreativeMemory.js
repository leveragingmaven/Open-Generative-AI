import { MEMORY_SCOPES, MEMORY_STATUSES, MEMORY_TYPES, isMemoryScope, isMemoryType } from "./MemoryTypes.js";

const now = () => new Date().toISOString();

export function createCreativeMemory(input = {}) {
  const createdAt = input.createdAt || now();
  return {
    id: input.id || `memory-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: isMemoryType(input.type) ? input.type : MEMORY_TYPES.BRAND,
    scope: isMemoryScope(input.scope) ? input.scope : MEMORY_SCOPES.WORKSPACE,
    scopeId: input.scopeId || null,
    value: input.value ?? null,
    sourceReferences: Array.isArray(input.sourceReferences) ? [...input.sourceReferences] : [],
    version: input.version ?? 1,
    confidence: input.confidence ?? 0.5,
    approved: Boolean(input.approved),
    status: input.status || MEMORY_STATUSES.ACTIVE,
    effectiveFrom: input.effectiveFrom || createdAt,
    effectiveUntil: input.effectiveUntil || null,
    supersedes: input.supersedes || null,
    createdAt,
    updatedAt: input.updatedAt || createdAt,
    metadata: input.metadata && typeof input.metadata === "object" ? { ...input.metadata } : {},
  };
}

export function updateCreativeMemory(memory, changes = {}) {
  return createCreativeMemory({
    ...memory,
    ...changes,
    id: memory?.id,
    createdAt: memory?.createdAt,
    version: changes.version ?? ((memory?.version || 1) + 1),
    updatedAt: now(),
  });
}
