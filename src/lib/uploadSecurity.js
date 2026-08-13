const DEFAULT_LIMITS_MB = {
  image: 25,
  audio: 100,
  video: 500,
};

const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif',
  'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm', 'audio/aac', 'audio/flac',
  'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska',
]);

function positiveNumber(name, fallback) {
  const value = Number.parseInt(String(process.env[name] || ''), 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function maxBytesFor(category) {
  const envName = `CREATOR_OS_UPLOAD_MAX_${category.toUpperCase()}_MB`;
  return positiveNumber(envName, DEFAULT_LIMITS_MB[category]) * 1024 * 1024;
}

export function maxUploadRequestBytes() {
  return positiveNumber('CREATOR_OS_UPLOAD_MAX_REQUEST_MB', 512) * 1024 * 1024;
}

export function uploadTooLargeResponse() {
  return Response.json(
    { error: 'Upload exceeds the configured size limit.', code: 'upload_too_large' },
    { status: 413 },
  );
}

export function unsupportedMediaTypeResponse() {
  return Response.json(
    { error: 'Unsupported upload media type.', code: 'unsupported_media_type' },
    { status: 415 },
  );
}

export function invalidUploadTargetResponse() {
  return Response.json(
    { error: 'Invalid upload target.', code: 'invalid_upload_target' },
    { status: 400 },
  );
}

export function requestExceedsUploadLimit(request) {
  const contentLength = Number.parseInt(request.headers.get('content-length') || '', 10);
  return Number.isInteger(contentLength) && contentLength > maxUploadRequestBytes();
}

export function validateUploadFile(file) {
  if (!file || typeof file.size !== 'number' || !ALLOWED_TYPES.has(String(file.type || '').toLowerCase())) {
    return { ok: false, reason: 'unsupported_media_type' };
  }

  const type = String(file.type).toLowerCase();
  const category = type.startsWith('image/') ? 'image' : type.startsWith('audio/') ? 'audio' : 'video';
  if (file.size > maxBytesFor(category)) return { ok: false, reason: 'upload_too_large' };
  return { ok: true, category };
}

export function validateMultipartUpload(formData) {
  const file = formData.get('file');
  const validation = validateUploadFile(file);
  return { ...validation, file };
}

