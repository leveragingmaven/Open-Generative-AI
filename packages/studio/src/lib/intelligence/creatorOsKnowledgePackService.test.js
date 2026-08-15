import assert from "node:assert/strict";
import test from "node:test";
import {
  getCurrentCreatorOsKnowledgePack,
  normalizeHubKnowledgePack,
  prepareKnowledgePackRequest,
} from "./creatorOsKnowledgePackService.js";
import { KnowledgeContextRouter } from "./KnowledgeContextRouter.js";
import { assembleModelRequest } from "./ModelRequestAssembler.js";

const hubPack = {
  schema: "creator-os-knowledge-pack.v1",
  userId: "user-1",
  authorityBlueprint: { id: "authority-1", version: 3, content: "Use the MavenSync authority method." },
  currentOffer: { id: "offer-1", title: "Launch offer", content: "A bounded offer." },
  supplementalContext: {
    ipLibrary: [{ id: "ip-1", title: "Signal Story" }],
    knowledgeCenter: [{ id: "kc-1", title: "Approved reference" }],
  },
  source: { system: "hub" },
  packVersion: 8,
  generatedAt: "2026-08-14T00:00:00.000Z",
  checksum: "sha256:pack",
};

test("normalizes the Hub pack into the existing Knowledge Pack contract", () => {
  const normalized = normalizeHubKnowledgePack(hubPack);

  assert.equal(normalized.id, "mavensync:user-1");
  assert.equal(normalized.version, 8);
  assert.equal(normalized.domains.ip.authorityBlueprint, hubPack.authorityBlueprint.content);
  assert.deepEqual(normalized.domains.ip.ipLibrary, hubPack.supplementalContext.ipLibrary);
  assert.deepEqual(normalized.domains.resources, hubPack.supplementalContext.knowledgeCenter);
  assert.deepEqual(normalized.offers.active, [hubPack.currentOffer]);
  assert.equal(normalized.offers.selectedOfferId, "offer-1");
  assert.equal(normalized.metadata.authorityBlueprintVersion, 3);
  assert.equal(normalized.metadata.hubPackVersion, 8);
  assert.equal(normalized.metadata.checksum, "sha256:pack");
  assert.equal(normalized.authorityBlueprint, undefined);
  assert.equal(normalized.supplementalContext, undefined);
});

test("retrieves the authenticated pack with credentialed CORS and normalizes it", async () => {
  let request;
  const pack = await getCurrentCreatorOsKnowledgePack({
    fetchImpl: async (...args) => {
      request = args;
      return { ok: true, async json() { return hubPack; } };
    },
  });

  assert.equal(request[1].credentials, "include");
  assert.equal(pack.metadata.checksum, "sha256:pack");
});

test("retrieves and normalizes the production response envelope", async () => {
  const pack = await getCurrentCreatorOsKnowledgePack({
    fetchImpl: async () => ({ ok: true, async json() { return { success: true, pack: hubPack }; } }),
  });

  assert.equal(pack.domains.ip.authorityBlueprint, hubPack.authorityBlueprint.content);
  assert.equal(pack.metadata.authorityBlueprintVersion, hubPack.authorityBlueprint.version);
});

test("no pack and retrieval failure preserve the existing no-knowledge behavior", async () => {
  assert.equal(normalizeHubKnowledgePack(null), null);
  assert.equal(await getCurrentCreatorOsKnowledgePack({
    fetchImpl: async () => ({ ok: false, async json() { return hubPack; } }),
  }), null);
  assert.equal(await getCurrentCreatorOsKnowledgePack({
    fetchImpl: async () => { throw new Error("network"); },
  }), null);
  const request = await prepareKnowledgePackRequest({ intent: "plain image" }, { fetchImpl: async () => ({ ok: false }) });
  assert.equal(request.knowledgePack, null);
});

test("router receives the normalized contract and selects the current offer", () => {
  const normalized = normalizeHubKnowledgePack(hubPack);
  const selected = new KnowledgeContextRouter().select(normalized, {
    request: { studioId: "marketing", intent: "write a sales page" },
  });

  assert.equal(selected.selectedOffer.id, "offer-1");
  assert.equal(selected.ip.authorityBlueprint, hubPack.authorityBlueprint.content);
  assert.equal(selected.metadata.checksum, "sha256:pack");
  assert.equal(selected.authorityBlueprint, undefined);
});

test("specialist instructions remain separate and authoritative", () => {
  const { modelRequest } = assembleModelRequest({
    agent: { systemPrompt: "Authoritative specialist", prompt: "Fallback specialist" },
    knowledgePack: normalizeHubKnowledgePack(hubPack),
    prompt: "Write a launch page",
  });

  assert.equal(modelRequest.instructions, "Authoritative specialist");
  assert.equal(modelRequest.taskContext.specialistInstructions, undefined);
  assert.equal(JSON.stringify(modelRequest).match(/Authoritative specialist/g)?.length, 1);
});
