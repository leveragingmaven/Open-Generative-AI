// Approved Creative Skill Pack V1 — Human Camera.
// Internal backend creative knowledge only. Produced by the Knowledge Compiler
// from the camera movement prompts source document and reviewed by the
// MavenSync team. No runtime registration, matching, or activation in
// Version 1; the Creative Brief enrichment stage consumes approved skills.
//
// Pack principle legend (creativePrinciples references):
//   P1 purposeful-movement  P2 controlled-speed  P3 readable-framing
//   P4 stable-end-state     P5 physical-consistency  P6 audience-orientation

export default {
  skillId: "camera-human-camera",
  name: "Human Camera",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  category: "craft-domain",
  supportedStudios: ["video", "marketing"],
  creativePrinciples: ["P2", "P3", "P5"],
  vocabulary: [
    { concept: "handheld", meaning: "hold the camera at human operator height with natural body movement, subtle sway and micro-adjustments", informs: "style" },
    { concept: "snorricam", meaning: "keep the camera fixed relative to the subject's torso or face while the subject moves", informs: "motion" },
  ],
  craftGuidance: {
    when: "use handheld for an organic, present, documentary-like feel; use snorricam to lock the camera to a moving subject and make the world move around them",
    why: "human camera movement carries the operator's physicality, so the frame feels lived-in; locking the camera to a body makes the subject the stable center of motion",
    composition: "handheld keeps the subject readable while the frame sways; snorricam keeps the subject close, centered and facing the camera as the background moves around them",
    pacing: "handheld is responsive and organic with subtle sway; snorricam matches the subject's body motion exactly",
    framing: "handheld settles into a natural handheld composition; snorricam holds the subject locked in frame for the duration",
    mistakes: "handheld shake so strong the subject becomes unreadable, or so stable it loses the organic feel; snorricam drift that breaks the locked, centered framing",
  },
  constraints: [
    "keep the handheld frame organic but keep the subject readable throughout",
    "keep the snorricam subject close, centered and facing the camera",
    "keep the snorricam camera fixed relative to the subject's body motion",
    "finish on a natural handheld composition or with the subject still locked in frame",
  ],
  evaluationRules: [
    { quality: "organic motion", signal: "handheld frame has natural sway and micro-adjustments without losing the subject", evidence: "playback review" },
    { quality: "locked center", signal: "snorricam subject stays close, centered and facing the camera", evidence: "frame-by-frame subject review" },
    { quality: "human scale", signal: "camera height reads as human operator height or subject-anchored", evidence: "perspective review" },
    { quality: "stable end state", signal: "the clip finishes with a natural handheld composition or the subject still locked in frame", evidence: "final-frame review" },
  ],
  movements: [
    { id: "handheld", name: "Handheld Shot", movement: "hold the camera at human operator height with natural body movement", speed: "responsive and organic", framing: "keep the subject readable while the frame has subtle sway and micro-adjustments", end: "finish with a natural handheld composition" },
    { id: "snorricam", name: "Body-Mounted Camera / Snorricam", movement: "keep the camera fixed relative to the subject's torso or face while the subject moves", speed: "match the subject's body motion", framing: "keep the subject close, centered and facing the camera as the background moves around them", end: "finish with the subject still locked in frame" },
  ],
  provenance: {
    source: "camera-movement-prompts-v1",
    reviewedBy: "MavenSync Team",
    approvedAt: "2026-08-02",
    supersedes: null,
  },
  status: "active",
};
