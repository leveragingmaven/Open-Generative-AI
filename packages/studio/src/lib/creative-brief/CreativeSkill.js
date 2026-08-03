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

export function applyCreativeSkill(brief, skill) {
  if (!brief || typeof brief !== "object") return brief;
  if (!skill || skill.status !== "active") return brief;

  const vocabulary = Array.isArray(skill.vocabulary) ? skill.vocabulary : [];
  const craft = skill.craftGuidance && typeof skill.craftGuidance === "object" ? skill.craftGuidance : {};

  const styleParts = [
    brief.style,
    ...vocabulary
      .filter((entry) => entry && typeof entry === "object" && entry.meaning)
      .map((entry) => entry.meaning),
    craft.composition,
    craft.lighting,
    craft.negativeSpace,
  ].filter(Boolean);

  return {
    ...brief,
    ...(styleParts.length ? { style: styleParts.join("; ") } : {}),
    constraints: Array.isArray(skill.constraints) ? [...skill.constraints] : [],
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

// A skill may declare the studios it is approved for. This is declarative
// eligibility (reads the skill's own data), not matching or scoring: when the
// pack declares no supported studios it applies everywhere.
export function isSkillApplicableToStudio(skill, studio) {
  if (!skill) return false;
  if (!Array.isArray(skill.supportedStudios) || skill.supportedStudios.length === 0) return true;
  return skill.supportedStudios.includes(studio);
}
