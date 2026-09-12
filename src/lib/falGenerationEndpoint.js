import { requireCreatorIdentity } from './creatorOsAuth.js';
import { requireCreatorOsRateLimit } from './creatorOsRateLimit.js';
import { resolveProviderCredential } from './providerCredentialResolver.js';
import { falProvider } from '../../packages/studio/src/lib/providers/FalProvider.js';

export async function handleFalGenerationPost(request, { identity, provider = falProvider, credentialResolver = resolveProviderCredential } = {}) {
  if (!identity) return Response.json({ error: 'Creator OS authentication required.', code: 'creator_os_auth_required' }, { status: 401 });
  let payload;
  try { payload = await request.json(); } catch { return Response.json({ error: 'Invalid request.', code: 'invalid_json' }, { status: 400 }); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.apiKey || payload.credential || payload.accountId || payload.userId) {
    return Response.json({ error: 'Invalid request.', code: 'invalid_request_payload' }, { status: 400 });
  }
  const operation = payload.operation === 'image_editing' ? 'image_editing' : 'image_generation';
  try {
    const apiKey = await credentialResolver({ accountId: identity.accountId, creatorIdentityKey: identity.identityKey || identity.creatorId || identity.userId, providerId: 'fal', operation });
    const result = await provider.execute({ operation, inputs: payload.inputs || {}, apiKey, signal: request.signal });
    return Response.json({ ok: true, provider: 'fal', requestId: result.providerResponseRef || null, outputReferences: result.outputReferences || [], providerMetadata: result.providerMetadata || {} });
  } catch (error) {
    const code = String(error?.code || 'provider_execution_failed');
    const message = code.startsWith('provider_credential') ? 'Provider credential is unavailable.' : code === 'provider_execution_timeout' ? 'Provider execution timed out.' : 'Provider execution failed.';
    return Response.json({ error: message, code }, { status: code.startsWith('provider_credential') ? 400 : 502 });
  }
}

export async function handleFalGenerationRoute(request, options = {}) {
  const auth = await (options.authenticate || requireCreatorIdentity)(request);
  if (auth.response) return auth.response;
  const limited = await (options.rateLimit || requireCreatorOsRateLimit)(request, auth.identity);
  if (limited) return limited;
  return handleFalGenerationPost(request, { ...options, identity: auth.identity });
}
