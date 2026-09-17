import assert from 'node:assert/strict';
import test from 'node:test';
import { decryptProviderCredential, encryptProviderCredential } from './providerCredentialEncryption.js';

test('encrypts credentials with authenticated ciphertext and decrypts server-side', () => {
  process.env.MAVENSYNC_CREDENTIAL_ENCRYPTION_KEY = 'encryption-test-secret';
  const encrypted = encryptProviderCredential('muapi-secret');
  assert.equal(encrypted.value.includes('muapi-secret'), false);
  assert.equal(decryptProviderCredential(encrypted), 'muapi-secret');
});

test('tampered credential ciphertext is rejected', () => {
  process.env.MAVENSYNC_CREDENTIAL_ENCRYPTION_KEY = 'encryption-test-secret';
  const encrypted = encryptProviderCredential('muapi-secret');
  const value = JSON.parse(encrypted.value);
  const tag = Buffer.from(value.tag, 'base64url');
  tag[0] ^= 1;
  value.tag = tag.toString('base64url');
  assert.throws(() => decryptProviderCredential({ ...encrypted, value: JSON.stringify(value) }), /provider_credential_decryption_failed/);
});
