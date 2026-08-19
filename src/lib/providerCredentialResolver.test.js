import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveProviderCredential } from './providerCredentialResolver.js';
import { encryptProviderCredential } from './providerCredentialEncryption.js';
import { InMemoryProviderCredentialRepository } from './providerCredentialRepository.js';

const original = {
  muapi: process.env.MUAPI_API_KEY,
  openai: process.env.OPENAI_API_KEY,
  mavenOpenai: process.env.MAVENSYNC_OPENAI_API_KEY,
  encryption: process.env.MAVENSYNC_CREDENTIAL_ENCRYPTION_KEY,
};

function restore() {
  for (const [key, value] of [['MUAPI_API_KEY', original.muapi], ['OPENAI_API_KEY', original.openai], ['MAVENSYNC_OPENAI_API_KEY', original.mavenOpenai], ['MAVENSYNC_CREDENTIAL_ENCRYPTION_KEY', original.encryption]]) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}

test.afterEach(restore);

test('resolves the authenticated account-scoped MuAPI credential without exposing it in metadata', async () => {
  process.env.MAVENSYNC_CREDENTIAL_ENCRYPTION_KEY = 'credential-test-key';
  process.env.MUAPI_API_KEY = 'server-muapi-secret';
  const repository = new InMemoryProviderCredentialRepository();
  await repository.save({ accountId: 'account-1', creatorIdentityKey: 'creator-1', providerId: 'muapi', ciphertext: encryptProviderCredential('user-muapi-secret') });
  assert.equal(await resolveProviderCredential({ accountId: 'account-1', creatorIdentityKey: 'creator-1', providerId: 'muapi', operation: 'image_generation', credentialRepository: repository }), 'user-muapi-secret');
});

test('resolves the existing OpenAI-compatible server credential precedence', async () => {
  process.env.OPENAI_API_KEY = 'openai-secret';
  process.env.MAVENSYNC_OPENAI_API_KEY = 'mavensync-openai-secret';
  assert.equal(await resolveProviderCredential({ accountId: 'account-1', creatorIdentityKey: 'creator-1', providerId: 'openai', operation: 'text_generation' }), 'openai-secret');
  delete process.env.OPENAI_API_KEY;
  assert.equal(await resolveProviderCredential({ accountId: 'account-1', creatorIdentityKey: 'creator-1', providerId: 'openai', operation: 'text_generation' }), 'mavensync-openai-secret');
});

test('fails safely for missing, unsupported, or incomplete credentials', async () => {
  delete process.env.MUAPI_API_KEY;
  process.env.MAVENSYNC_CREDENTIAL_ENCRYPTION_KEY = 'credential-test-key';
  await assert.rejects(resolveProviderCredential({ accountId: 'account-1', creatorIdentityKey: 'creator-1', providerId: 'muapi', credentialRepository: new InMemoryProviderCredentialRepository() }), (error) => error.code === 'provider_credential_required:muapi');
  await assert.rejects(resolveProviderCredential({ accountId: 'account-1', creatorIdentityKey: 'creator-1', providerId: 'replicate' }), (error) => error.code === 'unsupported_provider_credential');
  await assert.rejects(resolveProviderCredential({ providerId: 'muapi' }), (error) => error.code === 'credential_identity_required');
});

test('MuAPI does not fall back to the platform environment key', async () => {
  process.env.MUAPI_API_KEY = 'platform-secret';
  process.env.MAVENSYNC_CREDENTIAL_ENCRYPTION_KEY = 'credential-test-key';
  await assert.rejects(resolveProviderCredential({ accountId: 'account-1', creatorIdentityKey: 'creator-1', providerId: 'muapi', credentialRepository: new InMemoryProviderCredentialRepository() }), (error) => error.code === 'provider_credential_required:muapi');
});

test('account and creator scoping prevents credential cross-use', async () => {
  process.env.MAVENSYNC_CREDENTIAL_ENCRYPTION_KEY = 'credential-test-key';
  const repository = new InMemoryProviderCredentialRepository();
  await repository.save({ accountId: 'account-1', creatorIdentityKey: 'creator-1', providerId: 'muapi', ciphertext: encryptProviderCredential('user-secret') });
  await assert.rejects(resolveProviderCredential({ accountId: 'account-2', creatorIdentityKey: 'creator-1', providerId: 'muapi', credentialRepository: repository }), (error) => error.code === 'provider_credential_required:muapi');
  await assert.rejects(resolveProviderCredential({ accountId: 'account-1', creatorIdentityKey: 'creator-2', providerId: 'muapi', credentialRepository: repository }), (error) => error.code === 'provider_credential_required:muapi');
});
