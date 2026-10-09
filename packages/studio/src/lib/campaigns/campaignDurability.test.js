// Phase 7.1 durability guard for the Campaign Workspace.
//
// The store can be perfectly honest and the screen can still report a device-only
// campaign as saved: the hazard lives in the wiring. These assertions pin the wiring,
// so a future edit that closes the create form after a local-only write, or that drops
// the visible "not saved" state, fails here instead of in front of a creator.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const workspaceSource = readFileSync(
  new URL("../../components/CampaignWorkspace.jsx", import.meta.url),
  "utf8",
);

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `${startMarker} must exist`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `${endMarker} must follow ${startMarker}`);
  return source.slice(start, end);
}

// Everything from the create handler up to the component's own JSX.
const createBlock = sliceBetween(workspaceSource, "const handleCreate = async (event) => {", "return (");
const cardSource = sliceBetween(workspaceSource, "function CampaignCard(", "export default function CampaignWorkspace");

test("creating a campaign reaches the account before anything is displayed", () => {
  const durableWrite = createBlock.indexOf("await CampaignStore.createAsync(");
  const localWrite = createBlock.indexOf("CampaignStore.create(");
  const closesForm = createBlock.indexOf("setShowCreate(false)");
  assert.ok(durableWrite !== -1, "the durable write is attempted first");
  assert.ok(localWrite > durableWrite, "the local-only write may only be a fallback, after the durable one failed");
  assert.ok(closesForm > durableWrite, "the form closes only after the save attempt resolved");

  // Both cases that cannot be saved report and stop before the form closes, so the
  // creator keeps what was typed instead of seeing an empty result.
  const earlyReturns = createBlock.slice(0, closesForm).match(/return;/g) || [];
  assert.ok(earlyReturns.length >= 2, "both un-saveable cases must report and stop");
  assert.match(createBlock, /setCreateError\(/, "the un-saveable cases are reported");
});

test("a campaign that only reached this browser is labelled as not saved", () => {
  assert.match(createBlock, /saved in this browser only — it is not in your account yet\./);
  assert.match(workspaceSource, /role="status">\{createNotice\}/, "the device-only notice is announced");
  // The list marks the record itself, so it cannot be mistaken for a stored campaign.
  assert.match(cardSource, /campaign\.pendingSync === true/);
  assert.match(cardSource, /Not saved/);
  assert.match(cardSource, /On this device only — not in your account yet\./);
});

test("the legacy recovery notice is announced and still requires an explicit choice", () => {
  assert.match(workspaceSource, /role="status">\{legacyNotice\}/);
  assert.match(workspaceSource, /onClick=\{\(\) => \{ void importLegacyProjects\(\); \}\}/, "importing is a user action");
  assert.match(workspaceSource, /onClick=\{\(\) => discardLegacyProjects\(\)\}/, "discarding is a user action");
  // Nothing on mount imports: the only adoption paths are those two buttons, and the
  // mount effect is limited to reading the cache the provider already scoped.
  const mountEffect = sliceBetween(workspaceSource, "useEffect(() => {", "const sorted = useMemo");
  assert.doesNotMatch(mountEffect, /importLegacyProjects|importQuarantinedProjects/);
});
