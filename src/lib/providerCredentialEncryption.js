import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const IV_BYTES = 12;

function encryptionSecret() {
  const value = String(process.env.MAVENSYNC_CREDENTIAL_ENCRYPTION_KEY || '').trim();
  if (!value) throw Object.assign(new Error('credential_encryption_key_missing'), { code: 'credential_encryption_key_missing' });
  return value;
}

function key() {
  return crypto.createHash('sha256').update(encryptionSecret(), 'utf8').digest();
}

export function encryptProviderCredential(plaintext) {
  if (typeof plaintext !== 'string' || !plaintext.trim()) throw new Error('provider_credential_required');
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    version: VERSION,
    value: JSON.stringify({
      iv: iv.toString('base64url'),
      ciphertext: ciphertext.toString('base64url'),
      tag: cipher.getAuthTag().toString('base64url'),
    }),
  };
}

export function decryptProviderCredential(record) {
  // The two throws below already carried this exact string as their message but
  // omitted `.code`, so every caller that classifies on `code` — including
  // normalizedError, which is what persists creative_jobs.error_json — fell
  // through to the generic `provider_execution_failed` bucket and the real
  // cause was lost. The message, the condition, and the control flow are
  // unchanged; only the code is now attached, matching the two throws below
  // that already used Object.assign.
  if (!record?.value || record.version !== VERSION) throw Object.assign(new Error('provider_credential_ciphertext_invalid'), { code: 'provider_credential_ciphertext_invalid' });
  let envelope;
  try { envelope = JSON.parse(record.value); } catch { throw Object.assign(new Error('provider_credential_ciphertext_invalid'), { code: 'provider_credential_ciphertext_invalid' }); }
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key(), Buffer.from(envelope.iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    throw Object.assign(new Error('provider_credential_decryption_failed'), { code: 'provider_credential_decryption_failed' });
  }
}

export const PROVIDER_CREDENTIAL_ENCRYPTION_VERSION = VERSION;
