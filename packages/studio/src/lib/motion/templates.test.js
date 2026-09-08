import assert from "node:assert/strict";
import test from "node:test";
import {
  WORKFLOW_TEMPLATE_LIBRARY,
  WORKFLOW_TEMPLATE_IDS,
  getWorkflowTemplate,
  listWorkflowTemplates,
  resolveTemplateDefaults,
} from "./templates.js";
import { MOTION_SKILL_ID, MOTION_RECIPE_ID } from "./MotionConstants.js";

const EXPECTED_TEMPLATE_IDS = [
  "logo-reveal",
  "countdown-timer",
  "sales-dashboard",
  "animated-quote",
  "product-spotlight",
  "social-announcement",
  "lower-third",
  "statistics-animation",
  "call-to-action",
  "promo-intro",
];

test("Workflow Template Library registers all ten motion templates", () => {
  assert.deepEqual([...WORKFLOW_TEMPLATE_IDS].sort(), [...EXPECTED_TEMPLATE_IDS].sort());
  for (const id of EXPECTED_TEMPLATE_IDS) {
    assert.ok(WORKFLOW_TEMPLATE_LIBRARY[id], `expected ${id} to be registered`);
  }
});

test("every template follows the Workflow Template schema", () => {
  for (const id of EXPECTED_TEMPLATE_IDS) {
    const template = getWorkflowTemplate(id);
    assert.equal(template.templateId, id);
    assert.equal(typeof template.title, "string");
    assert.ok(template.title.length > 0, `${id} needs a title`);
    assert.equal(typeof template.description, "string");
    assert.ok(template.description.length > 0, `${id} needs a description`);
    assert.equal(typeof template.category, "string");
    assert.equal(typeof template.inputs, "object");
    assert.ok(Object.keys(template.inputs).length > 0, `${id} needs at least one input`);
    for (const [key, inputDef] of Object.entries(template.inputs)) {
      assert.equal(typeof inputDef.label, "string");
      assert.equal(typeof inputDef.type, "string");
      assert.equal(typeof inputDef.required, "boolean");
      assert.equal(typeof inputDef.description, "string");
    }
    assert.equal(typeof template.defaultDurationSeconds, "number");
    assert.ok(template.defaultDurationSeconds > 0, `${id} needs a positive default duration`);
    assert.equal(typeof template.defaultAspectRatio, "string");
    assert.ok(template.defaultAspectRatio.length > 0, `${id} needs a default aspect ratio`);
    assert.equal(template.recommendedProvider, "muapi");
    assert.ok(template.requiredSkills.includes(MOTION_SKILL_ID), `${id} must require the vibe-motion skill`);
    assert.ok(template.supportedRecipes.includes(MOTION_RECIPE_ID), `${id} must support the motionGraphics recipe`);
  }
});

test("workflow templates require inputs are labeled and typed", () => {
  for (const template of Object.values(WORKFLOW_TEMPLATE_LIBRARY)) {
    for (const [key, inputDef] of Object.entries(template.inputs)) {
      assert.ok(inputDef.label, `${template.templateId}.${key} is missing a label`);
      assert.ok(inputDef.type, `${template.templateId}.${key} is missing a type`);
      assert.ok(inputDef.description, `${template.templateId}.${key} is missing a description`);
    }
  }
});

test("resolveTemplateDefaults fills template and recipe defaults", () => {
  const resolved = resolveTemplateDefaults("countdown-timer", { countdown: 15 });
  assert.equal(resolved.templateId, "countdown-timer");
  assert.equal(resolved.aspectRatio, "9:16");
  assert.equal(resolved.durationSeconds, 10);
  assert.equal(resolved.countdown, 15);
  assert.equal(resolved.text, "Launching in");
  assert.ok(Array.isArray(resolved.brandColors));
});

test("listWorkflowTemplates filters by category and lists all by default", () => {
  assert.equal(listWorkflowTemplates().length, EXPECTED_TEMPLATE_IDS.length);
  const data = listWorkflowTemplates({ category: "data" });
  assert.ok(data.length >= 2);
  assert.ok(data.every((template) => template.category === "data"));
});

test("unknown workflow templates throw", () => {
  assert.throws(() => getWorkflowTemplate("nope"), /Unknown workflow template/);
});

test("Workflow Template Library is frozen", () => {
  assert.ok(Object.isFrozen(WORKFLOW_TEMPLATE_LIBRARY));
});
