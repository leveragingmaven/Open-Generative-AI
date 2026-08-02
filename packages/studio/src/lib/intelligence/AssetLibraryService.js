import { createCreativeAsset } from "./CreativeAsset.js";

const LEGACY_HISTORY_KEYS = [
  "hg_image_studio_persistent", "hg_video_studio_persistent", "hg_cinema_studio_persistent",
  "hg_marketing_studio_persistent", "hg_audio_studio_persistent", "hg_lipsync_studio_persistent",
  "hg_recast_studio_persistent", "hg_vibe_motion_studio_persistent",
];

function legacyAssets(storage = globalThis?.localStorage) {
  if (!storage) return [];
  return LEGACY_HISTORY_KEYS.flatMap((key) => {
    try {
      const raw = storage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const values = Array.isArray(parsed)
        ? parsed
        : parsed?.localHistory || parsed?.history || parsed?.internalHistory || (Array.isArray(parsed.items) ? parsed.items : []) || [];
      return values.map((item) => {
        const normalized = createCreativeAsset({
          ...item,
          id: item.id || `legacy-${key}-${item.url}`,
          title: item.title || item.prompt || "Legacy Creative Asset",
          generatedFiles: item.generatedFiles || (item.url ? [item.url] : []),
        });
        if (item.campaignId != null) normalized.campaignId = item.campaignId;
        if (item.campaign != null) normalized.campaign = item.campaign;
        if (item.metadata && typeof item.metadata === "object") {
          normalized.metadata = { ...item.metadata, legacyHistoryKey: key };
        }
        return normalized;
      });
    } catch { return []; }
  });
}

function assetType(asset) {
  return asset.metadata?.assetType || asset.kind || asset.type || asset.metadata?.studio || "creative";
}

export class AssetLibraryService {
  constructor({ repository, indexer, storage = globalThis?.localStorage } = {}) {
    this.repository = repository;
    this.indexer = indexer;
    this.storage = storage;
  }

  list(options = {}) {
    const canonical = this.repository?.list?.() || this.repository?.listAssets?.() || [];
    const legacy = options.includeLegacy === false ? [] : legacyAssets(this.storage);
    const seen = new Set();
    return [...canonical, ...legacy].filter((asset) => {
      if (seen.has(asset.id)) return false;
      seen.add(asset.id);
      return true;
    });
  }

  search({ query = "", sort = "newest", includeLegacy = true, ...filters } = {}) {
    let assets = this.list({ includeLegacy });
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery) assets = assets.filter((asset) => JSON.stringify(asset).toLowerCase().includes(normalizedQuery));
    assets = assets.filter((asset) => Object.entries(filters).every(([key, value]) => {
      if (value == null || value === "all") return true;
      if (key === "favorites") return Boolean(asset.favorite) === value;
      if (key === "archived") return Boolean(asset.archived) === value;
      if (key === "type") return assetType(asset) === value || (value === "marketing" && asset.metadata?.studio === "marketing") || (value === "workflow" && asset.metadata?.studio === "workflow");
      if (key === "date") return String(asset.createdAt || "").startsWith(value);
      return asset[key] === value || asset.metadata?.[key] === value;
    }));
    return assets.sort((a, b) => {
      if (sort === "oldest") return String(a.createdAt).localeCompare(String(b.createdAt));
      if (sort === "updated") return String(b.updatedAt).localeCompare(String(a.updatedAt));
      if (sort === "type") return String(a.metadata?.assetType || "").localeCompare(String(b.metadata?.assetType || ""));
      if (sort === "provider") return String(a.provider || "").localeCompare(String(b.provider || ""));
      if (sort === "model") return String(a.model || "").localeCompare(String(b.model || ""));
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
  }

  get(assetId) { return this.list().find((asset) => asset.id === assetId) || null; }
  update(assetId, changes) { return this.repository?.update?.(assetId, changes) || null; }
  setFavorite(assetId, favorite = true) { return this.update(assetId, { favorite }); }
  setArchived(assetId, archived = true) { return this.update(assetId, { archived }); }
  lineage(assetId) {
    const asset = this.get(assetId);
    if (!asset) return { asset: null, parent: null, children: [] };
    const all = this.list();
    return { asset, parent: all.find((item) => item.id === asset.parentAsset) || null, children: all.filter((item) => item.parentAsset === assetId) };
  }
}
