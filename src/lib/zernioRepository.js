import crypto from 'node:crypto';
import { getCreatorDatabasePool } from './creatorAccountStore.js';

function profileFromRow(row) {
  if (!row) return null;
  return {
    zernioProfileId: row.zernio_profile_id,
    accountId: String(row.account_id),
    creatorIdentityKey: row.creator_identity_key,
    profileName: row.profile_name,
    status: row.status,
  };
}

function accountFromRow(row) {
  if (!row) return null;
  return {
    zernioAccountId: row.zernio_account_id,
    zernioProfileId: row.zernio_profile_id,
    accountId: String(row.account_id),
    creatorIdentityKey: row.creator_identity_key,
    platform: row.platform,
    username: row.username,
    displayName: row.display_name,
    profileImageUrl: row.profile_image_url,
    status: row.status,
    isActive: Boolean(row.is_active),
    needsReconnect: Boolean(row.needs_reconnect),
  };
}

export class ZernioRepository {
  async getProfile() { throw new Error('ZernioRepository.getProfile() must be implemented'); }
  async saveProfile() { throw new Error('ZernioRepository.saveProfile() must be implemented'); }
  async listAccounts() { throw new Error('ZernioRepository.listAccounts() must be implemented'); }
  async saveAccounts() { throw new Error('ZernioRepository.saveAccounts() must be implemented'); }
  async getAccount() { throw new Error('ZernioRepository.getAccount() must be implemented'); }
}

export class MySqlZernioRepository extends ZernioRepository {
  constructor({ db = getCreatorDatabasePool() } = {}) {
    super();
    this.db = db;
  }

  async getProfile({ accountId, creatorIdentityKey }) {
    const [rows] = await this.db.query(
      `SELECT * FROM zernio_profiles
       WHERE account_id = ? AND creator_identity_key = ? LIMIT 1`,
      [accountId, creatorIdentityKey],
    );
    return profileFromRow(rows[0]);
  }

  async saveProfile({ zernioProfileId, accountId, creatorIdentityKey, profileName, status = 'active' }) {
    await this.db.query(
      `INSERT INTO zernio_profiles
       (zernio_profile_id, account_id, creator_identity_key, profile_name, status)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE profile_name = VALUES(profile_name), status = VALUES(status), updated_at = CURRENT_TIMESTAMP`,
      [zernioProfileId, accountId, creatorIdentityKey, profileName, status],
    );
    return this.getProfile({ accountId, creatorIdentityKey });
  }

  async listAccounts({ accountId, creatorIdentityKey, zernioProfileId }) {
    const [rows] = await this.db.query(
      `SELECT * FROM zernio_connected_accounts
       WHERE account_id = ? AND creator_identity_key = ? AND zernio_profile_id = ?
       ORDER BY platform, display_name, username`,
      [accountId, creatorIdentityKey, zernioProfileId],
    );
    return rows.map(accountFromRow);
  }

  async saveAccounts({ accountId, creatorIdentityKey, zernioProfileId, accounts = [] }) {
    for (const account of accounts) {
      await this.db.query(
        `INSERT INTO zernio_connected_accounts
         (zernio_account_id, zernio_profile_id, account_id, creator_identity_key,
          platform, username, display_name, profile_image_url, status, is_active, needs_reconnect)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
          zernio_profile_id = VALUES(zernio_profile_id),
          account_id = VALUES(account_id),
          creator_identity_key = VALUES(creator_identity_key),
          platform = VALUES(platform),
          username = VALUES(username),
          display_name = VALUES(display_name),
          profile_image_url = VALUES(profile_image_url),
          status = VALUES(status),
          is_active = VALUES(is_active),
          needs_reconnect = VALUES(needs_reconnect),
          updated_at = CURRENT_TIMESTAMP`,
        [
          account.zernioAccountId,
          zernioProfileId,
          accountId,
          creatorIdentityKey,
          account.platform,
          account.username,
          account.displayName,
          account.profileImageUrl,
          account.status,
          account.isActive ? 1 : 0,
          account.needsReconnect ? 1 : 0,
        ],
      );
    }
    return this.listAccounts({ accountId, creatorIdentityKey, zernioProfileId });
  }

  async getAccount({ accountId, creatorIdentityKey, zernioProfileId, zernioAccountId }) {
    const [rows] = await this.db.query(
      `SELECT * FROM zernio_connected_accounts
       WHERE account_id = ? AND creator_identity_key = ? AND zernio_profile_id = ? AND zernio_account_id = ? LIMIT 1`,
      [accountId, creatorIdentityKey, zernioProfileId, zernioAccountId],
    );
    return accountFromRow(rows[0]);
  }
}

export class InMemoryZernioRepository extends ZernioRepository {
  constructor() {
    super();
    this.profiles = new Map();
    this.accounts = new Map();
  }

  profileKey({ accountId, creatorIdentityKey }) { return `${accountId}:${creatorIdentityKey}`; }

  accountKey({ accountId, creatorIdentityKey, zernioProfileId, zernioAccountId }) {
    return `${accountId}:${creatorIdentityKey}:${zernioProfileId}:${zernioAccountId}`;
  }

  async getProfile(input) {
    return this.profiles.get(this.profileKey(input)) || null;
  }

  async saveProfile(input) {
    const record = {
      zernioProfileId: input.zernioProfileId,
      accountId: String(input.accountId),
      creatorIdentityKey: input.creatorIdentityKey,
      profileName: input.profileName,
      status: input.status || 'active',
    };
    this.profiles.set(this.profileKey(record), record);
    return record;
  }

  async listAccounts({ accountId, creatorIdentityKey, zernioProfileId }) {
    return [...this.accounts.values()].filter((account) => (
      account.accountId === String(accountId) &&
      account.creatorIdentityKey === creatorIdentityKey &&
      account.zernioProfileId === zernioProfileId
    ));
  }

  async saveAccounts({ accountId, creatorIdentityKey, zernioProfileId, accounts = [] }) {
    for (const input of accounts) {
      const record = {
        zernioAccountId: String(input.zernioAccountId),
        zernioProfileId,
        accountId: String(accountId),
        creatorIdentityKey,
        platform: input.platform,
        username: input.username || null,
        displayName: input.displayName || null,
        profileImageUrl: input.profileImageUrl || null,
        status: input.status || 'unknown',
        isActive: input.isActive !== false,
        needsReconnect: Boolean(input.needsReconnect),
      };
      this.accounts.set(this.accountKey(record), record);
    }
    return this.listAccounts({ accountId, creatorIdentityKey, zernioProfileId });
  }

  async getAccount(input) {
    return this.accounts.get(this.accountKey(input)) || null;
  }
}

export function newZernioProfileName(accountId) {
  return `mavensync-creator-${String(accountId).replace(/[^A-Za-z0-9_-]/g, '-')}`;
}

export function newZernioRequestId() {
  return crypto.randomUUID();
}
