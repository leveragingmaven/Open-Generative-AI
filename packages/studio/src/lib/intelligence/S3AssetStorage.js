import { AssetStorage } from "./AssetStorage.js";

export class S3AssetStorage extends AssetStorage {
  constructor({ client, bucket, publicBaseUrl = null, signer = null } = {}) {
    super();
    if (!client || !bucket) throw new Error("S3AssetStorage requires an injected client and bucket");
    this.client = client;
    this.bucket = bucket;
    this.publicBaseUrl = publicBaseUrl;
    this.signer = signer;
  }

  async putObject({ key, body, contentType, metadata = {} }) {
    await this.client.putObject({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType, Metadata: metadata });
    const head = await this.client.headObject({ Bucket: this.bucket, Key: key });
    return { key, contentType: head.ContentType || contentType, sizeBytes: head.ContentLength, checksum: head.ETag || null, metadata: head.Metadata || metadata };
  }

  async getMetadata(key) {
    try {
      const head = await this.client.headObject({ Bucket: this.bucket, Key: key });
      return { key, contentType: head.ContentType, sizeBytes: head.ContentLength, checksum: head.ETag || null, metadata: head.Metadata || {} };
    } catch { return null; }
  }

  async exists(key) { return Boolean(await this.getMetadata(key)); }
  async deleteObject(key) { await this.client.deleteObject({ Bucket: this.bucket, Key: key }); return true; }
  async createDeliveryReference(key) { return this.publicBaseUrl ? `${this.publicBaseUrl.replace(/\/$/, "")}/${key}` : `storage://${key}`; }
  async createSignedDeliveryReference(key, options = {}) {
    if (!this.signer) throw new Error("S3AssetStorage signer is not configured");
    return this.signer({ bucket: this.bucket, key, ...options });
  }
}
