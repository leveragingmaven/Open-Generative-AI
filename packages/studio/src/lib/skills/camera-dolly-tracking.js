// Approved Creative Skill Pack V1 — Camera Dolly & Tracking.
// Internal backend creative knowledge only. Produced by the Knowledge Compiler
// from the camera movement prompts source document and reviewed by the
// MavenSync team. No runtime registration, matching, or activation in
// Version 1; the Creative Brief enrichment stage consumes approved skills.
//
// Pack principle legend (creativePrinciples references):
//   P1 purposeful-movement  P2 controlled-speed  P3 readable-framing
//   P4 stable-end-state     P5 physical-consistency  P6 audience-orientation

export default {
  skillId: "camera-dolly-tracking",
  name: "Camera Dolly & Tracking",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  category: "craft-domain",
  supportedStudios: ["video", "marketing"],
  creativePrinciples: ["P1", "P2", "P3", "P4", "P5", "P6"],
  vocabulary: [
    { concept: "dolly", meaning: "move the camera physically in a straight line toward or away from the subject", informs: "motion" },
    { concept: "tracking shot", meaning: "move through the scene with the subject at a matched pace", informs: "motion" },
    { concept: "follow shot", meaning: "move behind the subject at shoulder height with the back, shoulder or head leading the frame", informs: "motion" },
    { concept: "reverse tracking", meaning: "move backward in front of a walking subject, keeping the face stable as the background moves behind", informs: "motion" },
    { concept: "side tracking", meaning: "move parallel beside the subject, holding a side or three-quarter profile at a stable distance", informs: "motion" },
    { concept: "chase shot", meaning: "follow a moving subject quickly along the action route, fast, reactive and physically close", informs: "motion" },
  ],
  craftGuidance: {
    when: "use dollies to close or open distance with a subject; use tracking to move with a subject, vehicle or performer so the environment does the moving",
    why: "physical camera travel changes perspective, not just scale, so space reads naturally and the subject stays anchored while the world slides past",
    composition: "keep camera height, lens direction and subject position consistent while distance closes or the environment moves through frame",
    pacing: "dolly in/out at a smooth controlled push or retreat; tracking and follow shots match the subject's pace; chase shots are fast and reactive",
    framing: "dollies tighten or widen the composition; tracking keeps the subject consistently readable; follow shots use the subject's back or shoulder as a foreground guide",
    mistakes: "changing camera height or lens direction mid-move, outrunning or lagging the subject, losing the subject to the frame edge, and unstable framing at speed",
  },
  constraints: [
    "keep camera height and lens direction consistent during a dolly",
    "match the camera pace to the subject, vehicle, footsteps or wheels for tracking moves",
    "keep the subject consistently readable and anchored as the environment moves around them",
    "complete each move on a clear, stable composition",
  ],
  evaluationRules: [
    { quality: "physical travel", signal: "the camera genuinely moves through space rather than only zooming or rotating", evidence: "tracked camera path review" },
    { quality: "matched pacing", signal: "camera speed matches the subject, vehicle or footsteps", evidence: "playback review against subject motion" },
    { quality: "anchored subject", signal: "the subject stays consistently framed while the environment moves", evidence: "frame-by-frame subject review" },
    { quality: "clear end state", signal: "the clip ends on a clear moving or settled composition", evidence: "final-frame review" },
  ],
  movements: [
    { id: "dolly-in", name: "Dolly In", movement: "move the camera physically forward in a straight line toward the main subject", speed: "smooth controlled push", framing: "keep camera height, lens direction and subject position consistent while distance closes", end: "finish in a tighter composition" },
    { id: "dolly-out", name: "Dolly Out", movement: "move the camera physically backward in a straight line away from the main subject", speed: "smooth controlled retreat", framing: "keep lens direction and camera height consistent while more environment enters frame", end: "finish in a wider composition" },
    { id: "tracking-shot", name: "Tracking Shot", movement: "move through the scene with the main subject", speed: "match the subject's pace", framing: "keep the subject consistently readable while the environment moves around them", end: "maintain a clear moving composition" },
    { id: "follow-shot", name: "Follow Shot / Over-the-Shoulder", movement: "move behind the subject along their route at shoulder height", speed: "match the subject's pace", framing: "keep the back, shoulder or head as the foreground guide while the route ahead stays readable", end: "continue following with the subject leading the frame" },
    { id: "reverse-tracking", name: "Reverse Tracking / Walk-and-Talk", movement: "move backward in front of the walking subject", speed: "match the subject's forward pace", framing: "keep front-facing face and body framing stable as the background moves behind them", end: "hold a clear front-facing moving composition" },
    { id: "side-tracking", name: "Side Tracking", movement: "move parallel beside the subject along their direction of travel", speed: "match the subject's motion", framing: "keep the subject in side profile or three-quarter profile at a stable distance", end: "continue the parallel movement with clear horizontal motion" },
    { id: "low-tracking", name: "Low Tracking", movement: "move at ground or below-waist height alongside the subject's movement path", speed: "match the subject, footsteps or wheels", framing: "keep the low detail readable while the ground plane moves through frame", end: "finish with the low perspective clearly maintained" },
    { id: "vehicle-tracking", name: "Vehicle Tracking", movement: "move with the vehicle along its route", speed: "match the vehicle's pace", framing: "keep the vehicle stable in frame while the road or environment moves past", end: "maintain a clear moving vehicle composition" },
    { id: "chase-shot", name: "Chase Shot", movement: "follow a moving subject quickly along the action route", speed: "fast, reactive and physically close", framing: "keep the subject visible while allowing energetic reframing", end: "stay connected to the subject in motion" },
  ],
  provenance: {
    source: "camera-movement-prompts-v1",
    reviewedBy: "MavenSync Team",
    approvedAt: "2026-08-02",
    supersedes: null,
  },
  status: "active",
};
