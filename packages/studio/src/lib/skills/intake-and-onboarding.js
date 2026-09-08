// Approved Creative Skill Pack — Intake & Onboarding (P1 Direction).
// The discipline that discovers intent before production and classifies user
// capability so the right assignment options are offered. Adapted from
// OpenMontage's creative-intake.md and onboarding.md.

export default {
  skillId: "intake-and-onboarding",
  name: "Intake & Onboarding",
  shortName: "Intake",
  description: "Discover a production's intent before any creative work: pin purpose, audience, platform, tone, references, outcome, and constraints with one or two questions at a time, and classify the user's available capability so the right starter options are offered without guessing a runtime.",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  category: "strategy",
  subcategory: "intake-and-onboarding",
  tags: ["intake", "onboarding", "brief", "capability"],
  capabilities: ["intake_onboarding"],
  supportedStudios: ["marketing", "ai-twin", "workflow", "video"],
  creativePrinciples: [
    "discover-intent-first: pin purpose, audience, platform, tone, outcome, and constraints before research",
    "one-or-two-at-a-time: ask the minimal set of questions, never a survey",
    "reference-routed-intake: route by the reference the user supplies",
    "capability-truth: classify setup-tier honestly and let it choose the assignment",
    "never-pick-runtime: runtime is a proposal-stage decision, not onboarding",
  ],
  vocabulary: [
    { concept: "creative intake", meaning: "the disciplined prompting protocol that discovers intent before research", informs: "conversation" },
    { concept: "setup tier", meaning: "a classification of available capability (zero-key/starter/standard/full) that selects the assignment", informs: "onboarding" },
    { concept: "reference-routed intake", meaning: "when a user shares a reference, route into reference-driven create rather than generic intake", informs: "intake routing" },
    { concept: "minimal questions", meaning: "ask only what is genuinely missing, one or two at a time, never a survey", informs: "conversation" },
    { concept: "inferred inputs", meaning: "fields the system can derive without asking (platform, aspect, tone defaults)", informs: "questioning" },
  ],
  craftGuidance: {
    summary: "Intake should feel like a short, curious conversation, not a form: discover intent in the right order, ask only what is missing, and route by the user's reference.",
    subject: "every new production and every onboarding conversation",
    order: "purpose then audience then platform then tone then outcome then constraints",
    rhythm: "one or two questions at a time; never batch-ask",
    honesty: "capability honesty: a lower tier gets starter prompts, not a false promise of full capability",
    routing: "a reference shared early routes straight into reference-driven create",
  },
  constraints: [
    "never batch-ask a full brief questionnaire",
    "intent is pinned (purpose, audience, platform, outcome) before research",
    "do not pick a runtime during onboarding",
    "capability is reported truthfully per tier",
  ],
  evaluationRules: [
    { quality: "intent pinned", signal: "purpose, audience, platform, and outcome are stated before research", evidence: "intake transcript review" },
    { quality: "minimal questioning", signal: "only genuinely missing fields are asked, a few at a time", evidence: "question-count audit" },
    { quality: "capability truth", signal: "the assignment matches the honestly-reported capability tier", evidence: "onboarding log" },
    { quality: "runtime deferred", signal: "runtime is not chosen at onboarding time", evidence: "decision review" },
  ],
  provenance: {
    source: "open-montage-harvest-v1",
    reviewedBy: "MavenSync Team",
    approvedAt: "2026-08-07",
    supersedes: null,
  },
  status: "active",
  shared: true,
  discoverable: true,
  metadata: {
    difficulty: "easy",
    estimatedCost: "free",
    expectedRuntime: "instant",
    outputTypes: ["text"],
    license: "internal",
    reviewStatus: "approved",
    priority: "foundational",
  },
  decisionRules: [
    { id: "R1", if: "the user shares a reference", then: "route into reference-driven create", else: "continue generic intake", confidence: 1 },
    { id: "R2", if: "a brief field is already defined", then: "do not ask for it again", else: "ask for it once", confidence: 1 },
    { id: "R3", if: "platform and format are predictable", then: "infer them and ask only the ambiguous", else: "ask directly", confidence: 0.8 },
  ],
  workflow: {
    requiredInputs: [],
    optionalInputs: ["rawBrief", "references"],
    inferredInputs: ["platform", "aspect", "toneDefaults"],
    phases: [
      { phase: "discover-intent", description: "pin purpose, audience, platform, tone, outcome, constraints in order" },
      { phase: "route", description: "route by reference or by intent into the right preparation" },
      { phase: "onboard", description: "classify capability tier and offer the matching starter prompts" },
    ],
    completionCriteria: [
      "purpose, audience, platform, and outcome are pinned",
      "the user was asked only for genuinely missing fields",
      "no runtime was decided during onboarding",
    ],
  },
  validation: {
    requiredAssets: [],
    missingContext: {
      rawBrief: "a user statement of what they want to produce",
      references: "any reference material that grounds intent",
    },
    unsupportedRequests: [
      "full capability promises to a user on a lower tier",
      "choosing a runtime during onboarding",
    ],
    qualityGates: [
      "intent is pinned before research",
      "questioning is minimal",
      "capability is reported honestly",
    ],
  },
  aiTwin: {
    internallyVerifies: [
      "is purpose and outcome pinned before research?",
      "were questions kept minimal and targeted?",
      "was capability reported truthfully?",
    ],
    userVisible: "guides the opening conversation and the onboarding assignment, decommissioning survey-like intake",
  },
  creativeIntelligence: {
    recommendWhen: [
      "a new production begins and intent is not yet known",
      "a user needs onboarding and a capability-based assignment",
    ],
    avoidWhen: [
      "the scope is fully specified and needs execution, not discovery",
    ],
    reasoning: "fit-first: intake is for discovery; once intent is pinned, route to the matching chosen workflow",
  },
};