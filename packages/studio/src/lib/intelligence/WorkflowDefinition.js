import { createWorkflowNode } from "./WorkflowNode.js";

export function createWorkflowDefinition(input = {}) {
  return {
    id: input.id || `workflow-${Date.now()}`,
    name: input.name || "Untitled Workflow",
    version: input.version || 1,
    nodes: Array.isArray(input.nodes) ? input.nodes.map(createWorkflowNode) : [],
    edges: Array.isArray(input.edges) ? [...input.edges] : [],
    metadata: input.metadata && typeof input.metadata === "object" ? { ...input.metadata } : {},
  };
}

export function validateWorkflowDefinition(definition) {
  const nodeIds = new Set(definition.nodes.map((node) => node.id));
  const errors = [];
  definition.edges.forEach((edge) => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) errors.push({ code: "invalid_edge", edge });
  });
  const indegree = new Map(definition.nodes.map((node) => [node.id, 0]));
  definition.edges.forEach((edge) => indegree.set(edge.target, (indegree.get(edge.target) || 0) + 1));
  const queue = [...indegree.entries()].filter(([, count]) => count === 0).map(([id]) => id);
  let visited = 0;
  while (queue.length) {
    const id = queue.shift(); visited += 1;
    definition.edges.filter((edge) => edge.source === id).forEach((edge) => {
      const next = indegree.get(edge.target) - 1;
      indegree.set(edge.target, next);
      if (next === 0) queue.push(edge.target);
    });
  }
  if (visited !== definition.nodes.length) errors.push({ code: "cycle_detected" });
  return { valid: errors.length === 0, errors };
}
