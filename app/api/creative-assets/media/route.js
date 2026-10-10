import { handleCreativeMediaRoute } from '../../../../src/lib/creativeMediaEndpoint.js';

export async function GET(request) { return handleCreativeMediaRoute(request); }
export async function HEAD(request) { return handleCreativeMediaRoute(request); }
