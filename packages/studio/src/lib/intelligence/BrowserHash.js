const HEX = "0123456789abcdef";

function bytesFrom(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (typeof value === "string") return new TextEncoder().encode(value);
  return new Uint8Array(value || []);
}

function fallbackHash(value) {
  const bytes = bytesFrom(value);
  let hash = 2166136261;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  let output = "";
  for (let index = 0; index < 8; index += 1) {
    hash = Math.imul(hash ^ (hash >>> 13), 2246822519);
    output += HEX[(hash >>> 28) & 15] + HEX[(hash >>> 24) & 15];
    output += HEX[(hash >>> 20) & 15] + HEX[(hash >>> 16) & 15];
    output += HEX[(hash >>> 12) & 15] + HEX[(hash >>> 8) & 15];
    output += HEX[(hash >>> 4) & 15] + HEX[hash & 15];
  }
  return output;
}

export async function sha256(value) {
  const bytes = bytesFrom(value);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return fallbackHash(bytes);
  const digest = await subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
