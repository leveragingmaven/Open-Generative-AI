import mysql from 'mysql2/promise';

let pool;

export class CreatorAccountSchemaMissingError extends Error {
  constructor() {
    super('creator_account_schema_missing');
    this.code = 'creator_account_schema_missing';
  }
}

function env(name) {
  return String(process.env[name] || '').trim();
}

export function getCreatorDatabasePool() {
  if (!pool) {
    const host = env('DB_HOST');
    const user = env('DB_USER');
    const database = env('DB_NAME');
    if (!host || !user || !database) throw new Error('creator_database_config_missing');
    pool = mysql.createPool({
      host,
      port: Number(process.env.DB_PORT || 3306),
      user,
      password: process.env.DB_PASS || '',
      database,
      connectionLimit: 5,
      waitForConnections: true,
      enableKeepAlive: true,
    });
  }
  return pool;
}

export async function resolveCreatorAccountId(identityKey, options = {}) {
  if (typeof identityKey !== 'string' || !identityKey.trim()) throw new Error('creator_identity_key_required');
  const db = options.db || getCreatorDatabasePool();
  try {
    // The unique identity key makes this safe when two first requests race.
    await db.query(
      'INSERT INTO creator_accounts (identity_key) VALUES (?) ON DUPLICATE KEY UPDATE identity_key = VALUES(identity_key)',
      [identityKey],
    );
    const [rows] = await db.query(
      'SELECT account_id FROM creator_accounts WHERE identity_key = ? LIMIT 1',
      [identityKey],
    );
    if (!rows[0]) throw new Error('creator_account_not_found');
    return String(rows[0].account_id);
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') throw new CreatorAccountSchemaMissingError();
    throw error;
  }
}

export function resetCreatorAccountStoreForTests() {
  pool = undefined;
}
