// Approved Creative Skill Pack V1 — Camera Physical Movement.
// Internal backend creative knowledge only. Produced by the Knowledge Compiler
// from the camera movement prompts source document and reviewed by the
// MavenSync team. No runtime registration, matching, or activation in
// Version 1; the Creative Brief enrichment stage consumes approved skills.
//
// Pack principle legend (creativePrinciples references):
//   P1 purposeful-movement  P2 controlled-speed  P3 readable-framing
//   P4 stable-end-state     P5 physical-consistency  P6 audience-orientation

export default {
  skillId: "camera-physical-movement",
  name: "Camera Physical Movement",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  category: "craft-domain",
  supportedStudios: ["video", "marketing"],
  creativePrinciples: ["P2", "P3", "P4", "P5", "P6"],
  vocabulary: [
    { concept: "truck", meaning: "move the camera laterally on a straight horizontal path while keeping the lens facing the same direction", informs: "motion" },
    { concept: "slider move", meaning: "slide the camera a small distance sideways so parallax shifts between foreground, subject and background layers", informs: "motion" },
    { concept: "pedestal", meaning: "move the entire camera vertically in a straight line while keeping the lens level", informs: "motion" },
    { concept: "push past", meaning: "move forward past a visible foreground object so it passes close to the lens", informs: "motion" },
    { concept: "arc", meaning: "move on a shallow curved path around the subject while keeping distance, height and subject readability consistent", informs: "motion" },
    { concept: "orbit", meaning: "circle the subject at a consistent radius with the subject centered while the background rotates around them", informs: "motion" },
  ],
  craftGuidance: {
    when: "use trucks and sliders for subtle lateral re-framing, pedestals for vertical re-framing, push past to travel through a foreground layer, and arcs or orbits to reveal a subject from a new angle",
    why: "lateral, vertical and curved travel change viewpoint and depth cues, revealing new sides of the scene while keeping the subject readable",
    composition: "keep the lens facing the same direction on trucks; on sliders keep foreground, subject and background layers readable as parallax shifts; on arcs and orbits keep distance, height and subject readability consistent",
    pacing: "smooth constant lateral travel for trucks, slow controlled motion for sliders, smooth constant lift or descent for pedestals, smooth measured curves for arcs, and a smooth controlled orbit at a consistent radius",
    framing: "the scene slides across frame on trucks; new angles appear on the side of travel for sliders and arcs; the subject stays centered during orbits",
    mistakes: "changing lens direction on a truck, moving so fast the subject is lost, inconsistent radius on orbits, and arcs that shift camera height or subject position",
  },
  constraints: [
    "keep the lens pointing in the same direction during truck and pedestal moves",
    "keep camera height, lens direction and subject distance consistent on arcs",
    "keep the subject centered on orbits at a consistent radius",
    "finish each move on a clean, readable composition",
  ],
  evaluationRules: [
    { quality: "straight travel", signal: "trucks and pedestals follow straight horizontal or vertical paths without drift", evidence: "tracked camera path review" },
    { quality: "consistent perspective", signal: "lens direction and camera height stay constant on lateral and vertical moves", evidence: "frame-grid review" },
    { quality: "parallax readability", signal: "slider moves keep foreground, subject and background layers readable", evidence: "frame-by-frame layer review" },
    { quality: "steady radius", signal: "arcs and orbits keep a consistent radius and centered subject", evidence: "tracked subject distance review" },
  ],
  movements: [
    { id: "truck-left", name: "Truck Left", movement: "move the camera physically to the left on a straight horizontal path", speed: "smooth constant lateral travel", framing: "keep the lens facing the same direction while the scene slides across frame", end: "finish on a clean lateral composition" },
    { id: "truck-right", name: "Truck Right", movement: "move the camera physically to the right on a straight horizontal path", speed: "smooth constant lateral travel", framing: "keep the lens facing the same direction while the scene slides across frame", end: "finish on a clean lateral composition" },
    { id: "slider-left", name: "Slider Left", movement: "slide the camera a small distance to the left", speed: "slow controlled constant motion", framing: "keep foreground, subject and background layers readable as parallax shifts", end: "finish on a refined composition with the new left-side angle visible" },
    { id: "slider-right", name: "Slider Right", movement: "slide the camera a small distance to the right", speed: "slow controlled constant motion", framing: "keep foreground, subject and background layers readable as parallax shifts", end: "finish on a refined composition with the new right-side angle visible" },
    { id: "pedestal-up", name: "Pedestal Up", movement: "move the entire camera vertically upward in a straight line", speed: "smooth constant lift", framing: "keep the lens level and pointed in the same direction during the vertical move", end: "finish with the higher framing clearly readable" },
    { id: "pedestal-down", name: "Pedestal Down", movement: "move the entire camera vertically downward in a straight line", speed: "smooth constant descent", framing: "keep the lens level and pointed in the same direction during the vertical move", end: "finish with the lower framing clearly readable" },
    { id: "push-past", name: "Push Past / Pass-by", movement: "move forward past a visible foreground object, edge or opening", speed: "smooth forward glide", framing: "let the foreground pass close to the lens while the space beyond becomes clearer", end: "arrive inside or beyond the foreground layer" },
    { id: "arc-left", name: "Arc Left", movement: "move on a shallow curved path around the main subject toward the left side", speed: "smooth measured curve", framing: "keep distance, height and subject readability consistent while the angle changes", end: "finish from a new left-side angle" },
    { id: "arc-right", name: "Arc Right", movement: "move on a shallow curved path around the main subject toward the right side", speed: "smooth measured curve", framing: "keep distance, height and subject readability consistent while the angle changes", end: "finish from a new right-side angle" },
    { id: "orbit-clockwise", name: "Orbit Clockwise", movement: "circle clockwise around the main subject at a consistent radius", speed: "smooth controlled orbit", framing: "keep the subject centered while the background rotates around them", end: "complete the intended arc or full circle with stable framing" },
    { id: "orbit-counterclockwise", name: "Orbit Counterclockwise", movement: "circle counterclockwise around the main subject at a consistent radius", speed: "smooth controlled orbit", framing: "keep the subject centered while the background rotates around them", end: "complete the intended arc or full circle with stable framing" },
  ],
  provenance: {
    source: "camera-movement-prompts-v1",
    reviewedBy: "MavenSync Team",
    approvedAt: "2026-08-02",
    supersedes: null,
  },
  status: "active",
};
