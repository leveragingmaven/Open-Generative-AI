import crypto from 'node:crypto';
import { readCreatorIdentity, requireCreatorIdentity } from './creatorOsAuth.js';
import { resolveCreatorAccountId } from './creatorAccountStore.js';
import { verifyCreatorOsServiceToken, requireCreatorOsServiceScope } from './creatorOsServiceAuth.js';

const SERVICE_HEADERS = {
  authorization: 'authorization',
  service: 'x-mavensync-service',
  user: 'x-mavensync-user',
  requestId: 'x-mavensync-request-id',
};

function bearerToken(authorization) {
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/.exec(String(authorization).trim());
  return match ? match[1] : null;
}

function hasServiceAuthHeaders(request) {
  const headers = request?.headers || {};
  return (
    headers[SERVICE_HEADERS.authorization] !== undefined ||
    headers[SERVICE_HEADERS.service] !== undefined ||
    headers[SERVICE_HEADERS.user] !== undefined
  );
}

function headerValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function errorResponse(message, code, status) {
  return Response.json({ error: message, code }, { status });
}

function logServiceAuth(request, result) {
  const headers = request?.headers || {};
  const line = JSON.stringify({
    event: 'creator_os_service_auth',
    route: request?.url || '',
    allowed: result.allowed,
    serviceId: result.serviceId ?? null,
    accountId: result.accountId ?? null,
    email: result.email ?? null,
    requestId: headerValue(headers[SERVICE_HEADERS.requestId]) ?? null,
    code: result.code ?? null,
  });
  console.info(`[service-auth] ${line}`);
}

/**
 * Combined auth for service-readable routes.
 *
 * - If MavenSync internal service-auth headers are present, they are the ONLY
 *   accepted auth path: an invalid service token fails closed and does NOT
 *   fall back to browser session auth.
 * - If no service-auth headers are present, the existing Creator OS cookie
 *   session path is used unchanged.
 * - On success returns `{ identity }` with the server-derived accountId.
 *
 * `requiredScope` selects which service scope is enforced for the route
 * (defaults to `creative.read`, the read-only status surface).
 */
export async function requireCreatorIdentityOrService(request, {
  authenticate = requireCreatorIdentity,
  resolveAccountId = resolveCreatorAccountId,
  requiredScope = 'creative.read',
} = {}) {
  const headers = request?.headers || {};
  if (!hasServiceAuthHeaders(request)) {
    return authenticate(request);
  }

  const authorization = headerValue(headers[SERVICE_HEADERS.authorization]);
  const serviceHeader = headerValue(headers[SERVICE_HEADERS.service]);
  const userHeader = headerValue(headers[SERVICE_HEADERS.user]);

  const token = bearerToken(authorization);
  if (!token) {
    logServiceAuth(request, { allowed: false, code: 'service_auth_invalid_format' });
    return { identity: null, response: errorResponse('Service authentication required.', 'service_auth_required', 401) };
  }

  let verified;
  try {
    verified = verifyCreatorOsServiceToken({ token });
  } catch (error) {
    const code = error?.code || 'service_auth_invalid_format';
    logServiceAuth(request, { allowed: false, code });
    return { identity: null, response: errorResponse('Service authentication failed.', code, 401) };
  }

  try {
    requireCreatorOsServiceScope(verified.scopes, requiredScope);
  } catch (err) {
    const code = err?.code || 'service_auth_missing_scope';
    logServiceAuth(request, { allowed: false, serviceId: verified.serviceId, code });
    return { identity: null, response: errorResponse('Service scope denied.', code, 403) };
  }

  if (serviceHeader && String(serviceHeader).trim() !== verified.serviceId) {
    logServiceAuth(request, { allowed: false, serviceId: verified.serviceId, code: 'service_mismatch' });
    return { identity: null, response: errorResponse('Service authentication failed.', 'service_mismatch', 401) };
  }

  if (userHeader) {
    const normalized = String(userHeader).trim().toLowerCase();
    if (normalized !== verified.subject) {
      logServiceAuth(request, { allowed: false, serviceId: verified.serviceId, email: verified.subject, code: 'user_mismatch' });
      return { identity: null, response: errorResponse('Service authentication failed.', 'user_mismatch', 401) };
    }
  }

  // Resolve the normalized email subject into the server-derived Creator OS
  // identity: identityKey = ai-gency:<sha256(email)> and accountId from the
  // creator_accounts mapping. Maven Harness never supplies accountId/identityKey.
  const identityKey = `ai-gency:${sha256hex(verified.subject)}`;
  let accountId;
  try {
    accountId = await resolveAccountId(identityKey);
  } catch (error) {
    logServiceAuth(request, { allowed: false, serviceId: verified.serviceId, email: verified.subject, code: 'creator_account_unavailable' });
    return { identity: null, response: errorResponse('Creator OS account mapping is unavailable.', 'creator_account_mapping_unavailable', 503) };
  }

  const identity = {
    email: verified.subject,
    username: '',
    role: '',
    identityKey,
    accountId,
    authSource: 'service',
  };
  logServiceAuth(request, { allowed: true, serviceId: verified.serviceId, accountId, email: verified.subject });
  return { identity, response: null };
}

function sha256hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
