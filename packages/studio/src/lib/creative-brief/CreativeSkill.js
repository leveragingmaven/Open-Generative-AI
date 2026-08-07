// Creative Skill enrichment — a single additive stage in the Creative Brief
// pipeline. After the Creative Brief is built and before studio translation,
// one approved Creative Skill (from the frozen SKILL_LIBRARY) can enrich the
// brief with curated craft knowledge: vocabulary, craft guidance, constraints,
// and creative principles.
//
// This is configuration → enrichment only. It performs no matching, no
// scoring, and no routing, and it introduces no engine. The Creative Brief
// remains the single place where creative intelligence is assembled before
// generation. The Studio Translators, Recipe Engine, and Provider layer are
// intentionally untouched; enrichment expresses itself through brief fields
// the translators already consume (style) plus additive fields that carry the
// skill's constraints, principles, and provenance.
//
// The result is a new brief object; the input brief is never mutated.

import { SKILL_LIBRARY } from "../skills/index.js";

// Curated, declarative routing of approved Creative Skills to the studios that
// consume them. This is configuration, not an engine: it maps a studio to the
// skills whose craft belongs in that studio's briefs, and the existing
// isSkillApplicableToStudio guard still applies before enrichment. Camera and
// messaging skills stay routed through their existing lanes; only the
// OpenMontage packs are added here.
const STUDIO_CREATIVE_SKILLS = Object.freeze({
  image: ["product-hero-photography", "atelier-composition", "character-composition"],
  video: [
    "creative-contracts",
    "motion-direction",
    "editing-intelligence",
    "b-roll-planning",
    "runtime-selection",
    "typography",
    "data-visualization",
  ],
  marketing: [
    "creative-contracts",
    "voice-performance",
    "typography",
    "data-visualization",
    "b-roll-planning",
  ],
  audio: ["audio-architecture", "voice-performance"],
  "ai-twin": ["intake-and-onboarding", "creative-contracts", "voice-performance"],
  workflow: ["workflow-variants", "creative-review", "runtime-selection"],
  publishing: ["creative-contracts", "typography", "creative-review"],
  character: ["character-composition"],
});

export { STUDIO_CREATIVE_SKILLS };

// Resolve the studio-routed Creative Skills as skill objects, honoring the
// existing declarative-eligibility guard. Unknown or inapplicable skills are
// skipped defensively.
export function selectCreativeSkillsForStudio(studio) {
  const ids = STUDIO_CREATIVE_SKILLS[studio] || [];
  const skills = [];
  for (const id of ids) {
    const skill = SKILL_LIBRARY[id];
    if (skill && skill.status === "active" && isSkillApplicableToStudio(skill, studio)) {
      skills.push(skill);
    }
  }
  return skills;
}

// Shared style-part collection so single- and multi-skill enrichment produce
// identical wording for the same skill.
function collectSkillStyleParts(briefStyle, skill) {
  const vocabulary = Array.isArray(skill.vocabulary) ? skill.vocabulary : [];
  const craft = skill.craftGuidance && typeof skill.craftGuidance === "object" ? skill.craftGuidance : {};
  return [
    briefStyle,
    ...vocabulary
      .filter((entry) => entry && typeof entry === "object" && entry.meaning)
      .map((entry) => entry.meaning),
    craft.composition,
    craft.lighting,
    craft.negativeSpace,
  ].filter(Boolean);
}

function skillEnrichment(skill) {
  const vocabulary = Array.isArray(skill.vocabulary) ? skill.vocabulary : [];
  const craft = skill.craftGuidance && typeof skill.craftGuidance === "object" ? skill.craftGuidance : {};
  return {
    craft: {
      subject: craft.subject || null,
      vocabulary: vocabulary
        .filter((entry) => entry && typeof entry === "object")
        .map((entry) => ({
          concept: entry.concept,
          meaning: entry.meaning,
          informs: entry.informs,
        })),
    },
    skill: {
      skillId: skill.skillId,
      name: skill.name,
      version: skill.version,
      schemaVersion: skill.schemaVersion,
      category: skill.category,
      creativePrinciples: Array.isArray(skill.creativePrinciples) ? [...skill.creativePrinciples] : [],
      status: skill.status,
    },
  };
}

