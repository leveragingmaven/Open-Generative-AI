import assert from "node:assert/strict";
import test from "node:test";
import {
  assetCampaignInfo,
  campaignAssetMetadata,
  withCampaignMetadata,
} from "./campaignAssetMetadata.js";

test("campaignAssetMetadata returns null when no active campaign", () => {
  assert.equal(campaignAssetMetadata(null), null);
  assert.equal(campaignAssetMetadata(undefined), null);
  assert.equal(campaignAssetMetadata({}), null);
});

test("campaignAssetMetadata maps the active campaign to ownership fields", () => {
  assert.deepEqual(campaignAssetMetadata({ id: "c1", name: "Launch" }, "image"), {
    campaignId: "c1",
    campaignName: "Launch",
    createdFromStudio: "image",
  });
});

test("withCampaignMetadata attaches campaign to a fresh asset entry", () => {
  const entry = { id: "a1", url: "https://example.test/x.png", prompt: "hi" };
  const tagged = withCampaignMetadata(entry, { id: "c1", name: "Launch" }, "image");
  assert.equal(tagged.campaignId, "c1");
  assert.equal(tagged.campaignName, "Launch");
  assert.equal(tagged.createdFromStudio, "image");
  assert.equal(tagged.metadata.campaignId, "c1");
  assert.equal(tagged.id, "a1");
  assert.equal(tagged.url, "https://example.test/x.png");
});

test("withCampaignMetadata is a no-op when no active campaign", () => {
  const entry = { id: "a1", url: "https://example.test/x.png" };
  const tagged = withCampaignMetadata(entry, null, "video");
  assert.equal(tagged, entry);
  assert.equal(tagged.campaignId, undefined);
});

test("withCampaignMetadata merges without overwriting an existing campaignId", () => {
  const entry = {
    id: "a1",
    url: "https://example.test/x.png",
    campaignId: "from-provider",
    campaignName: "Existing",
  };
  const tagged = withCampaignMetadata(entry, { id: "active-c", name: "Active" }, "workflow");
  assert.equal(tagged.campaignId, "from-provider");
  assert.equal(tagged.campaignName, "Existing");
  assert.equal(tagged.metadata.campaignId, "from-provider");
  assert.equal(tagged.createdFromStudio, "workflow");
});

test("withCampaignMetadata keeps existing metadata fields intact", () => {
  const entry = { id: "a1", metadata: { model: "model-x", studio: "image" } };
  const tagged = withCampaignMetadata(entry, { id: "c1", name: "Launch" }, "image");
  assert.equal(tagged.metadata.model, "model-x");
  assert.equal(tagged.metadata.studio, "image");
  assert.equal(tagged.metadata.campaignId, "c1");
});

test("assetCampaignInfo reads campaign off top-level or metadata", () => {
  assert.deepEqual(assetCampaignInfo({ campaignId: "c1", campaignName: "Launch" }), {
    campaignId: "c1",
    campaignName: "Launch",
  });
  assert.deepEqual(
    assetCampaignInfo({ metadata: { campaignId: "c2", campaignName: "Social" } }),
    { campaignId: "c2", campaignName: "Social" },
  );
  assert.equal(assetCampaignInfo({ id: "a1" }), null);
  assert.equal(assetCampaignInfo(null), null);
});
