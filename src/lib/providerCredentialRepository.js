import crypto from 'node:crypto';
import { getCreatorDatabasePool } from './creatorAccountStore.js';

function rowToCredential(row) {
  if (!row) return null;
  return {
    credentialId: row.credential_id,
    accountId: String(row.account_id),
    creatorIdentityKey: row.creator_identity_key,
    providerId: row.provider_id,
    ciphertext: { version: row.encryption_version, value: row.credential_ciphertext },
    status: row.status,
    lastValidatedAt: row.last_validated_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ProviderCredentialRepository {
  async save() { throw new Error('ProviderCredentialRepository.save() must be implemented'); }
  async getActive() { throw new Error('ProviderCredentialRepository.getActive() must be implemented'); }
  async revoke() { throw new Error('ProviderCredentialRepository.revoke() must be implemented'); }
}

export class MySqlProviderCredentialRepository extends ProviderCredentialRepository {
  constructor({ db = getCreatorDatabasePool() } = {}) { super(); this.db = db; }

  async save({ accountId, creatorIdentityKey, providerId, ciphertext, encryptionVersion } = {}) {
    const credentialId = `credential-${crypto.randomUUID()}`;
    await this.db.query(
      `INSERT INTO provider_credentials
       (credential_id, account_id, creator_identity_key, provider_id, credential_ciphertext, encryption_version, status)
       VALUES (?, ?, ?, ?, ?, ?, 'active')
       ON DUPLICATE KEY UPDATE
         credential_id = LAST_INSERT_ID(credential_id),
         credential_ciphertext = VALUES(credential_ciphertext),
         encryption_version = VALUES(encryption_version),
         status = 'active', revoked_at = NULL, updated_at = CURRENT_TIMESTAMP`,
      [credentialId, accountId, creatorIdentityKey, providerId, ciphertext.value, encryptionVersion || ciphertext.version],
    );
    const [rows] = await this.db.query(
      `SELECT * FROM provider_credentials
       WHERE account_id = ? AND creator_identity_key = ? AND provider_id = ? AND status = 'active' LIMIT 1`,
      [accountId, creatorIdentityKey, providerId],
    );
    return rowToCredential(rows[0]);
  }

  async getActive({ accountId, creatorIdentityKey, providerId } = {}) {
    const [rows] = await this.db.query(
      `SELECT * FROM provider_credentials
       WHERE account_id = ? AND creator_identity_key = ? AND provider_id = ? AND status = 'active' AND revoked_at IS NULL LIMIT 1`,
      [accountId, creatorIdentityKey, providerId],
    );
    return rowToCredential(rows[0]);
  }

  async revoke({ accountId, creatorIdentityKey, providerId } = {}) {
    const [result] = await this.db.query(
      `UPDATE provider_credentials SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP
       WHERE account_id = ? AND creator_identity_key = ? AND provider_id = ? AND status = 'active'`,
      [accountId, creatorIdentityKey, providerId],
    );
    return result.affectedRows === 1;
  }
}

export class InMemoryProviderCredentialRepository extends ProviderCredentialRepository {
  constructor() { super(); this.records = new Map(); }

  key({ accountId, creatorIdentityKey, providerId }) { return `${accountId}:${creatorIdentityKey}:${providerId}`; }

  async save(input) {
    const record = {
      credentialId: input.credentialId || `credential-${crypto.randomUUID()}`,
      accountId: String(input.accountId), creatorIdentityKey: input.creatorIdentityKey, providerId: input.providerId,
      ciphertext: input.ciphertext, status: 'active', revokedAt: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    this.records.set(this.key(record), record);
    return record;
  }

  async getActive(input) {
    const record = this.records.get(this.key(input));
    return record?.status === 'active' && !record.revokedAt ? record : null;
  }

  async revoke(input) {
    const record = this.records.get(this.key(input));
    if (!record) return false;
    record.status = 'revoked'; record.revokedAt = new Date().toISOString(); record.updatedAt = record.revokedAt;
    return true;
  }
}
