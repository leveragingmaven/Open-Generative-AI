import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENT_EXECUTION_AUTHORIZATION_STATUS,
  createAgentExecutionRequest,
  isAgentExecutionAuthorized,
  validateAgentExecutionRequest,
} from "./index.js";

const validInput = {
  agentId: "muapi-template-remote-42",
  conversationId: "conversation-42",
  authenticatedIdentity: {
    accountId: "account-1",
    creatorId: "creator-1",
    identityKey: "session-1",
    source: "server",
  },
  userIntent: "Create the approved campaign creative.",
  operation: "creative_generation",
  inputs: { brief: "Launch creative" },
  references: [{ id: "reference-1", type: "image" }],
  attachments: ["https://cdn.example.test/reference.png"],
  requestedSkillIds: ["product-hero-photography", "product-hero-photography"],
  requestedRecipeId: "image",
  requestedWorkflowId: "campaign-image-workflow",
  authorization: {
    status: AGENT_EXECUTION_AUTHORIZATION_STATUS.APPROVED,
    source: "server",
    requestedAt: "2026-08-18T12:00:00.000Z",
    approvedAt: "2026-08-18T12:01:00.000Z",
    approvedBy: "creator-1",
  },
  metadata: { source: "agent-chat" },
};

test("creates a valid declarative request without executing anything", () => {
  const request = createAgentExecutionRequest(validInput);
  assert.equal(request.agentId, validInput.agentId);
  assert.equal(request.operation, validInput.operation);
  assert.deepEqual(request.requestedSkillIds, ["product-hero-photography"]);
  assert.equal(request.requestedRecipeId, "image");
  assert.equal(request.requestedWorkflowId, "campaign-image-workflow");
  assert.equal(isAgentExecutionAuthorized(request), true);
});

test("reports missing required fields", () => {
  const result = validateAgentExecutionRequest({});
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((item) => item.field === "agentId"));
  assert.ok(result.errors.some((item) => item.field === "authenticatedIdentity"));
  assert.ok(result.errors.some((item) => item.field === "authorization"));
});

test("preserves optional campaign and Twin context", () => {
  const request = createAgentExecutionRequest({
    ...validInput,
    campaignId: "campaign-1",
    twinContext: { twinId: "twin-1", businessId: "business-1" },
  });
  assert.equal(request.campaignId, "campaign-1");
  assert.deepEqual(request.twinContext, { twinId: "twin-1", businessId: "business-1" });
});

test("preserves remote agent/template identifiers", () => {
  const request = createAgentExecutionRequest({ ...validInput, agentId: "550e8400-e29b-41d4-a716-446655440000" });
  assert.equal(request.agentId, "550e8400-e29b-41d4-a716-446655440000");
});

test("keeps skill, recipe, and workflow references advisory", () => {
  const request = createAgentExecutionRequest({ ...validInput, requestedSkillIds: ["unknown-skill"], requestedRecipeId: "unknown-recipe", requestedWorkflowId: "unknown-workflow" });
  assert.equal(request.requestedSkillIds[0], "unknown-skill");
  assert.equal(request.requestedRecipeId, "unknown-recipe");
  assert.equal(request.requestedWorkflowId, "unknown-workflow");
});

test("rejects incomplete or client-supplied execution authorization", () => {
  assert.throws(
    () => createAgentExecutionRequest({ ...validInput, authorization: { status: "approved", source: "client", requestedAt: validInput.authorization.requestedAt } }),
    (error) => error.code === "invalid_agent_execution_request",
  );
  const pending = createAgentExecutionRequest({
    ...validInput,
    authorization: { status: AGENT_EXECUTION_AUTHORIZATION_STATUS.PENDING_APPROVAL, source: "server", requestedAt: validInput.authorization.requestedAt },
  });
  assert.equal(isAgentExecutionAuthorized(pending), false);
});
