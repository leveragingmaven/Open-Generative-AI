import assert from "node:assert/strict";
import test from "node:test";
import { createCampaign } from "./Campaign.js";
import { applyTemplate, clonePlan, estimateAssets, updatePlan } from "./CampaignBuilder.js";
import { CAMPAIGN_TEMPLATES } from "./CampaignTemplate.js";
import { buildCampaignPlan, estimateCampaignWorkload } from "./CampaignPlanner.js";

test("CampaignBuilder creates provider-agnostic requests from a template", () => {
  const campaign = createCampaign({ id: "campaign-1", name: "Launch" });
  const plan = applyTemplate(campaign, CAMPAIGN_TEMPLATES.PRODUCT_LAUNCH);

  assert.equal(plan.campaignId, "campaign-1");
  assert.equal(plan.assetRequests.length, 3);
  assert.equal(plan.assetRequests[0].role, "hero");
  assert.equal(plan.assetRequests[0].recipe, "image");
  assert.equal(plan.assetRequests[0].provider, undefined);
  assert.equal(estimateAssets(campaign, CAMPAIGN_TEMPLATES.PRODUCT_LAUNCH), 3);
});

test("CampaignPlanner builds workload plans without executing generation", () => {
  const campaign = createCampaign({ id: "campaign-2", name: "Weekly" });
  const plan = buildCampaignPlan(campaign, CAMPAIGN_TEMPLATES.WEEKLY_CONTENT);
  const workload = estimateCampaignWorkload(campaign, CAMPAIGN_TEMPLATES.WEEKLY_CONTENT);
  const updated = updatePlan(plan, { status: "ready" });
  const clone = clonePlan(updated);

  assert.equal(plan.assetRequests.length, 3);
  assert.equal(workload.assetCount, 3);
  assert.equal(updated.status, "ready");
  assert.equal(clone.campaignId, campaign.id);
  assert.equal(Number.isNaN(Date.parse(clone.createdAt)), false);
  assert.equal(Number.isNaN(Date.parse(clone.updatedAt)), false);
});
