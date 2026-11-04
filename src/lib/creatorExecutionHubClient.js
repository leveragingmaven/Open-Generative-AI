import crypto from 'node:crypto';

const ISSUER = 'mavensync-creator-os';
const AUDIENCE = 'mavensync-hub';
const SERVICE_ID = 'mavensync-creator-os';
const SCOPE = 'creative.execute';
const MAX_TTL_SECONDS = 300;
const REFERENCE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export class CreatorExecutionHubError extends Error {
  constructor(code, message, status) {
    super(message || code);
    this.name = 'CreatorExecutionHubError';
    this.code = code;
    this.status = status;
  }
}

function setting(env, name, fallback = '') {
  return String(env[name] || fallback).trim();
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

export function signCreatorExecutionHubToken(subject, {
  env = process.env,
  now = Math.floor(Date.now() / 1000),
  ttlSeconds = 60,
} = {}) {
  const secret = setting(env, 'MAVENSYNC_CREATOR_HANDOFF_SECRET');
  const email = String(subject || '').trim().toLowerCase();
  if (secret.length < 32) {
    throw new CreatorExecutionHubError('hub_handoff_not_configured', 'Hub handoff is not configured.', 503);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new CreatorExecutionHubError('hub_handoff_member_unavailable', 'A signed-in member email is required.', 401);
  }
  const ttl = Math.max(1, Math.min(Number(ttlSeconds) || 60, MAX_TTL_SECONDS));
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: ISSUER,
    aud: AUDIENCE,
    sub: email,
    sid: SERVICE_ID,
    scp: [SCOPE],
    iat: now,
    exp: now + ttl,
    jti: crypto.randomBytes(16).toString('hex'),
  }));
  const message = `${header}.${payload}`;
  const signature = crypto.createHmac('sha256', secret).update(message).digest('base64url');
  return `${message}.${signature}`;
}

export function configuredCreatorExecutionHub({ env = process.env, fetchImpl = fetch } = {}) {
  const secret = setting(env, 'MAVENSYNC_CREATOR_HANDOFF_SECRET');
  const baseUrl = setting(env, 'MAVENSYNC_HUB_URL');
  if (secret.length < 32 || !baseUrl) return null;
  const origin = new URL(baseUrl).origin;
  if (!/^https:\/\/[^/]+$/.test(origin) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    throw new CreatorExecutionHubError('hub_handoff_invalid_origin', 'Invalid Hub URL.', 503);
  }

  async function request(method, path, subject, body) {
    const token = signCreatorExecutionHubToken(subject, { env });
    const response = await fetchImpl(new URL(path, origin), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'x-mavensync-service': SERVICE_ID,
        'x-mavensync-user': String(subject || '').trim().toLowerCase(),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 204) return { ok: true };
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = data?.code || (response.status === 404 ? 'handoff_not_found' : 'hub_handoff_unavailable');
      throw new CreatorExecutionHubError(code, data?.error || 'Hub handoff request failed.', response.status);
    }
    return data;
  }

  function checked(reference) {
    if (!REFERENCE_PATTERN.test(String(reference || ''))) {
      throw new CreatorExecutionHubError('invalid_handoff_reference', 'Invalid handoff reference.', 400);
    }
    return reference;
  }

  return {
    async read(reference, subject) {
      const data = await request('GET', `/api/creator-execution/handoffs/${checked(reference)}`, subject);
      return data.request;
    },
    async claim(reference, subject) {
      const data = await request('POST', `/api/creator-execution/handoffs/${checked(reference)}/claim`, subject, {});
      return data.instruction;
    },
    async release(reference, subject) {
      await request('POST', `/api/creator-execution/handoffs/${checked(reference)}/release`, subject, {});
    },
    async decline(reference, subject) {
      await request('POST', `/api/creator-execution/handoffs/${checked(reference)}/decline`, subject, {});
    },
    async recordJob(reference, subject, { jobId, operation }) {
      if (typeof jobId !== 'string' || !jobId || jobId.length > 128) {
        throw new CreatorExecutionHubError('invalid_creative_job_id', 'Invalid native job id.', 400);
      }
      const data = await request('POST', `/api/creator-execution/handoffs/${checked(reference)}/job`, subject, { jobId, operation });
      return data.request;
    },
  };
}
