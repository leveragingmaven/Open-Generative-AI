import crypto from 'node:crypto';
import { getMuApiBaseUrl, getServerMuApiKey, isAgencyModeEnabled } from './agencyMode.js';
import { MySqlCreativeAssetRepository } from './creativeAssetRepository.js';
import { resolveProviderCredential } from './providerCredentialResolver.js';
import { requestExceedsUploadLimit, validateMultipartUpload } from './uploadSecurity.js';
import { SUPPORTED_TYPES } from './zernioMediaResolver.js';

function failure(code, message, status) {
  return Response.json({ error: message, code }, { status });
}

export async function handlePublishingMediaUpload(request, {
  identity,
  repository,
  fetchImpl = fetch,
  agencyMode = isAgencyModeEnabled(),
  serverKey = getServerMuApiKey(),
  credentialResolver = resolveProviderCredential,
  baseUrl = getMuApiBaseUrl(),
} = {}) {
  if (!identity?.accountId || !identity?.identityKey) return failure('creator_os_auth_required', 'Creator OS authentication required.', 401);
  if (requestExceedsUploadLimit(request)) return failure('upload_too_large', 'Upload exceeds the configured size limit.', 413);
  let formData;
  try { formData = await request.formData(); } catch { return failure('invalid_upload', 'Choose an image or video file.', 400); }
  const { file, ok, reason, category } = validateMultipartUpload(formData);
  if (reason === 'upload_too_large') return failure('upload_too_large', 'Upload exceeds the configured size limit.', 413);
  if (!ok || !['image', 'video'].includes(category) || !SUPPORTED_TYPES.has(file.type.toLowerCase())) {
    return failure('unsupported_media_type', 'Choose a supported image or video file.', 415);
  }

  let credential;
  try {
    credential = agencyMode ? serverKey : await credentialResolver({
      accountId: identity.accountId, creatorIdentityKey: identity.identityKey, providerId: 'muapi',
    });
  } catch {
    return failure('upload_credential_unavailable', 'Media upload is unavailable for this account.', 503);
  }
  if (!credential) return failure('upload_credential_unavailable', 'Media upload is unavailable for this account.', 503);

  const uploadBody = new FormData();
  uploadBody.append('file', file, file.name);
  let uploaded;
  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/api/v1/upload_file`, {
      method: 'POST', headers: { 'x-api-key': credential }, body: uploadBody,
    });
    if (!response.ok) return failure('media_upload_failed', 'Media storage rejected the upload.', 502);
    const result = await response.json();
    uploaded = result.url || result.file_url || result.data?.url;
    if (new URL(uploaded).protocol !== 'https:') throw new Error('invalid_url');
  } catch {
    return failure('media_upload_failed', 'Media storage did not return a usable media URL.', 502);
  }

  const id = `upload-${crypto.randomUUID()}`;
  const asset = {
    id,
    accountId: String(identity.accountId),
    creatorIdentityKey: identity.identityKey,
    jobId: id,
    attemptId: id,
    requestId: id,
    authorizationId: id,
    agentId: 'publishing-upload',
    conversationId: id,
    title: file.name,
    filename: file.name,
    type: category,
    url: uploaded,
    generatedFiles: [uploaded],
    provider: 'muapi',
    providerOutputReference: uploaded,
    storageReference: uploaded,
    metadata: { assetType: 'uploaded', modality: category, filename: file.name, mimeType: file.type },
  };
  try {
    const assetRepository = repository || new MySqlCreativeAssetRepository();
    const saved = await assetRepository.saveOnConnection(assetRepository.db, asset);
    return Response.json({ ok: true, asset: saved }, { status: 201 });
  } catch {
    return failure('media_registration_failed', 'Uploaded media could not be attached to Publishing.', 503);
  }
}