export function applyCreativeSkill(brief, skill) {
  if (!brief || typeof brief !== "object") return brief;
  if (!skill || skill.status !== "active") return brief;

  const styleParts = collectSkillStyleParts(brief.style, skill);
  const enrichment = skillEnrichment(skill);

  return {
    ...brief,
    ...(styleParts.length ? { style: styleParts.join("; ") } : {}),
    constraints: Array.isArray(skill.constraints) ? [...skill.constraints] : [],
    ...enrichment,
  };
}

// Additive multi-skill enrichment: folds every eligible skill's vocabulary,
// craft guidance, and constraints into one new brief. The first applicable
// skill becomes the primary `skill` (kept for compatibility with the single-
// skill enrichment path); every applied skill is also recorded in an additive
// `skills` array so downstream provenance can see the full routed set.
export function applyCreativeSkills(brief, skills, { studio = null } = {}) {
  if (!brief || typeof brief !== "object") return brief;
  const eligible = (Array.isArray(skills) ? skills : [])
    .filter((skill) => skill && skill.status === "active")
    .filter((skill) => isSkillApplicableToStudio(skill, studio));

  let enriched = brief;
  let primary = null;
  const applied = [];
  for (const skill of eligible) {
    if (!primary) primary = skill;
    applied.push(skill);
    enriched = applyCreativeSkill(enriched, skill);
  }
  if (!applied.length) return brief;

  const constraints = [];
  const seen = new Set();
  for (const skill of applied) {
    for (const constraint of Array.isArray(skill.constraints) ? skill.constraints : []) {
      if (!seen.has(constraint)) {
        seen.add(constraint);
        constraints.push(constraint);
      }
    }
  }

  return {
    ...enriched,
    constraints,
    skills: applied.map((skill) => ({
      skillId: skill.skillId,
      name: skill.name,
      version: skill.version,
      category: skill.category,
    })),
  };
}

// Pure, non-mutating derivation of Creative Skill guidance for an execution
// plan. Reads each skill manifest (never writes to it) and folds the creative
// methodology the plan should carry: creative principles, craft guidance
// summaries, constraints, evaluation rules, quality gates, and an advisory
// Creative Review. Returns null when no eligible skills are present so the
// plan is left untouched. This keeps the separation of responsibilities:
// recipes own execution strategy, skills own creative methodology.
export function deriveCreativeSkillGuidance(skills, { studio = null } = {}) {
  const eligible = (Array.isArray(skills) ? skills : [])
    .filter((skill) => skill && skill.status === "active")
    .filter((skill) => isSkillApplicableToStudio(skill, studio));
  if (!eligible.length) return null;

  const unique = (values) => {
    const seen = new Set();
    return values.filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  };

  const principles = unique(eligible.flatMap((skill) =>
    Array.isArray(skill.creativePrinciples) ? skill.creativePrinciples : [],
  ));
  const constraints = unique(eligible.flatMap((skill) =>
    Array.isArray(skill.constraints) ? skill.constraints : [],
  ));
  const qualityGates = unique(eligible.flatMap((skill) =>
    Array.isArray(skill.validation?.qualityGates) ? skill.validation.qualityGates : [],
  ));
  const evaluationRules = eligible.flatMap((skill) =>
    (Array.isArray(skill.evaluationRules) ? skill.evaluationRules : []).map((rule) => ({
      skillId: skill.skillId,
      ...rule,
    })),
  );
  const craftGuidance = eligible
    .map((skill) => ({
      skillId: skill.skillId,
      summary: skill.craftGuidance && typeof skill.craftGuidance === "object" ? skill.craftGuidance.summary || null : null,
    }))
    .filter((entry) => entry.summary);
  const review = buildCreativeReview({}, { skillIds: ["creative-review", "creative-contracts"] });

  return {
    skills: eligible.map((skill) => ({
      skillId: skill.skillId,
      name: skill.name,
      version: skill.version,
      category: skill.category,
    })),
    creativePrinciples: principles,
    craftGuidance,
    constraints,
    evaluationRules,
    qualityGates,
    review,
  };
}

