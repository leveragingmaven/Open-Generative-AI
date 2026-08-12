import crypto from 'node:crypto';

export const CREATOR_OS_SESSION_COOKIE = 'creator_os_session';
const DEFAULT_ISSUER = 'ai-gency';
const DEFAULT_AUDIENCE = 'mavensync-creator-os';
const TOKEN_CLOCK_SKEW_SECONDS = 5;
const MAX_TOKEN_LIFETIME_SECONDS = 60;
const SESSION_TTL_SECONDS = 8 * 60 * 60;

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

export function requireCreatorIdentity(request) {
  const identity = readCreatorIdentity(request);
  if (identity) return { identity, response: null };
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
