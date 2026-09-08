import { readJson, writeJson } from "../assets/storageManager.js";
import { createCreativeMemory, updateCreativeMemory } from "./CreativeMemory.js";
import { StorageAdapter } from "./StorageAdapter.js";

export class MemoryStorageAdapter extends StorageAdapter {
  constructor({ key = "creative_memory", limit = 1000, storage } = {}) {
    super();
    this.key = key;
    this.limit = limit;
    this.storage = storage;
  }

  listMemory() {
    const values = readJson(this.key, [], this.storage);
    return Array.isArray(values) ? values : [];
  }

  getMemory(memoryId) {
    return this.listMemory().find((memory) => memory.id === memoryId) || null;
  }

  saveMemory(memory) {
    const normalized = createCreativeMemory(memory);
    const values = [normalized, ...this.listMemory().filter((item) => item.id !== normalized.id)].slice(0, this.limit);
    writeJson(this.key, values, this.storage);
    return normalized;
  }

  updateMemory(memoryId, changes = {}) {
    const existing = this.getMemory(memoryId);
    return existing ? this.saveMemory(updateCreativeMemory(existing, changes)) : null;
  }

  removeMemory(memoryId) {
    const existing = this.listMemory();
    const values = existing.filter((memory) => memory.id !== memoryId);
    writeJson(this.key, values, this.storage);
    return values.length !== existing.length;
  }
}
