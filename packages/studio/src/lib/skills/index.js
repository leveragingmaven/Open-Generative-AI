// Creative Skills — internal backend creative knowledge for Creative OS.
// Approved Creative Skill Packs are integrated directly into the codebase by a
// coding AI (Knowledge Compiler output, MavenSync-team reviewed). Version 1 is a
// configuration layer only: it establishes the existence of curated skills and
// provides lookup. Activation, matching, routing, scoring, and request analysis
// belong to the future Creative Skills Engine.

import productHeroPhotography from "./product-hero-photography.js";
import aiClipping from "./ai-clipping.js";
import vibeMotion from "./vibe-motion.js";
import recast from "./recast.js";
import cameraPanTilt from "./camera-pan-tilt.js";
import cameraZoomLens from "./camera-zoom-lens.js";
import cameraDollyTracking from "./camera-dolly-tracking.js";
import cameraPhysicalMovement from "./camera-physical-movement.js";
import cameraHumanCamera from "./camera-human-camera.js";
import cameraDroneCrane from "./camera-drone-crane.js";
import cameraSpecialTechniques from "./camera-special-techniques.js";
import messageClarity from "./message-clarity.js";
import curiosityBuilding from "./curiosity-building.js";
import humanConversation from "./human-conversation.js";
import trustBuilding from "./trust-building.js";
import problemDiscovery from "./problem-discovery.js";
import positioning from "./positioning.js";
import offerStrategy from "./offer-strategy.js";
import customerTransformation from "./customer-transformation.js";
import callToActionStrategy from "./call-to-action-strategy.js";
import storyStructure from "./story-structure.js";
import narrativeFlow from "./narrative-flow.js";
import emotionalPacing from "./emotional-pacing.js";
import characterPerspective from "./character-perspective.js";

export const SKILL_LIBRARY = Object.freeze({
  [productHeroPhotography.skillId]: productHeroPhotography,
  [aiClipping.skillId]: aiClipping,
  [vibeMotion.skillId]: vibeMotion,
  [recast.skillId]: recast,
  [cameraPanTilt.skillId]: cameraPanTilt,
  [cameraZoomLens.skillId]: cameraZoomLens,
  [cameraDollyTracking.skillId]: cameraDollyTracking,
  [cameraPhysicalMovement.skillId]: cameraPhysicalMovement,
  [cameraHumanCamera.skillId]: cameraHumanCamera,
  [cameraDroneCrane.skillId]: cameraDroneCrane,
  [cameraSpecialTechniques.skillId]: cameraSpecialTechniques,
  [messageClarity.skillId]: messageClarity,
  [curiosityBuilding.skillId]: curiosityBuilding,
  [humanConversation.skillId]: humanConversation,
  [trustBuilding.skillId]: trustBuilding,
  [problemDiscovery.skillId]: problemDiscovery,
  [positioning.skillId]: positioning,
  [offerStrategy.skillId]: offerStrategy,
  [customerTransformation.skillId]: customerTransformation,
  [callToActionStrategy.skillId]: callToActionStrategy,
  [storyStructure.skillId]: storyStructure,
  [narrativeFlow.skillId]: narrativeFlow,
  [emotionalPacing.skillId]: emotionalPacing,
  [characterPerspective.skillId]: characterPerspective,
});

// Version 1 public API: lookup only. Mirrors RecipeResolver.resolve.
export function getSkill(skillId) {
  const skill = SKILL_LIBRARY[skillId];
  if (!skill) throw new Error(`Unknown creative skill: ${skillId}`);
  return skill;
}

