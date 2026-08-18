import assert from "node:assert/strict";
import test from "node:test";
import { SKILL_LIBRARY } from "./index.js";
import { assertValidSkillLibrary, createSkillLibrary, validateSkillLibrary, validateSkillManifest } from "./SkillMetadata.js";

test("the registered skill library satisfies the minimum metadata contract", () => {
  assert.deepEqual(validateSkillLibrary(SKILL_LIBRARY), []);
  assert.equal(assertValidSkillLibrary(SKILL_LIBRARY), true);
});

test("validation catches duplicate IDs, identity errors, lifecycle errors, and malformed arrays", () => {
  const issues = validateSkillLibrary({
    first: {
      skillId: "same",
      name: "First",
      version: "1.0.0",
      category: "test",
      supportedStudios: "video",
      vocabulary: [],
      status: "active",
      tags: ["ok", ""],
      capabilities: [],
      discoverable: "yes",
    },
    second: {
      skillId: "same",
      name: "Second",
      version: "v1",
      category: "test",
      supportedStudios: [],
      vocabulary: [],
      status: "retired",
      tags: [],
      capabilities: [],
      discoverable: false,
    },
  });
  const fields = issues.map((issue) => issue.field);
  assert.ok(fields.includes("skillId"));
  assert.ok(fields.includes("supportedStudios"));
  assert.ok(fields.includes("tags"));
  assert.ok(fields.includes("discoverable"));
  assert.ok(fields.includes("version"));
  assert.ok(fields.includes("status"));
});

test("validation catches a registry key and manifest ID mismatch", () => {
  const issues = validateSkillManifest({
    skillId: "actual",
    name: "Actual",
    version: "1.0.0",
    category: "test",
    supportedStudios: [],
    vocabulary: [],
    status: "active",
  }, { registryKey: "different" });
  assert.ok(issues.some((issue) => issue.field === "skillId"));
});

test("registry construction rejects duplicate skill IDs before overwrite", () => {
  const skill = {
    skillId: "duplicate",
    name: "Duplicate",
    version: "1.0.0",
    category: "test",
    supportedStudios: [],
    vocabulary: [],
    status: "active",
  };
  assert.throws(() => createSkillLibrary([skill, { ...skill }]), /Duplicate Creative Skill ID/);
});
