import { decryptProviderCredential } from './providerCredentialEncryption.js';
import { MySqlProviderCredentialRepository } from './providerCredentialRepository.js';

function environment(name) {
  return String(process.env[name] || '').trim();
}

function credentialError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

/**
 * Resolve a provider credential only from trusted server-side identity and
 * provider configuration/storage. Browser/API payloads and agent content are
 * intentionally not inputs.
 */
export async function resolveProviderCredential({ accountId, creatorIdentityKey, providerId, operation, credentialRepository } = {}) {
  if (!String(accountId || '').trim() || !String(creatorIdentityKey || '').trim()) {
    throw credentialError('credential_identity_required');
  }
  const provider = String(providerId || '').trim().toLowerCase();
  if (!provider) throw credentialError('provider_required');

  let credential;
  if (['muapi', 'kie', 'fal', 'openrouter'].includes(provider)) {
    const repository = credentialRepository || new MySqlProviderCredentialRepository();
    const record = await repository.getActive({ accountId, creatorIdentityKey, providerId: provider });
    if (!record) throw credentialError(`provider_credential_required:${provider}`);
    credential = decryptProviderCredential(record.ciphertext);
  }
  else if (provider === 'openai') credential = environment('OPENAI_API_KEY') || environment('MAVENSYNC_OPENAI_API_KEY');
  else throw credentialError('unsupported_provider_credential');

  if (!credential) throw credentialError(`provider_credential_unavailable:${provider}`);
  return credential;
}

export function credentialResolutionMetadata({ providerId, operation } = {}) {
  const normalizedProvider = String(providerId || '').trim();
  return {
    providerId: normalizedProvider,
    operation: String(operation || '').trim(),
    source: ['muapi', 'kie', 'fal', 'openrouter'].includes(normalizedProvider.toLowerCase()) ? 'server_account_credential' : 'server_environment',
  };
}
