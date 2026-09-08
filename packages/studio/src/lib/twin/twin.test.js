import assert from "node:assert/strict";
import test from "node:test";

import {
  TWIN_STATUSES,
  TWIN_SOURCES,
  TWIN_ASSET_TYPES,
  TWIN_ASSET_CATALOG,
  getTwinAssetType,
  createTwinProfile,
  updateTwinProfile,
  createTwinCandidate,
  createTwinAsset,
} from "./TwinProfile.js";
import {
  listTwins,
  getTwin,
  createTwin,
  updateTwin,
  deleteTwin,
  loadTwinDraft,
  saveTwinDraft,
  clearTwinDraft,
} from "./TwinStore.js";
import {
  listVoiceProfiles,
  saveVoiceProfile,
  deleteVoiceProfile,
} from "./twinVoiceProfiles.js";
import {
  composeCreativeDefaults,
  buildTwinCandidatePrompt,
  buildTwinAssetPrompt,
  buildTwinAssetPromptMatrix,
} from "./twinAssets.js";
import { buildTwinOnboardingWorkflow } from "./twinWorkflow.js";
import { buildTwinPrefillFromHub, readBrandDnaMemory } from "./twinHubImport.js";

function createFakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    _map: map,
  };
}

const baseTwin = {
  name: "Maya",
  identity: {
    description: "warm, expressive creator",
    creativeStyle: "editorial fashion",
    visualPreferences: "soft window light, neutral wardrobe",
    tone: "confident",
  },
  referenceImages: [{ id: "ref-1", url: "https://cdn.example.com/ref1.webp", filename: "ref1.webp" }],
  candidates: [{ id: "cand-1", url: "https://cdn.example.com/c1.webp" }],
};

test("createTwinProfile applies defaults", () => {
  const twin = createTwinProfile();
  assert.equal(twin.status, TWIN_STATUSES.DRAFT);
  assert.equal(twin.source, TWIN_SOURCES.PHOTOS);
  assert.equal(twin.name, "My AI Twin");
  assert.deepEqual(twin.creativeDefaults, []);
  assert.deepEqual(twin.assets, []);
  assert.ok(twin.id.startsWith("twin-"));
  assert.ok(twin.createdAt);
});

test("createTwinProfile keeps hub source when explicitly set", () => {
  const twin = createTwinProfile({ source: TWIN_SOURCES.HUB });
  assert.equal(twin.source, TWIN_SOURCES.HUB);
});

test("createTwinProfile normalizes nested identity and candidates", () => {
  const twin = createTwinProfile(baseTwin);
  assert.equal(twin.identity.description, "warm, expressive creator");
  assert.equal(twin.candidates[0].approved, false);
  assert.equal(twin.referenceImages[0].url, "https://cdn.example.com/ref1.webp");
});

test("updateTwinProfile bumps updatedAt and preserves id/createdAt", () => {
  const twin = createTwinProfile(baseTwin);
  const updated = updateTwinProfile(twin, { name: "Maya V2", status: "published" });
  assert.equal(updated.id, twin.id);
  assert.equal(updated.createdAt, twin.createdAt);
  assert.equal(updated.name, "Maya V2");
  assert.equal(updated.status, TWIN_STATUSES.PUBLISHED);
  assert.ok(updated.updatedAt >= twin.updatedAt);
  assert.ok(!Number.isNaN(Date.parse(updated.updatedAt)));
});

test("invalid status falls back to draft", () => {
  assert.equal(createTwinProfile({ status: "banana" }).status, TWIN_STATUSES.DRAFT);
});

test("createTwinProfile normalizes blueprint source and workspace fields", () => {
  const twin = createTwinProfile({
    name: "Maya",
    source: "blueprint",
    role: "Brand Designer",
    personality: "Disciplined",
    knowledge: ["brand", "visual"],
    brandVoice: "clear, direct",
    campaignAccess: ["camp-1"],
    preferredWorkflows: ["brand-asset"],
    providers: { default: "muapi" },
    settings: { temperature: 0.5, approvalMode: "manual", permissions: ["generate"] },
  });
  assert.equal(twin.source, TWIN_SOURCES.BLUEPRINT);
  assert.equal(twin.role, "Brand Designer");
  assert.equal(twin.personality, "Disciplined");
  assert.deepEqual(twin.knowledge, ["brand", "visual"]);
  assert.equal(twin.brandVoice, "clear, direct");
  assert.deepEqual(twin.campaignAccess, ["camp-1"]);
  assert.deepEqual(twin.preferredWorkflows, ["brand-asset"]);
  assert.equal(twin.providers.default, "muapi");
  assert.equal(twin.settings.temperature, 0.5);
  assert.equal(twin.settings.approvalMode, "manual");
  assert.deepEqual(twin.settings.permissions, ["generate"]);
});

