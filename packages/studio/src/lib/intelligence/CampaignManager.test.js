import assert from "node:assert/strict";
import test from "node:test";
import { CampaignManager } from "./CampaignManager.js";
import { LocalStorageAdapter } from "./LocalStorageAdapter.js";
import { CAMPAIGN_STATUS } from "./CampaignStatus.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("CampaignManager provides CRUD, status, cloning, and asset relationships", () => {
  const manager = new CampaignManager({ adapter: new LocalStorageAdapter({ storage: memoryStorage() }) });
  const campaign = manager.createCampaign({ name: "Spring Launch", goal: "Awareness" });
  const updated = manager.updateStatus(campaign.id, CAMPAIGN_STATUS.PLANNING);
  const withAsset = manager.addAsset(campaign.id, { assetId: "asset-1", role: "hero", hero: true });
  const clone = manager.cloneCampaign(campaign.id, { name: "Spring Launch Variant" });

  assert.equal(updated.status, "planning");
  assert.equal(withAsset.assets[0].assetId, "asset-1");
  assert.equal(withAsset.assets[0].hero, true);
  assert.equal(clone.parentCampaign, campaign.id);
  assert.equal(manager.removeAsset(campaign.id, "asset-1").assets.length, 0);
  assert.equal(manager.deleteCampaign(campaign.id), true);
  assert.equal(manager.getCampaign(campaign.id), null);
});

test("CampaignManager rejects unknown status values", () => {
  const manager = new CampaignManager({ adapter: new LocalStorageAdapter({ storage: memoryStorage() }) });
  const campaign = manager.createCampaign({ name: "Campaign" });
  assert.throws(() => manager.updateStatus(campaign.id, "publishing"), /Unknown campaign status/);
});
