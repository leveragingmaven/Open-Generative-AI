import { handleFalGenerationRoute } from '../../../../src/lib/falGenerationEndpoint.js';

export async function POST(request) {
  return handleFalGenerationRoute(request);
}