test("createTwinProfile applies twin settings defaults", () => {
  const twin = createTwinProfile();
  assert.equal(twin.settings.temperature, 0.7);
  assert.equal(twin.settings.approvalMode, "review");
  assert.equal(twin.settings.defaultWorkflowId, null);
  assert.deepEqual(twin.settings.permissions, []);
  assert.deepEqual(twin.providers.enabled, ["muapi"]);
  assert.equal(twin.providers.default, "muapi");
});

test("createTwinProfile coerces invalid settings", () => {
  const twin = createTwinProfile({
    settings: { temperature: 99, approvalMode: "banana", permissions: "no" },
    providers: { default: "banana" },
  });
  assert.equal(twin.settings.temperature, 0.7);
  assert.equal(twin.settings.approvalMode, "review");
  assert.deepEqual(twin.settings.permissions, []);
  assert.deepEqual(twin.providers.enabled, ["muapi", "banana"]);
});

test("getTwinAssetType resolves catalog entries", () => {
  assert.equal(getTwinAssetType(TWIN_ASSET_TYPES.HERO_PORTRAIT).label, "Hero Portrait");
  assert.equal(getTwinAssetType("does-not-exist"), null);
});

test("TWIN_ASSET_CATALOG has six reusable asset types", () => {
  assert.equal(TWIN_ASSET_CATALOG.length, 6);
  const ids = TWIN_ASSET_CATALOG.map((a) => a.id);
  for (const type of Object.values(TWIN_ASSET_TYPES)) assert.ok(ids.includes(type));
});

test("createTwinAsset tags the correct asset type and label", () => {
  const asset = createTwinAsset({ assetType: TWIN_ASSET_TYPES.PROFILE_IMAGE, url: "u" });
  assert.equal(asset.assetType, TWIN_ASSET_TYPES.PROFILE_IMAGE);
  assert.equal(asset.label, "Profile Image");
  assert.equal(asset.approved, true);
});

test("createTwinCandidate generates stable ids", () => {
  const a = createTwinCandidate({});
  const b = createTwinCandidate({});
  assert.ok(a.id.startsWith("cand-"));
  assert.notEqual(a.id, b.id);
});

// ── TwinStore ────────────────────────────────────────────────────────────────

test("TwinStore CRUD round-trips through a fake storage", () => {
  const storage = createFakeStorage();
  const created = createTwin(baseTwin, storage);
  assert.equal(getTwin(created.id, storage).name, "Maya");

  const updated = updateTwin(created.id, { name: "Maya Updated" }, storage);
  assert.equal(updated.name, "Maya Updated");
  assert.equal(listTwins(storage).length, 1);

  assert.equal(deleteTwin(created.id, storage), true);
  assert.equal(getTwin(created.id, storage), null);
  assert.equal(deleteTwin(created.id, storage), false);
});

test("updateTwin returns null for unknown id", () => {
  const storage = createFakeStorage();
  assert.equal(updateTwin("nope", { name: "x" }, storage), null);
});

test("TwinStore draft persists and clears", () => {
  const storage = createFakeStorage();
  assert.equal(loadTwinDraft(storage), null);
  saveTwinDraft(createTwinProfile({ name: "Draft Twin" }), storage);
  assert.equal(loadTwinDraft(storage).name, "Draft Twin");
  assert.equal(clearTwinDraft(storage), true);
  assert.equal(loadTwinDraft(storage), null);
});

test("TwinStore tolerates corrupt localStorage", () => {
  const storage = createFakeStorage({ mavensync_ai_twins: "not-json" });
  assert.deepEqual(listTwins(storage), []);
});

// ── Voice profiles ───────────────────────────────────────────────────────────