// Convert already-derived Creative Skill guidance into concise, layered
// execution instructions for prompt assembly. This is a presentation transform
// only: it reads `creativeSkills` (the output of deriveCreativeSkillGuidance,
// as stored on the plan) and produces a short, human-ordered instruction block.
// Principles and craft guidance come first as creative direction; constraints
// come last as hard rules. Returns null when there is nothing to add, so the
// existing prompt is left untouched. This deliberately avoids dumping raw
// skill manifests into prompts.
export function buildCreativePromptInstructions(creativeSkills, { maxPrinciples = 6 } = {}) {
  if (!creativeSkills || typeof creativeSkills !== "object") return null;

  const lines = [];
  const principles = Array.isArray(creativeSkills.creativePrinciples)
    ? creativeSkills.creativePrinciples.slice(0, maxPrinciples)
    : [];
  for (const principle of principles) lines.push(`Craft: ${principle}`);
  const craft = Array.isArray(creativeSkills.craftGuidance) ? creativeSkills.craftGuidance : [];
  for (const entry of craft.slice(0, 3)) {
    if (entry && entry.summary) lines.push(`Guidance: ${entry.summary}`);
  }
  const constraints = Array.isArray(creativeSkills.constraints) ? creativeSkills.constraints : [];
  for (const constraint of constraints) lines.push(`Rule: ${constraint}`);

  if (!lines.length) return null;
  return lines.join(" | ");
}

// Extract the advisory Creative Review metadata (no scoring, no blocking) for
// downstream attachment. Returns null when there is no review guidance.
export function creativeReviewMetadata(creativeSkills) {
  const review = creativeSkills?.review;
  if (!review || typeof review !== "object") return null;
  return {
    name: review.name,
    skillIds: Array.isArray(review.skillIds) ? [...review.skillIds] : [],
    taxonomy: review.taxonomy || null,
    stages: Array.isArray(review.stages) ? [...review.stages] : [],
    constraints: Array.isArray(review.constraints) ? [...review.constraints] : [],
    qualityGates: Array.isArray(review.qualityGates) ? [...review.qualityGates] : [],
  };
}

// Optional advisory review stage built from the Creative Review and Creative
// Contracts skills. Advisory only: it surfaces the review contract (taxonomy,
// quality gates, decision rules, stage guidance) as a checklist attached to the
// enriched brief. It performs no scoring and introduces no review engine.
export function buildCreativeReview(brief, { skillIds = ["creative-review", "creative-contracts"] } = {}) {
  if (!brief || typeof brief !== "object") return null;
  const reviewSkills = skillIds
    .map((id) => SKILL_LIBRARY[id])
    .filter((skill) => skill && skill.status === "active");
  if (!reviewSkills.length) return null;

  const guidance = reviewSkills
    .map((skill) => skill.craftGuidance && typeof skill.craftGuidance === "object" ? skill.craftGuidance.summary : null)
    .filter(Boolean);
  const constraints = [];
  const seen = new Set();
  for (const skill of reviewSkills) {
    for (const constraint of Array.isArray(skill.constraints) ? skill.constraints : []) {
      if (!seen.has(constraint)) {
        seen.add(constraint);
        constraints.push(constraint);
      }
    }
  }
  const qualityGates = [];
  const gateSeen = new Set();
  for (const skill of reviewSkills) {
    const gates = skill.validation?.qualityGates;
    for (const gate of Array.isArray(gates) ? gates : []) {
      if (!gateSeen.has(gate)) {
        gateSeen.add(gate);
        qualityGates.push(gate);
      }
    }
  }
  const rules = reviewSkills.flatMap((skill) =>
    (Array.isArray(skill.decisionRules) ? skill.decisionRules : []).map((rule) => ({
      skillId: skill.skillId,
      id: rule.id,
      if: rule.if,
      then: rule.then,
    }))
  );

  return {
    skillIds: reviewSkills.map((skill) => skill.skillId),
    name: "Creative Review",
    taxonomy: "critical/suggestion/investigation (defined in creative-contracts)",
    stages: guidance,
    constraints,
    qualityGates,
    rules,
  };
}

// A skill may declare the studios it is approved for. This is declarative
// eligibility (reads the skill's own data), not matching or scoring: when the
// pack declares no supported studios it applies everywhere.
export function isSkillApplicableToStudio(skill, studio) {
  if (!skill) return false;
  if (!Array.isArray(skill.supportedStudios) || skill.supportedStudios.length === 0) return true;
  return skill.supportedStudios.includes(studio);
}
