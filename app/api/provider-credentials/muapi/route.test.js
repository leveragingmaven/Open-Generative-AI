import assert from 'node:assert/strict';
import test from 'node:test';
import { handleMuApiCredentialDelete, handleMuApiCredentialGet, handleMuApiCredentialPost } from './route.js';
import { InMemoryProviderCredentialRepository } from '../../../../src/lib/providerCredentialRepository.js';
import { decryptProviderCredential } from '../../../../src/lib/providerCredentialEncryption.js';

process.env.MAVENSYNC_CREDENTIAL_ENCRYPTION_KEY = 'route-test-secret';
const identity = { accountId: 'account-1', identityKey: 'creator-1', creatorId: 'creator-1' };
function request(body) { return { async json() { return body; } }; }

test('authenticated user can save and read only safe MuAPI credential metadata', async () => {
  const repository = new InMemoryProviderCredentialRepository();
  const saved = await handleMuApiCredentialPost(request({ apiKey: 'plain-user-secret' }), { identity, repository });
  assert.equal(saved.status, 200);
  const savedBody = await saved.json();
  assert.equal(savedBody.configured, true);
  assert.equal(JSON.stringify(savedBody).includes('plain-user-secret'), false);
  const record = await repository.getActive({ accountId: identity.accountId, creatorIdentityKey: identity.identityKey, providerId: 'muapi' });
  assert.equal(record.ciphertext.value.includes('plain-user-secret'), false);
  assert.equal(decryptProviderCredential(record.ciphertext), 'plain-user-secret');
  const read = await handleMuApiCredentialGet({ identity, repository });
  assert.equal((await read.json()).configured, true);
});

test('unauthenticated and identity override attempts are rejected', async () => {
  const repository = new InMemoryProviderCredentialRepository();
  assert.equal((await handleMuApiCredentialPost(request({ apiKey: 'secret' }), { repository })).status, 401);
  assert.equal((await handleMuApiCredentialPost(request({ apiKey: 'secret', accountId: 'browser-account' }), { identity, repository })).status, 400);
});

test('credential replacement and revocation are scoped and safe', async () => {
  const repository = new InMemoryProviderCredentialRepository();
  await handleMuApiCredentialPost(request({ apiKey: 'first' }), { identity, repository });
  await handleMuApiCredentialPost(request({ apiKey: 'second' }), { identity, repository });
  assert.equal(decryptProviderCredential((await repository.getActive({ accountId: identity.accountId, creatorIdentityKey: identity.identityKey, providerId: 'muapi' })).ciphertext), 'second');
  const deleted = await handleMuApiCredentialDelete({ identity, repository });
  assert.equal((await deleted.json()).configured, false);
  assert.equal(await repository.getActive({ accountId: identity.accountId, creatorIdentityKey: identity.identityKey, providerId: 'muapi' }), null);
});
