import { requireCreatorIdentity } from '../../../../src/lib/creatorOsAuth.js';
import { requireCreatorOsRateLimit } from '../../../../src/lib/creatorOsRateLimit.js';
import { readByokCredential, revokeByokCredential, saveByokCredential } from '../../../../src/lib/providerCredentialApi.js';

function errorResponse(error) {
  const code = error?.code || 'provider_credential_request_failed';
  const status = code === 'creator_os_auth_required' ? 401 : code.startsWith('provider_credential_required:') || code === 'unsupported_provider_credential' ? 400 : 400;
  return Response.json({ error: 'Unable to manage provider credential.', code }, { status });
}

async function identityFor(request) {
  const auth = await requireCreatorIdentity(request);
  if (auth.response) return { response: auth.response };
  const limited = await requireCreatorOsRateLimit(request, auth.identity);
  if (limited) return { response: limited };
  return { identity: auth.identity };
}

export async function GET(request, { params }) {
  const auth = await identityFor(request); if (auth.response) return auth.response;
  try { return Response.json(await readByokCredential({ provider: (await params).provider, identity: auth.identity })); } catch (error) { return errorResponse(error); }
}

export async function POST(request, { params }) {
  const auth = await identityFor(request); if (auth.response) return auth.response;
  try { const body = await request.json(); return Response.json(await saveByokCredential({ provider: (await params).provider, identity: auth.identity, apiKey: body?.apiKey || body?.credential })); } catch (error) { return errorResponse(error); }
}

export async function DELETE(request, { params }) {
  const auth = await identityFor(request); if (auth.response) return auth.response;
  try { return Response.json(await revokeByokCredential({ provider: (await params).provider, identity: auth.identity })); } catch (error) { return errorResponse(error); }
}
