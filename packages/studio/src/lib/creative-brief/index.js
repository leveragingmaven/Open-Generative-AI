// Creative Brief v1 — public facade for the creative intelligence layer that
// sits between the user's natural-language request and the existing Recipe
// Engine. This module exports the small public surface used by studios:
//   buildCreativeContext  (gather, read-only)
//   createCreativeBrief / buildCreativeBrief / validateCreativeBrief
//   studio translators (image / video / marketing)
//   CampaignBriefMemory (approved-brief write path)
//   enrichStudioPrompt   (one-call convenience for studio integration)

export { buildCreativeContext, readApprovedBriefs } from "./CreativeContext.js";
export {
  createCreativeBrief,
  validateCreativeBrief,
  buildCreativeBrief,
  BRIEF_FIELDS,
} from "./CreativeBrief.js";
export {
  translateImage,
  translateVideo,
  translateMarketing,
} from "./StudioTranslator.js";
export { CampaignBriefMemory, default as CampaignBriefMemoryDefault } from "./CampaignMemory.js";

import { buildCreativeContext } from "./CreativeContext.js";
import { buildCreativeBrief, validateCreativeBrief } from "./CreativeBrief.js";
import { translateImage, translateVideo, translateMarketing } from "./StudioTranslator.js";

const TRANSLATORS = {
  image: translateImage,
  video: translateVideo,
  marketing: translateMarketing,
};

// One-call convenience used by studios at the generation site. Gathers context,
// builds the Creative Brief, and translates it for the given studio. Returns a
// stable directive object; never throws — on any failure it falls back to the
// user's original request so generation is never blocked.
export function enrichCreativeRequest({
  studio = null,
  userRequest = "",
  activeCampaign = null,
  references = [],
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
    const directive = translator(brief);
    return { brief, directive, text: directive.text, validation };
  } catch (error) {
    return { brief: null, directive: null, text: userRequest, error };
  }
}