import {
  createAgentExecutionRequest,
  isAgentExecutionAuthorized,
} from "../../packages/studio/src/lib/agents/AgentExecutionRequest.js";
import {
  createAgentExecutionAuthorizationContext,
} from "./creatorOsAuth.js";
import { assertAgentExecutionAuthorizationIsActive } from "./agentExecutionApproval.js";

const CLIENT_IDENTITY_FIELDS = [
  "accountId",
  "userId",
  "creatorId",
  "identityKey",
  "authenticatedIdentity",
  "identitySource",
];

function errorResponse(message, code, status) {
  return Response.json({ error: message, code }, { status });
}

function hasClientIdentityOverride(payload) {
  return CLIENT_IDENTITY_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(payload, field));
}

function trustedIdentity(identity) {
  return {
    accountId: identity.accountId,
    // Creator OS currently exposes identityKey as the stable authenticated
    // creator identity. This value is derived server-side.
    creatorId: identity.creatorId || identity.userId || identity.identityKey,
    identityKey: identity.identityKey,
    source: "server",
  };
}

export async function handleAgentExecutionPost(request, { identity } = {}) {
  if (!identity) return errorResponse("Creator OS authentication required.", "creator_os_auth_required", 401);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return errorResponse("Request body must be valid JSON.", "invalid_json", 400);
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return errorResponse("Request body must be a JSON object.", "invalid_request_payload", 400);
  }
  if (hasClientIdentityOverride(payload)) {
    return errorResponse("Authenticated identity is server-owned.", "identity_override_not_allowed", 400);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "authorization")) {
    return errorResponse("Authorization must be supplied as a server-issued proof.", "client_authorization_not_allowed", 400);
  }

  let normalized;
  try {
    ({ request: normalized } = await normalizeAuthorizedAgentExecutionRequest(payload, { identity }));
  } catch (error) {
    return Response.json(
      { error: error.message, code: error.code || "invalid_agent_execution_request", details: error.errors || [] },
      { status: 400 },
    );
  }

  if (!isAgentExecutionAuthorized(normalized)) {
    return errorResponse(
      "An approved server authorization is required before execution.",
      "execution_authorization_required",
      403,
    );
  }

  return Response.json({
    ok: true,
    status: "validated",
    executionStarted: false,
    request: normalized,
  });
}

export async function normalizeAuthorizedAgentExecutionRequest(payload, { identity } = {}) {
  const serverIdentity = trustedIdentity(identity);
  const context = createAgentExecutionAuthorizationContext({ identity: serverIdentity, request: payload });
  const proof = await assertAgentExecutionAuthorizationIsActive({ proof: payload.authorizationProof, context });
  const request = createAgentExecutionRequest({
    ...payload,
    authenticatedIdentity: serverIdentity,
    authorizationProof: undefined,
    authorization: {
      authorizationId: proof.authorizationId,
      status: proof.status,
      source: "server",
      requestedAt: new Date(proof.issuedAt * 1000).toISOString(),
      approvedAt: new Date(proof.issuedAt * 1000).toISOString(),
      approvedBy: proof.approvedBy,
    },
  });
  return { request, proof, context };
}
