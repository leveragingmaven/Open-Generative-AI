import crypto from 'node:crypto';
import { CreatorAccountSchemaMissingError, resolveCreatorAccountId } from './creatorAccountStore.js';

export const CREATOR_OS_SESSION_COOKIE = 'creator_os_session';
const DEFAULT_ISSUER = 'ai-gency';
const DEFAULT_AUDIENCE = 'mavensync-creator-os';
const TOKEN_CLOCK_SKEW_SECONDS = 5;
const MAX_TOKEN_LIFETIME_SECONDS = 60;
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const EXECUTION_AUTHORIZATION_TTL_SECONDS = 5 * 60;
const EXECUTION_AUTHORIZATION_MAX_TTL_SECONDS = 15 * 60;

function setting(name, fallback = '') {
  return String(process.env[name] || fallback).trim();
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('invalid_base64url');
  return Buffer.from(value, 'base64url');
}

function signature(secret, encodedPayload) {
  return crypto.createHmac('sha256', secret).update(encodedPayload).digest();
}

function verifySignature(encodedPayload, encodedSignature, secret) {
  const actual = base64UrlDecode(encodedSignature);
  const expected = signature(secret, encodedPayload);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function executionAuthorizationError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function executionIdentity(identity) {
  return {
    accountId: String(identity?.accountId || '').trim(),
    creatorId: String(identity?.creatorId || identity?.userId || identity?.identityKey || '').trim(),
    identityKey: String(identity?.identityKey || '').trim(),
  };
}

export function createAgentExecutionAuthorizationContext({ identity, request } = {}) {
  const context = {
    identity: executionIdentity(identity),
    agentId: String(request?.agentId || request?.agentTemplateId || '').trim(),
    conversationId: String(request?.conversationId || '').trim(),
    operation: String(request?.operation || request?.capability || '').trim(),
    intentFingerprint: crypto.createHash('sha256').update(stableSerialize({
      agentId: String(request?.agentId || request?.agentTemplateId || '').trim(),
      conversationId: String(request?.conversationId || '').trim(),
      userIntent: String(request?.userIntent || '').trim(),
      operation: String(request?.operation || request?.capability || '').trim(),
      campaignId: request?.campaignId || null,
      twinContext: request?.twinContext || null,
      inputs: request?.inputs || {},
      references: request?.references || [],
      attachments: request?.attachments || [],
      requestedSkillIds: request?.requestedSkillIds || request?.skillIds || [],
      requestedRecipeId: request?.requestedRecipeId || request?.recipeId || null,
      requestedWorkflowId: request?.requestedWorkflowId || request?.workflowId || null,
      metadata: request?.metadata || {},
    })).digest('hex'),
  };
  return context;
}

export function issueAgentExecutionAuthorizationProof(context, {
  now = Math.floor(Date.now() / 1000),
  ttlSeconds = EXECUTION_AUTHORIZATION_TTL_SECONDS,
  approvedBy = context?.identity?.creatorId,
} = {}) {
  if (!context?.identity?.accountId || !context?.identity?.creatorId || !context?.agentId || !context?.conversationId || !context?.operation || !context?.intentFingerprint) {
    throw new Error('execution_authorization_context_required');
  }
  const ttl = Number(ttlSeconds);
  if (!Number.isInteger(ttl) || ttl <= 0 || ttl > EXECUTION_AUTHORIZATION_MAX_TTL_SECONDS) {
    throw new Error('invalid_execution_authorization_ttl');
  }
  const payload = {
    type: 'mavensync-agent-execution-approval',
    version: 1,
    authorizationId: crypto.randomUUID(),
    status: 'approved',
    context,
    approvedBy: String(approvedBy || '').trim(),
    issuedAt: now,
    expiresAt: now + ttl,
  };
  if (!payload.approvedBy) throw new Error('execution_approver_required');
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return `${encodedPayload}.${base64UrlEncode(signature(requiredSecret(), encodedPayload))}`;
}

export function verifyAgentExecutionAuthorizationProof(proof, context, {
  now = Math.floor(Date.now() / 1000),
} = {}) {
  if (typeof proof !== 'string') throw executionAuthorizationError('execution_authorization_proof_required');
  const segments = proof.split('.');
  if (segments.length !== 2) throw executionAuthorizationError('invalid_execution_authorization_proof');
  const [encodedPayload, encodedSignature] = segments;
  const secret = requiredSecret();
  if (!verifySignature(encodedPayload, encodedSignature, secret)) throw executionAuthorizationError('invalid_execution_authorization_signature');
  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8'));
  } catch {
    throw executionAuthorizationError('invalid_execution_authorization_payload');
  }
  if (payload.type !== 'mavensync-agent-execution-approval' || payload.version !== 1 || payload.status !== 'approved') {
    throw executionAuthorizationError('invalid_execution_authorization_claims');
  }
  if (!Number.isInteger(payload.issuedAt) || !Number.isInteger(payload.expiresAt) || payload.expiresAt <= payload.issuedAt) {
    throw executionAuthorizationError('invalid_execution_authorization_times');
  }
  if (payload.expiresAt - payload.issuedAt > EXECUTION_AUTHORIZATION_MAX_TTL_SECONDS || payload.expiresAt <= now || payload.issuedAt > now + TOKEN_CLOCK_SKEW_SECONDS) {
    throw executionAuthorizationError('execution_authorization_expired');
  }
  if (!payload.authorizationId || !payload.approvedBy || stableSerialize(payload.context) !== stableSerialize(context)) {
    throw executionAuthorizationError('execution_authorization_context_mismatch');
  }
  return payload;
}

