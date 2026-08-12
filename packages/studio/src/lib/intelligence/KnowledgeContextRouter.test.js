import assert from "node:assert/strict";
import test from "node:test";
import { KnowledgeContextRouter } from "./KnowledgeContextRouter.js";
import { InMemoryKnowledgePackStore } from "./KnowledgePack.js";
import { CreativeIntelligenceEngine } from "./CreativeIntelligenceEngine.js";

const pack = {
  id: "hub-pack",
  version: 4,
  updatedAt: "2026-08-12T00:00:00.000Z",
  domains: {
    brand: { name: "MavenSync", palette: ["#111111"] },
    voice: { tone: "clear and warm" },
    audience: { primary: "founders" },
    ip: { framework: "Signal Story" },
    approvedClaims: ["Approved claim"],
    resources: [{ id: "resource-1" }],
    visualDirection: { style: "editorial" },
  },
  offers: { active: [{ id: "offer-a", name: "Offer A" }, { id: "offer-b", name: "Offer B" }], selectedOfferId: "offer-a" },
};

test("knowledge selection is deterministic and excludes irrelevant sections", () => {
  const router = new KnowledgeContextRouter();
  const image = router.select(pack, { request: { studioId: "image", intent: "branded product image" } });
  assert.deepEqual(image.brand, pack.domains.brand);
  assert.deepEqual(image.visualDirection, pack.domains.visualDirection);
  assert.equal(image.voice, null);
  assert.equal(image.audience, null);
  assert.equal(image.selectedOffer, null);

  const writing = router.select(pack, { request: { studioId: "marketing", intent: "write a sales page" } });
  assert.deepEqual(writing.voice, pack.domains.voice);
  assert.deepEqual(writing.audience, pack.domains.audience);
  assert.deepEqual(writing.selectedOffer, pack.offers.active[0]);
  assert.deepEqual(writing.resources, []);
});

test("explicit offer selection returns only that offer pack", () => {
  const router = new KnowledgeContextRouter();
  const context = router.select(pack, { request: { intent: "creative request" }, offerId: "offer-b" });
  assert.equal(context.selectedOffer.id, "offer-b");
});

test("knowledge pack updates replace only with a newer version", () => {
  const store = new InMemoryKnowledgePackStore(pack);
  store.replace({ ...pack, version: 3, domains: { ...pack.domains, brand: { name: "old" } } });
  assert.equal(store.get().domains.brand.name, "MavenSync");
  store.replace({ ...pack, version: 5, domains: { ...pack.domains, brand: { name: "new" } } });
  assert.equal(store.get().domains.brand.name, "new");
});

test("Creative Intelligence keeps knowledge optional and separate from memory", () => {
  const engine = new CreativeIntelligenceEngine({
    memory: { projectMemory: () => ({ memories: [], values: {}, provenance: [] }) },
    router: { resolve: () => ({ providerId: "muapi", deploymentId: "image" }) },
  });
  const withoutPack = engine.plan({ recipeId: "image", intent: "plain image" });
  assert.equal(withoutPack.knowledgeContext, null);
  const withPack = engine.plan({ recipeId: "image", studioId: "image", intent: "branded image", knowledgePack: pack });
  assert.deepEqual(withPack.knowledgeContext.brand, pack.domains.brand);
  assert.equal(withPack.memoryProjection.memories.length, 0);
});
