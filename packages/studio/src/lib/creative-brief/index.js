// Creative Brief v1 — public facade for the creative intelligence layer that
// sits between the user's natural-language request and the existing Recipe
// Engine. This module exports the small public surface used by studios:
//   buildCreativeContext  (gather, read-only)
//   createCreativeBrief / buildCreativeBrief / validateCreativeBrief
//   studio translators (image / video / marketing)
//   CampaignBriefMemory (approved-brief write path)
//   enrichCreativeRequest   (one-call convenience for studio integration)
//
// Pipeline: Creative Context → Creative Brief → one approved Creative Skill
// → Studio Translator. The skill stage is additive enrichment only (no
// matching, scoring, or engine); the Creative Brief remains the single place
// where creative intelligence is assembled before generation.

export { buildCreativeContext, readApprovedBriefs } from "./CreativeContext.js";
export {
  createCreativeBrief,
  validateCreativeBrief,
  buildCreativeBrief,
  detectBrandIntent,
  extractSubject,
  TONE_VOCAB,
  BRIEF_FIELDS,
} from "./CreativeBrief.js";
export {
  translateImage,
  translateVideo,
  translateMarketing,
} from "./StudioTranslator.js";
export { CampaignBriefMemory, default as CampaignBriefMemoryDefault } from "./CampaignMemory.js";
export { applyCreativeSkill, isSkillApplicableToStudio } from "./CreativeSkill.js";

import { buildCreativeContext } from "./CreativeContext.js";
import { buildCreativeBrief, validateCreativeBrief } from "./CreativeBrief.js";
import { translateImage, translateVideo, translateMarketing } from "./StudioTranslator.js";
import { getSkill } from "../skills/index.js";
import { applyCreativeSkill, isSkillApplicableToStudio } from "./CreativeSkill.js";

const TRANSLATORS = {
  image: translateImage,
  video: translateVideo,
  marketing: translateMarketing,
};

// One-call convenience used by studios at the generation site. Gathers context,
// builds the Creative Brief, applies one approved Creative Skill (additive
// enrichment), and translates it for the given studio. Returns a stable
// directive object; never throws — on any failure it falls back to the user's
// original request so generation is never blocked.
//
// `skill` may be a skill object, a skillId resolved through getSkill, or
// `null` to skip the enrichment stage. The default is the first approved pack,
// product-hero-photography, applied only to the studios it declares.
export function enrichCreativeRequest({
  studio = null,
  userRequest = "",
  activeCampaign = null,
  references = [],
  skill = getSkill("product-hero-photography"),
} = {}) {
  try {
    const translator = TRANSLATORS[studio] || translateMarketing;
    const context = buildCreativeContext({
      studio,
      userRequest,
      activeCampaign,
      references,
    });
    const brief = buildCreativeBrief(context, { goal: userRequest, studio });
    const validation = validateCreativeBrief(brief);
    if (!validation.valid) {
      return { brief: null, directive: null, text: userRequest, validation };
    }
    const resolvedSkill = typeof skill === "string" ? getSkill(skill) : skill;
    const enrichedBrief = resolvedSkill && isSkillApplicableToStudio(resolvedSkill, studio)
      ? applyCreativeSkill(brief, resolvedSkill)
      : brief;
    const directive = translator(enrichedBrief);
    return { brief: enrichedBrief, directive, text: directive.text, validation };
  } catch (error) {
    return { brief: null, directive: null, text: userRequest, error };
  }
}