// Deterministic skill runtime (additive). The Creative Intelligence Engine and
// AI Twin consume skill manifests through getSkill; skills that carry an
// executable analysis expose it as named exports from their own module. The
// Communication Skill Pack analyzers (Message Clarity, Curiosity Building,
// Human Conversation) are re-exported here so the platform has a single entry
// point to the Creative Skills library.
export {
  MESSAGE_CLARITY_SKILL_ID,
  analyzeMessageClarity,
  buildRecommendations,
  clarifyContent,
  evaluateMessageClarity,
  verifyMessageClarity,
  splitIntoSentences,
  tokenizeWords,
} from "./message-clarity.js";
export {
  CURIOSITY_BUILDING_SKILL_ID,
  analyzeCuriosityBuilding,
  buildRecommendations as buildCuriosityRecommendations,
  restructureContent,
  evaluateCuriosityBuilding,
  verifyCuriosityBuilding,
} from "./curiosity-building.js";
export {
  HUMAN_CONVERSATION_SKILL_ID,
  analyzeHumanConversation,
  buildRecommendations as buildConversationRecommendations,
  refineContent,
  evaluateHumanConversation,
  verifyHumanConversation,
} from "./human-conversation.js";
export {
  TRUST_BUILDING_SKILL_ID,
  analyzeTrustBuilding,
  buildRecommendations as buildTrustRecommendations,
  preserveContent,
  evaluateTrustBuilding,
  verifyTrustBuilding,
} from "./trust-building.js";
export {
  PROBLEM_DISCOVERY_SKILL_ID,
  analyzeProblemDiscovery,
  buildRecommendations as buildProblemDiscoveryRecommendations,
  preserveProblemDiscovery,
  evaluateProblemDiscovery,
  verifyProblemDiscovery,
} from "./problem-discovery.js";
export {
  POSITIONING_SKILL_ID,
  analyzePositioning,
  buildRecommendations as buildPositioningRecommendations,
  preservePositioning,
  evaluatePositioning,
  verifyPositioning,
} from "./positioning.js";
export {
  OFFER_STRATEGY_SKILL_ID,
  analyzeOfferStrategy,
  buildRecommendations as buildOfferStrategyRecommendations,
  preserveOfferStrategy,
  evaluateOfferStrategy,
  verifyOfferStrategy,
} from "./offer-strategy.js";
export {
  CUSTOMER_TRANSFORMATION_SKILL_ID,
  analyzeCustomerTransformation,
  buildRecommendations as buildCustomerTransformationRecommendations,
  preserveCustomerTransformation,
  evaluateCustomerTransformation,
  verifyCustomerTransformation,
} from "./customer-transformation.js";
export {
  CALL_TO_ACTION_STRATEGY_SKILL_ID,
  analyzeCallToActionStrategy,
  buildRecommendations as buildCtaRecommendations,
  preserveCallToAction,
  evaluateCallToActionStrategy,
  verifyCallToActionStrategy,
} from "./call-to-action-strategy.js";
export {
  STORY_STRUCTURE_SKILL_ID,
  STORY_STAGES,
  CONFLICT_MARKERS,
  RESOLUTION_MARKERS,
  analyzeStoryStructure,
  buildRecommendations as buildStoryStructureRecommendations,
  preserveStoryStructure,
  evaluateStoryStructure,
  verifyStoryStructure,
} from "./story-structure.js";
export {
  NARRATIVE_FLOW_SKILL_ID,
  TRANSITION_MARKERS,
  TRANSITION_TYPES,
  analyzeNarrativeFlow,
  buildRecommendations as buildNarrativeFlowRecommendations,
  preserveNarrativeFlow,
  evaluateNarrativeFlow,
  verifyNarrativeFlow,
} from "./narrative-flow.js";
export {
  EMOTIONAL_PACING_SKILL_ID,
  POSITIVE_EMOTION_MARKERS,
  NEGATIVE_EMOTION_MARKERS,
  EMOTIONAL_INTENSITY_MARKERS,
  analyzeEmotionalPacing,
  buildRecommendations as buildEmotionalPacingRecommendations,
  preserveEmotionalPacing,
  evaluateEmotionalPacing,
  verifyEmotionalPacing,
} from "./emotional-pacing.js";
export {
  CHARACTER_PERSPECTIVE_SKILL_ID,
  FIRST_PERSON_MARKERS,
  SECOND_PERSON_MARKERS,
  THIRD_PERSON_MARKERS,
  PERSPECTIVE_MARKERS,
  analyzeCharacterPerspective,
  buildRecommendations as buildCharacterPerspectiveRecommendations,
  preserveCharacterPerspective,
  evaluateCharacterPerspective,
  verifyCharacterPerspective,
} from "./character-perspective.js";
