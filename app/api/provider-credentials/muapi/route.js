import { requireCreatorIdentity } from '../../../../src/lib/creatorOsAuth.js';
import { requireCreatorOsRateLimit } from '../../../../src/lib/creatorOsRateLimit.js';
import { encryptProviderCredential } from '../../../../src/lib/providerCredentialEncryption.js';
import { MySqlProviderCredentialRepository } from '../../../../src/lib/providerCredentialRepository.js';

function identityFields(payload) {
  return ['accountId', 'userId', 'creatorId', 'identityKey', 'authenticatedIdentity', 'identitySource'].some((field) => Object.prototype.hasOwnProperty.call(payload || {}, field));
}

function safeStatus(record) {
  return { provider: 'muapi', configured: !!record, status: record?.status || 'not_configured', updatedAt: record?.updatedAt || null };
}

function errorResponse(error) {
  const code = error?.code || 'provider_credential_request_failed';
  const status = code === 'creator_os_auth_required' ? 401 : code === 'trusted_identity_fields_not_allowed' ? 400 : 400;
  return Response.json({ error: code === 'provider_credential_required:muapi' ? 'MuAPI BYOK credential is required.' : 'Unable to manage provider credential.', code }, { status });
}

export async function handleMuApiCredentialPost(request, { identity, repository } = {}) {
  if (!identity) return errorResponse(Object.assign(new Error('creator_os_auth_required'), { code: 'creator_os_auth_required' }));
  let payload;
  try { payload = await request.json(); } catch { return errorResponse(Object.assign(new Error('invalid_json'), { code: 'invalid_json' })); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return errorResponse(Object.assign(new Error('invalid_request_payload'), { code: 'invalid_request_payload' }));
  if (identityFields(payload)) return errorResponse(Object.assign(new Error('trusted_identity_fields_not_allowed'), { code: 'trusted_identity_fields_not_allowed' }));
  const apiKey = typeof payload.apiKey === 'string' ? payload.apiKey.trim() : typeof payload.credential === 'string' ? payload.credential.trim() : '';
  if (!apiKey) return errorResponse(Object.assign(new Error('provider_credential_required:muapi'), { code: 'provider_credential_required:muapi' }));
  try {
    const encrypted = encryptProviderCredential(apiKey);
    const saved = await (repository || new MySqlProviderCredentialRepository()).save({
      accountId: identity.accountId,
      creatorIdentityKey: identity.identityKey || identity.creatorId || identity.userId,
      providerId: 'muapi',
      ciphertext: encrypted,
      encryptionVersion: encrypted.version,
    });
    return Response.json(safeStatus(saved));
  } catch (error) { return errorResponse(error); }
}

export async function handleMuApiCredentialGet({ identity, repository } = {}) {
  if (!identity) return errorResponse(Object.assign(new Error('creator_os_auth_required'), { code: 'creator_os_auth_required' }));
  try {
    const record = await (repository || new MySqlProviderCredentialRepository()).getActive({ accountId: identity.accountId, creatorIdentityKey: identity.identityKey || identity.creatorId || identity.userId, providerId: 'muapi' });
    return Response.json(safeStatus(record));
  } catch (error) { return errorResponse(error); }
}

export async function handleMuApiCredentialDelete({ identity, repository } = {}) {
  if (!identity) return errorResponse(Object.assign(new Error('creator_os_auth_required'), { code: 'creator_os_auth_required' }));
  try {
    await (repository || new MySqlProviderCredentialRepository()).revoke({ accountId: identity.accountId, creatorIdentityKey: identity.identityKey || identity.creatorId || identity.userId, providerId: 'muapi' });
    return Response.json({ provider: 'muapi', configured: false, status: 'revoked', updatedAt: new Date().toISOString() });
  } catch (error) { return errorResponse(error); }
}

export async function route(request, options = {}) {
  const auth = await (options.authenticate || requireCreatorIdentity)(request);
  if (auth.response) return auth.response;
  const limited = await (options.rateLimit || requireCreatorOsRateLimit)(request, auth.identity);
  if (limited) return limited;
  return options.method === 'GET' ? handleMuApiCredentialGet({ ...options, identity: auth.identity }) : options.method === 'DELETE' ? handleMuApiCredentialDelete({ ...options, identity: auth.identity }) : handleMuApiCredentialPost(request, { ...options, identity: auth.identity });
}

export async function POST(request) { return route(request, { method: 'POST' }); }
export async function GET(request) { return route(request, { method: 'GET' }); }
export async function DELETE(request) { return route(request, { method: 'DELETE' }); }
