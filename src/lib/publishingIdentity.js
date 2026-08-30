const MUAPI_EXTERNAL_ID_NAMESPACE = "mavensync-creator-os";

export function deriveMuApiExternalUserId(identity = {}) {
  const identityKey = typeof identity.identityKey === "string" ? identity.identityKey.trim() : "";
  if (!identityKey) {
    const error = new Error("Authenticated Creator OS identity is required for publishing.");
    error.code = "publishing_identity_required";
    throw error;
  }
  return `${MUAPI_EXTERNAL_ID_NAMESPACE}:${identityKey}`;
}

export function buildMuApiConnectPayload(identity, requestBody = {}) {
  return {
    external_user_id: deriveMuApiExternalUserId(identity),
    redirect_to: requestBody.redirectTo || requestBody.redirect_to || "",
  };
}

export function buildMuApiAccountScope(identity) {
  return new URLSearchParams({ external_user_id: deriveMuApiExternalUserId(identity) });
}

function accountList(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.accounts)) return input.accounts;
  if (Array.isArray(input?.data)) return input.data;
  if (Array.isArray(input?.results)) return input.results;
  return [];
}

function accountId(account = {}) {
  return account.id ?? account.account_id ?? account.accountId ?? null;
}

function accountIsConnected(account = {}) {
  if (account.connected === false || account.is_connected === false) return false;
  const status = String(account.status || "").toLowerCase();
  return !["disconnected", "cancelled", "canceled", "failed", "error"].includes(status);
}

export function assertOwnedMuApiAccount(accountsResponse, requestedAccountId, identity) {
  const externalUserId = deriveMuApiExternalUserId(identity);
  if (requestedAccountId === undefined || requestedAccountId === null || requestedAccountId === "") {
    const error = new Error("Publishing requires a connected account.");
    error.code = "missing_account_id";
    throw error;
  }

  const requested = String(requestedAccountId);
  const account = accountList(accountsResponse).find((candidate) => {
    const candidateId = accountId(candidate);
    const candidateOwner = candidate.external_user_id || candidate.externalUserId;
    return String(candidateId) === requested && (!candidateOwner || candidateOwner === externalUserId);
  });

  if (!account) {
    const error = new Error("The selected publishing account is not available to this user.");
    error.code = "publishing_account_not_owned";
    throw error;
  }
  if (!accountIsConnected(account)) {
    const error = new Error("The selected publishing account is not connected.");
    error.code = "publishing_account_unavailable";
    throw error;
  }
  return account;
}
