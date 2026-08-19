import assert from "node:assert/strict";
import test from "node:test";

import { handleAgentExecutionRoute } from "./route.js";
import {
  issueAgentExecutionApproval,
} from "../../../src/lib/agentExecutionApproval.js";

process.env.MAVENSYNC_SSO_SECRET = "agent-execution-test-secret";

const identity = {
  accountId: "account-server",
  identityKey: "ai-gency:server-creator",
  email: "creator@example.test",
};

const approvedAuthorization = {
  status: "approved",
  source: "server",
  requestedAt: "2026-08-18T12:00:00.000Z",
  approvedAt: "2026-08-18T12:01:00.000Z",
  approvedBy: "ai-gency:server-creator",
};

function request(body) {
  return new Request("http://localhost/api/agent-execution", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validPayload(overrides = {}) {
  return {
    agentId: "muapi-template-remote-42",
    conversationId: "muapi-conversation-42",
    userIntent: "Create the approved campaign creative.",
    operation: "creative_generation",
    inputs: { brief: "Launch creative" },
    references: [],
    attachments: [],
    requestedSkillIds: ["advisory-skill"],
    requestedRecipeId: "advisory-recipe",
    requestedWorkflowId: "advisory-workflow",
    ...overrides,
  };
}

async function withApproval(payload, options = {}) {
  const approval = await issueAgentExecutionApproval({ payload, identity, ...options });
  return {
    ...payload,
    authorizationProof: approval.proof,
  };
}

async function json(response) {
  return { status: response.status, body: await response.json() };
}

const noRateLimit = async () => null;
const authenticate = async () => ({ identity, response: null });
const unauthenticate = async () => ({ identity: null, response: Response.json({ error: "Creator OS authentication required.", code: "creator_os_auth_required" }, { status: 401 }) });

function routeRequest(body, authenticateOverride = authenticate) {
  return handleAgentExecutionRoute(request(body), { authenticate: authenticateOverride, rateLimit: noRateLimit });
}

test("accepts an authenticated valid request and returns a normalized request", async () => {
  const result = await json(await routeRequest(await withApproval(validPayload())));
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.status, "validated");
  assert.equal(result.body.executionStarted, false);
  assert.equal(result.body.request.authenticatedIdentity.accountId, "account-server");
  assert.equal(result.body.request.authenticatedIdentity.creatorId, identity.identityKey);
});

test("rejects an unauthenticated request", async () => {
  const result = await json(await routeRequest(await withApproval(validPayload()), unauthenticate));
  assert.equal(result.status, 401);
  assert.equal(result.body.code, "creator_os_auth_required");
});

test("rejects browser attempts to override server-owned identity", async () => {
  const approved = await withApproval(validPayload());
  const result = await json(await routeRequest({ ...approved, accountId: "attacker-account" }));
  assert.equal(result.status, 400);
  assert.equal(result.body.code, "identity_override_not_allowed");
});

test("accepts approved authorization and rejects pending authorization", async () => {
  const approved = await json(await routeRequest(await withApproval(validPayload())));
  assert.equal(approved.status, 200);

  const pending = await json(await routeRequest(validPayload()));
  assert.equal(pending.status, 400);
  assert.equal(pending.body.code, "execution_authorization_proof_required");
});

test("preserves optional campaign and Twin context", async () => {
  const result = await json(await routeRequest(await withApproval(validPayload({
    campaignId: "campaign-7",
    twinContext: { twinId: "twin-7", businessId: "business-7" },
  }))));
  assert.deepEqual(result.body.request.campaignId, "campaign-7");
  assert.deepEqual(result.body.request.twinContext, { twinId: "twin-7", businessId: "business-7" });
});

test("preserves remote agent/template and conversation IDs", async () => {
  const result = await json(await routeRequest(await withApproval(validPayload({
    agentId: "550e8400-e29b-41d4-a716-446655440000",
    conversationId: "remote-conversation-9",
  }))));
  assert.equal(result.body.request.agentId, "550e8400-e29b-41d4-a716-446655440000");
  assert.equal(result.body.request.conversationId, "remote-conversation-9");
});

test("rejects malformed request payloads", async () => {
  const malformed = await json(await routeRequest({ operation: "missing identity and authorization" }));
  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.code, "execution_authorization_proof_required");

  const invalidJson = await json(await handleAgentExecutionRoute(new Request("http://localhost/api/agent-execution", { method: "POST", body: "{" }), { authenticate, rateLimit: noRateLimit }));
  assert.equal(invalidJson.status, 400);
  assert.equal(invalidJson.body.code, "invalid_json");
});

test("rejects a missing, forged, altered, expired, or mismatched approval proof", async () => {
  const base = validPayload();
  const missing = await json(await routeRequest(base));
  assert.equal(missing.status, 400);
  assert.equal(missing.body.code, "execution_authorization_proof_required");

  const forged = await json(await routeRequest({ ...base, authorizationProof: "fake.approval" }));
  assert.equal(forged.status, 400);

  const proof = await withApproval(base);
  const altered = await json(await routeRequest({ ...base, operation: "different_operation", authorizationProof: proof.authorizationProof }));
  assert.equal(altered.status, 400);

  const expired = await json(await routeRequest(withApproval(base, { now: 100, ttlSeconds: 10 })));
  assert.equal(expired.status, 400);

  const wrongAccount = await json(await handleAgentExecutionRoute(request(proof), { authenticate: async () => ({ identity: { ...identity, accountId: "other-account" }, response: null }), rateLimit: noRateLimit }));
  assert.equal(wrongAccount.status, 400);

  const wrongAgent = await json(await routeRequest({ ...base, agentId: "another-agent", authorizationProof: proof.authorizationProof }));
  assert.equal(wrongAgent.status, 400);

  const wrongConversation = await json(await routeRequest({ ...base, conversationId: "another-conversation", authorizationProof: proof.authorizationProof }));
  assert.equal(wrongConversation.status, 400);

  const wrongOperation = await json(await routeRequest({ ...base, operation: "another_operation", authorizationProof: proof.authorizationProof }));
  assert.equal(wrongOperation.status, 400);
});

test("rejects client-created approval objects even without a proof", async () => {
  const result = await json(await routeRequest({ ...validPayload(), authorization: approvedAuthorization }));
  assert.equal(result.status, 400);
  assert.equal(result.body.code, "client_authorization_not_allowed");
});
