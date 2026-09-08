export class AssetStorage {
  async putObject() { throw new Error("AssetStorage.putObject() must be implemented"); }
  async getMetadata() { throw new Error("AssetStorage.getMetadata() must be implemented"); }
  async exists() { throw new Error("AssetStorage.exists() must be implemented"); }
  async deleteObject() { throw new Error("AssetStorage.deleteObject() must be implemented"); }
  async createDeliveryReference() { throw new Error("AssetStorage.createDeliveryReference() must be implemented"); }
  async createSignedDeliveryReference() { throw new Error("AssetStorage.createSignedDeliveryReference() must be implemented"); }
}
