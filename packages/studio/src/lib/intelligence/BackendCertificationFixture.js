import { CreativeExecutionEngine } from "./CreativeExecutionEngine.js";
import { InMemoryExecutionPersistence } from "./ExecutionPersistence.js";
import { CreativeIntelligenceEngine } from "./CreativeIntelligenceEngine.js";
import { RecipeResolver } from "./RecipeResolver.js";
import { capabilityRouter } from "./CapabilityRouter.js";
import { ProviderRegistryExecutionAdapter } from "./ProviderExecution.js";
import { OpenAICompatibleProvider } from "../providers/OpenAICompatibleProvider.js";
import { PersistentUsageAccounting } from "./UsageAccounting.js";
import { PersistentKnowledgePackStore } from "./KnowledgePack.js";

class CertificationUsageRepository {
  constructor() { this.allowances = new Map(); this.records = new Map(); this.reservations = new Map(); this.events = []; }
  async getAllowance(accountId) { return this.allowances.get(accountId) ?? null; }
  async authorizeAndReserve({ accountId, estimatedCredits, usage }) {
    this.events.push(["authorize", accountId]);
    const allowance = await this.getAllowance(accountId);
    const reserved = [...this.reservations.values()].filter((item) => item.accountId === accountId).reduce((sum, item) => sum + item.credits, 0);
    if (allowance != null && estimatedCredits == null) return { authorized: false, code: "allowance_cost_unknown", message: "Cost unavailable", allowance };
    if (allowance != null && allowance - reserved < estimatedCredits) return { authorized: false, code: "insufficient_credits", message: "Insufficient allowance", allowance, requiredCredits: estimatedCredits };
    const reservationId = `reservation-${this.reservations.size + 1}`;
    this.reservations.set(reservationId, { accountId, credits: estimatedCredits || 0 });
    return { authorized: true, allowance, reservationId, usage };
  }
  async recordUsage(record) { this.records.set(record.id, record); return record; }
  async updateUsage(id, changes) { const next = { ...this.records.get(id), ...changes }; this.records.set(id, next); return next; }
  async deductCredits({ accountId, credits, usageId, authorization }) {
    this.events.push(["deduct", accountId]);
    if (authorization?.reservationId) this.reservations.delete(authorization.reservationId);
    const allowance = await this.getAllowance(accountId);
    if (allowance != null) this.allowances.set(accountId, allowance - credits);
    if (usageId) await this.updateUsage(usageId, { creditAmountCharged: credits, chargeStatus: "charged" });
    return { charged: credits, allowance: allowance == null ? null : allowance - credits };
  }
  async releaseReservation({ accountId, reservationId }) { this.events.push(["release", accountId]); this.reservations.delete(reservationId); }
  async listUsage({ accountId }) { return [...this.records.values()].filter((record) => record.accountId === accountId); }
}

class CertificationKnowledgeRepository {
  constructor() { this.packs = new Map(); }
  async getCurrentPack(accountId) { return this.packs.get(accountId) || null; }
  async replacePack(accountId, pack) { this.packs.set(accountId, pack); return pack; }
}

const memory = { projectMemory: () => ({ memories: [], values: {}, provenance: [] }) };
const recipes = new RecipeResolver({ recipes: {
  image: { id: "image", capabilityRequirements: ["image_generation"] },
  text: { id: "text", capabilityRequirements: ["text_generation"] },
} });

function routerWithCertificationCost() {
  return { resolve: (...args) => ({ ...capabilityRouter.resolve(...args), cost: { unit: "credit", creditAmount: 2 } }) };
}

async function execute({ accountId, apiKey, intent, recipeId = "image", studioId = "image", inputs = {}, knowledgePack, provider, usageRepository, operation }) {
  const intelligence = new CreativeIntelligenceEngine({ memory, recipes, router: routerWithCertificationCost() });
  const plan = intelligence.plan({ accountId, apiKey, intent, recipeId, studioId, inputs, knowledgePack });
  const persistence = new InMemoryExecutionPersistence();
  const execution = new CreativeExecutionEngine({
    persistence,
    accounting: new PersistentUsageAccounting({ repository: usageRepository }),
    providerExecutor: new ProviderRegistryExecutionAdapter({ registry: { get: () => provider } }),
  });
  const context = execution.createExecutionContext(plan);
  const job = execution.createJob(context);
  execution.queue(job.id);
  const result = await execution.execute(job.id, { context, routing: context.routing, operation, inputs, apiKey, accountId });
  return { result, plan, context, usage: await new PersistentUsageAccounting({ repository: usageRepository }).listUsage(accountId), jobId: job.id };
}

function pack(accountId, offerId) {
  return { id: `pack-${accountId}`, version: 1, domains: { brand: { accountId }, voice: { accountId, tone: "clear" }, audience: { accountId, name: "founders" }, approvedClaims: [`claim-${accountId}`] }, offers: { active: [{ id: offerId, accountId }, { id: `${offerId}-second`, accountId }], selectedOfferId: offerId } };
}

