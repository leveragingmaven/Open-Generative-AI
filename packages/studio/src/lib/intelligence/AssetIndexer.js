export class AssetIndexer {
  index() { throw new Error("AssetIndexer.index() must be implemented"); }
  search() { throw new Error("AssetIndexer.search() must be implemented"); }
}

export class InMemoryAssetIndexer extends AssetIndexer {
  constructor() { super(); this.records = []; }
  index(asset) { this.records = [...this.records.filter((record) => record.id !== asset.id), asset]; return asset; }
  search(filters = {}) {
    return this.records.filter((asset) => Object.entries(filters).every(([key, value]) => {
      if (value == null) return true;
      if (Array.isArray(asset[key])) return asset[key].includes(value);
      return asset[key] === value || asset.metadata?.[key] === value;
    }));
  }
}
