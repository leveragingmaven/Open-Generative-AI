import assert from "node:assert/strict";
import test from "node:test";
import { SKILL_LIBRARY, getSkill } from "./index.js";

const EXPECTED_SKILL_IDS = [
  "product-hero-photography",
  "camera-pan-tilt",
  "camera-zoom-lens",
  "camera-dolly-tracking",
  "camera-physical-movement",
  "camera-human-camera",
  "camera-drone-crane",
  "camera-special-techniques",
  "ai-clipping",
  "vibe-motion",
  "recast",
  "message-clarity",
  "curiosity-building",
  "human-conversation",
  "trust-building",
  "problem-discovery",
  "positioning",
  "offer-strategy",
  "customer-transformation",
  "call-to-action-strategy",
  "story-structure",
  "narrative-flow",
  "emotional-pacing",
  "character-perspective",
  "story-resolution",
  "creative-contracts",
  "atelier-composition",
  "motion-direction",
  "runtime-selection",
  "intake-and-onboarding",
  "typography",
  "data-visualization",
  "talking-head-edits",
  "character-composition",
  "voice-performance",
  "screen-demo",
  "editing-intelligence",
  "b-roll-planning",
  "audio-architecture",
  "creative-review",
  "workflow-variants",
];

const REQUIRED_FIELDS = [
  "skillId",
  "name",
  "version",
  "schemaVersion",
  "category",
  "supportedStudios",
  "creativePrinciples",
  "vocabulary",
  "craftGuidance",
  "constraints",
  "evaluationRules",
  "provenance",
  "status",
];

test("SKILL_LIBRARY loads every approved skill", () => {
  assert.deepEqual(Object.keys(SKILL_LIBRARY).sort(), [...EXPECTED_SKILL_IDS].sort());
  for (const id of EXPECTED_SKILL_IDS) {
    assert.ok(SKILL_LIBRARY[id], `expected ${id} to be registered`);
  }
});

test("every skill follows the approved Creative Skill schema", () => {
  for (const id of EXPECTED_SKILL_IDS) {
    const skill = getSkill(id);
    for (const field of REQUIRED_FIELDS) {
      assert.ok(skill[field] !== undefined, `${id} is missing ${field}`);
    }
    assert.equal(skill.skillId, id);
    assert.equal(skill.version, "1.0.0");
    assert.equal(skill.schemaVersion, "1.0.0");
    assert.equal(skill.status, "active");
    assert.ok(Array.isArray(skill.vocabulary));
    assert.ok(Array.isArray(skill.creativePrinciples));
    assert.ok(Array.isArray(skill.constraints));
    assert.ok(Array.isArray(skill.evaluationRules));
    assert.equal(typeof skill.craftGuidance, "object");
  }
});

test("camera movement skills declare a movements catalog grounded in the source", () => {
  const cameraIds = EXPECTED_SKILL_IDS.filter((id) => id.startsWith("camera-"));
  for (const id of cameraIds) {
    const skill = getSkill(id);
    assert.ok(Array.isArray(skill.movements), `${id} should carry a movements catalog`);
    assert.ok(skill.movements.length > 0, `${id} should list at least one movement`);
    for (const movement of skill.movements) {
      assert.equal(typeof movement.name, "string");
      assert.ok(movement.movement, `${id}.${movement.id} is missing movement`);
      assert.ok(movement.speed, `${id}.${movement.id} is missing speed`);
      assert.ok(movement.framing, `${id}.${movement.id} is missing framing`);
      assert.ok(movement.end, `${id}.${movement.id} is missing end state`);
    }
  }
});

test("getSkill returns the expected skill objects", () => {
  const hero = getSkill("product-hero-photography");
  assert.equal(hero.name, "Product Hero Photography");
  assert.deepEqual(hero.supportedStudios, ["image", "marketing", "video"]);

  assert.equal(getSkill("camera-pan-tilt").name, "Camera Pan & Tilt");
  assert.equal(getSkill("camera-zoom-lens").name, "Camera Zoom & Lens");
  assert.equal(getSkill("camera-dolly-tracking").name, "Camera Dolly & Tracking");
  assert.equal(getSkill("camera-physical-movement").name, "Camera Physical Movement");
  assert.equal(getSkill("camera-human-camera").name, "Human Camera");
  assert.equal(getSkill("camera-drone-crane").name, "Drone & Crane");
  assert.equal(getSkill("camera-special-techniques").name, "Special Camera Techniques");

  for (const id of cameraIds()) {
    assert.ok(getSkill(id).supportedStudios.includes("video"));
  }
});

