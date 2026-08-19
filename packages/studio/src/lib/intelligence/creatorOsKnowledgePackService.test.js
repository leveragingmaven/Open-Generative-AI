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

const frameworks = [
  { title: "Signal Story", category: "positioning", summary: "A concise story structure." },
  { title: "Offer Ladder", category: "offer", summary: "A progression of offer commitments." },
];

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

test("preserves a non-empty V3 audience domain during normalization", () => {
  const audience = { name: "Growth-minded founders", needs: ["clarity", "momentum"] };
  const normalized = normalizeHubKnowledgePack({ ...hubPack, domains: { audience } });

  assert.deepEqual(normalized.domains.audience, audience);
});

test("preserves a non-empty V4 offer domain during normalization", () => {
  const offer = "Loop Breaker 11. Offer Clarity";
  const normalized = normalizeHubKnowledgePack({ ...hubPack, domains: { offer } });

  assert.equal(normalized.domains.offer, offer);
});

test("preserves a non-empty V5 authority domain during normalization", () => {
  const authority = "Authority Anchors\nFoundational Pattern\nCategory-of-One Positioning";
  const normalized = normalizeHubKnowledgePack({ ...hubPack, domains: { authority } });

  assert.equal(normalized.domains.authority, authority);
});

test("preserves V6 Frameworks entries during normalization", () => {
  const normalized = normalizeHubKnowledgePack({ ...hubPack, domains: { frameworks } });

  assert.deepEqual(normalized.domains.frameworks, frameworks);
  assert.notEqual(normalized.domains.frameworks, frameworks);
  assert.notEqual(normalized.domains.frameworks[0], frameworks[0]);
});

test("normalizes missing or empty V6 Frameworks safely", () => {
  assert.deepEqual(normalizeHubKnowledgePack(hubPack).domains.frameworks, []);
  assert.deepEqual(normalizeHubKnowledgePack({ ...hubPack, domains: { frameworks: [] } }).domains.frameworks, []);
});

test("normalizes a missing or empty V5 authority domain to null", () => {
  assert.equal(normalizeHubKnowledgePack(hubPack).domains.authority, null);
  assert.equal(normalizeHubKnowledgePack({ ...hubPack, domains: { authority: "   " } }).domains.authority, null);
});

test("normalizes a missing or empty V4 offer domain to null", () => {
  assert.equal(normalizeHubKnowledgePack(hubPack).domains.offer, null);
  assert.equal(normalizeHubKnowledgePack({ ...hubPack, domains: { offer: "   " } }).domains.offer, null);
});

test("normalizes a missing audience domain to null", () => {
  const normalized = normalizeHubKnowledgePack(hubPack);

  assert.equal(normalized.domains.audience, null);
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

test("a hanging Knowledge Pack request resolves to the existing no-knowledge fallback", async () => {
  const startedAt = Date.now();
  const pack = await getCurrentCreatorOsKnowledgePack({
    timeoutMs: 10,
    fetchImpl: async () => new Promise(() => {}),
  });

  assert.equal(pack, null);
  assert.ok(Date.now() - startedAt < 500, "Knowledge Pack timeout should be bounded");
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
