import { MEMORY_TYPES } from "./MemoryTypes.js";

class MemoryRegistry {
  constructor() {
    this.types = new Map(Object.values(MEMORY_TYPES).map((type) => [type, { id: type, name: type }]));
  }

  registerType(type, definition = {}) {
    if (!type) throw new Error("Memory type is required");
    this.types.set(type, { id: type, ...definition });
    return this.types.get(type);
  }

  getType(type) {
    return this.types.get(type) || null;
  }

  listTypes() {
    return [...this.types.values()];
  }
}

export const memoryRegistry = new MemoryRegistry();
export { MemoryRegistry };