test("unknown skill IDs throw", () => {
  assert.throws(() => getSkill("does-not-exist"), /Unknown creative skill/);
});

test("SKILL_LIBRARY is frozen", () => {
  assert.ok(Object.isFrozen(SKILL_LIBRARY));
});

test("foundational skills declare advisory dependency metadata", () => {
  const foundationalIds = EXPECTED_SKILL_IDS.filter((id) => {
    const skill = SKILL_LIBRARY[id];
    return skill.category === "communication" || skill.priority === "foundational";
  });
  assert.ok(foundationalIds.length >= 5, "foundational skills should hold at least five skills");
  for (const id of foundationalIds) {
    const skill = SKILL_LIBRARY[id];
    assert.ok(Array.isArray(skill.dependsOn), `${id} is missing dependsOn`);
    assert.ok(Array.isArray(skill.complements), `${id} is missing complements`);
    assert.ok(Array.isArray(skill.sharedUtilities), `${id} is missing sharedUtilities`);
    assert.ok(skill.sharedUtilities.includes("communication-utils"), `${id} should reuse the shared utils`);
  }
  const trust = SKILL_LIBRARY["trust-building"];
  assert.deepEqual(trust.dependsOn, ["message-clarity", "curiosity-building"]);
  assert.deepEqual(trust.complements, ["human-conversation"]);
  const problem = SKILL_LIBRARY["problem-discovery"];
  assert.deepEqual(problem.dependsOn, ["message-clarity", "trust-building"]);
  assert.deepEqual(problem.complements, ["positioning", "customer-transformation"]);
  const positioning = SKILL_LIBRARY["positioning"];
  assert.deepEqual(positioning.dependsOn, ["problem-discovery"]);
  assert.deepEqual(positioning.complements, ["offer-strategy", "customer-transformation"]);
  const offer = SKILL_LIBRARY["offer-strategy"];
  assert.deepEqual(offer.dependsOn, ["problem-discovery", "positioning"]);
  assert.deepEqual(offer.complements, ["customer-transformation", "call-to-action-strategy"]);
  const transformation = SKILL_LIBRARY["customer-transformation"];
  assert.deepEqual(transformation.dependsOn, ["problem-discovery", "positioning", "offer-strategy"]);
  assert.deepEqual(transformation.complements, ["call-to-action-strategy"]);
  const cta = SKILL_LIBRARY["call-to-action-strategy"];
  assert.deepEqual(cta.dependsOn, ["offer-strategy", "customer-transformation"]);
  assert.deepEqual(cta.complements, ["trust-building"]);
  const story = SKILL_LIBRARY["story-structure"];
  assert.deepEqual(story.dependsOn, ["message-clarity", "curiosity-building"]);
  assert.deepEqual(story.complements, ["emotional-pacing", "narrative-flow"]);
  assert.deepEqual(story.sharedUtilities, ["communication-utils"]);
  assert.equal(story.category, "storytelling");
  assert.ok(story.compatibleRecipes.includes("video-script"));
  assert.ok(story.compatibleRecipes.includes("podcast"));
  const flow = SKILL_LIBRARY["narrative-flow"];
  assert.deepEqual(flow.dependsOn, ["story-structure"]);
  assert.deepEqual(flow.complements, ["emotional-pacing", "character-perspective"]);
  assert.deepEqual(flow.sharedUtilities, ["communication-utils"]);
  assert.equal(flow.category, "storytelling");
  const pacing = SKILL_LIBRARY["emotional-pacing"];
  assert.deepEqual(pacing.dependsOn, ["story-structure", "narrative-flow"]);
  assert.deepEqual(pacing.complements, ["character-perspective", "story-continuity"]);
  assert.deepEqual(pacing.sharedUtilities, ["communication-utils"]);
  assert.equal(pacing.category, "storytelling");
  const perspective = SKILL_LIBRARY["character-perspective"];
  assert.deepEqual(perspective.dependsOn, ["story-structure", "narrative-flow", "emotional-pacing"]);
  assert.deepEqual(perspective.complements, ["story-continuity"]);
  assert.deepEqual(perspective.sharedUtilities, ["communication-utils"]);
  assert.equal(perspective.category, "storytelling");
});

function cameraIds() {
  return EXPECTED_SKILL_IDS.filter((id) => id.startsWith("camera-"));
}
