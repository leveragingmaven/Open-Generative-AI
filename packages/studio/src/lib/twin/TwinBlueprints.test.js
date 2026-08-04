import assert from "node:assert/strict";
import test from "node:test";

import {
  TWIN_BLUEPRINTS,
  TWIN_PERMISSIONS,
  TWIN_KNOWLEDGE_COLLECTIONS,
  listBlueprints,
  getBlueprint,
  getBlueprintSkillIds,
  createTwinFromBlueprint,
} from "./TwinBlueprints.js";
import { TWIN_SOURCES, TWIN_DEFAULT_SETTINGS } from "./TwinProfile.js";
import { SKILL_LIBRARY } from "../skills/index.js";

test("TwinBlueprints catalog exposes ten reusable blueprints", () => {
  assert.equal(TWIN_BLUEPRINTS.length, 10);
  const ids = new Set(TWIN_BLUEPRINTS.map((b) => b.id));
  for (const expected of [
    "marketing-strategist",
    "brand-designer",
    "creative-director",
    "research-assistant",
    "campaign-planner",
    "pinterest-expert",
    "copywriter",
    "video-director",
    "image-director",
    "workflow-builder",
  ]) {
    assert.ok(ids.has(expected), `missing blueprint: ${expected}`);
  }
});

test("every blueprint skillId resolves in the Creative Skill registry", () => {
  for (const blueprint of TWIN_BLUEPRINTS) {
    for (const skillId of blueprint.skillIds) {
      assert.ok(SKILL_LIBRARY[skillId], `unknown skill ${skillId} on ${blueprint.id}`);
    }
  }
});

test("blueprints reference only known knowledge collections and permissions", () => {
  const knowledgeIds = new Set(TWIN_KNOWLEDGE_COLLECTIONS.map((k) => k.id));
  const permissionIds = new Set(TWIN_PERMISSIONS.map((p) => p.id));
  for (const blueprint of TWIN_BLUEPRINTS) {
    for (const k of blueprint.knowledge) assert.ok(knowledgeIds.has(k), `unknown knowledge ${k}`);
    for (const p of blueprint.permissions) assert.ok(permissionIds.has(p), `unknown permission ${p}`);
  }
});

test("getBlueprint resolves and returns null for unknown ids", () => {
  assert.equal(getBlueprint("marketing-strategist").name, "Marketing Strategist");
  assert.equal(getBlueprint("does-not-exist"), null);
});

test("getBlueprintSkillIds copies blueprint skill ids", () => {
  assert.deepEqual(getBlueprintSkillIds(getBlueprint("video-director")), [
    "camera-pan-tilt",
    "camera-dolly-tracking",
    "camera-physical-movement",
  ]);
});

test("createTwinFromBlueprint builds a draft twin with blueprint config", () => {
  const blueprint = getBlueprint("marketing-strategist");
  const twin = createTwinFromBlueprint(blueprint);
  assert.equal(twin.name, "Marketing Strategist");
  assert.equal(twin.role, "Marketing Strategist");
  assert.equal(twin.source, TWIN_SOURCES.BLUEPRINT);
  assert.deepEqual(twin.creativeDefaults, []);
  assert.deepEqual(twin.knowledge, ["brand", "voice", "audience", "offers", "campaign"]);
  assert.deepEqual(twin.settings.permissions, blueprint.permissions);
  assert.equal(twin.providers.default, "muapi");
  assert.equal(twin.metadata.blueprintId, "marketing-strategist");
});

test("createTwinFromBlueprint copies permissions into settings", () => {
  const blueprint = getBlueprint("copywriter");
  const twin = createTwinFromBlueprint(blueprint);
  assert.ok(twin.settings.permissions.includes("publish-draft"));
  assert.ok(twin.settings.permissions.includes("generate"));
});

test("createTwinFromBlueprint honors overrides", () => {
  const twin = createTwinFromBlueprint(getBlueprint("brand-designer"), {
    name: "Maya",
    settings: { ...TWIN_DEFAULT_SETTINGS, temperature: 0.5 },
  });
  assert.equal(twin.name, "Maya");
  assert.equal(twin.settings.temperature, 0.5);
  assert.equal(twin.metadata.blueprintId, "brand-designer");
});

test("createTwinFromBlueprint throws without a blueprint", () => {
  assert.throws(() => createTwinFromBlueprint(null), /Twin Blueprint is required/);
});

test("listBlueprints returns the curated catalog", () => {
  assert.equal(listBlueprints().length, TWIN_BLUEPRINTS.length);
});
