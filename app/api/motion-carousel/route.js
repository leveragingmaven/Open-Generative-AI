import { requireCreatorIdentity } from '../../../src/lib/creatorOsAuth.js';
import { requireCreatorOsRateLimit } from '../../../src/lib/creatorOsRateLimit.js';
import { handleMotionCarouselPost, handleMotionCarouselGet } from '../../../src/lib/motionCarouselEndpoint.js';
import { canUseMotionCarousel, motionCarouselAccessDeniedResponse } from '../../../src/lib/motionCarouselAccess.js';

// Maven Motion Carousel API: plan a storyboard, render it locally, and download
// the produced slides/exports. Auth and rate limiting match every other
// Creator OS endpoint; the renderer itself is configured by the operator.
//
// Animated carousels are being rolled out to the owner account first, so this
// route also enforces the rollout allowlist server-side. The Motion Design panel
// is not what protects it — a customer without access gets a 403 here even if
// they call the API directly.
//
// A media GET (`?file=<name>`) hands back one already-rendered artifact, addressed
// only by recomputing the object key from the caller's own job (the ownership check
// still runs in `serveStoredCarouselFile`). It is an authenticated, authorized,
// read-only byte stream — the same kind of request every other media route serves
// unmetered — so it does not spend the budget that protects plan/render/retry and
// the status poll. Authentication, the rollout allowlist and ownership all still
// apply; only the rate-limit step is skipped, and only for this shape.
export function isCarouselMediaGet(request) {
  if (String(request?.method || 'GET').toUpperCase() !== 'GET') return false;
  try {
    return new URL(request.url).searchParams.has('file');
  } catch {
    return false;
  }
}

export async function authorizeMotionCarousel(request, {
  identityResolver = requireCreatorIdentity,
  rateLimiter = requireCreatorOsRateLimit,
  env = process.env,
} = {}) {
  const auth = await identityResolver(request);
  if (auth.response) return auth;
  if (!canUseMotionCarousel(auth.identity, { env })) {
    return { identity: null, response: motionCarouselAccessDeniedResponse() };
  }
  if (!isCarouselMediaGet(request)) {
    const limited = await rateLimiter(request, auth.identity);
    if (limited) return { identity: auth.identity, response: limited };
  }
  return auth;
}

export async function POST(request) {
  const auth = await authorizeMotionCarousel(request);
  if (auth.response) return auth.response;
  return handleMotionCarouselPost(request, { identity: auth.identity });
}

export async function GET(request) {
  const auth = await authorizeMotionCarousel(request);
  if (auth.response) return auth.response;
  return handleMotionCarouselGet(request, { identity: auth.identity });
}
