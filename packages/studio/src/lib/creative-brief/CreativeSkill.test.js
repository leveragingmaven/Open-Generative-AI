import assert from "node:assert/strict";
import test from "node:test";
import { applyCreativeSkill, isSkillApplicableToStudio } from "./CreativeSkill.js";
import { enrichCreativeRequest } from "./index.js";
import { getSkill, SKILL_LIBRARY } from "../skills/index.js";

const SKILL = getSkill("product-hero-photography");

function baseBrief(overrides = {}) {
  return {
    version: 1,
    studio: "image",
    goal: "hero product shot",
    subject: "skincare serum",
    tone: "premium",
    style: "luxury minimal",
    brand: null,
    format: { medium: "image", aspect: "1:1", motion: null },
    meta: { source: "creative-brief-v1" },
    ...overrides,
  };
}

test("applyCreativeSkill enriches style with vocabulary and craft guidance", () => {
  const enriched = applyCreativeSkill(baseBrief(), SKILL);
  assert.ok(enriched.style.includes("luxury minimal"));
  assert.ok(enriched.style.includes("single protagonist of the frame"));
  assert.ok(enriched.style.includes("sculpted key light"));
  assert.ok(enriched.style.includes("negative space"));
});

test("applyCreativeSkill carries constraints and creative principles", () => {
  const enriched = applyCreativeSkill(baseBrief(), SKILL);
  assert.deepEqual(enriched.constraints, SKILL.constraints);
  assert.deepEqual(enriched.skill.creativePrinciples, SKILL.creativePrinciples);
  assert.equal(enriched.skill.skillId, "product-hero-photography");
  assert.equal(enriched.skill.name, "Product Hero Photography");
  assert.equal(enriched.skill.version, "1.0.0");
});

test("applyCreativeSkill records applied vocabulary with provenance", () => {
  const enriched = applyCreativeSkill(baseBrief(), SKILL);
  assert.deepEqual(enriched.craft.vocabulary, SKILL.vocabulary);
  assert.ok(enriched.craft.subject);
});

test("applyCreativeSkill preserves every original brief field", () => {
  const brief = baseBrief();
  const enriched = applyCreativeSkill(brief, SKILL);
  assert.equal(enriched.goal, brief.goal);
  assert.equal(enriched.subject, brief.subject);
  assert.equal(enriched.tone, brief.tone);
  assert.equal(enriched.brand, brief.brand);
  assert.deepEqual(enriched.format, brief.format);
  assert.deepEqual(enriched.meta, brief.meta);
});

test("applyCreativeSkill does not mutate the input brief", () => {
  const brief = baseBrief();
  const snapshot = { ...brief };
  applyCreativeSkill(brief, SKILL);
  assert.deepEqual(brief, snapshot);
});

test("applyCreativeSkill is a no-op for missing, inactive, or malformed skills", () => {
  const brief = baseBrief();
  assert.equal(applyCreativeSkill(brief, null), brief);
  assert.equal(applyCreativeSkill(brief, undefined), brief);
  assert.equal(applyCreativeSkill(brief, { status: "inactive" }), brief);
  assert.equal(applyCreativeSkill(brief, { status: "active" }).skill.skillId, undefined);
  assert.equal(applyCreativeSkill(null, SKILL), null);
});

test("isSkillApplicableToStudio respects declared supported studios", () => {
  assert.ok(isSkillApplicableToStudio(SKILL, "image"));
  assert.ok(isSkillApplicableToStudio(SKILL, "marketing"));
  assert.ok(isSkillApplicableToStudio(SKILL, "video"));
  assert.equal(isSkillApplicableToStudio(SKILL, "audio"), false);
  assert.equal(isSkillApplicableToStudio(null, "image"), false);
  assert.ok(isSkillApplicableToStudio({ ...SKILL, supportedStudios: [] }, "audio"));
});

test("enrichCreativeRequest applies the approved skill by default", () => {
  const result = enrichCreativeRequest({
    studio: "image",
    userRequest: "Create a luxury perfume commercial",
    activeCampaign: null,
  });
  assert.ok(result.brief, "brief is produced");
  assert.equal(result.brief.skill.skillId, "product-hero-photography");
  assert.ok(result.brief.constraints.length > 0);
  assert.ok(result.text.startsWith("Create a luxury perfume commercial"));
  assert.ok(result.text.includes("sculpted key light"));
});

test("enrichCreativeRequest with skill: null skips the enrichment stage", () => {
  const result = enrichCreativeRequest({
    studio: "image",
    userRequest: "Create a luxury perfume commercial",
    skill: null,
  });
  assert.ok(result.brief);
  assert.equal(result.brief.skill, undefined);
  assert.equal(result.brief.constraints, undefined);
  assert.equal(result.brief.style, "high quality, clean, natural");
});

test("enrichCreativeRequest accepts a skillId string resolved via getSkill", () => {
  const result = enrichCreativeRequest({
    studio: "image",
    userRequest: "hero shot",
    skill: "product-hero-photography",
  });
  assert.equal(result.brief.skill.skillId, "product-hero-photography");
});

test("enrichCreativeRequest does not apply a skill outside its supported studios", () => {
  const result = enrichCreativeRequest({
    studio: "audio",
    userRequest: "a jingle for the brand",
    skill: "product-hero-photography",
  });
  assert.ok(result.brief);
  assert.equal(result.brief.skill, undefined);
});

test("enrichCreativeRequest with an unknown skillId fails open to the user request", () => {
  const result = enrichCreativeRequest({
    studio: "image",
    userRequest: "a clean poster",
    skill: "does-not-exist",
  });
  assert.equal(result.text, "a clean poster");
  assert.equal(result.brief, null);
});

test("SKILL_LIBRARY is unchanged by the enrichment integration", () => {
  assert.ok(Object.isFrozen(SKILL_LIBRARY));
  assert.ok(SKILL_LIBRARY["product-hero-photography"], "approved skills remain registered");
});
