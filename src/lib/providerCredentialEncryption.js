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
  if (!record?.value || record.version !== VERSION) throw new Error('provider_credential_ciphertext_invalid');
  let envelope;
  try { envelope = JSON.parse(record.value); } catch { throw new Error('provider_credential_ciphertext_invalid'); }
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key(), Buffer.from(envelope.iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    throw Object.assign(new Error('provider_credential_decryption_failed'), { code: 'provider_credential_decryption_failed' });
  }
}

export const PROVIDER_CREDENTIAL_ENCRYPTION_VERSION = VERSION;