function requiredSecret() {
  const secret = setting('MAVENSYNC_SSO_SECRET');
  if (!secret) throw new Error('sso_secret_missing');
  return secret;
}

function validateClaims(payload, now = Math.floor(Date.now() / 1000)) {
  if (!payload || typeof payload !== 'object') throw new Error('invalid_payload');
  if (payload.iss !== setting('MAVENSYNC_SSO_ISSUER', DEFAULT_ISSUER)) throw new Error('invalid_issuer');
  if (payload.aud !== setting('MAVENSYNC_SSO_AUDIENCE', DEFAULT_AUDIENCE)) throw new Error('invalid_audience');
  if (typeof payload.email !== 'string' || !payload.email.trim()) throw new Error('email_required');
  if (typeof payload.jti !== 'string' || !payload.jti.trim()) throw new Error('jti_required');
  if (!Number.isInteger(payload.iat) || !Number.isInteger(payload.exp)) throw new Error('invalid_time_claims');
  if (payload.exp <= payload.iat || payload.exp - payload.iat > MAX_TOKEN_LIFETIME_SECONDS) throw new Error('invalid_token_lifetime');
  if (payload.iat > now + TOKEN_CLOCK_SKEW_SECONDS || payload.exp < now) throw new Error('token_expired_or_not_yet_valid');
  return payload;
}

export function verifyAgencyToken(token, { now = Math.floor(Date.now() / 1000) } = {}) {
  const segments = typeof token === 'string' ? token.split('.') : [];
  if (segments.length !== 2) throw new Error('invalid_token_format');
  const [encodedPayload, encodedSignature] = segments;
  const secret = requiredSecret();
  if (!verifySignature(encodedPayload, encodedSignature, secret)) throw new Error('invalid_signature');
  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8'));
  } catch {
    throw new Error('invalid_payload');
  }
  return validateClaims(payload, now);
}

function identityFromClaims(claims) {
  const email = claims.email.trim().toLowerCase();
  return {
    email,
    username: typeof claims.username === 'string' ? claims.username : '',
    role: typeof claims.role === 'string' ? claims.role : '',
    identityKey: `ai-gency:${crypto.createHash('sha256').update(email).digest('hex')}`,
    accountId: null,
  };
}

function createSession(identity, now = Math.floor(Date.now() / 1000)) {
  const payload = { ...identity, iat: now, exp: now + SESSION_TTL_SECONDS };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return `${encodedPayload}.${base64UrlEncode(signature(requiredSecret(), encodedPayload))}`;
}

export function readCreatorIdentity(request, { now = Math.floor(Date.now() / 1000) } = {}) {
  const token = request?.cookies?.get?.(CREATOR_OS_SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const [encodedPayload, encodedSignature] = token.split('.');
    if (!encodedPayload || !encodedSignature || !verifySignature(encodedPayload, encodedSignature, requiredSecret())) return null;
    const payload = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8'));
    if (payload.exp < now || payload.iat > now + TOKEN_CLOCK_SKEW_SECONDS) return null;
    return identityFromClaims(payload);
  } catch {
    return null;
  }
}

export async function requireCreatorIdentity(request, { resolveAccountId = resolveCreatorAccountId } = {}) {
  const identity = readCreatorIdentity(request);
  if (identity) {
    try {
      const accountId = await resolveAccountId(identity.identityKey);
      return { identity: { ...identity, accountId }, response: null };
    } catch (error) {
      const schemaMissing = error instanceof CreatorAccountSchemaMissingError || error?.code === 'creator_account_schema_missing';
      return {
        identity: null,
        response: Response.json(
          schemaMissing
            ? { error: 'Creator OS account mapping is not migrated.', code: 'creator_account_schema_missing' }
            : { error: 'Creator OS account mapping is unavailable.', code: 'creator_account_mapping_unavailable' },
          { status: 503 },
        ),
      };
    }
  }
  return {
    identity: null,
    response: Response.json(
      { error: 'Creator OS authentication required.', code: 'creator_os_auth_required' },
      { status: 401 },
    ),
  };
}

export function establishCreatorSession(response, claims) {
  const identity = identityFromClaims(claims);
  response.cookies.set(CREATOR_OS_SESSION_COOKIE, createSession(identity), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  return identity;
}

export function clearCreatorSession(response) {
  response.cookies.set(CREATOR_OS_SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export function creatorSessionTtlSeconds() {
  return SESSION_TTL_SECONDS;
}
