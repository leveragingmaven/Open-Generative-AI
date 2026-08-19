import { requireCreatorIdentity } from "../../../src/lib/creatorOsAuth.js";
import { requireCreatorOsRateLimit } from "../../../src/lib/creatorOsRateLimit.js";
import { handleAgentExecutionPost } from "../../../src/lib/agentExecutionEndpoint.js";

export async function handleAgentExecutionRoute(
  request,
  { authenticate = requireCreatorIdentity, rateLimit = requireCreatorOsRateLimit } = {},
) {
  const auth = await authenticate(request);
  if (auth.response) return auth.response;
  const limited = await rateLimit(request, auth.identity);
  if (limited) return limited;
  return handleAgentExecutionPost(request, { identity: auth.identity });
}

export async function POST(request) {
  return handleAgentExecutionRoute(request);
}
