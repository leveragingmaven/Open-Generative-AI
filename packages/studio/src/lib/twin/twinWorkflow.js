// AI Twin Studio — Twin onboarding workflow.
//
// Every published twin gets a dedicated, editable AI Twin workflow that
// becomes the default onboarding workflow for that twin. The workflow is
// created through the standard Workflow Studio API (createWorkflow) so it
// appears in Workflow Studio and remains editable there.
//
// This module is intentionally decoupled from React: the payload builder is
// pure and unit-testable; creation goes through ProviderRegistry.createWorkflow.

import { TWIN_ASSET_CATALOG } from "./TwinProfile.js";
import { createWorkflow } from "../providers/ProviderRegistry.js";
import { buildTwinAssetPrompt, composeCreativeDefaults } from "./twinAssets.js";
import { updateTwin } from "./TwinStore.js";

export const TWIN_ONBOARDING_MODEL = "nano-banana-pro";

let nodeSeq = 0;
const nextId = (prefix) => `${prefix}-${Date.now()}-${nodeSeq++}`;

export function buildTwinOnboardingWorkflow(twin) {
  const identity = twin?.identity || {};
  const identityDescription = [
    `Twin: ${twin?.name || "My AI Twin"}`,
    identity.description,
    composeCreativeDefaults(twin?.creativeDefaults),
  ]
    .filter(Boolean)
    .join(". ");

  const nodes = [];
  const edges = [];
  const identityNodeId = "twin-identity";

  nodes.push({
    id: identityNodeId,
    category: "text",
    model: "identity-description",
    input_params: { prompt: identityDescription },
    output_params: { resultUrl: null, outputs: [] },
    params: { prompt: identityDescription, outputs: [] },
    position: { x: 0, y: 40 },
    inputs: [],
  });

  const step = 300;
  TWIN_ASSET_CATALOG.forEach((assetType, index) => {
    const nodeId = `twin-${assetType.id}`;
    const prompt = buildTwinAssetPrompt(twin, assetType.id);
    nodes.push({
      id: nodeId,
      category: "image",
      model: TWIN_ONBOARDING_MODEL,
      input_params: { prompt, aspect_ratio: assetType.aspectRatio },
      output_params: { resultUrl: null, outputs: [] },
      params: { prompt, aspect_ratio: assetType.aspectRatio, outputs: [] },
      position: { x: 380, y: 40 + index * step },
      inputs: [identityNodeId],
    });
    edges.push({
      id: nextId("edge"),
      source: identityNodeId,
      target: nodeId,
      sourceHandle: null,
      targetHandle: null,
    });
  });

  return {
    workflow_id: null,
    name: `${twin?.name || "My AI Twin"} — AI Twin Onboarding`,
    edges,
    data: { nodes },
  };
}

// Creates the twin's onboarding workflow via the standard Workflow API and
// stores the returned workflow id on the twin record.
export async function createTwinOnboardingWorkflow(apiKey, twin, storage) {
  if (!apiKey || !twin?.id) return { ok: false, workflowId: null, error: "missing_api_key_or_twin" };
  const payload = buildTwinOnboardingWorkflow(twin);
  const response = await createWorkflow(apiKey, payload);
  const workflowId = response?.workflow_id || response?.id || response?.workflowId || null;
  if (workflowId) {
    updateTwin(twin.id, { workflowId }, storage);
  }
  return { ok: true, workflowId, response };
}
