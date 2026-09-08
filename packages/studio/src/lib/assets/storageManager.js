export function readJson(key, fallback = null, storage = globalThis?.localStorage) {
  if (!key || !storage) return fallback;
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    console.warn(`[storageManager] Failed to read ${key}:`, err);
    return fallback;
  }
}

export function writeJson(key, value, storage = globalThis?.localStorage) {
  if (!key || !storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn(`[storageManager] Failed to write ${key}:`, err);
    return false;
  }
}

export function removeItem(key, storage = globalThis?.localStorage) {
  if (!key || !storage) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch (err) {
    console.warn(`[storageManager] Failed to remove ${key}:`, err);
    return false;
  }
}
