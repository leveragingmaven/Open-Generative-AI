import { requireCreatorIdentity } from '../../../../src/lib/creatorOsAuth.js';
import { requireCreatorOsRateLimit } from '../../../../src/lib/creatorOsRateLimit.js';
import { handleAgentExecutionPreparationPost } from '../prepare/route.js';

export async function handleAgentExecutionStartPost(request, { identity, preparationService } = {}) {
  return handleAgentExecutionPreparationPost(request, { identity, preparationService });
}

export async function handleAgentExecutionStartRoute(request, { authenticate = requireCreatorIdentity, rateLimit = requireCreatorOsRateLimit, ...options } = {}) {
  const auth = await authenticate(request);
  if (auth.response) return auth.response;
  const limited = await rateLimit(request, auth.identity);
  if (limited) return limited;
  return handleAgentExecutionStartPost(request, { ...options, identity: auth.identity });
}

export async function POST(request) { return handleAgentExecutionStartRoute(request); }
