const DEFAULTS = {
  agency: { perMinute: 60, burst: 12, burstWindowSeconds: 10 },
  byok: { perMinute: 120, burst: 20, burstWindowSeconds: 10 },
};

const buckets = new Map();

function positiveInteger(name, fallback) {
  const value = Number.parseInt(String(process.env[name] || ''), 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function limitsFor(agencyFunded) {
  const defaults = agencyFunded ? DEFAULTS.agency : DEFAULTS.byok;
  const prefix = agencyFunded ? 'CREATOR_OS_AGENCY' : 'CREATOR_OS_BYOK';
  return {
    perMinute: positiveInteger(`${prefix}_RATE_LIMIT_PER_MINUTE`, defaults.perMinute),
    burst: positiveInteger(`${prefix}_RATE_LIMIT_BURST`, defaults.burst),
    burstWindowSeconds: positiveInteger(`${prefix}_RATE_LIMIT_BURST_WINDOW_SECONDS`, defaults.burstWindowSeconds),
  };
}

function prune(now) {
  for (const [key, timestamps] of buckets) {
    const recent = timestamps.filter((timestamp) => timestamp > now - 60_000);
    if (recent.length) buckets.set(key, recent);
    else buckets.delete(key);
  }
}

export function resetCreatorOsRateLimitForTests() {
  buckets.clear();
}

export function checkCreatorOsRateLimit({ identityKey, agencyFunded, now = Date.now() } = {}) {
  if (typeof identityKey !== 'string' || !identityKey) {
    throw new Error('rate_limit_identity_required');
  }

  const limits = limitsFor(Boolean(agencyFunded));
  const key = `${agencyFunded ? 'agency' : 'byok'}:${identityKey}`;
  const timestamps = buckets.get(key) || [];
  const minuteAgo = now - 60_000;
  const burstAgo = now - limits.burstWindowSeconds * 1_000;
  const recent = timestamps.filter((timestamp) => timestamp > minuteAgo);
  const burstCount = recent.filter((timestamp) => timestamp > burstAgo).length;

  if (recent.length >= limits.perMinute || burstCount >= limits.burst) {
    const oldestRelevant = recent[Math.max(0, recent.length - limits.perMinute)] || recent[0] || now;
    const retryAfterSeconds = Math.max(1, Math.ceil((oldestRelevant + (recent.length >= limits.perMinute ? 60_000 : limits.burstWindowSeconds * 1_000) - now) / 1_000));
    buckets.set(key, recent);
    return { allowed: false, retryAfterSeconds };
  }

  recent.push(now);
  buckets.set(key, recent);
  if (buckets.size > 10_000) prune(now);
  return { allowed: true, retryAfterSeconds: 0 };
}

export function requireCreatorOsRateLimit(request, identity, { agencyFunded } = {}) {
  try {
    const result = checkCreatorOsRateLimit({
      identityKey: identity?.identityKey,
      agencyFunded,
    });
    if (result.allowed) return null;
    return Response.json(
      { error: 'Request rate limit exceeded.', code: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(result.retryAfterSeconds) } },
    );
  } catch {
    return Response.json(
      { error: 'Request protection is temporarily unavailable.', code: 'rate_limit_unavailable' },
      { status: 503 },
    );
  }
}

