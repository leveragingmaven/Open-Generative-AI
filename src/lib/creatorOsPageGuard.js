/**
 * Server-side page guard for Creator OS.
 *
 * Reuses the existing session validation in `./creatorOsAuth.js` — the
 * cryptographic/session logic is not refactored or duplicated. This module only
 * wires that existing reader to Next.js server components:
 *
 *   - reads the `creator_os_session` cookie from the incoming request
 *   - delegates validation to the existing `readCreatorIdentity`
 *   - redirects to the existing Agency SSO launcher when that reader fails closed
 *
 * `next/headers` and `next/navigation` are imported here rather than in
 * `creatorOsPageAccess.js` so the policy stays unit-testable outside the Next
 * runtime.
 */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { readCreatorIdentity } from './creatorOsAuth.js';
import { creatorOsPageAccess } from './creatorOsPageAccess.js';

/**
 * Require a valid Creator OS session before rendering a protected page.
 *
 * Missing, invalid, and expired sessions all resolve to the same redirect: the
 * existing Your AI Coach Biz / Agency launcher, which handles authentication and
 * performs the existing SSO handoff back into Creator OS.
 *
 * @returns {Promise<object>} the validated creator identity.
 */
export async function requireCreatorOsPageSession() {
  // `readCreatorIdentity` reads `request.cookies.get(name)`. Next's `cookies()`
  // returns the cookie store itself, which already exposes `.get(name)`, so it
  // is wrapped to match the shape the existing reader expects.
  const cookieStore = await cookies();
  const identity = readCreatorIdentity({ cookies: cookieStore });
  const { authorized, redirectTo } = creatorOsPageAccess(identity);
  if (!authorized) redirect(redirectTo);
  return identity;
}
