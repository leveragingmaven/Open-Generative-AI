import { requireCreatorIdentity } from '../../../src/lib/creatorOsAuth.js';
import { requireCreatorOsRateLimit } from '../../../src/lib/creatorOsRateLimit.js';
import { handleMotionCarouselPost, handleMotionCarouselGet } from '../../../src/lib/motionCarouselEndpoint.js';

// Maven Motion Carousel API: plan a storyboard, render it locally, and download
// the produced slides/exports. Auth and rate limiting match every other
// Creator OS endpoint; the renderer itself is configured by the operator.
async function authorize(request) {
  const auth = await requireCreatorIdentity(request);
  if (auth.response) return auth;
  const limited = await requireCreatorOsRateLimit(request, auth.identity);
  if (limited) return { response: limited };
  return auth;
}

export async function POST(request) {
  const auth = await authorize(request);
  if (auth.response) return auth.response;
  return handleMotionCarouselPost(request, { identity: auth.identity });
}

export async function GET(request) {
  const auth = await authorize(request);
  if (auth.response) return auth.response;
  return handleMotionCarouselGet(request, { identity: auth.identity });
}
