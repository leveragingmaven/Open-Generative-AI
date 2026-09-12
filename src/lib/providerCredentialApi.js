import { encryptProviderCredential } from './providerCredentialEncryption.js';
import { MySqlProviderCredentialRepository } from './providerCredentialRepository.js';

export const BYOK_PROVIDER_IDS = Object.freeze(['muapi', 'kie', 'fal', 'openrouter']);

function safeStatus(provider, record) {
  return { provider, configured: !!record, status: record?.status || 'not_configured', updatedAt: record?.updatedAt || null };
}

export function validateByokProvider(provider) {
  const value = String(provider || '').trim().toLowerCase();
  if (!BYOK_PROVIDER_IDS.includes(value)) throw Object.assign(new Error('unsupported_provider_credential'), { code: 'unsupported_provider_credential' });
  return value;
}

function identityKey(identity) { return identity.identityKey || identity.creatorId || identity.userId; }

export async function saveByokCredential({ provider, identity, apiKey, repository = new MySqlProviderCredentialRepository() }) {
  const id = validateByokProvider(provider);
  if (!identity?.accountId || !identityKey(identity)) throw Object.assign(new Error('creator_os_auth_required'), { code: 'creator_os_auth_required' });
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw Object.assign(new Error(`provider_credential_required:${id}`), { code: `provider_credential_required:${id}` });
  const encrypted = encryptProviderCredential(apiKey.trim());
  const record = await repository.save({ accountId: identity.accountId, creatorIdentityKey: identityKey(identity), providerId: id, ciphertext: encrypted, encryptionVersion: encrypted.version });
  return safeStatus(id, record);
}

export async function readByokCredential({ provider, identity, repository = new MySqlProviderCredentialRepository() }) {
  const id = validateByokProvider(provider);
  const record = await repository.getActive({ accountId: identity.accountId, creatorIdentityKey: identityKey(identity), providerId: id });
  return safeStatus(id, record);
}

export async function revokeByokCredential({ provider, identity, repository = new MySqlProviderCredentialRepository() }) {
  const id = validateByokProvider(provider);
  await repository.revoke({ accountId: identity.accountId, creatorIdentityKey: identityKey(identity), providerId: id });
  return { provider: id, configured: false, status: 'revoked', updatedAt: new Date().toISOString() };
}
