// Approved Creative Skill Pack — Data Visualization (P2 Craft).
// Chart selection, animation, and readability standards for data scenes:
// decision tree, build-up/highlight patterns, density limits, and color
// derived from the playbook. Adapted from OpenMontage's data-visualization.md.

export default {
  skillId: "data-visualization",
  name: "Data Visualization",
  shortName: "DataViz",
  description: "Build data scenes that explain: pick the right chart with a decision tree, animate build-up and narrative highlight, respect density and readability limits, and color from the playbook so the data reads in any frame.",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  category: "motion graphics",
  subcategory: "data-visualization",
  tags: ["data-viz", "charts", "animation", "readability", "dashboard"],
  capabilities: ["data_visualization"],
  supportedStudios: ["video", "marketing", "publishing"],
  creativePrinciples: [
    "one-chart-one-idea: a chart answers one comparison, trend, part, or point",
    "stop-at-first-match: choose the chart by walking the decision tree top-down",
    "readable-any-frame: the chart must be readable at any paused frame of its hold",
    "density-limited: stay inside per-chart density ceilings",
    "color-from-playbook: never invent a palette; color never carries meaning alone",
  ],
  vocabulary: [
    { concept: "chart decision tree", meaning: "read top-to-bottom and stop at the first match: few points then stat-card; many then aggregate; compare->bar, trend->line, parts->pie, KPI->grid", informs: "chart selection" },
    { concept: "build-up animation", meaning: "empty frame -> data enters -> fully built in 2-4s -> hold 3-5s minimum", informs: "animation" },
    { concept: "narrative highlight", meaning: "dim the whole chart to 30% and brighten one element as the narration names it", informs: "animation" },
    { concept: "density ceilings", meaning: "max bars 9, pie slices 6, line points 12, KPI 6 — over that, aggregate to top-N + Other", informs: "chart limits" },
    { concept: "pattern-tag", meaning: "a hatching/dot pattern added so color is not the only encoder", informs: "accessibility" },
  ],
  craftGuidance: {
    summary: "Let data tell one clear idea per chart: choose the type from the decision tree, animate build-up so the viewer follows, keep density low, and use playbook color plus patterns so meaning never depends on color alone.",
    choose: "walk the tree: <3 points -> stat card; >12 -> aggregate; then compare/trend/parts/KPI/ranking/before-after/correlation",
    build: "empty frame -> data begins ~0.3s -> fully built by 2-4s -> hold 3-5s min before transition",
    highlight: "full chart at 30% opacity; one element at full color + 1.05x scale as narration mentions it",
    density: "bars 5-7 (max 9); pie 3-5 (max 6); line 5-12 points; KPI 3-6; always 2D, y-axis at 0 for bars",
    color: "derive from the playbook palette; add patterns and labels; avoid red-green; ~3:1 between adjacent elements",
  },
  constraints: [
    "chart type is chosen by the decision tree, never by habit",
    "a chart must be readable at any paused frame of its hold",
    "density stays within the ceilings per chart",
    "always 2D; y-axis at 0 for bar charts",
    "color never carries meaning alone — pair with patterns and labels",
  ],
  evaluationRules: [
    { quality: "tree-followed", signal: "the chosen chart matches the decision tree for the data", evidence: "chart-to-data mapping" },
    { quality: "readable-any-frame", signal: "the chart is legible at every paused frame of its hold", evidence: "frame sampling" },
    { quality: "density-limit", signal: "series count is within the per-chart ceiling", evidence: "count check" },
    { quality: "meaning-not-color", signal: "patterns/labels back the color encoding", evidence: "visual check" },
    { quality: "scale-honest", signal: "bar y-axes start at 0 and 3D is never used", evidence: "graphic review" },
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
    expectedRuntime: "1-2h",
    outputTypes: ["video", "image"],
    license: "internal",
    reviewStatus: "approved",
    priority: "foundational",
  },
  decisionRules: [
    { id: "R1", if: "there are fewer than 3 data points", then: "use a stat card or single KPI, not a chart", else: "continue the tree", confidence: 1 },
    { id: "R2", if: "there are more than 12 points", then: "aggregate to top-N and add Other", else: "keep the full series", confidence: 1 },
    { id: "R3", if: "the story compares values", then: "use a bar chart", else: "move to the next tree check", confidence: 0.9 },
    { id: "R4", if: "the story is a trend", then: "use a line or area chart", else: "move on", confidence: 0.9 },
    { id: "R5", if: "the story is parts-of-a-whole", then: "use a pie/donut with at most 6 slices", else: "move on", confidence: 0.9 },
    { id: "R6", if: "the story is a KPI", then: "use a KPI grid of at most 6", else: "move on", confidence: 0.9 },
    { id: "R7", if: "a chart exceeds its density ceiling", then: "aggregate to top-N with an Other slice", else: "keep the chart", confidence: 1 },
  ],
  workflow: {
    requiredInputs: ["script", "dataSource"],
    optionalInputs: ["stylePlaybook"],
    inferredInputs: ["chartType"],
    phases: [
      { phase: "pick", description: "walk the chart decision tree for each data beat" },
      { phase: "build", description: "construct the chart within density and readability limits" },
      { phase: "animate", description: "animate build-up and narrative highlight" },
      { phase: "verify", description: "sample paused frames and confirm readability and playbook color" },
    ],
    completionCriteria: [
      "each data beat has a tree-chosen chart",
      "every chart is readable at any paused frame",
      "color and patterns together encode meaning",
    ],
  },
  validation: {
    requiredAssets: [],
    missingContext: {
      script: "the narration beats that each chart must serve",
      dataSource: "the data each chart visualizes",
    },
    unsupportedRequests: [
      "3D charts or non-zero bar y-axes",
    ],
    qualityGates: [
      "no chart above its density ceiling",
      "no red-green-only encoding",
      "no chart unreadable mid-animation",
    ],
  },
  aiTwin: {
    internallyVerifies: [
      "does the chart type match the decision tree?",
      "is the chart readable at a paused frame?",
      "is color within the playbook and never the only encoder?",
    ],
    userVisible: "stores the preferred chart style and playbook colors for consistent data scenes",
  },
  creativeIntelligence: {
    recommendWhen: [
      "the content contains numbers, trends, or comparisons",
      "a data scene must be animated into a video",
    ],
    avoidWhen: [
      "a piece has no data to visualize",
    ],
    reasoning: "capability-first: data-viz serves any scene whose meaning depends on a chart or stat",
  },
};