test("voice profiles upsert and delete", () => {
  const storage = createFakeStorage();
  const profile = saveVoiceProfile({ name: "Clear", tone: "clear, direct", voiceId: "voice-1" }, storage);
  assert.equal(profile.name, "Clear");
  assert.equal(listVoiceProfiles(storage).length, 1);

  const updated = saveVoiceProfile({ ...profile, tone: "warm" }, storage);
  assert.equal(updated.tone, "warm");
  assert.equal(listVoiceProfiles(storage).length, 1);

  assert.equal(deleteVoiceProfile(profile.id, storage), true);
  assert.equal(listVoiceProfiles(storage).length, 0);
});

// ── Prompt composition ───────────────────────────────────────────────────────

test("composeCreativeDefaults maps known skills, skips unknown", () => {
  const text = composeCreativeDefaults(["product-hero-photography", "not-a-skill"]);
  assert.ok(text.includes("Product Hero Photography"));
  assert.ok(text.includes("not-a-skill"));
});

test("composeCreativeDefaults returns empty string for no defaults", () => {
  assert.equal(composeCreativeDefaults([]), "");
});

test("buildTwinCandidatePrompt includes identity and defaults", () => {
  const twin = createTwinProfile({ ...baseTwin, creativeDefaults: ["camera-dolly-tracking"] });
  const prompt = buildTwinCandidatePrompt(twin);
  assert.ok(prompt.includes("warm, expressive creator"));
  assert.ok(prompt.includes("editorial fashion"));
  assert.ok(prompt.includes("Camera Dolly & Tracking"));
  assert.ok(prompt.includes("reference image"));
});

test("buildTwinAssetPromptMatrix covers every catalog entry", () => {
  const twin = createTwinProfile(baseTwin);
  const matrix = buildTwinAssetPromptMatrix(twin);
  assert.equal(matrix.length, TWIN_ASSET_CATALOG.length);
  for (const entry of matrix) {
    assert.ok(entry.prompt.includes(entry.label));
  }
});

// ── Onboarding workflow ──────────────────────────────────────────────────────

test("buildTwinOnboardingWorkflow returns a valid editable graph", () => {
  const twin = createTwinProfile({ ...baseTwin, creativeDefaults: ["product-hero-photography"] });
  const workflow = buildTwinOnboardingWorkflow(twin);
  assert.equal(workflow.workflow_id, null);
  assert.ok(workflow.name.includes("AI Twin Onboarding"));

  const nodeIds = new Set(workflow.data.nodes.map((n) => n.id));
  assert.ok(nodeIds.has("twin-identity"));
  assert.equal(workflow.data.nodes.length, 1 + TWIN_ASSET_CATALOG.length);

  for (const edge of workflow.edges) {
    assert.ok(nodeIds.has(edge.source));
    assert.ok(nodeIds.has(edge.target));
  }
  for (const node of workflow.data.nodes) {
    assert.ok(node.id);
    assert.ok(node.category);
    assert.ok(node.params);
    assert.ok(node.position);
    assert.ok(Array.isArray(node.inputs));
  }
});

// ── Hub import ───────────────────────────────────────────────────────────────

test("buildTwinPrefillFromHub maps knowledge when present", () => {
  const knowledge = {
    brandVoice: "clear, direct, expert",
    audience: "operations leaders",
    offer: "automation audit",
    campaignBrief: "drive qualified calls",
    contentGoal: "awareness",
    platform: "linkedin",
  };
  const prefill = buildTwinPrefillFromHub(knowledge, [
    { type: "brand", value: "palette: deep blue, white" },
    { type: "visual", value: "bold editorial layouts" },
  ]);
  assert.equal(prefill.hasHubProfile, true);
  assert.equal(prefill.hubProfile.brandVoice, "clear, direct, expert");
  assert.equal(prefill.identity.tone, "clear, direct, expert");
  assert.equal(prefill.identity.description, "automation audit, for operations leaders");
  assert.ok(prefill.identity.visualPreferences.includes("deep blue"));
  assert.ok(prefill.identity.visualPreferences.includes("bold editorial layouts"));
});

test("buildTwinPrefillFromHub returns empty when no knowledge", () => {
  const prefill = buildTwinPrefillFromHub(null, []);
  assert.equal(prefill.hasHubProfile, false);
  assert.equal(prefill.hubProfile.brandVoice, undefined);
});

test("readBrandDnaMemory never throws and returns an array", () => {
  const storage = createFakeStorage({ creative_memory: "not-json" });
  const result = readBrandDnaMemory(storage);
  assert.ok(Array.isArray(result));
});
