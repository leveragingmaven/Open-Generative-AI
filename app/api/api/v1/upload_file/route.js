import { NextResponse } from 'next/server';
import { getMuApiBaseUrl, isAgencyModeEnabled } from '@/src/lib/agencyMode';
import { requireCreatorIdentity } from '@/src/lib/creatorOsAuth';
import { requireCreatorOsRateLimit } from '@/src/lib/creatorOsRateLimit';
import { requestExceedsUploadLimit, uploadTooLargeResponse, unsupportedMediaTypeResponse, validateMultipartUpload } from '@/src/lib/uploadSecurity';
import { credentialResolutionErrorResponse, resolveProxyMuApiCredential } from '../[[...path]]/route.js';

// The credential comes from the same seam as the central MuAPI proxy, so an
// upload resolves the account's own encrypted server-side credential.
//
// The previous browser `x-api-key` source is deliberately gone: generation
// already routes through the proxy, which never trusts that header, so an
// upload that trusted it could succeed for an account whose generations could
// not - and a customer who saved their key through Settings (encrypted, as
// BYOK is designed) had no key in the browser to send at all, which made every
// image, video, audio, and lip-sync upload fail for them.
async function resolveUploadCredential(identity) {
  return resolveProxyMuApiCredential({ identity });
}

export async function POST(request) {
  const auth = await requireCreatorIdentity(request);
  if (auth.response) return auth.response;
  const rateLimit = requireCreatorOsRateLimit(request, auth.identity, { agencyFunded: isAgencyModeEnabled() });
  if (rateLimit) return rateLimit;
  if (requestExceedsUploadLimit(request)) return uploadTooLargeResponse();

  let key;
  try {
    key = await resolveUploadCredential(auth.identity);
  } catch (error) {
    // Never surface resolver internals or credential material to the caller.
    return credentialResolutionErrorResponse(error);
  }

  if (isAgencyModeEnabled() && !key) {
    return NextResponse.json({ error: 'MUAPI_API_KEY is not configured.', code: 'missing_muapi_key' }, { status: 500 });
  }
  if (!key) return credentialResolutionErrorResponse({ code: 'provider_credential_required:muapi' });

  try {
    const formData = await request.formData();
    const upload = validateMultipartUpload(formData);
    if (upload.reason === 'upload_too_large') return uploadTooLargeResponse();
    if (!upload.ok) return unsupportedMediaTypeResponse();

    const headers = new Headers();
    // Supplied server-side only, never re-read from the request.
    headers.set('x-api-key', key);
    const response = await fetch(`${getMuApiBaseUrl().replace(/\/+$/, '')}/api/v1/upload_file`, {
      method: 'POST',
      headers,
      body: formData,
    });
    const contentType = response.headers.get('content-type') || 'application/json';
    const body = await response.arrayBuffer();
    return new NextResponse(body, { status: response.status, headers: { 'content-type': contentType } });
  } catch {
    return NextResponse.json({ error: 'Upload provider request failed.', code: 'upload_provider_failure' }, { status: 502 });
  }
}

