import assert from "node:assert/strict";
import test from "node:test";
import { INCLUDED_ZERNIO_ENGAGEMENT_ACCOUNTS, zernioEngagementEntitlement } from "./zernioEntitlements.js";

test("included Zernio engagement allowance is two by default", () => {
  assert.equal(INCLUDED_ZERNIO_ENGAGEMENT_ACCOUNTS, 2);
  assert.deepEqual(zernioEngagementEntitlement([]), {
    includedEngagementAccounts: 2,
    purchasedEngagementAccounts: 0,
    allowedEngagementAccounts: 2,
    connectedEngagementAccounts: 0,
    canConnectEngagementAccount: true,
  });
});

test("one and two connected Zernio accounts consume the included entitlement", () => {
  const accounts = [{ id: "z1", provider: "zernio" }, { id: "z2", provider: "zernio" }];
  assert.equal(zernioEngagementEntitlement(accounts.slice(0, 1)).canConnectEngagementAccount, true);
  const full = zernioEngagementEntitlement(accounts);
  assert.equal(full.connectedEngagementAccounts, 2);
  assert.equal(full.canConnectEngagementAccount, false);
});

test("disconnecting frees a slot and one purchased extra raises the allowance to three", () => {
  const accounts = [{ id: "z1", provider: "zernio" }, { id: "z2", provider: "zernio" }];
  const disconnected = zernioEngagementEntitlement(accounts.slice(0, 1));
  assert.equal(disconnected.connectedEngagementAccounts, 1);
  assert.equal(disconnected.canConnectEngagementAccount, true);
  const extra = zernioEngagementEntitlement([...accounts, { id: "z3", provider: "zernio" }], 1);
  assert.equal(extra.purchasedEngagementAccounts, 1);
  assert.equal(extra.allowedEngagementAccounts, 3);
  assert.equal(extra.connectedEngagementAccounts, 3);
  assert.equal(extra.canConnectEngagementAccount, false);
});

test("MuAPI and GHL discovered accounts are not counted as Zernio engagement accounts", () => {
  const accounts = [
    { id: "z1", provider: "zernio" },
    { id: "mu1", provider: "muapi" },
    { id: "ghl1", provider: "ghl_hub" },
  ];
  const entitlement = zernioEngagementEntitlement(accounts);
  assert.equal(entitlement.connectedEngagementAccounts, 1);
  assert.equal(entitlement.canConnectEngagementAccount, true);
});