export async function runBackendCertification() {
  const usageRepository = new CertificationUsageRepository();
  usageRepository.allowances.set("account-a", 10);
  usageRepository.allowances.set("account-b", 10);
  const knowledgeRepository = new CertificationKnowledgeRepository();
  const knowledgeStore = new PersistentKnowledgePackStore({ repository: knowledgeRepository });
  await knowledgeStore.replacePack("account-a", pack("account-a", "offer-a"));
  await knowledgeStore.replacePack("account-b", pack("account-b", "offer-b"));

  let mediaCalls = 0;
  const mediaProvider = { id: "muapi", async execute(request) { mediaCalls += 1; if (request.apiKey !== null) throw Error("Agency key was not null"); if (request.context.knowledgeContext.brand.accountId !== "account-a") throw Error("wrong media context"); return { outputs: ["media-output"], creditAmount: 2 }; } };
  const journey1 = await execute({ accountId: "account-a", apiKey: null, intent: "branded product image", knowledgePack: await knowledgeStore.getCurrentPack("account-a"), provider: mediaProvider, usageRepository });
  if (journey1.plan.routing.providerId !== "muapi" || journey1.plan.knowledgeContext.brand.accountId !== "account-a" || journey1.usage[0].creditAmountCharged !== 2 || mediaCalls !== 1) throw Error("Journey 1 failed");
  if (usageRepository.events.findIndex((event) => event[0] === "authorize") > usageRepository.events.findIndex((event) => event[0] === "deduct")) throw Error("Authorization ordering failed");

  let textRequest;
  const textProvider = new OpenAICompatibleProvider({ config: { endpoint: "https://mock.test/v1", model: "configured-model", serverKey: "server-key" }, fetchImpl: async (url, options) => { textRequest = { url, options }; return { ok: true, json: async () => ({ choices: [{ message: { content: "written" } }], usage: { total_tokens: 4 } }) }; } });
  const journey2 = await execute({ accountId: "account-a", apiKey: null, intent: "write a sales page", studioId: "marketing", recipeId: "text", inputs: { model: "user-selected-model", prompt: "Write" }, knowledgePack: await knowledgeStore.getCurrentPack("account-a"), provider: textProvider, usageRepository, operation: "text_generation" });
  const textBody = JSON.parse(textRequest.options.body);
  if (journey2.plan.routing.providerId !== "openai" || journey2.plan.knowledgeContext.voice.accountId !== "account-a" || journey2.plan.knowledgeContext.selectedOffer.id !== "offer-a" || textBody.model !== "user-selected-model" || journey2.usage[1].creditAmountCharged !== 2) throw Error("Journey 2 failed");

  const byok = await execute({ accountId: "account-b", apiKey: "user-key", intent: "write a sales page", studioId: "marketing", recipeId: "text", inputs: { model: "byok-model", prompt: "Write" }, knowledgePack: await knowledgeStore.getCurrentPack("account-b"), provider: textProvider, usageRepository, operation: "text_generation" });
  if (byok.usage.find((record) => record.jobId === byok.jobId).credentialMode !== "byok" || byok.usage.find((record) => record.jobId === byok.jobId).creditAmountCharged !== 0 || (await usageRepository.getAllowance("account-b")) !== 10) throw Error("Journey 3 failed");

  let blockedCalls = 0;
  usageRepository.allowances.set("blocked", 1);
  const blocked = await execute({ accountId: "blocked", apiKey: null, intent: "branded image", knowledgePack: await knowledgeStore.getCurrentPack("account-a"), provider: { id: "muapi", async execute() { blockedCalls += 1; return { outputs: ["fake"] }; } }, usageRepository });
  if (blockedCalls !== 0 || blocked.result.error.code !== "insufficient_credits") throw Error("Journey 4 failed");

  let released = false;
  usageRepository.allowances.set("failure", 5);
  const failed = await execute({ accountId: "failure", apiKey: null, intent: "branded image", knowledgePack: await knowledgeStore.getCurrentPack("account-a"), provider: { id: "muapi", async execute() { throw Error("provider failed"); } }, usageRepository });
  released = usageRepository.events.some((event) => event[0] === "release" && event[1] === "failure");
  const failureUsage = failed.usage.find((record) => record.jobId === failed.jobId);
  if (failed.result.status !== "failed" || !released || failureUsage.status !== "failed" || failureUsage.creditAmountCharged !== 0) throw Error("Journey 5 failed");

  const aContext = (await knowledgeStore.getCurrentPack("account-a")).offers.active;
  const bContext = (await knowledgeStore.getCurrentPack("account-b")).offers.active;
  if (aContext.length !== 2 || bContext.length !== 2 || aContext[0].accountId === bContext[0].accountId) throw Error("Journey 6 failed");

  const noPack = await execute({ accountId: "account-a", apiKey: null, intent: "plain image", provider: { id: "muapi", async execute() { return { outputs: ["media-output"], creditAmount: 2 }; } }, usageRepository });
  if (noPack.plan.knowledgeContext !== null || noPack.result.status !== "completed") throw Error("Journey 7 failed");
  return { journey1, journey2, byok, blocked, failed, noPack };
}
