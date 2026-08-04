import assert from "node:assert/strict";
import test from "node:test";

import { COMMAND_SECTIONS, searchCommandDestinations } from "./commandBarRegistry.js";

test("existing navigation sections remain intact on empty query", () => {
  const sections = searchCommandDestinations("");
  const labels = sections.map((s) => s.label);
  assert.ok(labels.includes("HOME"));
  assert.ok(labels.includes("CREATE"));
  assert.ok(labels.includes("WORKSPACES"));
  assert.ok(labels.includes("RECENT"));
  assert.equal(sections.some((s) => s.id === "intents"), false);
});

test("keyword search still resolves normal destinations", () => {
  const sections = searchCommandDestinations("video");
  const items = sections.flatMap((s) => s.items);
  assert.ok(items.some((i) => i.id === "video"), "CREATE Video Studio should still resolve");
});

test("intent phrases resolve to an INTENT command with pipeline metadata", () => {
  const sections = searchCommandDestinations("turn this into shorts");
  const intentSection = sections.find((s) => s.id === "intents");
  assert.ok(intentSection, "expected an INTENT section");
  assert.equal(intentSection.label, "INTENT");
  const item = intentSection.items[0];
  assert.equal(item.id, "intent-repurpose-shorts");
  assert.equal(item.label, "Turn this into shorts");
  assert.equal(item.route, "/studio/video");
  assert.equal(item.recipeId, "repurposeVideo");
  assert.equal(item.params.view, "repurpose");
  assert.equal(item.params.recipeId, "repurposeVideo");
  assert.deepEqual(item.params.skillIds, ["ai-clipping"]);
  assert.equal(item.studio, "Video Studio");
  assert.equal(item.status, undefined);
});

test("twin intents carry a deep-link to the twin conversation", () => {
  const sections = searchCommandDestinations("use marketing maven");
  const item = sections.find((s) => s.id === "intents").items[0];
  assert.equal(item.id, "intent-twin-marketing-strategist");
  assert.equal(item.route, "/studio/ai-twin");
  assert.equal(item.params.twinBlueprintId, "marketing-strategist");
  assert.equal(item.params.view, "conversations");
});

test("agents studio resolves as a normal destination", () => {
  const sections = searchCommandDestinations("agents studio");
  const items = sections.flatMap((s) => s.items);
  assert.ok(items.some((i) => i.id === "agents-studio" && i.route === "/studio/agents"));
});

test("motion intent commands deep-link to Marketing Studio Motion Graphics", () => {
  const sections = searchCommandDestinations("animate my logo");
  const item = sections.find((s) => s.id === "intents").items[0];
  assert.equal(item.id, "intent-motion-graphics");
  assert.equal(item.route, "/studio/marketing");
  assert.equal(item.tabId, "marketing");
  assert.equal(item.recipeId, "motionGraphics");
  assert.equal(item.studio, "Marketing Studio");
  assert.equal(item.params.view, "motion");
  assert.deepEqual(item.params.skillIds, ["vibe-motion"]);
  assert.equal(item.params.intent, "animate my logo");
});

test("talking-avatar intent commands deep-link to Character Studio Performance Transfer", () => {
  const sections = searchCommandDestinations("recast this video");
  const item = sections.find((s) => s.id === "intents").items[0];
  assert.equal(item.id, "intent-talking-avatar");
  assert.equal(item.route, "/studio/character");
  assert.equal(item.tabId, "character");
  assert.equal(item.recipeId, "performanceTransfer");
  assert.equal(item.studio, "Character Studio");
  assert.deepEqual(item.params.skillIds, ["recast"]);
  assert.equal(item.params.view, "character");
  assert.equal(item.params.intent, "recast this video");
});

test("intent commands respect enabledTabIds", () => {
  const enabled = new Set(["image"]);
  const sections = searchCommandDestinations("create motion graphics", enabled);
  assert.equal(sections.some((s) => s.id === "intents"), false);
  const full = searchCommandDestinations("create motion graphics");
  assert.ok(full.some((s) => s.id === "intents"));
});

test("unrelated queries keep the normal search results", () => {
  const sections = searchCommandDestinations("banana split");
  assert.equal(sections.some((s) => s.id === "intents"), false);
});

test("COMMAND_SECTIONS remains the curated nav registry", () => {
  assert.ok(COMMAND_SECTIONS.length >= 4);
  assert.ok(COMMAND_SECTIONS.some((s) => s.id === "create"));
});
