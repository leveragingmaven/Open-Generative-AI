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
});

// Version 1 public API: lookup only. Mirrors RecipeResolver.resolve.
export function getSkill(skillId) {
  const skill = SKILL_LIBRARY[skillId];
  if (!skill) throw new Error(`Unknown creative skill: ${skillId}`);
  return skill;
}
