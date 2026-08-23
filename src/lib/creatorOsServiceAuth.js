import crypto from 'node:crypto';

export const CREATOR_OS_SERVICE_AUTH_ISSUER = 'mavensync-harness';
export const CREATOR_OS_SERVICE_AUTH_AUDIENCE = 'mavensync-creator-os';
export const CREATOR_OS_SERVICE_AUTH_ALGORITHM = 'HS256';
export const CREATOR_OS_SERVICE_AUTH_MAX_TTL_SECONDS = 300;
export const CREATOR_OS_SERVICE_AUTH_CLOCK_SKEW_SECONDS = 30;

export const CREATOR_OS_SERVICE_SCOPES = [
  'business.read',
  'artifact.read',
  'artifact.write',
  'work.read',
  'work.write',
  'creative.prepare',
  'creative.execute',
  'creative.read',
  'publishing',
];

export function setting(name, fallback = '') {
  return String(process.env[name] || fallback).trim();
}

function getRequiredEnv(name) {
  const value = setting(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export class CreatorOsServiceAuthError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CreatorOsServiceAuthError';
    this.code = code;
  }
}

function base64UrlDecode(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new CreatorOsServiceAuthError('service_auth_invalid_format', 'invalid base64url encoding');
  return Buffer.from(value, 'base64url');
}

function parseJsonSegment(encoded) {
  let value;
  try {
    value = JSON.parse(base64UrlDecode(encoded).toString('utf8'));
  } catch {
    throw new CreatorOsServiceAuthError('service_auth_invalid_format', 'service token payload is not valid JSON');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CreatorOsServiceAuthError('service_auth_invalid_format', 'service token payload must be a JSON object');
  }
  return value;
}

function signature(secret, message) {
  return crypto.createHmac('sha256', secret).update(message).digest();
}

function verifySignature(message, encodedSignature, secret) {
  const actual = base64UrlDecode(encodedSignature);
  const expected = signature(secret, message);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function normalizeEmailSubject(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CreatorOsServiceAuthError('service_auth_missing_subject', 'service token subject is missing');
  }
  const normalized = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new CreatorOsServiceAuthError('service_auth_invalid_subject', 'service token subject is not a normalized email');
  }
  return normalized;
}

export function verifyCreatorOsServiceToken({ token, now = Math.floor(Date.now() / 1000) } = {}) {
  const current = setting('MAVENSYNC_SERVICE_AUTH_SECRET');
  const previous = setting('MAVENSYNC_SERVICE_AUTH_SECRET_PREVIOUS');
  if (!current && !previous) {
    throw new CreatorOsServiceAuthError('service_auth_not_configured', 'service auth secret is not configured');
  }

  const segments = typeof token === 'string' ? token.split('.') : [];
  if (segments.length !== 3) {
    throw new CreatorOsServiceAuthError('service_auth_invalid_format', 'service token must have 3 segments');
  }
  const [encodedHeader, encodedPayload, encodedSignature] = segments;
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new CreatorOsServiceAuthError('service_auth_invalid_format', 'service token is malformed');
  }

  const header = parseJsonSegment(encodedHeader);
  if (header.alg !== CREATOR_OS_SERVICE_AUTH_ALGORITHM) {
    throw new CreatorOsServiceAuthError('service_auth_invalid_algorithm', `unsupported algorithm "${String(header.alg)}"`);
  }

  const message = `${encodedHeader}.${encodedPayload}`;
  let valid = current && verifySignature(message, encodedSignature, current);
  if (!valid && previous) {
    valid = verifySignature(message, encodedSignature, previous);
  }
  if (!valid) {
    throw new CreatorOsServiceAuthError('service_auth_invalid_signature', 'service token signature is invalid');
  }

  const payload = parseJsonSegment(encodedPayload);
  const skew = CREATOR_OS_SERVICE_AUTH_CLOCK_SKEW_SECONDS;

  if (payload.iss !== CREATOR_OS_SERVICE_AUTH_ISSUER) {
    throw new CreatorOsServiceAuthError('service_auth_wrong_issuer', 'service token issuer mismatch');
  }
  if (payload.aud !== CREATOR_OS_SERVICE_AUTH_AUDIENCE) {
    throw new CreatorOsServiceAuthError('service_auth_wrong_audience', 'service token audience mismatch');
  }
  const subject = normalizeEmailSubject(payload.sub);
  if (typeof payload.sid !== 'string' || payload.sid.trim() === '') {
    throw new CreatorOsServiceAuthError('service_auth_missing_service', 'service token is missing the calling service id');
  }
  if (!Number.isInteger(payload.iat)) {
    throw new CreatorOsServiceAuthError('service_auth_not_yet_valid', 'service token is missing a valid iat');
  }
  if (!Number.isInteger(payload.exp)) {
    throw new CreatorOsServiceAuthError('service_auth_expired', 'service token is missing a valid exp');
  }
  if (payload.exp <= payload.iat) {
    throw new CreatorOsServiceAuthError('service_auth_ttl_exceeded', 'service token exp must be after iat');
  }
  if (payload.exp - payload.iat > CREATOR_OS_SERVICE_AUTH_MAX_TTL_SECONDS) {
    throw new CreatorOsServiceAuthError('service_auth_ttl_exceeded', 'service token lifetime exceeds the maximum');
  }
  if (payload.exp < now - CREATOR_OS_SERVICE_AUTH_CLOCK_SKEW_SECONDS) {
    throw new CreatorOsServiceAuthError('service_auth_expired', 'service token has expired');
  }
  if (payload.iat > now + CREATOR_OS_SERVICE_AUTH_CLOCK_SKEW_SECONDS) {
    throw new CreatorOsServiceAuthError('service_auth_not_yet_valid', 'service token was issued in the future');
  }
  if (typeof payload.jti !== 'string' || payload.jti.trim() === '') {
    throw new CreatorOsServiceAuthError('service_auth_invalid_format', 'service token is missing a jti');
  }
  if (!Array.isArray(payload.scp)) {
    throw new CreatorOsServiceAuthError('service_auth_missing_scope', 'service token is missing scopes');
  }
  const knownScopes = new Set(CREATOR_OS_SERVICE_SCOPES);
  for (const value of payload.scp) {
    if (typeof value !== 'string' || !knownScopes.has(value)) {
      throw new CreatorOsServiceAuthError('service_auth_unknown_scope', `service token declares unknown scope "${String(value)}"`);
    }
  }
  if (payload.scp.length === 0) {
    throw new CreatorOsServiceAuthError('service_auth_missing_scope', 'service token declares no scopes');
  }

  return {
    serviceId: String(payload.sid).trim(),
    subject,
    scopes: payload.scp,
    claims: {
      iss: payload.iss,
      aud: payload.aud,
      sub: subject,
      sid: String(payload.sid).trim(),
      scp: payload.scp,
      iat: payload.iat,
      exp: payload.exp,
      jti: payload.jti,
    },
  };
}

export function requireCreatorOsServiceScope(scopes, required) {
  if (!Array.isArray(scopes) || !scopes.includes(required)) {
    throw new CreatorOsServiceAuthError('service_auth_missing_scope', `missing required service scope "${required}"`);
  }
}
