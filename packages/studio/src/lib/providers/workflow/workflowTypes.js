import { normalizeAssetReference } from "../../mavensync/AssetHandoff.js";
import { normalizeJobResponse } from "../../jobs/jobTypes.js";
import { WorkflowValidationError } from "./workflowErrors.js";

export function normalizeWorkflowPreset(input = {}) {
  const id = input.id || input.workflow_id || input.slug || `workflow-${Date.now()}`;
  const data = input.data || {};
  return {
    id,
    name: input.name || input.title || "Untitled Workflow",
    description: input.description || "",
    category: input.category || "General",
    version: input.version || "1",
    nodes: input.nodes || data.nodes || [],
    edges: input.edges || data.edges || [],
    inputs: input.inputs || input.input_data || [],
    outputs: input.outputs || input.output_data || [],
    requiredProviders: input.requiredProviders || ["muapi"],
    thumbnail: input.thumbnail || input.thumbnail_url || null,
    source: input.source || "muapi-workflow",
    raw: input,
  };
}

export function validateWorkflowGraph(definition = {}) {
  const nodes = definition.nodes || definition.data?.nodes || [];
  const edges = definition.edges || definition.data?.edges || [];
  const nodeIds = new Set(nodes.map((node) => node.id).filter(Boolean));
  const errors = [];

  if (!Array.isArray(nodes)) errors.push({ code: "nodes_not_array" });
  if (!Array.isArray(edges)) errors.push({ code: "edges_not_array" });

  for (const edge of Array.isArray(edges) ? edges : []) {
    if (edge.source && !nodeIds.has(edge.source)) {
      errors.push({ code: "missing_source_node", edgeId: edge.id, nodeId: edge.source });
    }
    if (edge.target && !nodeIds.has(edge.target)) {
      errors.push({ code: "missing_target_node", edgeId: edge.id, nodeId: edge.target });
    }
  }

  if (errors.length) {
    throw new WorkflowValidationError("Workflow graph contains invalid references", { errors });
  }

  return {
    ok: true,
    nodeCount: nodes.length,
    edgeCount: edges.length,
  };
}

export function normalizeWorkflowRun(input = {}, context = {}) {
  const job = normalizeJobResponse(input);
  return {
    ...job,
    id: input.run_id || job.id,
    workflowId: input.workflow_id || context.workflowId || null,
    provider: input.provider || "muapi",
    ownerId: context.session?.userId || input.ownerId || null,
    tenantId: context.session?.tenantId || input.tenantId || null,
    projectId: context.launchContext?.projectId || input.projectId || null,
    campaignId: context.launchContext?.campaignId || input.campaignId || null,
    raw: input,
  };
}

export function normalizeWorkflowOutputAsset(output = {}, context = {}) {
  const url = output.url || output.value || output.assetUrl || null;
  return normalizeAssetReference(
    {
      id: output.assetId || output.id,
      url,
      kind: output.kind || output.type,
      provider: output.provider || "muapi",
      sourceJobId: output.sourceJobId || output.run_id || context.runId,
      prompt: output.prompt,
      metadata: {
        ...(output.metadata || {}),
        workflowId: output.workflowId || context.workflowId || null,
        outputId: output.id || null,
        temporaryUrl: Boolean(output.temporaryUrl || output.expires_at || output.signedUrl),
      },
    },
    context,
  );
}

export class PollingRegistry {
  constructor() {
    this.inFlight = new Map();
  }

  run(key, task) {
    if (this.inFlight.has(key)) return this.inFlight.get(key);
    const promise = Promise.resolve()
      .then(task)
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise);
    return promise;
  }

  has(key) {
    return this.inFlight.has(key);
  }
}
