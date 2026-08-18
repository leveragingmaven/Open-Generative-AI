import assert from "node:assert/strict";
import test from "node:test";
import { SKILL_LIBRARY, getSkill } from "./index.js";
import { SkillResolver, rankSkills, resolveSkills } from "./SkillResolver.js";

const resolver = new SkillResolver();

function manifest(skillId, overrides = {}) {
  return {
    skillId,
    name: skillId,
    version: "1.0.0",
    schemaVersion: "1.0.0",
    category: "test",
    supportedStudios: ["video"],
    vocabulary: [],
    status: "active",
    discoverable: true,
    tags: [],
    capabilities: [],
    ...overrides,
  };
}

test("selects an explicitly requested skill", () => {
  const result = resolver.resolve({ skillId: "camera-pan-tilt" });
  assert.equal(result.explicit, true);
  assert.equal(result.selected.skillId, "camera-pan-tilt");
  assert.deepEqual(result.matches[0].reasons, ["explicit skill ID requested"]);
});

test("matches intent and tags using skill metadata", () => {
  const result = resolver.resolve({ intent: "plan cinematic camera movement", tags: ["camera"] });
  assert.ok(result.matches.length > 0);
  assert.ok(result.matches.some(({ skill }) => skill.skillId.startsWith("camera-")));
  assert.ok(result.matches[0].reasons.length > 0);
});

test("matches supported studios", () => {
  const result = resolver.resolve({ studio: "video" });
  assert.ok(result.matches.length > 0);
  assert.ok(result.matches.every(({ skill }) => skill.supportedStudios.includes("video")));
});

test("matches capabilities", () => {
  const result = resolver.resolve({ capabilities: ["motion_direction"] });
  assert.ok(result.matches.length > 0);
  assert.equal(result.matches[0].skill.skillId, "motion-direction");
  assert.ok(result.matches[0].reasons.some((reason) => reason.includes("capability")));
});

test("ranks deterministically and exposes selected skill", () => {
  const first = resolveSkills({ intent: "brand visual design", category: "design" });
  const second = resolveSkills({ intent: "brand visual design", category: "design" });
  assert.deepEqual(first.matches.map(({ skill }) => skill.skillId), second.matches.map(({ skill }) => skill.skillId));
  assert.equal(first.selected.skillId, first.matches[0].skill.skillId);
  assert.deepEqual(rankSkills({ intent: "brand visual design", category: "design" }), first.matches);
});

test("excludes inactive and deprecated skills from discovery", () => {
  const custom = new SkillResolver({ skills: {
    active: manifest("active", { tags: ["test"] }),
    inactive: manifest("inactive", { status: "archived", tags: ["test"] }),
    deprecated: manifest("deprecated", { status: "deprecated", tags: ["test"] }),
  } });
  const result = custom.resolve({ tags: ["test"] });
  assert.deepEqual(result.matches.map(({ skill }) => skill.skillId), ["active"]);
});

test("excludes non-discoverable skills from dynamic discovery but permits explicit lookup", () => {
  const hidden = manifest("hidden", { discoverable: false, tags: ["secret"] });
  const custom = new SkillResolver({ skills: { hidden } });
  assert.equal(custom.resolve({ tags: ["secret"] }).selected, null);
  assert.equal(custom.resolve({ skillId: "hidden" }).selected, hidden);
});

test("studio mismatch is excluded and complete capability matches outrank partial matches", () => {
  const custom = new SkillResolver({ skills: {
    partial: manifest("partial", { supportedStudios: ["video"], capabilities: ["one"] }),
    complete: manifest("complete", { supportedStudios: ["video"], capabilities: ["one", "two"] }),
    "wrong-studio": manifest("wrong-studio", { supportedStudios: ["image"], capabilities: ["one", "two"] }),
  } });
  const result = custom.resolve({ studio: "video", capabilities: ["one", "two"] });
  assert.deepEqual(result.matches.map(({ skill }) => skill.skillId), ["complete", "partial"]);
  assert.ok(result.matches[0].reasons.some((reason) => reason.includes("fully provides")));
});

test("duplicate tags and capabilities do not inflate ranking", () => {
  const custom = new SkillResolver({ skills: {
    duplicate: manifest("duplicate", { tags: ["camera", "camera"], capabilities: ["camera", "camera"] }),
    clean: manifest("clean", { tags: ["camera"], capabilities: ["camera"] }),
  } });
  const result = custom.resolve({ tags: ["camera", "camera"], capabilities: ["camera", "camera"] });
  assert.equal(result.matches[0].score, result.matches[1].score);
  assert.deepEqual(result.matches.map(({ skill }) => skill.skillId), ["clean", "duplicate"]);
});

test("empty or underspecified requests do not select an arbitrary skill", () => {
  assert.equal(resolver.resolve({}).selected, null);
  assert.deepEqual(resolver.resolve({}).matches, []);
});

test("returns a no-match result without throwing", () => {
  const result = resolver.resolve({ intent: "zzzz-quux" });
  assert.equal(result.selected, null);
  assert.deepEqual(result.matches, []);
});

test("preserves existing getSkill compatibility", () => {
  assert.equal(getSkill("product-hero-photography"), SKILL_LIBRARY["product-hero-photography"]);
  assert.equal(resolver.getSkill("product-hero-photography"), getSkill("product-hero-photography"));
  assert.throws(() => getSkill("does-not-exist"), /Unknown creative skill/);
});
