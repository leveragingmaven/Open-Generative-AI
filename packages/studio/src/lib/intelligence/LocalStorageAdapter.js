import { readJson, writeJson } from "../assets/storageManager.js";
import { cloneCreativeAsset, createCreativeAsset, updateCreativeAsset } from "./CreativeAsset.js";
import { StorageAdapter } from "./StorageAdapter.js";
import { cloneCampaign, createCampaign, updateCampaign } from "./Campaign.js";

export class LocalStorageAdapter extends StorageAdapter {
  constructor({ key = "creative_library", limit = 200, storage } = {}) {
    super();
    this.key = key;
    this.limit = limit;
    this.storage = storage;
    this.campaignKey = "creative_campaigns";
  }

  listAssets() {
    const assets = readJson(this.key, [], this.storage);
    return Array.isArray(assets) ? assets : [];
  }

  getAsset(assetId) {
    return this.listAssets().find((asset) => asset.id === assetId) || null;
  }

  saveAsset(asset) {
    const normalized = createCreativeAsset(asset);
    const assets = [normalized, ...this.listAssets().filter((item) => item.id !== normalized.id)].slice(0, this.limit);
    writeJson(this.key, assets, this.storage);
    return normalized;
  }

  updateAsset(assetId, changes = {}) {
    const existing = this.getAsset(assetId);
    if (!existing) return null;
    return this.saveAsset(updateCreativeAsset(existing, { ...changes, id: assetId }));
  }

  removeAsset(assetId) {
    const existing = this.listAssets();
    const assets = existing.filter((asset) => asset.id !== assetId);
    writeJson(this.key, assets, this.storage);
    return assets.length !== existing.length;
  }

  cloneAsset(assetId, overrides = {}) {
    const existing = this.getAsset(assetId);
    if (!existing) return null;
    return this.saveAsset(cloneCreativeAsset(existing, overrides));
  }

  listCampaigns() {
    const campaigns = readJson(this.campaignKey, [], this.storage);
    return Array.isArray(campaigns) ? campaigns : [];
  }

  getCampaign(campaignId) {
    return this.listCampaigns().find((campaign) => campaign.id === campaignId) || null;
  }

  saveCampaign(campaign) {
    const normalized = createCampaign(campaign);
    const campaigns = [normalized, ...this.listCampaigns().filter((item) => item.id !== normalized.id)].slice(0, this.limit);
    writeJson(this.campaignKey, campaigns, this.storage);
    return normalized;
  }

  updateCampaign(campaignId, changes = {}) {
    const existing = this.getCampaign(campaignId);
    return existing ? this.saveCampaign(updateCampaign(existing, { ...changes, id: campaignId })) : null;
  }

  removeCampaign(campaignId) {
    const existing = this.listCampaigns();
    const campaigns = existing.filter((campaign) => campaign.id !== campaignId);
    writeJson(this.campaignKey, campaigns, this.storage);
    return campaigns.length !== existing.length;
  }

  cloneCampaign(campaignId, overrides = {}) {
    const existing = this.getCampaign(campaignId);
    return existing ? this.saveCampaign(cloneCampaign(existing, overrides)) : null;
  }
}
