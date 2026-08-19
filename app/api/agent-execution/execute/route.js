import { handleAgentExecutionRunRoute } from '../../../../src/lib/agentExecutionRunEndpoint.js';

export async function POST(request) {
  return handleAgentExecutionRunRoute(request);
}
