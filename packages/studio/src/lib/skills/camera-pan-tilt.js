// Approved Creative Skill Pack V1 — Camera Pan & Tilt.
// Internal backend creative knowledge only. Produced by the Knowledge Compiler
// from the camera movement prompts source document and reviewed by the
// MavenSync team. No runtime registration, matching, or activation in
// Version 1; the Creative Brief enrichment stage consumes approved skills.
//
// Pack principle legend (creativePrinciples references):
//   P1 purposeful-movement  P2 controlled-speed  P3 readable-framing
//   P4 stable-end-state     P5 physical-consistency  P6 audience-orientation

export default {
  skillId: "camera-pan-tilt",
  name: "Camera Pan & Tilt",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  category: "craft-domain",
  supportedStudios: ["video", "marketing"],
  creativePrinciples: ["P1", "P2", "P3", "P4", "P6"],
  vocabulary: [
    { concept: "static shot", meaning: "hold one fixed camera position and framing for the full clip", informs: "motion" },
    { concept: "pan", meaning: "rotate the camera horizontally from one fixed point, keeping the horizon level", informs: "motion" },
    { concept: "whip pan", meaning: "rotate rapidly toward a new target with brief motion blur, then settle on a sharp composition", informs: "motion" },
    { concept: "tilt", meaning: "rotate the camera upward or downward from one fixed point, keeping the vertical subject centered", informs: "motion" },
  ],
  craftGuidance: {
    when: "use pans and tilts to reveal space or connect two subjects from a single camera position; hold a static shot to let the scene play out without camera emphasis",
    why: "rotation from a fixed point shifts attention across the frame while preserving perspective and camera height, so the viewer stays oriented",
    composition: "keep the horizon level; new space enters from the direction of travel; begin and end each move on a readable composition",
    pacing: "smooth constant rotation for pans and tilts; a whip pan is a fast snap with brief motion blur that must land sharp",
    framing: "on tilts keep the vertical subject or architecture centered; on whips begin on one readable frame and land on a second readable target",
    mistakes: "letting the horizon tilt, drifting height during the move, starting or ending mid-composition, and whips that never settle sharp",
  },
  constraints: [
    "keep the camera on one fixed point for the full move; rotation only, no physical travel",
    "keep the horizon level throughout the rotation",
    "keep camera height, lens distance and angle consistent during the move",
    "begin and end each move on a clear, readable composition",
  ],
  evaluationRules: [
    { quality: "fixed pivot", signal: "the camera rotates without translating; no lateral or vertical drift", evidence: "tracked camera path review" },
    { quality: "level horizon", signal: "the horizon stays horizontal during the rotation", evidence: "frame-grid review" },
    { quality: "settled end state", signal: "the clip ends on a clear, stable composition", evidence: "final-frame review" },
    { quality: "pacing discipline", signal: "rotation is smooth and constant (or a deliberate snap with blur for whips)", evidence: "playback review" },
  ],
  movements: [
    { id: "static-shot", name: "Static Shot", movement: "hold one fixed camera position for the full clip", speed: "still and steady", framing: "keep the same angle, height, lens distance and composition", end: "finish with the same framing and camera position" },
    { id: "pan-left", name: "Pan Left", movement: "rotate the camera horizontally from right to left from one fixed point", speed: "smooth constant rotation", framing: "keep the horizon level while new space enters from the left side of the frame", end: "settle on a clear final composition" },
    { id: "pan-right", name: "Pan Right", movement: "rotate the camera horizontally from left to right from one fixed point", speed: "smooth constant rotation", framing: "keep the horizon level while new space enters from the right side of the frame", end: "settle on a clear final composition" },
    { id: "whip-pan-left", name: "Whip Pan Left", movement: "rotate rapidly from the starting direction toward a new target on the left", speed: "fast snap with brief motion blur during the rotation", framing: "begin on one readable composition and land on a second readable target", end: "settle into a sharp final frame" },
    { id: "whip-pan-right", name: "Whip Pan Right", movement: "rotate rapidly from the starting direction toward a new target on the right", speed: "fast snap with brief motion blur during the rotation", framing: "begin on one readable composition and land on a second readable target", end: "settle into a sharp final frame" },
    { id: "tilt-up", name: "Tilt Up", movement: "rotate the camera upward from one fixed point", speed: "smooth constant tilt", framing: "keep the vertical subject or architecture centered as the frame travels upward", end: "land on the upper target" },
    { id: "tilt-down", name: "Tilt Down", movement: "rotate the camera downward from one fixed point", speed: "smooth constant tilt", framing: "keep the vertical subject or architecture centered as the frame travels downward", end: "land on the lower target" },
  ],
  provenance: {
    source: "camera-movement-prompts-v1",
    reviewedBy: "MavenSync Team",
    approvedAt: "2026-08-02",
    supersedes: null,
  },
  status: "active",
};
