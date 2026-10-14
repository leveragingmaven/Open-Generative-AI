/**
 * Who may use the Maven Motion Carousel endpoint.
 *
 * The carousel renderer is being rolled out to the owner account first, so the
 * API is closed to everyone else until owner testing is complete. This is a
 * server-side decision made on the server-derived identity (`creatorOsAuth`), so
 * hiding the panel in the browser is never what protects it.
 *
 * Rollout switches:
 *   MAVEN_MOTION_OWNER_ALLOWLIST="owner@mavensync.space,ai-gency:<hash>"
 *
 * Entries are matched case-insensitively against the account's email, identity
 * key, account id and SSO role. An empty or unset allowlist allows **nobody** —
 * the endpoint fails closed, so a missing variable can never open the feature to
 * customers by accident.
 *
 * Pure module: no Node APIs, no browser APIs.
 */

export const MOTION_CAROUSEL_ACCESS_ENV_VAR = 'MAVEN_MOTION_OWNER_ALLOWLIST';

/** The configured allowlist, lowercased and without blanks. */
export function motionCarouselAllowlist(env = process.env) {
  return String(env?.[MOTION_CAROUSEL_ACCESS_ENV_VAR] || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/** Every value an allowlist entry may match for this identity. */
export function motionCarouselIdentifiers(identity) {
  return [identity?.email, identity?.identityKey, identity?.accountId, identity?.creatorId, identity?.role]
    .map((value) => (value == null ? '' : String(value).trim().toLowerCase()))
    .filter(Boolean);
}

/**
 * `true` only when the identity is named in the allowlist. Fails closed: with no
 * allowlist, nobody has access, not everybody.
 */
export function canUseMotionCarousel(identity, { env = process.env, allowlist = null } = {}) {
  const allowed = allowlist || motionCarouselAllowlist(env);
  if (!allowed.length) return false;
  const identifiers = motionCarouselIdentifiers(identity);
  if (!identifiers.length) return false;
  return allowed.some((entry) => identifiers.includes(entry));
}

/**
 * The refusal an unapproved account receives. It names no account and reveals no
 * allowlist entry, so it cannot be used to probe who has access.
 */
export function motionCarouselAccessDeniedResponse() {
  return Response.json(
    {
      error: 'Animated carousels are not enabled for this account yet.',
      code: 'motion_carousel_not_enabled',
    },
    { status: 403 },
  );
}

/** The rollout state, for the endpoint status payload and operator diagnostics. */
export function describeMotionCarouselAccess({ env = process.env } = {}) {
  const allowlist = motionCarouselAllowlist(env);
  return {
    // Only whether it is open and how many entries there are — never the entries.
    restrictedToAllowlist: true,
    allowlistEntries: allowlist.length,
    enabled: allowlist.length > 0,
  };
}
