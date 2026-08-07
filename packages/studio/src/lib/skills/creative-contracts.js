// Approved Creative Skill Pack — Creative Contracts (P0 Platform Standard).
// The foundational platform-wide creative doctrine adopted from OpenMontage:
// the Anti-Subjective Rule, the 5-aspect prompt spec, the reviewer severity
// taxonomy, the tone/honesty contract, and the checkpoint/approval gate model.
// Advisory knowledge only; consumed by Creative Intelligence and AI Twin.

export default {
  skillId: "creative-contracts",
  name: "Creative Contracts",
  shortName: "Contracts",
  description: "The platform-level creative contract every production honors: name visual causes instead of mood adjectives, write to the 5-aspect prompt, classify review findings by severity, keep runtime and delivery promises honest, and gate every consequential decision at a checkpoint.",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  category: "craft-domain",
  subcategory: "creative-contracts",
  tags: ["contracts", "anti-subjective", "5-aspect", "severity", "honesty", "governance"],
  capabilities: ["creative_contract"],
  supportedStudios: ["video", "marketing", "ai-twin", "workflow", "publishing"],
  creativePrinciples: [
    "visual-cause-not-mood: replace every emotional or taste adjective with a concrete visual cause",
    "name-what-brings-field: write prompts to the 5-aspect contract, not prose",
    "structured-severity: findings carry a critical/suggestion/investigation class",
    "honesty-first: motion, runtime, and delivery promises are honored, never silently downgraded",
    "gate-every-change: consequential decisions pause at an approval checkpoint",
    "append-dont-rewrite: the decision log is append-only and keyed by (category, subject)",
  ],
  vocabulary: [
    { concept: "anti-subjective rule", meaning: "replace emotional adjectives ('epic', 'moody', 'cinematic') with concrete visual causes and chosen parameters", informs: "prompt writing" },
    { concept: "5-aspect contract", meaning: "the subject / subject-motion / scene / spatial / camera scaffold that prompts must satisfy deterministically", informs: "prompt use" },
    { concept: "severity taxonomy", meaning: "critical, suggestion, investigation — the shared classification for review findings", informs: "review" },
    { concept: "delivery promise", meaning: "the motion/format the user was told to expect, which must hold through compose", informs: "honesty" },
    { concept: "decision log", meaning: "an append-only record of each principled choice, keyed by category and subject", informs: "governance" },
    { concept: "approval checkpoint", meaning: "the point where a gated stage must pause for explicit human approval", informs: "workflow" },
  ],
  craftGuidance: {
    summary: "Bind every creative brief to the deterministic vocabulary of the platform: visual cause, the 5-aspect prompt, severity-classified findings, honest delivery promises, and gated decision checkpoints.",
    subject: "the working brief, its prompt language, and every consequential decision it records",
    composition: "no taste-describing word enters a prompt; only parametrizable visuals",
    structure: "prompts follow Subject, Subject-Motion, Scene, Spatial, Camera order",
    review: "findings are concrete, quantified, and classified by severity",
    governance: "every material change is logged and gated; the runtime and delivery promise are kept",
  },
  constraints: [
    "no mood-only words in prompts; describe the visual cause",
    "no silent downgrade of a promised motion or runtime",
    "every finding must name an artwork or be classified as an investigation (never critical)",
    "consequential decisions pause at an approval checkpoint",
    "decision log entries are appended, never rewritten-in-place",
  ],
  evaluationRules: [
    { quality: "visual-cause discipline", signal: "every mood adjective has a concrete visual substitute and parameters are named", evidence: "prompt-text scan" },
    { quality: "scaffold completeness", signal: "the 5-aspect contract is fulfilled for every shot request", evidence: "the prompt skeleton covers the shot" },
    { quality: "severity discipline", signal: "findings list class + concrete fix (or are demoted to investigation)", evidence: "review artifact review" },
    { quality: "promise honesty", signal: "the promised motion/runtime matches the final render with no unlogged swap", evidence: "delivery-vs-edit_decisions diff" },
    { quality: "gated decisions", signal: "each checkpoint holds an approval record and an append-only log entry", evidence: "decision-log audit" },
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
    difficulty: "medium",
    estimatedCost: "free",
    expectedRuntime: "instant",
    outputTypes: ["text"],
    license: "internal",
    reviewStatus: "approved",
    priority: "foundational",
  },
  decisionRules: [
    { id: "R1", if: "a prompt contains a mood or taste adjective", then: "replace it with a concrete parametrized visual cause before routing", else: "keep the prompt", confidence: 1 },
    { id: "R2", if: "a finding cannot state a concrete fix", then: "classify it as investigation, never critical", else: "classify it critical/suggestion by need", confidence: 1 },
    { id: "R3", if: "a promised motion is not reproducible in the chosen runtime", then: "state the honest limit at proposal and let the user choose", else: "proceed with the promise", confidence: 1 },
    { id: "R4", if: "a design decision changes mid-run", then: "log an append-only entry and pause for approval", else: "continue to next gate", confidence: 1 },
  ],
  workflow: {
    requiredInputs: ["creativeBrief", "campaignContext"],
    optionalInputs: ["draftPrompt", "reviewFindings"],
    inferredInputs: ["platform", "aspect"],
    phases: [
      { phase: "enrich", description: "apply the contracts to the brief and prompt langauge" },
      { phase: "review", description: "classify findings by severity with concrete evidence" },
      { phase: "gate", description: "pause at approval checkpoints; append decisions to the log" },
    ],
    completionCriteria: [
      "no undefined mood adjectives remain in the brief",
      "the review findings are severity-classified with concrete evidence",
      "every consequential decision has an approval record",
    ],
  },
  validation: {
    requiredAssets: [],
    missingContext: {
      creativeBrief: "the campaign goal and subject that the creative contracts anchor to",
      campaignContext: "the campaign context that grounds tone and delivery promise",
    },
    unsupportedRequests: [
      "requests to write mood adjectives with no visual cause",
      "requests to silently swap a promised reproduction run",
    ],
    qualityGates: [
      "no mood-only words in the final brief",
      "no unaddressed critical findings before publish",
    ],
  },
  aiTwin: {
    internallyVerifies: [
      "does the brief name visual causes for each taste description?",
      "does every finding state the evidence and a concrete fix?",
      "does the delivery promise match what the runtime will produce?",
    ],
    userVisible: "applies the platform creative contracts to every brief and review before Creative Intelligence acts on it",
  },
  creativeIntelligence: {
    recommendWhen: [
      "the brief leans on vague mood or taste language",
      "a new production needs a shared review and governance contract",
      "a runtime or delivery promise must be recorded honestly",
    ],
    avoidWhen: [
      "the task is a constrained, already-gated execution with no review scope",
    ],
    reasoning: "capability-first: apply the platform contracts whenever the request needs grounded prompt language and governed decisions",
  },
};