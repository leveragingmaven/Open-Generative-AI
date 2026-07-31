import { createCampaign } from "./Campaign.js";
import { createCampaignAsset } from "./CampaignAsset.js";
import { CAMPAIGN_STATUS, isCampaignStatus } from "./CampaignStatus.js";
import { storageRegistry } from "./StorageRegistry.js";

export class CampaignManager {
  constructor({ adapter, adapterName } = {}) {
    this.adapter = adapter || (adapterName ? storageRegistry.getAdapter(adapterName) : storageRegistry.getDefaultAdapter());
  }

  createCampaign(input = {}) {
    return this.adapter.saveCampaign(createCampaign(input));
  }

  updateCampaign(campaignId, changes = {}) {
    return this.adapter.updateCampaign(campaignId, changes);
  }

  deleteCampaign(campaignId) {
    return this.adapter.removeCampaign(campaignId);
  }

  cloneCampaign(campaignId, overrides = {}) {
    return this.adapter.cloneCampaign(campaignId, overrides);
  }

  getCampaign(campaignId) {
    return this.adapter.getCampaign(campaignId);
  }

  listCampaigns() {
    return this.adapter.listCampaigns();
  }

  addAsset(campaignId, assetInput) {
    const campaign = this.getCampaign(campaignId);
    if (!campaign) return null;
    const relationship = createCampaignAsset({ ...assetInput, campaignId, assetId: assetInput.assetId });
    const assets = [...campaign.assets.filter((asset) => asset.assetId !== relationship.assetId), relationship];
    return this.updateCampaign(campaignId, { assets });
  }

  removeAsset(campaignId, assetId) {
    const campaign = this.getCampaign(campaignId);
    if (!campaign) return null;
    return this.updateCampaign(campaignId, {
      assets: campaign.assets.filter((asset) => asset.assetId !== assetId),
    });
  }

  updateStatus(campaignId, status) {
    if (!isCampaignStatus(status)) throw new Error(`Unknown campaign status: ${status}`);
    return this.updateCampaign(campaignId, { status });
  }
}

export const localCampaignManager = new CampaignManager();
