import assert from 'node:assert/strict';
import test from 'node:test';
import { decryptProviderCredential } from './providerCredentialEncryption.js';
import { InMemoryProviderCredentialRepository } from './providerCredentialRepository.js';
import { readByokCredential, revokeByokCredential, saveByokCredential } from './providerCredentialApi.js';

process.env.MAVENSYNC_CREDENTIAL_ENCRYPTION_KEY = 'byok-provider-test-secret';
const identity = { accountId: 'account-1', identityKey: 'creator-1' };

test('BYOK provider credentials are encrypted, scoped, and never returned', async () => {
  const repository = new InMemoryProviderCredentialRepository();
  const saved = await saveByokCredential({ provider: 'fal', identity, apiKey: 'fal-secret', repository });
  assert.deepEqual(saved, { provider: 'fal', configured: true, status: 'active', updatedAt: saved.updatedAt });
  assert.equal(JSON.stringify(saved).includes('fal-secret'), false);
  const record = await repository.getActive({ accountId: 'account-1', creatorIdentityKey: 'creator-1', providerId: 'fal' });
  assert.equal(decryptProviderCredential(record.ciphertext), 'fal-secret');
  assert.equal((await readByokCredential({ provider: 'fal', identity, repository })).configured, true);
  assert.equal((await readByokCredential({ provider: 'fal', identity: { accountId: 'other', identityKey: 'other' }, repository })).configured, false);
});

test('BYOK provider credentials support all approved provider IDs and revocation', async () => {
  const repository = new InMemoryProviderCredentialRepository();
  for (const provider of ['muapi', 'kie', 'fal', 'openrouter']) {
    await saveByokCredential({ provider, identity, apiKey: `${provider}-secret`, repository });
  }
  const revoked = await revokeByokCredential({ provider: 'kie', identity, repository });
  assert.equal(revoked.configured, false);
  assert.equal((await readByokCredential({ provider: 'kie', identity, repository })).configured, false);
});
