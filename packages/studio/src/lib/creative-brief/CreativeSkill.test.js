import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCreativeSkill,
  applyCreativeSkills,
  buildCreativeReview,
  buildCreativePromptInstructions,
  creativeReviewMetadata,
  deriveCreativeSkillGuidance,
  isSkillApplicableToStudio,
  selectCreativeSkillsForStudio,
  STUDIO_CREATIVE_SKILLS,
} from "./CreativeSkill.js";
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

test("STUDIO_CREATIVE_SKILLS routes OpenMontage packs to consuming studios", () => {
  assert.ok(STUDIO_CREATIVE_SKILLS.video.includes("motion-direction"));
  assert.ok(STUDIO_CREATIVE_SKILLS.video.includes("editing-intelligence"));
  assert.ok(STUDIO_CREATIVE_SKILLS.video.includes("b-roll-planning"));
  assert.ok(STUDIO_CREATIVE_SKILLS.marketing.includes("voice-performance"));
  assert.ok(STUDIO_CREATIVE_SKILLS.workflow.includes("workflow-variants"));
  assert.ok(STUDIO_CREATIVE_SKILLS.workflow.includes("creative-review"));
});

test("selectCreativeSkillsForStudio resolves only registered, active, applicable skills", () => {
  const image = selectCreativeSkillsForStudio("image");
  assert.ok(Array.isArray(image) && image.length > 0);
  for (const skill of image) {
    assert.ok(SKILL_LIBRARY[skill.skillId]);
    assert.equal(skill.status, "active");
    assert.ok(isSkillApplicableToStudio(skill, "image"));
  }
  const video = selectCreativeSkillsForStudio("video");
  assert.ok(video.some((skill) => skill.skillId === "motion-direction"));
  assert.deepEqual(selectCreativeSkillsForStudio("does-not-exist"), []);
});

test("applyCreativeSkills folds multiple routed skills additively", () => {
  const brief = baseBrief();
  const enriched = applyCreativeSkills(
    brief,
    selectCreativeSkillsForStudio("video"),
    { studio: "video" },
  );
  assert.ok(enriched.skills.length >= 2, "records additive applied skills");
  assert.ok(enriched.skills.some((skill) => skill.skillId === "motion-direction"));
  assert.ok(enriched.skills.some((skill) => skill.skillId === "b-roll-planning"));
  assert.ok(enriched.constraints.length >= enriched.skills.length);
  assert.equal(enriched.goal, brief.goal);
  assert.equal(applyCreativeSkills(brief, [], { studio: "video" }), brief);
});

test("enrichCreativeRequest accepts a skills array and routes per studio", () => {
  const result = enrichCreativeRequest({
    studio: "video",
    userRequest: "A slow push-in on the hero product",
    skills: selectCreativeSkillsForStudio("video"),
  });
  assert.ok(result.brief, "brief produced");
  assert.ok(Array.isArray(result.brief.skills));
  assert.ok(result.brief.skills.some((skill) => skill.skillId === "motion-direction"));
  assert.ok(result.text && result.text.trim());
});

test("enrichCreativeRequest review option attaches an advisory Creative Review", () => {
  const result = enrichCreativeRequest({
    studio: "video",
    userRequest: "A product film",
    skills: selectCreativeSkillsForStudio("video"),
    review: true,
  });
  assert.ok(result.brief.creativeReview, "advisory review attached");
  assert.ok(result.brief.creativeReview.qualityGates.length > 0);
  assert.ok(result.brief.creativeReview.name === "Creative Review");
});

test("buildCreativeReview returns null without active review skills", () => {
  assert.equal(buildCreativeReview(baseBrief(), { skillIds: ["does-not-exist"] }), null);
  assert.equal(buildCreativeReview(null), null);
});

test("applyCreativeSkills ignores inactive skills but keeps active ones", () => {
  const brief = baseBrief();
  const inactive = { ...getSkill("motion-direction"), status: "inactive" };
  const active = getSkill("motion-direction");
  const enriched = applyCreativeSkills(brief, [inactive, active], { studio: "video" });
  assert.ok(enriched.skills.some((skill) => skill.skillId === "motion-direction"));
});

test("deriveCreativeSkillGuidance folds skill methodology without mutating manifests", () => {
  const guidance = deriveCreativeSkillGuidance(selectCreativeSkillsForStudio("video"), { studio: "video" });
  assert.ok(guidance, "guidance derived");
  assert.ok(guidance.skills.some((skill) => skill.skillId === "motion-direction"));
  assert.ok(guidance.creativePrinciples.length >= 0);
  assert.ok(guidance.constraints.length > 0);
  assert.ok(guidance.evaluationRules.every((rule) => rule.skillId));
  assert.ok(guidance.qualityGates.length > 0);
  assert.equal(guidance.review.name, "Creative Review");
});

test("deriveCreativeSkillGuidance returns null with no eligible skills", () => {
  assert.equal(deriveCreativeSkillGuidance([]), null);
  assert.equal(deriveCreativeSkillGuidance(null), null);
  assert.equal(deriveCreativeSkillGuidance([{ ...getSkill("motion-direction"), status: "inactive" }], { studio: "video" }), null);
});

test("buildCreativePromptInstructions converts guidance into concise layered instructions", () => {
  const guidance = deriveCreativeSkillGuidance(selectCreativeSkillsForStudio("video"), { studio: "video" });
  const instructions = buildCreativePromptInstructions(guidance);
  assert.ok(instructions, "instructions produced");
  assert.ok(instructions.includes("Craft:"));
  assert.ok(instructions.includes("Guidance:"));
  assert.ok(instructions.includes("Rule:"));
  assert.equal(buildCreativePromptInstructions(null), null);
  assert.equal(buildCreativePromptInstructions({}), null);
});

test("buildCreativePromptInstructions keeps principles bounded and constraints complete", () => {
  const guidance = deriveCreativeSkillGuidance(selectCreativeSkillsForStudio("video"), { studio: "video" });
  const instructions = buildCreativePromptInstructions(guidance, { maxPrinciples: 2 });
  const craftLines = instructions.split(" | ").filter((line) => line.startsWith("Craft:"));
  assert.ok(craftLines.length <= 2);
  const ruleLines = instructions.split(" | ").filter((line) => line.startsWith("Rule:"));
  assert.equal(ruleLines.length, guidance.constraints.length);
});

test("creativeReviewMetadata returns advisory review without scoring", () => {
  const guidance = deriveCreativeSkillGuidance(selectCreativeSkillsForStudio("video"), { studio: "video" });
  const review = creativeReviewMetadata(guidance);
  assert.equal(review.name, "Creative Review");
  assert.ok(Array.isArray(review.qualityGates));
  assert.ok(Array.isArray(review.constraints));
  assert.equal(creativeReviewMetadata(null), null);
  assert.equal(creativeReviewMetadata({}), null);
});
