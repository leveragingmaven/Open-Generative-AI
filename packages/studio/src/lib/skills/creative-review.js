// Approved Creative Skill Pack — Creative Review (P3 Review Intelligence).
// The platform review/QA contract: severity taxonomy, constructive findings,
// stage-fit focus, slideshow-risk, delivery-promise, runtime-honesty, and the
// anti-perfectionism loop. Adapted from OpenMontage's reviewer doctrine.

export default {
  skillId: "creative-review",
  name: "Creative Review",
  shortName: "Review",
  description: "Grade any stage artifact with a structured review language: every finding is accurate, constructive, and severity-tagged; a critical flag blocks until a concrete fix lands; runtime and delivery promises are audited; and the loop stops after a bounded number of rounds.",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  category: "research",
  subcategory: "creative-review",
  tags: ["review", "qa", "severity", "feedback", "delivery", "runtime"],
  capabilities: ["creative_review"],
  supportedStudios: ["video", "workflow", "publishing", "marketing", "ai-twin"],
  creativePrinciples: [
    "accurate: every finding cites the concrete artifact line, field, or frame",
    "complete: one critical finding triggers a scan for its siblings",
    "constructive: a critical finding must carry a concrete proposed fix",
    "severity-discipline: classify findings with the shared severity taxonomy defined in the Creative Contracts platform standard",
    "anti-perfectionism: stop after a valid number of rounds and ship",
    "honest-runtime: the runtime in the render matches the proposal",
  ],
  vocabulary: [
    { concept: "severity", meaning: "the finding classification shared with the platform; the taxonomy (critical/suggestion/investigation) is defined in Creative Contracts", informs: "review" },
    { concept: "critical finding", meaning: "must-fix with a concrete fix; without one it is demoted to investigation", informs: "review" },
    { concept: "constructive finding", meaning: "a finding that names the exact problem and a change to fix it", informs: "review" },
    { concept: "stage-fit focus", meaning: "the specific thing a stage's review cares about most", informs: "review" },
    { concept: "runtime honesty", meaning: "the render's runtime and motion match the promise, never silently changed", informs: "governance" },
  ],
  craftGuidance: {
    summary: "A review is a structured, evidence-based gate: concrete and constructive findings, severity-sorted, runtime honest, and terminated after a bounded number of rounds.",
    subject: "any stage artifact — brief, concept, script, scene plan, assets, edit, render, publish",
    accuracy: "cite the exact line, field, or frame; never hallucinate",
    constructive: "a critical flag only when you can state the concrete fix",
    severity: "use the shared taxonomy from Creative Contracts (critical = must fix; suggestion = should fix; investigate = real concern, no pinpointed fix)",
    stageFit: "proposal cares about promise and cost; script about timing; compose about the runtime",
    runtime: "audit that the chosen runtime in edit_decisions matches the rendered deliverable",
  },
  constraints: [
    "no critical finding without a concrete fix",
    "no vague finding (e.g. 'script too long')",
    "findings must reference a concrete artifact",
    "stop the loop after the anti-perfection limit; pass with warnings",
    "runtime must not be silently swapped",
  ],
  evaluationRules: [
    { quality: "severity-fit", signal: "findings are sorted and tagged with severity", evidence: "review report" },
    { quality: "constructive", signal: "critical findings carry a concrete fix", evidence: "finding audit" },
    { quality: "accurate", signal: "findings cite the exact artifact reference", evidence: "spot-check" },
    { quality: "runtime-honest", signal: "no silent runtime swap against the proposal", evidence: "proposal-vs-render diff" },
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
    { id: "R1", if: "a finding cannot be tied to a concrete artifact", then: "demote it from critical", else: "keep it", confidence: 1 },
    { id: "R2", if: "a requested runtime would change mid-run", then: "flag a critical runtime-honesty finding", else: "accept the promise", confidence: 1 },
    { id: "R3", if: "two review rounds are finished", then: "pass with accepted warnings instead of blocking", else: "continue review", confidence: 1 },
  ],
  workflow: {
    requiredInputs: ["artifactToReview"],
    optionalInputs: ["reviewFocus", "playbook"],
    inferredInputs: ["stage"],
    phases: [
      { phase: "schema-first", description: "validate the structural contract non-negotiably" },
      { phase: "investigate", description: "run the stage-fit review with severity tags" },
      { phase: "severity", description: "commit and sort the findings" },
      { phase: "audit", description: "audit runtime, delivery promise, and findings" },
    ],
    completionCriteria: [
      "every finding is severity-tagged with evidence",
      "no unbounded review loop",
      "runtime matches the delivered promise",
    ],
  },
  validation: {
    requiredAssets: ["artifactToReview"],
    missingContext: {
      artifactToReview: "the brief, concept, script, plan, or render under review",
    },
    unsupportedRequests: [
      "reviews that block forever with no concrete fix",
    ],
    qualityGates: [
      "no critical without a fix",
      "findings are evidence-backed",
    ],
  },
  aiTwin: {
    internallyVerifies: [
      "did every finding cite concrete evidence?",
      "was each critical finding constructed with a fix?",
      "did the scan look for sibling findings?",
    ],
    userVisible: "no user-facing changes unless a stage must be revised to resolve a critical finding",
  },
  creativeIntelligence: {
    recommendWhen: [
      "an artifact must be gated before moving forward",
      "a piece must be quality-checked against a hold-rule",
      "a runtime or delivery promise must be audited",
    ],
    avoidWhen: [
      "there is nothing to review yet",
    ],
    reasoning: "capability-first: creative review is the standard gate for any stage artifact",
  },
};