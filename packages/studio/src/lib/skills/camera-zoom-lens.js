// Approved Creative Skill Pack V1 — Camera Zoom & Lens.
// Internal backend creative knowledge only. Produced by the Knowledge Compiler
// from the camera movement prompts source document and reviewed by the
// MavenSync team. No runtime registration, matching, or activation in
// Version 1; the Creative Brief enrichment stage consumes approved skills.
//
// Pack principle legend (creativePrinciples references):
//   P1 purposeful-movement  P2 controlled-speed  P3 readable-framing
//   P4 stable-end-state     P5 physical-consistency  P6 audience-orientation

export default {
  skillId: "camera-zoom-lens",
  name: "Camera Zoom & Lens",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  category: "craft-domain",
  supportedStudios: ["video", "marketing"],
  creativePrinciples: ["P2", "P3", "P4", "P5"],
  vocabulary: [
    { concept: "slow zoom", meaning: "gradually change lens focal length at an even pace toward a tighter or wider frame", informs: "motion" },
    { concept: "fast zoom", meaning: "quickly change lens focal length in a decisive, confident move", informs: "motion" },
    { concept: "crash zoom", meaning: "snap the lens rapidly and punchily toward or away from the main target", informs: "motion" },
  ],
  craftGuidance: {
    when: "use zooms to intensify on a subject or expand context from a fixed camera position; slow zooms build focus, crash zooms punctuate",
    why: "changing focal length scales the frame without moving the camera, letting the main visual target grow or recede while its position holds",
    composition: "keep the main visual target centered and readable through the scale change; zoom in toward a tighter composition, zoom out toward a wider one",
    pacing: "slow zooms are gradual and even; fast zooms are quick and decisive; crash zooms are very fast and punchy",
    framing: "keep the target readable as it grows in frame (in) or as surrounding space appears (out); land on a stable composition",
    mistakes: "drifting the target off-center mid-zoom, uneven zoom speed, zooming so fast the target becomes unreadable, and failing to settle on a stable frame",
  },
  constraints: [
    "change lens focal length only; keep the camera position fixed",
    "keep the main visual target centered or clearly readable during the scale change",
    "match zoom speed to the intended effect: gradual, decisive, or punchy",
    "end each zoom on a stable final composition",
  ],
  evaluationRules: [
    { quality: "fixed camera", signal: "the frame scale changes without camera travel", evidence: "tracked camera path review" },
    { quality: "readable target", signal: "the main visual target stays centered and readable through the scale change", evidence: "frame-by-frame target review" },
    { quality: "speed intent", signal: "zoom speed matches the intended effect (gradual, decisive, or punchy)", evidence: "playback review" },
    { quality: "stable end state", signal: "the clip ends on a stable tighter or wider composition", evidence: "final-frame review" },
  ],
  movements: [
    { id: "slow-zoom-in", name: "Slow Zoom In", movement: "slowly increase lens focal length toward a tighter frame", speed: "gradual and even", framing: "keep the main visual target readable as it becomes larger in frame", end: "finish on a stable tighter composition" },
    { id: "slow-zoom-out", name: "Slow Zoom Out", movement: "slowly decrease lens focal length toward a wider frame", speed: "gradual and even", framing: "keep the main visual target readable as more surrounding space appears", end: "finish on a stable wider composition" },
    { id: "fast-zoom-in", name: "Fast Zoom In", movement: "quickly increase lens focal length toward the main visual target", speed: "quick decisive zoom", framing: "keep the target centered or clearly readable during the scale change", end: "finish on a stable tighter composition" },
    { id: "fast-zoom-out", name: "Fast Zoom Out", movement: "quickly decrease lens focal length away from the main visual target", speed: "quick decisive zoom", framing: "keep the target readable as the surrounding space appears", end: "finish on a stable wider composition" },
    { id: "crash-zoom-in", name: "Crash Zoom In", movement: "snap the lens rapidly toward the main visual target", speed: "very fast and punchy", framing: "keep the target readable through the sudden scale change", end: "land on a bold tighter composition" },
    { id: "crash-zoom-out", name: "Crash Zoom Out", movement: "snap the lens rapidly away from the main visual target", speed: "very fast and punchy", framing: "keep the target readable as the surrounding space appears", end: "land on a bold wider composition" },
  ],
  provenance: {
    source: "camera-movement-prompts-v1",
    reviewedBy: "MavenSync Team",
    approvedAt: "2026-08-02",
    supersedes: null,
  },
  status: "active",
};
