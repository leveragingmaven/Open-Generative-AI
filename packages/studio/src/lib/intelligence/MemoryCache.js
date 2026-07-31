export class MemoryCache {
  constructor() {
    this.values = new Map();
  }

  get(key) {
    const entry = this.values.get(key);
    if (!entry || (entry.expiresAt && entry.expiresAt <= Date.now())) {
      this.values.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key, value, ttlMs = 0) {
    this.values.set(key, { value, expiresAt: ttlMs ? Date.now() + ttlMs : 0 });
    return value;
  }

  invalidate(prefix = "") {
    for (const key of this.values.keys()) {
      if (!prefix || key.startsWith(prefix)) this.values.delete(key);
    }
  }
}
