/**
 * Pure access-control policy for Creator OS application pages.
 *
 * This module holds no Next.js and no crypto imports on purpose: it is the
 * testable half of the page guard. The session itself is always read with the
 * existing `readCreatorIdentity` from `./creatorOsAuth.js` — the cryptographic
 * validation is not duplicated or reimplemented here.
 *
 * Policy: a Creator OS page renders only when a valid `creator_os_session` is
 * present. Missing, invalid, and expired sessions are all indistinguishable at
 * this layer (the reader fails closed and returns null), and all redirect to the
 * existing Your AI Coach Biz / Agency SSO launcher, which decides whether the
 * visitor must authenticate. We never redirect to /login.php directly.
 */

/** Existing Agency SSO launcher for Creator OS — the single authentication entry. */
export const CREATOR_OS_AUTH_ENTRY =
  'https://youraicoach.biz/php/mavensync/launch.php?destination=creator-os';

/**
 * The launcher URL an unauthenticated Creator OS visitor is sent to.
 *
 * @returns {string} absolute URL of the existing Agency launcher.
 */
export function creatorOsAuthEntryUrl() {
  return CREATOR_OS_AUTH_ENTRY;
}

/**
 * Decide whether a Creator OS page may render for a resolved identity.
 *
 * @param {object|null|undefined} identity result of `readCreatorIdentity`.
 * @returns {{ authorized: boolean, redirectTo: string|null }} when not
 *   authorized, `redirectTo` is the existing Agency launcher.
 */
export function creatorOsPageAccess(identity) {
  if (identity) return { authorized: true, redirectTo: null };
  return { authorized: false, redirectTo: creatorOsAuthEntryUrl() };
}
