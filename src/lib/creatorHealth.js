import { getCreatorDatabasePool } from './creatorAccountStore.js';

export function creatorLiveness() {
  return { ok: true, service: 'creator-os' };
}

export async function creatorReadiness(options = {}) {
  try {
    const db = options.db || getCreatorDatabasePool();
    await db.query('SELECT 1 AS ready');
    return { status: 200, body: { ok: true, service: 'creator-os', database: 'ready' } };
  } catch (error) {
    return {
      status: 503,
      body: {
        ok: false,
        service: 'creator-os',
        database: 'unavailable',
        code: error?.message === 'creator_database_config_missing'
          ? 'creator_database_config_missing'
          : 'creator_database_unavailable',
      },
    };
  }
}
