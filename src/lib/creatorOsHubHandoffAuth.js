import crypto from 'node:crypto';

/**
 * Narrow Hub -> Creator OS status delegation verifier.
 *
 * This is NOT the Maven Harness service-auth contract and cannot approve,
 * prepare, execute, or publish. It is accepted only for the existing
 * read-only creative job status surface so Hub can report the status of a job
 * that the member already approved in the Creator OS browser.
 */
export const CREATOR_OS_HUB_ISSUER = 'mavensync-hub';
export const CREATOR_OS_HUB_AUDIENCE = 'mavensync-creator-os';
export const CREATOR_OS_HUB_SERVICE_ID = 'mavensync-hub';
export const CREATOR_OS_HUB_SCOPE = 'creative.read';
export const CREATOR_OS_HUB_ALGORITHM = 'HS256';
export const CREATOR_OS_HUB_MAX_TTL_SECONDS = 300;
export const CREATOR_OS_HUB_CLOCK_SKEW_SECONDS = 30;

export class CreatorOsHubHandoffAuthError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CreatorOsHubHandoffAuthError';
    this.code = code;
  }
}

export function getCreatorOsHubHandoffSecrets(env = process.env) {
  const current = String(env.MAVENSYNC_CREATOR_HANDOFF_SECRET || '').trim();
  if (!current) return null;
  const previous = String(env.MAVENSYNC_CREATOR_HANDOFF_SECRET_PREVIOUS || '').trim();
  return previous ? { current, previous } : { current };
}

function base64UrlDecode(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new CreatorOsHubHandoffAuthError('hub_handoff_invalid_format', 'invalid base64url encoding');
  }
  return Buffer.from(value, 'base64url');
}

function parseJsonSegment(encoded) {
  let value;
  try {
    value = JSON.parse(base64UrlDecode(encoded).toString('utf8'));
  } catch {
    throw new CreatorOsHubHandoffAuthError('hub_handoff_invalid_format', 'token payload is not valid JSON');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CreatorOsHubHandoffAuthError('hub_handoff_invalid_format', 'token payload must be a JSON object');
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
    throw new CreatorOsHubHandoffAuthError('hub_handoff_missing_subject', 'token subject is missing');
  }
  const normalized = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new CreatorOsHubHandoffAuthError('hub_handoff_invalid_subject', 'token subject is not a normalized email');
  }
  return normalized;
}

export function verifyCreatorOsHubHandoffToken({ token, now = Math.floor(Date.now() / 1000), env = process.env } = {}) {
  const secrets = getCreatorOsHubHandoffSecrets(env);
  if (!secrets) {
    throw new CreatorOsHubHandoffAuthError('hub_handoff_not_configured', 'Hub handoff secret is not configured');
  }
  const segments = typeof token === 'string' ? token.split('.') : [];
  if (segments.length !== 3) {
    throw new CreatorOsHubHandoffAuthError('hub_handoff_invalid_format', 'token must have 3 segments');
  }
  const [encodedHeader, encodedPayload, encodedSignature] = segments;
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new CreatorOsHubHandoffAuthError('hub_handoff_invalid_format', 'token is malformed');
  }
  const header = parseJsonSegment(encodedHeader);
  if (header.alg !== CREATOR_OS_HUB_ALGORITHM) {
    throw new CreatorOsHubHandoffAuthError('hub_handoff_invalid_algorithm', 'unsupported algorithm');
  }
  const message = `${encodedHeader}.${encodedPayload}`;
  let valid = verifySignature(message, encodedSignature, secrets.current);
  if (!valid && secrets.previous) valid = verifySignature(message, encodedSignature, secrets.previous);
  if (!valid) {
    throw new CreatorOsHubHandoffAuthError('hub_handoff_invalid_signature', 'token signature is invalid');
  }

  const payload = parseJsonSegment(encodedPayload);
  if (payload.iss !== CREATOR_OS_HUB_ISSUER) {
    throw new CreatorOsHubHandoffAuthError('hub_handoff_wrong_issuer', 'token issuer mismatch');
  }
  if (payload.aud !== CREATOR_OS_HUB_AUDIENCE) {
    throw new CreatorOsHubHandoffAuthError('hub_handoff_wrong_audience', 'token audience mismatch');
  }
  if (payload.sid !== CREATOR_OS_HUB_SERVICE_ID) {
    throw new CreatorOsHubHandoffAuthError('hub_handoff_missing_service', 'token service id mismatch');
  }
  const subject = normalizeEmailSubject(payload.sub);
  if (typeof payload.iat !== 'number' || !Number.isInteger(payload.iat)
    || typeof payload.exp !== 'number' || !Number.isInteger(payload.exp)) {
    throw new CreatorOsHubHandoffAuthError('hub_handoff_invalid_format', 'token time claims are invalid');
  }
  if (payload.exp <= payload.iat) {
    throw new CreatorOsHubHandoffAuthError('hub_handoff_ttl_exceeded', 'token exp must be after iat');
  }
  if (payload.exp - payload.iat > CREATOR_OS_HUB_MAX_TTL_SECONDS) {
    throw new CreatorOsHubHandoffAuthError('hub_handoff_ttl_exceeded', 'token lifetime exceeds the maximum');
  }
  if (payload.exp < now - CREATOR_OS_HUB_CLOCK_SKEW_SECONDS) {
    throw new CreatorOsHubHandoffAuthError('hub_handoff_expired', 'token has expired');
  }
  if (payload.iat > now + CREATOR_OS_HUB_CLOCK_SKEW_SECONDS) {
    throw new CreatorOsHubHandoffAuthError('hub_handoff_not_yet_valid', 'token was issued in the future');
  }
  if (typeof payload.jti !== 'string' || !payload.jti.trim()) {
    throw new CreatorOsHubHandoffAuthError('hub_handoff_invalid_format', 'token is missing a jti');
  }
  if (!Array.isArray(payload.scp) || payload.scp.length !== 1 || payload.scp[0] !== CREATOR_OS_HUB_SCOPE) {
    throw new CreatorOsHubHandoffAuthError('hub_handoff_missing_scope', 'token must declare only creative.read');
  }

  return {
    serviceId: payload.sid,
    subject,
    scopes: payload.scp,
    claims: {
      iss: payload.iss,
      aud: payload.aud,
      sub: subject,
      sid: payload.sid,
      scp: payload.scp,
      iat: payload.iat,
      exp: payload.exp,
      jti: payload.jti,
    },
  };
}

export function requireCreatorOsHubScope(scopes, required = CREATOR_OS_HUB_SCOPE) {
  if (!Array.isArray(scopes) || !scopes.includes(required)) {
    throw new CreatorOsHubHandoffAuthError('hub_handoff_missing_scope', `missing required scope "${required}"`);
  }
}
