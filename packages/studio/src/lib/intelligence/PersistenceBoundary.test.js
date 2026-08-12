import assert from "node:assert/strict";
import test from "node:test";
import { PersistentUsageAccounting } from "./UsageAccounting.js";
import { PersistentKnowledgePackStore } from "./KnowledgePack.js";

class UsageRepositoryFake {
  constructor() { this.allowances = new Map(); this.records = new Map(); }
  async authorizeAndReserve({ accountId, estimatedCredits, usage }) {
    const allowance = this.allowances.get(accountId) ?? null;
    if (allowance != null && (estimatedCredits == null || allowance < estimatedCredits)) {
      return { authorized: false, code: estimatedCredits == null ? "allowance_cost_unknown" : "insufficient_credits", allowance };
    }
    return { authorized: true, allowance, reservationId: `reservation-${accountId}-${usage?.id || "usage"}` };
  }
  async recordUsage(record) { this.records.set(record.id, record); return record; }
  async updateUsage(id, changes) { const record = { ...this.records.get(id), ...changes }; this.records.set(id, record); return record; }
  async deductCredits({ accountId, credits, usageId }) {
    if (credits) this.allowances.set(accountId, (this.allowances.get(accountId) ?? 0) - credits);
    if (usageId) await this.updateUsage(usageId, { creditAmountCharged: credits, chargeStatus: "charged" });
    return { charged: credits, allowance: this.allowances.get(accountId) ?? null };
  }
  async releaseReservation() { return { released: true }; }
  async listUsage({ accountId }) { return [...this.records.values()].filter((record) => record.accountId === accountId); }
}

class KnowledgeRepositoryFake {
  constructor() { this.packs = new Map(); }
  async getCurrentPack(accountId) { return this.packs.get(accountId) || null; }
  async replacePack(accountId, pack) { this.packs.set(accountId, pack); return pack; }
}

test("persistent usage adapter scopes records by account and survives adapter recreation", async () => {
  const repository = new UsageRepositoryFake();
  repository.allowances.set("account-a", 5);
  repository.allowances.set("account-b", 0);
  const first = new PersistentUsageAccounting({ repository });
  const usage = await first.recordUsage({ id: "usage-a", accountId: "account-a", status: "pending" });
  const authorization = await first.authorize({ accountId: "account-a", estimatedCredits: 2, usage });
  await first.deductCredits({ accountId: "account-a", credits: 2, usageId: usage.id, authorization });
  const second = new PersistentUsageAccounting({ repository });
  assert.equal((await second.listUsage("account-a")).length, 1);
  assert.equal((await second.listUsage("account-b")).length, 0);
  assert.equal(repository.allowances.get("account-a"), 3);
});

test("persistent Knowledge Packs are account-scoped and version protected", async () => {
  const repository = new KnowledgeRepositoryFake();
  const first = new PersistentKnowledgePackStore({ repository });
  await first.replacePack("account-a", { id: "pack-a", version: 2, updatedAt: "2026-08-12T00:00:00.000Z", domains: { brand: { name: "A" } } });
  await first.replacePack("account-b", { id: "pack-b", version: 1, domains: { brand: { name: "B" } } });
  const second = new PersistentKnowledgePackStore({ repository });
  await second.replacePack("account-a", { id: "pack-a", version: 1, domains: { brand: { name: "old" } } });
  assert.equal((await second.getCurrentPack("account-a")).domains.brand.name, "A");
  assert.equal((await second.getCurrentPack("account-b")).domains.brand.name, "B");
});

test("persistent usage adapter requires an atomic repository contract", async () => {
  const accounting = new PersistentUsageAccounting({ repository: {} });
  await assert.rejects(accounting.authorize({ accountId: "account-a", estimatedCredits: 1 }), { code: "atomic_authorization_required" });
});
