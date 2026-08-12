const now = () => new Date().toISOString();

export function credentialMode(apiKey) {
  return apiKey !== undefined && apiKey !== null ? "byok" : "agency-funded";
}

export function createUsageRecord(input = {}) {
  return {
    id: input.id || `usage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    requestId: input.requestId || null,
    jobId: input.jobId || null,
    timestamp: input.timestamp || now(),
    capability: input.capability || null,
    operation: input.operation || null,
    provider: input.provider || null,
    model: input.model || null,
    deployment: input.deployment || null,
    credentialMode: input.credentialMode || "agency-funded",
    status: input.status || "pending",
    estimatedCost: input.estimatedCost ?? null,
    actualCost: input.actualCost ?? null,
    creditAmountCharged: input.creditAmountCharged ?? 0,
    providerUsage: input.providerUsage ?? null,
    chargeStatus: input.chargeStatus || "not-charged",
    error: input.error || null,
  };
}

export class InMemoryUsageAccounting {
  constructor({ defaultAllowance = null } = {}) {
    this.defaultAllowance = defaultAllowance;
    this.allowances = new Map();
    this.records = new Map();
  }

  setAllowance(accountId, credits) {
    this.allowances.set(accountId || "default", credits);
  }

  getAllowance(accountId) {
    const key = accountId || "default";
    return this.allowances.has(key) ? this.allowances.get(key) : this.defaultAllowance;
  }

  authorize({ accountId, estimatedCredits = null, usage } = {}) {
    const allowance = this.getAllowance(accountId);
    if (allowance == null) return { authorized: true, allowance: null, usage };
    if (estimatedCredits == null) {
      return {
        authorized: false,
        code: "allowance_cost_unknown",
        message: "Agency-funded execution cannot be authorized because deployment credit cost is unavailable",
        allowance,
        usage,
      };
    }
    if (allowance < estimatedCredits) {
      return {
        authorized: false,
        code: "insufficient_credits",
        message: "Insufficient available credits for this AI request",
        allowance,
        requiredCredits: estimatedCredits,
        usage,
      };
    }
    return { authorized: true, allowance, usage };
  }

  recordUsage(record) {
    const normalized = createUsageRecord(record);
    this.records.set(normalized.id, normalized);
    return normalized;
  }

  updateUsage(id, changes = {}) {
    const existing = this.records.get(id);
    if (!existing) return this.recordUsage({ ...changes, id });
    const updated = createUsageRecord({ ...existing, ...changes, id: existing.id });
    this.records.set(id, updated);
    return updated;
  }

  deductCredits({ accountId, credits = 0, usageId } = {}) {
    if (!credits) return { charged: 0, allowance: this.getAllowance(accountId) };
    const key = accountId || "default";
    const allowance = this.getAllowance(accountId);
    if (allowance != null && allowance < credits) {
      const error = new Error("Insufficient available credits for AI request");
      error.code = "insufficient_credits";
      throw error;
    }
    if (allowance != null) this.allowances.set(key, allowance - credits);
    if (usageId) this.updateUsage(usageId, { creditAmountCharged: credits, chargeStatus: "charged" });
    return { charged: credits, allowance: allowance == null ? null : allowance - credits };
  }

  listUsage() { return Array.from(this.records.values()); }
}

export const usageAccounting = new InMemoryUsageAccounting();
