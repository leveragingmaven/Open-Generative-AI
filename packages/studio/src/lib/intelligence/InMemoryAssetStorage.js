import { AssetStorage } from "./AssetStorage.js";
import { sha256 } from "./BrowserHash.js";

export class InMemoryAssetStorage extends AssetStorage {
  constructor() { super(); this.objects = new Map(); }

  async putObject({ key, body, contentType = "application/octet-stream", metadata = {} }) {
    const buffer = body instanceof Uint8Array ? body : new Uint8Array(body || []);
    const checksum = await sha256(buffer);
    const object = { key, body: buffer, contentType, sizeBytes: buffer.length, checksum, metadata: { ...metadata } };
    this.objects.set(key, object);
    return { key, contentType, sizeBytes: object.sizeBytes, checksum, metadata: object.metadata };
  }

  async getMetadata(key) {
    const object = this.objects.get(key);
    return object ? { key: object.key, contentType: object.contentType, sizeBytes: object.sizeBytes, checksum: object.checksum, metadata: object.metadata } : null;
  }

  async exists(key) { return this.objects.has(key); }
  async deleteObject(key) { return this.objects.delete(key); }
  async createDeliveryReference(key) { return `storage://${key}`; }
  async createSignedDeliveryReference(key, { expiresInSeconds = 300 } = {}) { return `storage+signed://${key}?expires=${expiresInSeconds}`; }
}
