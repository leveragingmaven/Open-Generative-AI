import { NextResponse } from 'next/server';
import { getMuApiBaseUrl, getServerMuApiKey, isAgencyModeEnabled } from '@/src/lib/agencyMode';
import { requireCreatorIdentity } from '@/src/lib/creatorOsAuth';
import { requireCreatorOsRateLimit } from '@/src/lib/creatorOsRateLimit';
import { requestExceedsUploadLimit, uploadTooLargeResponse, unsupportedMediaTypeResponse, validateMultipartUpload } from '@/src/lib/uploadSecurity';

function apiKey(request) {
  if (isAgencyModeEnabled()) return getServerMuApiKey();
  return request.headers.get('x-api-key') || null;
}

export async function POST(request) {
  const auth = requireCreatorIdentity(request);
  if (auth.response) return auth.response;
  const rateLimit = requireCreatorOsRateLimit(request, auth.identity, { agencyFunded: isAgencyModeEnabled() });
  if (rateLimit) return rateLimit;
  if (requestExceedsUploadLimit(request)) return uploadTooLargeResponse();

  const key = apiKey(request);
  if (isAgencyModeEnabled() && !key) {
    return NextResponse.json({ error: 'MUAPI_API_KEY is not configured.', code: 'missing_muapi_key' }, { status: 500 });
  }

  try {
    const formData = await request.formData();
    const upload = validateMultipartUpload(formData);
    if (upload.reason === 'upload_too_large') return uploadTooLargeResponse();
    if (!upload.ok) return unsupportedMediaTypeResponse();

    const headers = new Headers();
    if (key) headers.set('x-api-key', key);
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

