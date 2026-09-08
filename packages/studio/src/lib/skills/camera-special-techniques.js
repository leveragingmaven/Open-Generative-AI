// Approved Creative Skill Pack V1 — Special Camera Techniques.
// Internal backend creative knowledge only. Produced by the Knowledge Compiler
// from the camera movement prompts source document and reviewed by the
// MavenSync team. No runtime registration, matching, or activation in
// Version 1; the Creative Brief enrichment stage consumes approved skills.
//
// Pack principle legend (creativePrinciples references):
//   P1 purposeful-movement  P2 controlled-speed  P3 readable-framing
//   P4 stable-end-state     P5 physical-consistency  P6 audience-orientation

export default {
  skillId: "camera-special-techniques",
  name: "Special Camera Techniques",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  category: "craft-domain",
  supportedStudios: ["video", "marketing"],
  creativePrinciples: ["P1", "P2", "P3", "P4", "P5", "P6"],
  vocabulary: [
    { concept: "first person view", meaning: "move forward at human eye height from the character's perspective, using visible hands or body edges as reference", informs: "style" },
    { concept: "tilt shift", meaning: "hold or glide from a high angled view with a narrow band of sharp focus and soft blur above and below", informs: "style" },
    { concept: "infinite zoom", meaning: "zoom continuously inward toward the exact center target until the next visual world fills the frame", informs: "motion" },
    { concept: "earth zoom out", meaning: "pull upward from the starting point through street, city, landscape and planet scale, keeping the origin centered", informs: "motion" },
    { concept: "time lapse", meaning: "hold one fixed camera position while time moves rapidly forward with a stable composition", informs: "motion" },
    { concept: "pass through", meaning: "move forward toward a visible object or surface and continue into the space beyond", informs: "motion" },
  ],
  craftGuidance: {
    when: "use first person view to place the viewer inside a character; tilt shift for a miniature-scale look; infinite zoom and earth zoom out for continuous scale journeys; time lapse for compressed passage of time; pass through to travel into a revealed space",
    why: "each special technique changes the perceptual contract of the shot — personalizing the camera, miniaturizing scale, compressing time, or traveling through barriers",
    composition: "first person keeps hands or body edges as a physical reference; tilt shift keeps a narrow sharp band across the subject; infinite zoom and earth zoom keep the target centered; time lapse keeps the same composition and horizon; pass through keeps the opening centered as the transition point",
    pacing: "first person moves at a natural walking or reaching pace; tilt shift moves small and precise; infinite zoom accelerates smoothly; earth zoom out expands rapidly; time lapse compresses time while the camera stays fixed; pass through glides smoothly and centered",
    framing: "each technique must end with its signature framing intact: the same point of view, the miniature view, the next world filling the frame, the planet-scale view, the same camera angle, or the revealed space beyond",
    mistakes: "breaking the character's point of view, losing the narrow focus band in tilt shift, letting the zoom center drift, keeping the earth zoom origin off-center, moving the camera in time lapse, and passing off-axis through the barrier",
  },
  constraints: [
    "keep first person view at human eye height with a visible physical reference",
    "keep the tilt shift sharp band across the key subject area with soft blur above and below",
    "keep infinite zoom and earth zoom out targets centered through the scale change",
    "hold one fixed camera position for time lapse",
    "keep the pass-through opening or surface centered as the transition point",
  ],
  evaluationRules: [
    { quality: "signature intact", signal: "the technique's defining framing survives to the final frame (POV, miniature, filled frame, planet scale, fixed angle, revealed space)", evidence: "final-frame review" },
    { quality: "perspective discipline", signal: "eye height and physical reference hold in first person; zoom targets stay centered", evidence: "frame-by-frame review" },
    { quality: "focus band", signal: "tilt shift keeps a narrow sharp band with soft blur above and below", evidence: "focus map review" },
    { quality: "stable camera", signal: "time lapse holds one fixed camera position with the same composition and horizon", evidence: "tracked camera path review" },
  ],
  movements: [
    { id: "first-person-view", name: "First Person View", movement: "move forward at human eye height from the character's perspective", speed: "natural walking or reaching pace", framing: "use visible hands, arms or body edges as the viewer's physical reference", end: "arrive at the next point of action from the same point of view" },
    { id: "tilt-shift", name: "Tilt Shift", movement: "hold or glide from a high angled view over the scene", speed: "small precise movement", framing: "keep a narrow band of sharp focus across the key subject area with soft blur above and below", end: "finish with the miniature-scale view intact" },
    { id: "infinite-zoom", name: "Infinite Zoom", movement: "zoom continuously inward toward the exact center target", speed: "smooth accelerating zoom", framing: "keep the circular target centered as it expands", end: "finish when the next visual world fills the frame" },
    { id: "earth-zoom-out", name: "Earth Zoom Out", movement: "pull upward from the starting point through street, city, landscape and planet scale", speed: "rapid expanding zoom out", framing: "keep the original location centered as scale grows", end: "finish on a planet-scale view with the starting point still implied at center" },
    { id: "time-lapse", name: "Time Lapse", movement: "hold one fixed camera position while time moves rapidly forward", speed: "fast time compression with a stable camera", framing: "keep the same composition and horizon as motion passes through the frame", end: "finish from the same camera angle with visible passage of time" },
    { id: "pass-through-objects", name: "Pass Through Objects", movement: "move forward toward a visible object, surface or barrier and continue into the space beyond", speed: "smooth centered glide", framing: "keep the opening or surface centered as the transition point", end: "arrive inside the revealed space beyond" },
  ],
  provenance: {
    source: "camera-movement-prompts-v1",
    reviewedBy: "MavenSync Team",
    approvedAt: "2026-08-02",
    supersedes: null,
  },
  status: "active",
};
