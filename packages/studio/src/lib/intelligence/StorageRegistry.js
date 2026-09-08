import { LocalStorageAdapter } from "./LocalStorageAdapter.js";

class StorageRegistry {
  constructor() {
    this.adapters = new Map();
    this.defaultAdapterName = null;
    this.registerAdapter("local", new LocalStorageAdapter());
    this.setDefaultAdapter("local");
  }

  registerAdapter(name, adapter) {
    if (!name || !adapter) throw new Error("Storage adapter name and implementation are required");
    this.adapters.set(name, adapter);
    return adapter;
  }

  getAdapter(name) {
    const adapter = this.adapters.get(name);
    if (!adapter) throw new Error(`Unknown storage adapter: ${name}`);
    return adapter;
  }

  setDefaultAdapter(name) {
    this.getAdapter(name);
    this.defaultAdapterName = name;
  }

  getDefaultAdapter() {
    return this.getAdapter(this.defaultAdapterName);
  }
}

export const storageRegistry = new StorageRegistry();
export { StorageRegistry };
