export class AssetRepository {
  save() { throw new Error("AssetRepository.save() must be implemented"); }
  get() { throw new Error("AssetRepository.get() must be implemented"); }
  list() { throw new Error("AssetRepository.list() must be implemented"); }
  update() { throw new Error("AssetRepository.update() must be implemented"); }
}

export class InMemoryAssetRepository extends AssetRepository {
  constructor() { super(); this.assets = new Map(); }
  save(asset) { this.assets.set(asset.id, asset); return asset; }
  get(assetId) { return this.assets.get(assetId) || null; }
  list() { return [...this.assets.values()]; }
  update(assetId, changes) { const asset = this.get(assetId); return asset ? this.save({ ...asset, ...changes }) : null; }
}
