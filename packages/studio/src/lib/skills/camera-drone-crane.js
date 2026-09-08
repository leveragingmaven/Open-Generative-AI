// Approved Creative Skill Pack V1 — Drone & Crane.
// Internal backend creative knowledge only. Produced by the Knowledge Compiler
// from the camera movement prompts source document and reviewed by the
// MavenSync team. No runtime registration, matching, or activation in
// Version 1; the Creative Brief enrichment stage consumes approved skills.
//
// Pack principle legend (creativePrinciples references):
//   P1 purposeful-movement  P2 controlled-speed  P3 readable-framing
//   P4 stable-end-state     P5 physical-consistency  P6 audience-orientation

export default {
  skillId: "camera-drone-crane",
  name: "Drone & Crane",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  category: "craft-domain",
  supportedStudios: ["video", "marketing"],
  creativePrinciples: ["P1", "P2", "P3", "P4", "P5"],
  vocabulary: [
    { concept: "crane move", meaning: "travel smoothly upward or downward through open space to reveal or descend on a scene", informs: "motion" },
    { concept: "drone push", meaning: "fly smoothly forward through open space toward the subject or destination", informs: "motion" },
    { concept: "drone pull", meaning: "fly smoothly backward away from the subject as more landscape appears", informs: "motion" },
    { concept: "helicopter shot", meaning: "move from high altitude along a broad gradual flight path at wide scale", informs: "motion" },
  ],
  craftGuidance: {
    when: "use crane moves to scale upward or descend into a location; use drone pushes and pulls to glide toward or away from a subject; use helicopter shots for broad high-altitude travel",
    why: "aerial and crane travel moves the camera through open space, changing scale and revealing context the way only free travel can",
    composition: "keep the subject or location readable as the camera rises, descends or approaches; on pull-backs keep the subject readable as more landscape appears; helicopter shots hold the landscape or distant subject readable at wide scale",
    pacing: "crane lifts and descents are slow and controlled; drone glides are controlled and even; helicopter motion is steady and gradual",
    framing: "crane ups finish on a clearly visible higher scale; drone pushes arrive at a closer aerial composition; drone pulls finish wider; helicopter shots finish on a stable high-altitude composition",
    mistakes: "moving too fast for the scale to read, losing the subject against the landscape, vertical moves that wobble off-axis, and helicopter motion that drifts or speeds erratically",
  },
  constraints: [
    "keep crane vertical travel smooth and controlled through open space",
    "keep the subject or destination readable during drone approach and retreat",
    "keep helicopter travel at steady, controlled aerial speed",
    "finish each move on a clear aerial or high-altitude composition",
  ],
  evaluationRules: [
    { quality: "open-space travel", signal: "the camera moves smoothly through open space without obstruction or wobble", evidence: "tracked aerial path review" },
    { quality: "readable target", signal: "the subject, route or destination stays readable during the move", evidence: "frame-by-frame target review" },
    { quality: "scale intent", signal: "the end framing matches the intended closer, wider or higher scale", evidence: "final-frame review" },
    { quality: "steady speed", signal: "aerial motion is smooth and controlled, not erratic", evidence: "playback review" },
  ],
  movements: [
    { id: "crane-up", name: "Crane Up", movement: "travel smoothly upward through open space", speed: "slow controlled vertical lift", framing: "keep the subject or location readable as the camera rises", end: "finish with the higher scale clearly visible" },
    { id: "crane-down", name: "Crane Down", movement: "travel smoothly downward through open space", speed: "slow controlled vertical descent", framing: "keep the subject or location readable as the camera descends", end: "finish with the lower subject or destination clearly visible" },
    { id: "drone-push", name: "Drone Push In", movement: "fly smoothly forward through open space toward the subject or destination", speed: "controlled aerial glide", framing: "keep the route and destination readable as the camera approaches", end: "arrive at a closer aerial composition" },
    { id: "drone-pull", name: "Drone Pull Back", movement: "fly smoothly backward away from the subject or destination", speed: "controlled aerial retreat", framing: "keep the subject readable as more landscape appears", end: "finish on a wider aerial composition" },
    { id: "helicopter-shot", name: "Helicopter Shot", movement: "move from high altitude along a broad gradual flight path", speed: "steady controlled aerial motion", framing: "keep the landscape or distant moving subject readable at wide scale", end: "finish on a stable high-altitude composition" },
  ],
  provenance: {
    source: "camera-movement-prompts-v1",
    reviewedBy: "MavenSync Team",
    approvedAt: "2026-08-02",
    supersedes: null,
  },
  status: "active",
};
